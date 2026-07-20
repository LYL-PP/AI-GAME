import { spawn } from 'node:child_process';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9337;
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--enable-unsafe-swiftshader',`--remote-debugging-port=${PORT}`,`--user-data-dir=D:/AI游戏/game-正式版/tools/.chrome-profile-rt`,'--window-size=1280,720','about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let id = 0; const pending = new Map(); let ws;
const send = (m, p = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const evaljs = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }))?.result?.value;
const Q = `(()=>{const n=NPCAPI.get('rogers');return n?{x:+n.pos.x.toFixed(1),z:+n.pos.z.toFixed(1),dead:n.dead,clip:n.rigged?n.rigged.currentName:null,lock:!!n.prologueLock}:null;})()`;
(async () => {
  let wsUrl;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); wsUrl = l.find((t) => t.type === 'page')?.webSocketDebuggerUrl; } catch {}
    if (!wsUrl) await sleep(1000);
  }
  ws = new WebSocket(wsUrl);
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
  await new Promise((r) => { ws.onopen = r; });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: 'http://localhost:8000/?chapter=1&play=1&fresh=1' });
  await sleep(16000);
  await evaljs('ChapterAPI.begin(4)');
  await sleep(1500);
  console.log('after begin:', JSON.stringify(await evaljs(Q)));
  await evaljs('StoryAPI.triggerDeath()');
  for (let i = 0; i < 6; i++) {
    await sleep(2000);
    console.log(`t+${(i + 1) * 2}s:`, JSON.stringify(await evaljs(Q)), 'state:', await evaljs('ChapterAPI.state()'));
  }
  ws.close(); chrome.kill(); process.exit(0);
})().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
