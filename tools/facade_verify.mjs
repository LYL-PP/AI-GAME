// facade_verify.mjs —— 立面移植验收：码头第一眼/门廊/侧缝/大厅南向
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9269;
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--enable-unsafe-swiftshader',`--remote-debugging-port=${PORT}`,`--user-data-dir=${join(ROOT,'tools/.chrome-profile-fac')}`,'--window-size=1280,720','about:blank'], { stdio: 'ignore', cwd: ROOT });
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
  await sleep(16000);
  await shot('f1_dock.png');                                        // 码头第一眼（出生视角）
  await evaljs('DebugAPI.teleport(0, 16, 0, 1.25)');                // 栈桥中端平视立面
  await sleep(400);
  await shot('f1_jetty.png');
  await evaljs('DebugAPI.teleport(0, 12.2, 0, 1.8)');               // 门廊：穿拱门看正门
  await sleep(400);
  await shot('f1_porch.png');
  await evaljs('DebugAPI.teleport(9.5, 16, -0.7, 1.5)');            // 东侧接缝
  await sleep(400);
  await shot('f1_seam_east.png');
  await evaljs('DebugAPI.teleport(-9.5, 16, 0.7, 1.5)');            // 西侧接缝
  await sleep(400);
  await shot('f1_seam_west.png');
  await evaljs('DebugAPI.teleport(0.5, 3.0, Math.PI, 1.8)');        // 大厅内向南看（不穿帮验证）
  await sleep(400);
  await shot('f1_hall_south.png');
  ws.close(); chrome.kill(); process.exit(0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
