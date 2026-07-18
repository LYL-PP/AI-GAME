// portrait_shot.mjs —— 对话立绘嵌入验证截图
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import fs from 'node:fs';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9231;
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--enable-unsafe-swiftshader',`--remote-debugging-port=${PORT}`,`--user-data-dir=${join(ROOT,'tools/.chrome-profile')}`,'--window-size=1280,720','about:blank'], { stdio: 'ignore', cwd: ROOT });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let id = 0; const pending = new Map(); let ws;
const send = (m, p = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const evaljs = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r?.exceptionDetails) console.log('ERR', JSON.stringify(r.exceptionDetails).slice(0,300)); return r?.result?.value; };
async function shot(name) { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(join(ROOT, 'docs/screenshots', name), Buffer.from(r.data, 'base64')); console.log('截图', name); }
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
  await send('Page.navigate', { url: 'http://localhost:8000/?chapter=1&play=1' });
  await sleep(12000);
  const r = await evaljs(`(() => {
    DialogueAPI.start('vera');
    const img = document.querySelector('#dlgPortrait img');
    return JSON.stringify({ src: img?.src, ok: img?.complete && img?.naturalWidth > 0, w: img?.naturalWidth, h: img?.naturalHeight });
  })()`);
  console.log('立绘加载:', r);
  await sleep(1500);
  await shot('portrait_vera_dlg.png');
  const r2 = await evaljs(`(() => { DialogueAPI.close(); DialogueAPI.start('wargrave'); const img = document.querySelector('#dlgPortrait img'); return JSON.stringify({ src: img?.src, ok: img?.complete && img?.naturalWidth > 0 }); })()`);
  console.log('立绘加载2:', r2);
  await sleep(1500);
  await shot('portrait_wargrave_dlg.png');
  chrome.kill(); process.exit(0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
