// ch1_check.mjs —— chapter 1 日程位置抽查
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9228;
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--enable-unsafe-swiftshader',`--remote-debugging-port=${PORT}`,`--user-data-dir=${join(ROOT,'tools/.chrome-profile')}`,'--window-size=1280,720','about:blank'], { stdio: 'ignore', cwd: ROOT });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let id = 0; const pending = new Map(); let ws;
const send = (m, p = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const evaljs = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r?.exceptionDetails) console.log('EVAL ERR:', JSON.stringify(r.exceptionDetails).slice(0,300)); return r?.result?.value; };
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
  const res = await evaljs(`(() => {
    const g = (id) => { const n = NPCAPI.get(id); return [+n.pos.x.toFixed(1), +n.pos.y.toFixed(1), +n.pos.z.toFixed(1), n.action]; };
    return JSON.stringify({
      mrs_rogers: g('mrs_rogers'),   // 期望 bedroom_own (10,5.0,-4.75) sleep
      macarthur: g('macarthur'),     // 期望 cape_bench (0,~1.1,-77.1) gaze_sea
      rogers: g('rogers'),           // 期望 kitchen_stove (10.6,1.8,-4.6) cook
      wargrave: g('wargrave'),       // hall_armchair (-2.5,1.8,5.5) sit
      brent: g('brent'),             // hall_window_chair knit
      prologueState: PrologueAPI.state(),
    });
  })()`);
  console.log('CH1:', res);
  ws.close(); chrome.kill(); process.exit(0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
