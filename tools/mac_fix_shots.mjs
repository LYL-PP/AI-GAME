import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9333;
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--enable-unsafe-swiftshader',`--remote-debugging-port=${PORT}`,`--user-data-dir=${join(ROOT,'tools/.chrome-profile-mf')}`,'--window-size=1280,720','about:blank'], { stdio: 'ignore', cwd: ROOT });
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
  await send('Page.navigate', { url: 'http://localhost:8000/?chapter=0&play=1&fresh=1' });
  await sleep(16000);
  // gaze_sea：强制落位北岬长椅验证播放路径
  await evaljs(`(()=>{const n=NPCAPI.get('macarthur');n.place(0,0.98,-77.1,Math.PI);n.setAction('gaze_sea');})()`);
  await sleep(2500);
  const st = await evaljs(`(()=>{const n=NPCAPI.get('macarthur');return {act:n.action,clip:n.rigged?n.rigged.currentName:null};})()`);
  console.log('gaze state:', JSON.stringify(st));
  await evaljs('WeatherAPI.setChapter(8)'); await sleep(500); await evaljs('DebugAPI.teleport(-3.2, -74.8, -1.9, null)');   // 东南 3.5m 回望西北长椅
  await sleep(1200);
  await shot('mac_gaze.png');
  // ch3 死亡现场（绕开 signPost：从西侧拍）
  await evaljs('ChapterAPI.begin(3)');
  await sleep(1200);
  await evaljs('StoryAPI.triggerDeath()');
  for (let i = 0; i < 40; i++) { await sleep(500); if ((await evaljs('ChapterAPI.state()')) === 'await') break; }
  await evaljs('DebugAPI.teleport(-3.2, -74.8, -1.9, null)');
  await sleep(1500);
  await shot('mac_dead.png');
  ws.close(); chrome.kill(); process.exit(0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
