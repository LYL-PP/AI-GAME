// final_new_shots.mjs —— 最终拼图：5 人近景 + 晚餐全景 + 指控运镜 2 帧（一次启动；Edge 无头，CDP localhost 优先）
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { get } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EDGE = process.env.CHROME || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9244;
const edge = spawn(EDGE, ['--headless=new','--disable-gpu','--enable-unsafe-swiftshader',`--remote-debugging-port=${PORT}`,`--user-data-dir=${join(ROOT,'tools/.edge-profile-final')}`,'--window-size=1280,720','about:blank'], { stdio: 'ignore', cwd: ROOT });
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
const frontCam = (cid, dist) => `(() => {
  const n = NPCAPI.get("${cid}");
  const a = n.yaw;
  DebugAPI.teleport(n.pos.x - Math.sin(a) * ${dist}, n.pos.z - Math.cos(a) * ${dist}, a + Math.PI, n.pos.y);
})()`;
async function main() {
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
  for (let i = 0; i < 120; i++) { await sleep(1000); if (await evaljs('!!(window.NPCAPI && window.PrologueAPI && window.DebugAPI)')) break; }
  await sleep(2000);
  // 机制自检记录
  console.log('rogers tray visible(站姿):', await evaljs('NPCAPI.get("rogers")?.trayProp?.visible'));
  console.log('vera parry_hold:', await evaljs('!!NPCAPI.get("vera")?.rigged?.has("parry_hold")'), '| lombard punch_react:', await evaljs('!!NPCAPI.get("lombard")?.rigged?.has("punch_react")'));
  // ① 5 人近景（初始位正脸）
  for (const cid of ['vera', 'rogers', 'mrs_rogers', 'macarthur', 'marston']) {
    await evaljs(frontCam(cid, 1.7));
    await sleep(400);
    await shot(`final_face_${cid}.png`);
  }
  // ② 晚餐全景（全员入座后，餐厅广角）
  await evaljs('PrologueAPI.gather()');
  for (let i = 0; i < 40; i++) { await sleep(3000); if ((await evaljs('PrologueAPI.state()')) === 'await_sit') break; }
  await evaljs('DebugAPI.teleport(-2.6, 8.4, -2.4, 1.8)');
  await sleep(500);
  await shot('final_dinner_wide.png');
  console.log('rogers tray visible(坐姿):', await evaljs('NPCAPI.get("rogers")?.trayProp?.visible'));
  // ③ 指控运镜 2 帧（takeSeat 后 cine：intro→marston→rogers→mrs_rogers→macarthur…）
  await evaljs('DebugAPI.teleport(2.2, 6.8, 0, 1.8)');
  await sleep(300);
  await evaljs('PrologueAPI.takeSeat()');
  await sleep(9000);   // ≈ charge#1~2（marston/rogers）
  await shot('final_accuse_1.png');
  await sleep(6000);   // ≈ charge#3~4（mrs_rogers/macarthur）
  await shot('final_accuse_2.png');
  console.log('cine state:', await evaljs('PrologueAPI.state()'));
  ws.close(); edge.kill(); process.exit(0);
}
main().catch((e) => { console.error(e); edge.kill(); process.exit(1); });
