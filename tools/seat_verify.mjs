import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9291;
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--enable-unsafe-swiftshader',`--remote-debugging-port=${PORT}`,`--user-data-dir=${join(ROOT,'tools/.chrome-profile-props')}`,'--window-size=1280,720','about:blank'], { stdio: 'ignore', cwd: ROOT });
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
  await sleep(17000);
  await evaljs('PrologueAPI.gather()');
  for (let i = 0; i < 34; i++) { await sleep(3000); if ((await evaljs('PrologueAPI.state()')) === 'await_sit') break; }
  // 圆桌全景（从 SW 看 NE 四连座，能读出全员朝向）
  await evaljs(`(() => {
    const ids = ['wargrave','vera','lombard','marston'];
    let mx = 0, mz = 0;
    for (const i of ids) { const p = NPCAPI.get(i).pos; mx += p.x / 4; mz += p.z / 4; }
    DebugAPI.teleport(1.1, 2.5, Math.atan2(-(mx - 1.1), -(mz - 2.5)), 1.8);
  })()`);
  await sleep(500);
  await shot('seat_overview.png');
  // rigged 侧视近景：vera 座位侧前（垂直于她与桌心连线）
  await evaljs(`(() => {
    const n = NPCAPI.get('vera');
    const a = n.yaw + Math.PI / 2;   // 侧向
    DebugAPI.teleport(n.pos.x - Math.sin(a) * 2.2, n.pos.z - Math.cos(a) * 2.2, a + Math.PI, n.pos.y);
  })()`);
  await sleep(400);
  await shot('seat_vera_side.png');
  // lombard 侧视
  await evaljs(`(() => {
    const n = NPCAPI.get('lombard');
    const a = n.yaw - Math.PI / 2;
    DebugAPI.teleport(n.pos.x - Math.sin(a) * 2.2, n.pos.z - Math.cos(a) * 2.2, a + Math.PI, n.pos.y);
  })()`);
  await sleep(400);
  await shot('seat_lombard_side.png');
  // Kenney 角色侧视（布伦特）
  await evaljs(`(() => {
    const n = NPCAPI.get('brent');
    const a = n.yaw + Math.PI / 2;
    DebugAPI.teleport(n.pos.x - Math.sin(a) * 2.2, n.pos.z - Math.cos(a) * 2.2, a + Math.PI, n.pos.y);
  })()`);
  await sleep(400);
  await shot('seat_brent_side.png');
  ws.close(); chrome.kill(); process.exit(0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
