// npc_new_shots.mjs —— 新版真贴图角色游戏内验收截图（Edge 无头，CDP localhost 优先）
// 用法: node tools/npc_new_shots.mjs <id>
// 产出: new_<id>_front.png（初始位近景正脸）/ new_<id>_walk.png（序章行走）/ new_<id>_dinner.png（晚餐坐姿）
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { get } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EDGE = process.env.CHROME || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9242;
const edge = spawn(EDGE, ['--headless=new','--disable-gpu','--enable-unsafe-swiftshader',`--remote-debugging-port=${PORT}`,`--user-data-dir=${join(ROOT,'tools/.edge-profile-shots')}`,'--window-size=1280,720','about:blank'], { stdio: 'ignore', cwd: ROOT });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJson = (url) => new Promise((res, rej) => {
  get(url, (r) => { let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on('error', rej);
});
let id = 0; const pending = new Map(); let ws;
const send = (m, p = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const evaljs = async (e) => {
  const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
  if (r?.exceptionDetails) console.log('EVAL ERR:', JSON.stringify(r.exceptionDetails).slice(0, 300));
  return r?.result?.value;
};
async function shot(name) {
  const s = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(ROOT, 'docs/screenshots', name), Buffer.from(s.data, 'base64'));
  console.log('SHOT:', name);
}
// 正面机位：NPC 前方 dist 米，面向其正脸
const frontCam = (cid, dist) => `(() => {
  const n = NPCAPI.get("${cid}");
  const a = n.yaw;
  DebugAPI.teleport(n.pos.x - Math.sin(a) * ${dist}, n.pos.z - Math.cos(a) * ${dist}, a + Math.PI, n.pos.y);
})()`;
async function main() {
  const cid = process.argv[2] || 'vera';
  let wsUrl;
  for (let i = 0; i < 90 && !wsUrl; i++) {
    for (const host of ['localhost', '127.0.0.1']) {
      if (wsUrl) break;
      try { const l = await getJson(`http://${host}:${PORT}/json/list`); wsUrl = l.find((t) => t.type === 'page')?.webSocketDebuggerUrl; } catch {}
    }
    if (!wsUrl) await sleep(1000);
  }
  if (!wsUrl) { console.log('NO PAGE'); edge.kill(); process.exit(1); }
  ws = new WebSocket(wsUrl);
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
  await new Promise((r) => { ws.onopen = r; });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Page.navigate', { url: 'http://localhost:8000/?chapter=0&play=1&fresh=1' });
  // 等游戏自检 API 就绪（Edge+swiftshader 首次编译着色器较慢）
  for (let i = 0; i < 300; i++) { await sleep(1000); if (await evaljs('!!(window.NPCAPI && window.PrologueAPI && window.DebugAPI)')) break; }
  await sleep(2000);
  console.log(cid, 'rigged:', await evaljs(`!!NPCAPI.get("${cid}")?.rigged`), 'items:', await evaljs(`Object.keys(NPCAPI.get("${cid}")?.rigged?.items || {}).join(",")`));
  // ① 初始位近景正脸（验证游戏内贴图/光照）
  await evaljs(frontCam(cid, 1.7));
  await sleep(400);
  await shot(`new_${cid}_front.png`);
  // ② 序章集合 → 行走中拍正脸（4s 时多在门廊路径上）
  await evaljs('PrologueAPI.gather()');
  await sleep(4000);
  await evaljs(frontCam(cid, 2.2));
  await sleep(300);
  await shot(`new_${cid}_walk.png`);
  // ③ 全员入座后拍该角色晚餐坐姿（await_sit 时 NPC 已就座；不 takeSeat，避免指控运镜抢相机）
  for (let i = 0; i < 40; i++) { await sleep(3000); if ((await evaljs('PrologueAPI.state()')) === 'await_sit') break; }
  await evaljs(frontCam(cid, 1.8));
  await sleep(400);
  await shot(`new_${cid}_dinner.png`);
  ws.close(); edge.kill(); process.exit(0);
}
main().catch((e) => { console.error(e); edge.kill(); process.exit(1); });
