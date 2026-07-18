// trio_shots5.mjs —— 最终构图：SW 侧拍四人一排坐姿 + vera/lombard 贴图近景
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9248;
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--enable-unsafe-swiftshader',`--remote-debugging-port=${PORT}`,`--user-data-dir=${join(ROOT,'tools/.chrome-profile-trio')}`,'--window-size=1280,720','about:blank'], { stdio: 'ignore', cwd: ROOT });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let id = 0; const pending = new Map(); let ws;
const send = (m, p = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const evaljs = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }))?.result?.value;
async function shot(name) {
  const s = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(ROOT, 'docs/screenshots', name), Buffer.from(s.data, 'base64'));
  console.log('SHOT:', name);
}
async function main() {
  let wsUrl;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); wsUrl = l.find((t) => t.type === 'page')?.webSocketDebuggerUrl; } catch {}
    if (!wsUrl) await sleep(1000);
  }
  ws = new WebSocket(wsUrl);
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
  await new Promise((r) => { ws.onopen = r; });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Page.navigate', { url: 'http://localhost:8000/?chapter=0&play=1&fresh=1' });
  await sleep(14000);
  await evaljs('PrologueAPI.gather()');
  for (let i = 0; i < 34; i++) { await sleep(3000); if ((await evaljs('PrologueAPI.state()')) === 'await_sit') break; }
  // facing = -(sin yaw, cos yaw)：看向目标 yaw = atan2(-dx, -dz)
  // (a) SW 侧（大厅方向）看向 NE 一排：marston/沃格雷夫/vera/隆巴德 四人正面
  await evaljs(`(() => {
    const ids = ['wargrave','vera','lombard','marston'];
    let mx = 0, mz = 0;
    for (const i of ids) { const p = NPCAPI.get(i).pos; mx += p.x / 4; mz += p.z / 4; }
    const px = 1.1, pz = 2.5;
    const y = NPCAPI.get('vera').pos.y;
    DebugAPI.teleport(px, pz, Math.atan2(-(mx - px), -(mz - pz)), y);
  })()`);
  await sleep(500);
  await shot('marston2_dinner_sit.png');
  // (b) vera 贴图近景：机位在 vera 与圆心之间、距她 1.3m
  await evaljs(`(() => {
    const n = NPCAPI.get('vera');
    const a = n.yaw; // 她面向圆心
    DebugAPI.teleport(n.pos.x - Math.sin(a) * 1.3, n.pos.z - Math.cos(a) * 1.3, a + Math.PI, n.pos.y);
  })()`);
  await sleep(500);
  await shot('vera_front.png');
  // (c) lombard 贴图近景
  await evaljs(`(() => {
    const n = NPCAPI.get('lombard');
    const a = n.yaw;
    DebugAPI.teleport(n.pos.x - Math.sin(a) * 1.3, n.pos.z - Math.cos(a) * 1.3, a + Math.PI, n.pos.y);
  })()`);
  await sleep(500);
  await shot('lombard_sit_front.png');
  ws.close(); chrome.kill(); process.exit(0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
