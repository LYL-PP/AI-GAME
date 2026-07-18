// walk_measure.mjs —— 码头→别墅南门步行实测
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9240;
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--enable-unsafe-swiftshader',`--remote-debugging-port=${PORT}`,`--user-data-dir=${join(ROOT,'tools/.chrome-profile')}`,'--window-size=1280,720','about:blank'], { stdio: 'ignore', cwd: ROOT });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let id = 0; const pending = new Map(); let ws;
const send = (m, p = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const evaljs = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }))?.result?.value;
async function main() {
  let wsUrl;
  for (let i = 0; i < 40 && !wsUrl; i++) {
    try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); wsUrl = l.find((t) => t.type === 'page')?.webSocketDebuggerUrl; } catch {}
    if (!wsUrl) await sleep(500);
  }
  ws = new WebSocket(wsUrl);
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
  await new Promise((r) => { ws.onopen = r; });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Page.navigate', { url: 'http://localhost:8000/?chapter=0&play=1&fresh=1' });
  await sleep(13000);
  const r = await evaljs(`(async () => {
    const D = window.DebugAPI;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    D.teleport(0, 48, 0, 1.25);            // 出生点（新码头）
    const s0 = D.getState();
    let dist = 0, stuck = 0;
    // 码头→别墅南门（0, 8.6）：直线向北
    for (let i = 0; i < 400; i++) {
      const a = D.getState();
      const dz = -0.29;                     // 步行 2.9m/s × 0.1s
      D.move(0, dz);
      await sleep(100);
      const b = D.getState();
      dist += Math.hypot(b.x - a.x, b.z - a.z);
      if (Math.hypot(b.x - a.x, b.z - a.z) < 0.05) stuck++;
      if (b.z <= 8.8) break;
    }
    const e = D.getState();
    return JSON.stringify({
      start: [s0.x, s0.y, s0.z], end: [e.x.toFixed(1), e.y, e.z.toFixed(1)],
      dist: +dist.toFixed(1), stuckSteps: stuck,
      walkSec: +(dist / 2.9).toFixed(1), runSec: +(dist / 5.4).toFixed(1),
    });
  })()`);
  console.log('WALK:', r);
  ws.close(); chrome.kill(); process.exit(0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
