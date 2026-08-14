// final_reshoot.mjs —— 补拍：晚餐全景 / 马尔斯顿晚餐近景 / 指控运镜 2 帧（按 cineText 字幕人名定位 charge 步）
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { get } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EDGE = process.env.CHROME || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9245;
const edge = spawn(EDGE, ['--headless=new','--disable-gpu','--enable-unsafe-swiftshader',`--remote-debugging-port=${PORT}`,`--user-data-dir=${join(ROOT,'tools/.edge-profile-reshoot')}`,'--window-size=1280,720','about:blank'], { stdio: 'ignore', cwd: ROOT });
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
  // 全员入座
  await evaljs('PrologueAPI.gather()');
  for (let i = 0; i < 40; i++) { await sleep(3000); if ((await evaljs('PrologueAPI.state()')) === 'await_sit') break; }
  // ① 晚餐全景：玩家座位旁 (2.2,6.8) 望北正对圆桌（wargrave_dinner 同款机位）
  await evaljs('DebugAPI.teleport(2.2, 6.8, 0, 1.8)');
  await sleep(500);
  await shot('final_dinner_wide.png');
  // ② 马尔斯顿晚餐近景（座位正面 1.8m）
  await evaljs(`(() => {
    const n = NPCAPI.get('marston');
    const a = n.yaw;
    DebugAPI.teleport(n.pos.x - Math.sin(a) * 1.8, n.pos.z - Math.cos(a) * 1.8, a + Math.PI, n.pos.y);
  })()`);
  await sleep(400);
  await shot('final_face_marston.png');
  // ③ 指控运镜 2 帧（skip 快进，按 cineText 人名定位 charge 步）
  await evaljs('DebugAPI.teleport(2.2, 6.8, 0, 1.8)');
  await sleep(300);
  await evaljs('PrologueAPI.takeSeat()');
  await sleep(2000);
  const cineText = "document.getElementById('cineText')?.textContent || ''";
  for (const [name, file] of [['马尔斯顿', 'final_accuse_1.png'], ['麦克阿瑟', 'final_accuse_2.png']]) {
    let hit = false;
    for (let i = 0; i < 70 && !hit; i++) {
      const t = await evaljs(cineText);
      if (t && t.includes(name)) hit = true;
      else { await evaljs('PrologueAPI.skip()'); await sleep(450); }
    }
    console.log('charge', name, hit ? 'hit' : 'MISS');
    await sleep(1300);   // 运镜落位 + 立绘淡入
    await shot(file);
  }
  ws.close(); edge.kill(); process.exit(0);
}
main().catch((e) => { console.error(e); edge.kill(); process.exit(1); });
