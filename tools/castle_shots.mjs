// castle_shots.mjs —— 城堡外观 4 机位截图（ch1 夜）。用法: node tools/castle_shots.mjs <前缀>
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PREFIX = process.argv[2] || 'castle_x';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9346;
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--enable-unsafe-swiftshader',`--remote-debugging-port=${PORT}`,`--user-data-dir=${join(ROOT,'tools/.chrome-profile-cshots')}`,'--window-size=1280,720','about:blank'], { stdio: 'ignore', cwd: ROOT });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
  for (let i = 0; i < 60 && !wsUrl; i++) {
    try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); wsUrl = l.find((t) => t.type === 'page')?.webSocketDebuggerUrl; } catch {}
    if (!wsUrl) await sleep(1000);
  }
  ws = new WebSocket(wsUrl);
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
  await new Promise((r) => { ws.onopen = r; });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Page.navigate', { url: 'http://localhost:8000/?chapter=0&play=1&fresh=1' });
  // 就绪等待：__scene 挂上（禁缓存后大模型加载变慢）
  let ready = false;
  for (let i = 0; i < 40 && !ready; i++) {
    await sleep(1000);
    ready = await evaljs('!!(window.__scene && window.DebugAPI)');
  }
  if (!ready) { console.log('FAIL: scene not ready in 40s'); chrome.kill(); process.exit(1); }
  await sleep(1500);
  // 序章白天默认天气（用户同款机位：正面平视两翼）
  // 1) 正面平视（含两翼）——码头栈道北端回望
  await evaljs('DebugAPI.teleport(0, 38, 0)');
  await sleep(1200);
  await shot(PREFIX + '_front.png');
  // 2) 45° 侧面（东南角望向城堡）
  await evaljs('DebugAPI.teleport(34, 30, 0.70)');
  await sleep(1200);
  await shot(PREFIX + '_side45.png');
  // 3) 岛背面（北岬角回望北立面）
  await evaljs('DebugAPI.teleport(0, -64, 3.14159)');
  await sleep(1200);
  await shot(PREFIX + '_back.png');
  // 4) 码头第一眼（出生构图对照）
  await evaljs('DebugAPI.teleport(0, 48, 0)');
  await sleep(1200);
  await shot(PREFIX + '_dock.png');
  ws.close(); chrome.kill(); process.exit(0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
