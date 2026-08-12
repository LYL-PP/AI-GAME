// net_audit.mjs —— 线上站点网络加载审计
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import fs from 'node:fs';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9243;
const URL_TO_TEST = process.argv[2] || 'https://ai-game-liard.vercel.app/';
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--enable-unsafe-swiftshader',`--remote-debugging-port=${PORT}`,`--user-data-dir=${join(ROOT,'tools/.chrome-profile')}`,'--window-size=1280,720','about:blank'], { stdio: 'ignore', cwd: ROOT });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let id = 0; const pending = new Map(); let ws;
const send = (m, p = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
async function main() {
  let wsUrl;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    try { const l = await (await fetch(`http://localhost:${PORT}/json/list`)).json(); wsUrl = l.find((t) => t.type === 'page')?.webSocketDebuggerUrl; } catch {}
    if (!wsUrl) await sleep(1000);
  }
  if (!wsUrl) { console.log('CDP 端口未就绪'); chrome.kill(); process.exit(1); }
  ws = new WebSocket(wsUrl);
  const reqs = new Map();
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') console.log('JS异常:', JSON.stringify(m.params.exceptionDetails).slice(0, 500));
    if (m.method === 'Runtime.consoleAPICalled' && true) console.log('console.' + m.params.type + ':', (m.params.args||[]).map(a=>a.value??a.description??'').join(' ').slice(0, 300));
    if (m.method === 'Network.requestWillBeSent') reqs.set(m.params.requestId, { url: m.params.request.url, t0: Date.now(), bytes: 0, status: 0 });
    if (m.method === 'Network.responseReceived') { const r = reqs.get(m.params.requestId); if (r) r.status = m.params.response.status; }
    if (m.method === 'Network.loadingFinished') { const r = reqs.get(m.params.requestId); if (r) { r.bytes = m.params.encodedDataLength; r.dur = Date.now() - r.t0; } }
    if (m.method === 'Network.loadingFailed') { const r = reqs.get(m.params.requestId); if (r) r.status = 'FAIL:' + (m.params.errorText || ''); }
  };
  await new Promise((r) => { ws.onopen = r; });
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable'); await send('Log.enable');
  await send('Page.navigate', { url: URL_TO_TEST });
  await sleep(60000); // 观察 60 秒
  const done = await send('Runtime.evaluate', { expression: 'JSON.stringify({ready: !!window.DebugAPI, title: document.title})', returnByValue: true });
  console.log('60s 后游戏就绪状态:', done?.result?.value);
  const arr = [...reqs.values()].sort((a, b) => b.bytes - a.bytes);
  let total = 0; for (const r of arr) total += r.bytes;
  console.log('总传输:', (total / 1048576).toFixed(1) + 'MB', '| 请求数:', arr.length);
  for (const r of arr.filter(r=>r.url.includes('.glb'))) console.log('GLB:', (r.bytes/1048576).toFixed(2)+'MB', (r.dur/1000).toFixed(1)+'s', r.status, r.url.split('/').pop());
  for (const r of arr.slice(0, 25)) console.log((r.bytes / 1048576).toFixed(2) + 'MB', (r.dur / 1000).toFixed(1) + 's', r.status, r.url.replace(URL_TO_TEST, '/').slice(0, 90));
  const fails = arr.filter((r) => String(r.status).startsWith('FAIL') || r.status >= 400);
  console.log('失败/异常:', fails.length); fails.slice(0, 10).forEach((r) => console.log('  ', r.status, r.url.slice(-70)));
  chrome.kill('SIGKILL'); process.exit(0);
}
main().catch((e) => { console.error(e); chrome.kill('SIGKILL'); process.exit(1); });
