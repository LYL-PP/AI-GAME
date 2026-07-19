import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9330;
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--enable-unsafe-swiftshader',`--remote-debugging-port=${PORT}`,`--user-data-dir=${join(ROOT,'tools/.chrome-profile-aw')}`,'--window-size=1280,720','about:blank'], { stdio: 'ignore', cwd: ROOT });
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
  await send('Page.navigate', { url: 'http://localhost:8000/?chapter=1&play=1&fresh=1' });
  await sleep(16000);
  for (let i = 0; i < 60; i++) {
    await sleep(2000);
    const n = await evaljs(`(()=>{const n=NPCAPI.get('armstrong');return n?{x:+n.pos.x.toFixed(2),z:+n.pos.z.toFixed(2),y:+n.pos.y.toFixed(2),yaw:+n.yaw.toFixed(2),walk:!!n.walking,clip:n.rigged?n.rigged.currentName:null}:null;})()`);
    if (n && n.walk) {
      const dx = -Math.sin(n.yaw), dz = -Math.cos(n.yaw);
      const px = n.x + dx * 3.5 + dz * 1.5, pz = n.z + dz * 3.5 - dx * 1.5;   // 前侧方机位
      const cy = Math.atan2(-(n.x - px), -(n.z - pz));
      await evaljs(`DebugAPI.teleport(${px}, ${pz}, ${cy}, ${n.y})`);
      await sleep(400);
      const s = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(join(ROOT, 'docs/screenshots', 'armstrong_walk.png'), Buffer.from(s.data, 'base64'));
      console.log('SHOT walk at clip:', n.clip, 'pos:', n.x, n.z);
      break;
    }
    if (i === 59) console.log('no walk in 2min window');
  }
  ws.close(); chrome.kill(); process.exit(0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
