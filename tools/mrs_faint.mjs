import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9343;
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--enable-unsafe-swiftshader',`--remote-debugging-port=${PORT}`,`--user-data-dir=${join(ROOT,'tools/.chrome-profile-mf2')}`,'--window-size=1280,720','about:blank'], { stdio: 'ignore', cwd: ROOT });
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
  await send('Page.navigate', { url: 'http://localhost:8000/?chapter=0&play=1&fresh=1' });
  await sleep(17000);
  await evaljs('PrologueAPI.gather()');
  for (let i = 0; i < 34; i++) { await sleep(3000); if ((await evaljs('PrologueAPI.state()')) === 'await_sit') break; }
  await evaljs('DebugAPI.teleport(2.2, 6.8, 0, 1.8)');
  await sleep(300);
  await evaljs('PrologueAPI.takeSeat()');
  for (let i = 0; i < 300; i++) {
    const st = await evaljs('PrologueAPI.state()');
    if (st === 'faint') {
      await sleep(1500);
      const s = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(join(ROOT, 'docs/screenshots', 'mrs_faint.png'), Buffer.from(s.data, 'base64'));
      console.log('SHOT: mrs_faint.png at faint');
      const rz = await evaljs(`(()=>{const n=NPCAPI.get('mrs_rogers');return n?{rz:+n.group.rotation.z.toFixed(2),act:n.action,clip:n.rigged?n.rigged.currentName:null}:null;})()`);
      console.log('faint state:', JSON.stringify(rz));
      break;
    }
    if (st === 'done' || st === 'idle') { console.log('faint missed (state:', st, ')'); break; }
    await sleep(1000);
  }
  ws.close(); chrome.kill(); process.exit(0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
