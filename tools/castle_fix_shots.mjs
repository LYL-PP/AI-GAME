// 城堡外观修复前后对比：ch5 雾天南面 / ch0 码头第一眼 / 45°侧面 / 门廊近景 / 岛背面
// 用法：node tools/castle_fix_shots.mjs <tag>
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TAG = process.argv[2] || 'x';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9315;
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--enable-unsafe-swiftshader',`--remote-debugging-port=${PORT}`,`--user-data-dir=${join(ROOT,'tools/.chrome-profile-cf')}`,'--window-size=1280,720','about:blank'], { stdio: 'ignore', cwd: ROOT });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let id = 0; const pending = new Map(); let ws;
const send = (m, p = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const evaljs = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }))?.result?.value;
async function shot(name) {
  const s = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(ROOT, 'docs/screenshots', name), Buffer.from(s.data, 'base64'));
  console.log('SHOT:', name);
}
// [chapter, x, z, yaw, name]
const SHOTS = [
  [5, 0, 55, 0, 'ch5_south'],         // 雾天南面（用户同款机位，码头回望北）
  [0, 0, 55, 0, 'ch0_dock'],          // 码头第一眼
  [5, -26, 26, -1.02, 'side45'],      // 45° 侧面（西南向东北）
  [5, 0, 17, 0, 'porch'],             // 门廊近景
  [5, 0, -32, Math.PI, 'isleback'],   // 岛背面（北向南看背面穿帮）
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
  for (const [ch, x, z, yaw, name] of SHOTS) {
    await send('Page.navigate', { url: `http://localhost:8000/?chapter=${ch}&play=1&fresh=1` });
    await sleep(15000);
    await evaljs(`DebugAPI.teleport(${x}, ${z}, ${yaw}, null)`);
    await sleep(1500);
    await shot(`castlefix_${TAG}_${name}.png`);
  }
  ws.close(); chrome.kill(); process.exit(0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
