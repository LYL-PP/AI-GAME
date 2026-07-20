// overlay_check.mjs —— E 开对话不弹开始覆盖层验证
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9239;
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
  await send('Page.navigate', { url: 'http://localhost:8000/?chapter=1&play=1&fresh=1' });
  await sleep(12000);
  // 模拟对话打开 + 指针锁释放，断言覆盖层不弹
  const r1 = await evaljs(`(() => {
    DialogueAPI.start('vera');
    document.exitPointerLock && document.exitPointerLock();
    document.dispatchEvent(new Event('pointerlockchange'));
    const ov = document.getElementById('startOverlay');
    return JSON.stringify({ dlg: !!document.querySelector('#dlgBox.show'), overlay: getComputedStyle(ov).display });
  })()`);
  console.log('对话打开时覆盖层:', r1, r1?.includes('"overlay":"none"') ? 'PASS' : 'FAIL');
  // 笔记本同理
  const r2 = await evaljs(`(() => {
    DialogueAPI.close();
    DeductionAPI.open();
    document.dispatchEvent(new Event('pointerlockchange'));
    const ov = document.getElementById('startOverlay');
    DeductionAPI.close();
    return JSON.stringify({ overlay: getComputedStyle(ov).display });
  })()`);
  console.log('笔记本打开时覆盖层:', r2, r2?.includes('"overlay":"none"') ? 'PASS' : 'FAIL');
  chrome.kill('SIGKILL'); process.exit(0);
}
main().catch((e) => { console.error(e); chrome.kill('SIGKILL'); process.exit(1); });
