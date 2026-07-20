import { spawn } from 'node:child_process';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9332;
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--enable-unsafe-swiftshader',`--remote-debugging-port=${PORT}`,`--user-data-dir=D:/AI游戏/game-正式版/tools/.chrome-profile-bp2`,'--window-size=1280,720','about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let id = 0; const pending = new Map(); let ws;
const send = (m, p = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const evaljs = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }))?.result?.value;
(async () => {
  let wsUrl;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); wsUrl = l.find((t) => t.type === 'page')?.webSocketDebuggerUrl; } catch {}
    if (!wsUrl) await sleep(1000);
  }
  ws = new WebSocket(wsUrl);
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
    else if (m.method === 'Runtime.exceptionThrown') console.log('EXC:', JSON.stringify(m.params.exceptionDetails).slice(0, 500));
    else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') console.log('CERR:', (m.params.args||[]).map(a=>a.value??a.description??'').join(' ').slice(0, 300));
  };
  await new Promise((r) => { ws.onopen = r; });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__errs=[];window.addEventListener('error',e=>__errs.push(String((e.error&&e.error.stack)||e.message)));window.addEventListener('unhandledrejection',e=>__errs.push('rej:'+(e.reason&&e.reason.stack||e.reason)));` });
  await send('Page.navigate', { url: 'http://localhost:8000/?chapter=0&play=1&fresh=1' });
  await sleep(22000);
  console.log('ERRS:', JSON.stringify(await evaljs('window.__errs||[]')).slice(0, 1500));
  console.log('PrologueAPI:', await evaljs('typeof PrologueAPI'), '| NPCAPI:', await evaljs('typeof NPCAPI'));
  ws.close(); chrome.kill(); process.exit(0);
})().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
