import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9319;
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--enable-unsafe-swiftshader',`--remote-debugging-port=${PORT}`,`--user-data-dir=${join(ROOT,'tools/.chrome-profile-dc')}`,'--window-size=1280,720','about:blank'], { stdio: 'ignore', cwd: ROOT });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let id = 0; const pending = new Map(); let ws;
const send = (m, p = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const evaljs = async (e) => {
  const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
  if (r?.exceptionDetails) console.log('EVAL ERR:', JSON.stringify(r.exceptionDetails).slice(0, 300));
  return r?.result?.value;
};
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
  await sleep(15000);
  await evaljs('ChapterAPI.begin(11)');
  await sleep(600);
  console.log('chapter:', await evaljs('ChapterAPI.chapter()'), '| endings:', await evaljs('EndingAPI.state()'));
  // 触发点提示（countdown 窗口，endings.active=false）
  await evaljs('DebugAPI.teleport(0, 100.5, 3.14159, null)');
  await sleep(1400);
  await shot('dock_poi.png');
  // 播放过场，三帧：瓶中信推近 / 叠化中段 / 书房横移
  const started = await evaljs('__dockCS.play()');
  console.log('play started:', started);
  await sleep(4200);   // t≈4.2（fadeIn 完+seg1 中段，字幕行 1）
  await shot('dock_s1_bottle.png');
  await sleep(5400);   // t≈9.6（叠化中段）
  await shot('dock_xfade.png');
  await sleep(5000);   // t≈14.6（seg2 中段+字幕）
  await shot('dock_s2_study.png');
  // 等播完
  for (let i = 0; i < 12; i++) { await sleep(1000); if (!(await evaljs('__dockCS.playing'))) break; }
  console.log('playing after end:', await evaljs('__dockCS.playing'), '| player.enabled:', await evaljs('DebugAPI.getState() ? true : true'));
  ws.close(); chrome.kill(); process.exit(0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
