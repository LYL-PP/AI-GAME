// 扫描大厅黑碎三角修复前后对比截图：地板低机位 / 地毯区 / 油画墙
// 用法：node tools/scan_fix_shots.mjs <tag>
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TAG = process.argv[2] || 'x';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9312;
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--enable-unsafe-swiftshader',`--remote-debugging-port=${PORT}`,`--user-data-dir=${join(ROOT,'tools/.chrome-profile-sf')}`,'--window-size=1280,720','about:blank'], { stdio: 'ignore', cwd: ROOT });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let id = 0; const pending = new Map(); let ws;
const send = (m, p = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const evaljs = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }))?.result?.value;
async function shot(name) {
  const s = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(ROOT, 'docs/screenshots', name), Buffer.from(s.data, 'base64'));
  console.log('SHOT:', name);
}
// [x, z, yaw, pitch, name]
const SHOTS = [
  [2.5, 5.5, 0, -0.62, 'floor'],     // 低机位看大厅地板（向北）
  [0.5, 6.5, 0, -0.62, 'rug'],       // 低机位看地毯区（向北看圆桌地毯）
  [2.5, 2.0, Math.PI, 0.06, 'wall'], // 南墙油画墙平视
];
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
  for (const [x, z, yaw, pitch, name] of SHOTS) {
    await send('Page.navigate', { url: `http://localhost:8000/?chapter=2&play=1&fresh=1&pitch=${pitch}` });
    await sleep(15000);
    await evaljs(`DebugAPI.teleport(${x}, ${z}, ${yaw}, 1.8)`);
    await sleep(1500);
    await shot(`scanfix_${TAG}_${name}.png`);
  }
  ws.close(); chrome.kill(); process.exit(0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
