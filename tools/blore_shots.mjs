// 布洛尔接入验证：指控帧 / 投影近景 / 日程行走 / ch8 门廊死亡现场
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9334;
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--enable-unsafe-swiftshader',`--remote-debugging-port=${PORT}`,`--user-data-dir=${join(ROOT,'tools/.chrome-profile-bl')}`,'--window-size=1280,720','about:blank'], { stdio: 'ignore', cwd: ROOT });
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
  // 1) 指控运镜帧
  await evaljs('PrologueAPI.gather()');
  for (let i = 0; i < 34; i++) { await sleep(3000); if ((await evaljs('PrologueAPI.state()')) === 'await_sit') break; }
  await evaljs('DebugAPI.teleport(2.2, 6.8, 0, 1.8)');
  await sleep(300);
  await evaljs('PrologueAPI.takeSeat()');
  for (let i = 0; i < 420; i++) {
    const txt = await evaljs(`(document.getElementById('cineText')||{textContent:''}).textContent`);
    if (txt && txt.includes('布洛尔')) { await sleep(1500); await shot('blore_sit.png'); break; }
    const st = await evaljs('PrologueAPI.state()');
    if (st === 'done' || st === 'idle') break;
    await sleep(700);
  }
  // 2) 投影近景 + 3) 日程行走（切章重排触发走动）
  await evaljs('PrologueAPI.restore(); ChapterAPI.begin(2)');
  await sleep(4000);
  const n1 = await evaljs(`(()=>{const n=NPCAPI.get('blore');return n?{x:+n.pos.x.toFixed(2),y:+n.pos.y.toFixed(2),z:+n.pos.z.toFixed(2),yaw:+n.yaw.toFixed(2),act:n.action,walk:!!n.walking,clip:n.rigged?n.rigged.currentName:null}:null;})()`);
  console.log('blore@ch2:', JSON.stringify(n1));
  let idleShot = false, walkShot = false;
  for (let i = 0; i < 45 && (!idleShot || !walkShot); i++) {
    await sleep(2000);
    const n = await evaljs(`(()=>{const n=NPCAPI.get('blore');return n?{x:+n.pos.x.toFixed(2),z:+n.pos.z.toFixed(2),y:+n.pos.y.toFixed(2),yaw:+n.yaw.toFixed(2),walk:!!n.walking}:null;})()`);
    if (!n) break;
    const dx = -Math.sin(n.yaw), dz = -Math.cos(n.yaw);
    if (n.walk && !walkShot) {
      await sleep(2200);   // 等位移发生后，从已走到的前方侧向拍
      const n2 = await evaljs(`(()=>{const n=NPCAPI.get('blore');return n?{x:+n.pos.x.toFixed(2),z:+n.pos.z.toFixed(2),yaw:+n.yaw.toFixed(2)}:null;})()`);
      const b = n2 || n;
      const dx2 = -Math.sin(b.yaw), dz2 = -Math.cos(b.yaw);
      const px = b.x + dx2 * 3.5 + dz2 * 1.8, pz = b.z + dz2 * 3.5 - dx2 * 1.8;
      await evaljs(`DebugAPI.teleport(${px}, ${pz}, ${Math.atan2(-(b.x - px), -(b.z - pz))}, ${n.y})`);
      await sleep(400); await shot('blore_walk.png'); walkShot = true;
      console.log('walk shot at', b.x, b.z);
    } else if (!n.walk && !idleShot && i > 3) {
      const px = n.x + dx * 1.8, pz = n.z + dz * 1.8;
      await evaljs(`DebugAPI.teleport(${px}, ${pz}, ${Math.atan2(-(n.x - px), -(n.z - pz))}, ${n.y})`);
      await sleep(400); await shot('blore_close.png'); idleShot = true;
    }
  }
  // 4) ch8 门廊死亡现场
  await evaljs('ChapterAPI.begin(8)');
  await sleep(1200);
  await evaljs('StoryAPI.triggerDeath()');
  for (let i = 0; i < 40; i++) { await sleep(500); if ((await evaljs('ChapterAPI.state()')) === 'await') break; }
  const spot = JSON.parse(await evaljs('JSON.stringify(ChapterAPI.sceneSpot())'));
  console.log('ch8 spot:', JSON.stringify(spot));
  await evaljs(`DebugAPI.teleport(${spot.x - 2.6}, ${spot.z + 2.0}, ${Math.atan2(-(spot.x - (spot.x - 2.6)), -(spot.z - (spot.z + 2.0)))}, null)`);
  await sleep(1500);
  await shot('blore_dead.png');
  ws.close(); chrome.kill(); process.exit(0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
