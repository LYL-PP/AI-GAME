// q_check.mjs —— Q 键唤出章节导航验证
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import fs from 'node:fs';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9235;
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--enable-unsafe-swiftshader',`--remote-debugging-port=${PORT}`,`--user-data-dir=${join(ROOT,'tools/.chrome-profile')}`,'--window-size=1280,720','about:blank'], { stdio: 'ignore', cwd: ROOT });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let id = 0; const pending = new Map(); let ws;
const send = (m, p = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const evaljs = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r?.exceptionDetails) console.log('ERR', JSON.stringify(r.exceptionDetails).slice(0,200)); return r?.result?.value; };
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
  await send('Page.navigate', { url: 'http://localhost:8000/?chapter=0&play=1&fresh=1' });
  await sleep(12000);
  const r1 = await evaljs(`(() => { document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyQ'})); return JSON.stringify({ open: NavAPI.isOpen() }); })()`);
  console.log('按 Q 后面板:', r1, r1?.includes('true') ? 'PASS' : 'FAIL');
  const r2 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(join(ROOT, 'docs/screenshots/nav_q_open.png'), Buffer.from(r2.data, 'base64'));
  const r3 = await evaljs(`(() => { document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyQ'})); return JSON.stringify({ open: NavAPI.isOpen() }); })()`);
  console.log('再按 Q 后面板:', r3, r3?.includes('false') ? 'PASS' : 'FAIL');
  const r4 = await evaljs(`(() => { const c = document.getElementById('controlsHint').textContent; const o = document.getElementById('ovControls').textContent; return JSON.stringify({ hud: c.includes('章节导航'), overlay: o.includes('章节导航') }); })()`);
  console.log('操作提示含「章节导航」:', r4);
  chrome.kill('SIGKILL'); process.exit(0);
}
main().catch((e) => { console.error(e); chrome.kill('SIGKILL'); process.exit(1); });
