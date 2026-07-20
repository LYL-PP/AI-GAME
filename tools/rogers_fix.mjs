import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9336;
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--enable-unsafe-swiftshader',`--remote-debugging-port=${PORT}`,`--user-data-dir=${join(ROOT,'tools/.chrome-profile-rf')}`,'--window-size=1280,720','about:blank'], { stdio: 'ignore', cwd: ROOT });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let id = 0; const pending = new Map(); let ws;
const send = (m, p = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const evaljs = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }))?.result?.value;
async function shot(name) {
  const s = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(ROOT, 'docs/screenshots', name), Buffer.from(s.data, 'base64'));
  console.log('SHOT:', name);
}
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
  await evaljs('WeatherAPI.setChapter(8)');
  await sleep(600);
  const n1 = await evaljs(`(()=>{const n=NPCAPI.get('rogers');return n?{x:+n.pos.x.toFixed(2),y:+n.pos.y.toFixed(2),z:+n.pos.z.toFixed(2),yaw:+n.yaw.toFixed(2),trayVis:n.trayProp?n.trayProp.visible:null}:null;})()`);
  console.log('rogers:', JSON.stringify(n1));
  if (n1) {
    const dx = -Math.sin(n1.yaw), dz = -Math.cos(n1.yaw);
    const px = n1.x + dx * 1.8 + dz * 0.7, pz = n1.z + dz * 1.8 - dx * 0.7;
    await evaljs(`DebugAPI.teleport(${px}, ${pz}, ${Math.atan2(-(n1.x - px), -(n1.z - pz))}, ${n1.y})`);
    await sleep(1200);
    await shot('rogers_serve.png');
  }
  await evaljs('WeatherAPI.setChapter(8)');
  await evaljs('ChapterAPI.begin(4)');
  await sleep(1200);
  await evaljs('StoryAPI.triggerDeath()');
  for (let i = 0; i < 40; i++) { await sleep(500); if ((await evaljs('ChapterAPI.state()')) === 'await') break; }
  const spot = JSON.parse(await evaljs('JSON.stringify(ChapterAPI.sceneSpot())'));
  console.log('rogers dead state:', JSON.stringify(await evaljs(`(()=>{const n=NPCAPI.get('rogers');return n?{pos:{x:+n.pos.x.toFixed(1),y:+n.pos.y.toFixed(1),z:+n.pos.z.toFixed(1)},gp:{x:+n.group.position.x.toFixed(1),y:+n.group.position.y.toFixed(1),z:+n.group.position.z.toFixed(1)},rx:+n.group.rotation.x.toFixed(2),vis:n.group.visible,clip:n.rigged?n.rigged.currentName:null,dead:n.dead}:null;})()`))); await evaljs(`DebugAPI.teleport(${spot.x + 3.5}, ${spot.z + 2.5}, 0.95, ${spot.y + 1.0})`);
  await sleep(1500);
  await shot('rogers_dead.png');
  ws.close(); chrome.kill(); process.exit(0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
