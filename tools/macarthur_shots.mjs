// 麦克阿瑟接入验证：投影近景 / 北岬望海(gaze_sea) / 晚餐坐姿 / ch3 死亡现场
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9331;
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--enable-unsafe-swiftshader',`--remote-debugging-port=${PORT}`,`--user-data-dir=${join(ROOT,'tools/.chrome-profile-mac')}`,'--window-size=1280,720','about:blank'], { stdio: 'ignore', cwd: ROOT });
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
  // 1) 晚餐坐姿（指控运镜帧）
  await evaljs('PrologueAPI.gather()');
  for (let i = 0; i < 34; i++) { await sleep(3000); if ((await evaljs('PrologueAPI.state()')) === 'await_sit') break; }
  await evaljs('DebugAPI.teleport(2.2, 6.8, 0, 1.8)');
  await sleep(300);
  await evaljs('PrologueAPI.takeSeat()');
  for (let i = 0; i < 420; i++) {
    const txt = await evaljs(`(document.getElementById('cineText')||{textContent:''}).textContent`);
    if (txt && txt.includes('麦克阿瑟')) { await sleep(1500); await shot('mac_sit.png'); break; }
    const st = await evaljs('PrologueAPI.state()');
    if (st === 'done' || st === 'idle') break;
    await sleep(700);
  }
  // 2) ch2 北岬望海（gaze_sea 坐姿）
  await evaljs('PrologueAPI.restore(); ChapterAPI.begin(2)');
  await sleep(4000);
  const n1 = await evaljs(`(()=>{const n=NPCAPI.get('macarthur');return n?{x:+n.pos.x.toFixed(2),y:+n.pos.y.toFixed(2),z:+n.pos.z.toFixed(2),yaw:+n.yaw.toFixed(2),act:n.action,clip:n.rigged?n.rigged.currentName:null}:null;})()`);
  console.log('macarthur@ch2:', JSON.stringify(n1));
  if (n1) {
    const dx = -Math.sin(n1.yaw), dz = -Math.cos(n1.yaw);
    const px = n1.x + dx * 3.0 + dz * 1.2, pz = n1.z + dz * 3.0 - dx * 1.2;
    const cy = Math.atan2(-(n1.x - px), -(n1.z - pz));
    await evaljs(`DebugAPI.teleport(${px}, ${pz}, ${cy}, null)`);
    await sleep(1200);
    await shot('mac_gaze.png');
  }
  // 3) 投影近景（同点位再近 1.6m 正面）
  if (n1) {
    const dx = -Math.sin(n1.yaw), dz = -Math.cos(n1.yaw);
    const px = n1.x + dx * 1.6, pz = n1.z + dz * 1.6;
    const cy = Math.atan2(-(n1.x - px), -(n1.z - pz));
    await evaljs(`DebugAPI.teleport(${px}, ${pz}, ${cy}, null)`);
    await sleep(1000);
    await shot('mac_close.png');
  }
  // 4) ch3 死亡现场
  await evaljs('ChapterAPI.begin(3)');
  await sleep(1200);
  await evaljs('StoryAPI.triggerDeath()');
  for (let i = 0; i < 40; i++) { await sleep(500); if ((await evaljs('ChapterAPI.state()')) === 'await') break; }
  const spot = JSON.parse(await evaljs('JSON.stringify(ChapterAPI.sceneSpot())'));
  const st3 = await evaljs(`(()=>{const n=NPCAPI.get('macarthur');return n?{clip:n.rigged?n.rigged.currentName:null,dead:n.dead,rx:+n.group.rotation.x.toFixed(2)}:null;})()`);
  console.log('ch3 mac state:', JSON.stringify(st3), 'spot:', JSON.stringify(spot));
  await evaljs(`DebugAPI.teleport(${spot.x + 2.4}, ${spot.z + 2.4}, ${Math.atan2(-(spot.x - (spot.x + 2.4)), -(spot.z - (spot.z + 2.4)))}, null)`);
  await sleep(1500);
  await shot('mac_dead.png');
  ws.close(); chrome.kill(); process.exit(0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
