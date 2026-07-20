// 罗杰斯太太接入验证：指控帧(联合镜头) / 厨房位 / ch1 床上 sleep / ch2 死亡现场
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9342;
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--enable-unsafe-swiftshader',`--remote-debugging-port=${PORT}`,`--user-data-dir=${join(ROOT,'tools/.chrome-profile-mr')}`,'--window-size=1280,720','about:blank'], { stdio: 'ignore', cwd: ROOT });
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
  await send('Page.navigate', { url: 'http://localhost:8000/?chapter=0&play=1&fresh=1' });
  await sleep(17000);
  // 1) 指控运镜帧（mrs_rogers 字幕"埃塞尔·罗杰斯"）
  await evaljs('PrologueAPI.gather()');
  for (let i = 0; i < 34; i++) { await sleep(3000); if ((await evaljs('PrologueAPI.state()')) === 'await_sit') break; }
  await evaljs('DebugAPI.teleport(2.2, 6.8, 0, 1.8)');
  await sleep(300);
  await evaljs('PrologueAPI.takeSeat()');
  for (let i = 0; i < 420; i++) {
    const txt = await evaljs(`(document.getElementById('cineText')||{textContent:''}).textContent`);
    if (txt && txt.includes('埃塞尔')) { await sleep(1500); await shot('mrs_sit.png'); break; }
    const st = await evaljs('PrologueAPI.state()');
    if (st === 'done' || st === 'idle') break;
    await sleep(700);
  }
  // 2) 昏厥帧（faint 段：罗杰斯太太滑下椅子）
  for (let i = 0; i < 90; i++) {
    const st = await evaljs('PrologueAPI.state()');
    if (st === 'faint') { await sleep(1200); await shot('mrs_faint.png'); break; }
    if (st === 'done' || st === 'idle') break;
    await sleep(1000);
  }
  // 3) 厨房位（ch1 日程）
  await evaljs('PrologueAPI.restore(); ChapterAPI.begin(1)');
  await sleep(5000);
  const n1 = await evaljs(`(()=>{const n=NPCAPI.get('mrs_rogers');return n?{x:+n.pos.x.toFixed(2),y:+n.pos.y.toFixed(2),z:+n.pos.z.toFixed(2),yaw:+n.yaw.toFixed(2),act:n.action,clip:n.rigged?n.rigged.currentName:null}:null;})()`);
  console.log('mrs_rogers@ch1:', JSON.stringify(n1));
  if (n1) {
    const dx = -Math.sin(n1.yaw), dz = -Math.cos(n1.yaw);
    const px = n1.x + dx * 2.0 + dz * 0.8, pz = n1.z + dz * 2.0 - dx * 0.8;
    await evaljs(`DebugAPI.teleport(${px}, ${pz}, ${Math.atan2(-(n1.x - px), -(n1.z - pz))}, ${n1.y})`);
    await sleep(1200);
    await shot('mrs_kitchen.png');
  }
  // 4) ch2 死亡现场（卧室床上；先提亮再触发）
  await evaljs('WeatherAPI.setChapter(8)');
  await evaljs('ChapterAPI.begin(2)');
  await sleep(1200);
  await evaljs('StoryAPI.triggerDeath()');
  for (let i = 0; i < 40; i++) { await sleep(500); if ((await evaljs('ChapterAPI.state()')) === 'await') break; }
  const st2 = await evaljs(`(()=>{const n=NPCAPI.get('mrs_rogers');return n?{clip:n.rigged?n.rigged.currentName:null,dead:n.dead,rx:+n.group.rotation.x.toFixed(2),act:n.action}:null;})()`);
  console.log('ch2 mrs state:', JSON.stringify(st2));
  await evaljs(`DebugAPI.teleport(${9.1 + 1.6}, ${-6.6 + 1.6}, ${Math.atan2(-(9.1 - (9.1 + 1.6)), -(-6.6 - (-6.6 + 1.6)))}, 5.0)`);
  await sleep(1500);
  await shot('mrs_dead.png');
  ws.close(); chrome.kill(); process.exit(0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
