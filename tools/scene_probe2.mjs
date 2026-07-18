// scene_probe2.mjs —— 第二轮：hall 内侧四向 + castle 局部网格
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9259;
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--enable-unsafe-swiftshader',`--remote-debugging-port=${PORT}`,`--user-data-dir=${join(ROOT,'tools/.chrome-profile-scene')}`,'--window-size=1280,720','about:blank'], { stdio: 'ignore', cwd: ROOT });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let id = 0; const pending = new Map(); let ws;
const send = (m, p = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const evaljs = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }))?.result?.value;
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
  const jobs = [
    ['hall', 'in_posz'], ['hall', 'in_negz'], ['hall', 'in_posx'], ['hall', 'in_negx'],
    ['castle&meshes=6,7', 'iso'], ['castle&meshes=6,7', 'front'], ['castle&meshes=6,7', 'top'],
    ['castle', 'close'],
  ];
  for (const [m, v] of jobs) {
    await send('Page.navigate', { url: `http://localhost:8000/tools/scene_probe.html?m=${m}&v=${v}` });
    for (let i = 0; i < 45; i++) { await sleep(500); if (await evaljs('!!window.__ready')) break; }
    const name = `scan2_${m.replace(/[^a-z0-9]/gi, '_')}_${v}.png`;
    const s = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(ROOT, 'docs/screenshots', name), Buffer.from(s.data, 'base64'));
    console.log('SHOT:', name);
  }
  ws.close(); chrome.kill(); process.exit(0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
