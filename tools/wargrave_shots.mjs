// wargrave_shots.mjs —— 骨骼法官贴图验证截图
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9241;
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--enable-unsafe-swiftshader',`--remote-debugging-port=${PORT}`,`--user-data-dir=${join(ROOT,'tools/.chrome-profile')}`,'--window-size=1280,720','about:blank'], { stdio: 'ignore', cwd: ROOT });
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
  for (let i = 0; i < 40 && !wsUrl; i++) {
    try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); wsUrl = l.find((t) => t.type === 'page')?.webSocketDebuggerUrl; } catch {}
    if (!wsUrl) await sleep(500);
  }
  ws = new WebSocket(wsUrl);
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
  await new Promise((r) => { ws.onopen = r; });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Page.navigate', { url: 'http://localhost:8000/?chapter=0&play=1&fresh=1' });
  await sleep(14000);
  console.log('rigged:', await evaljs('!!NPCAPI.get("wargrave").rigged'));
  // 正面近景（法官在大厅扶手椅旁，相机从其朝向正面拍）
  await evaljs(`(() => {
    const n = NPCAPI.get('wargrave');
    const a = n.yaw;
    DebugAPI.teleport(n.pos.x - Math.sin(a) * 2.0, n.pos.z - Math.cos(a) * 2.0, a + Math.PI, n.pos.y);
  })()`);
  await sleep(600);
  await shot('wargrave_front.png');
  // 侧面近景
  await evaljs(`(() => {
    const n = NPCAPI.get('wargrave');
    const a = n.yaw + Math.PI / 2;
    DebugAPI.teleport(n.pos.x - Math.sin(a) * 2.0, n.pos.z - Math.cos(a) * 2.0, a + Math.PI, n.pos.y);
  })()`);
  await sleep(600);
  await shot('wargrave_side.png');
  // 日程行走中（序章 gather 触发后法官走向圆桌，机位在路径侧前方）
  await evaljs('PrologueAPI.gather()');
  await sleep(6000);
  await evaljs(`(() => {
    const n = NPCAPI.get('wargrave');
    const a = n.yaw;
    DebugAPI.teleport(n.pos.x - Math.sin(a + 0.9) * 2.6, n.pos.z - Math.cos(a + 0.9) * 2.6, a + Math.PI - 0.9, n.pos.y);
  })()`);
  await sleep(300);
  await shot('wargrave_walk.png');
  // 晚餐全员
  for (let i = 0; i < 34; i++) { await sleep(3000); if ((await evaljs('PrologueAPI.state()')) === 'await_sit') break; }
  await evaljs('DebugAPI.teleport(2.2, 6.8, 0, 1.8)');
  await sleep(300);
  await evaljs('PrologueAPI.takeSeat()');
  await sleep(3000);
  await shot('wargrave_dinner.png');
  // ch6 假死现场（dying clip 末帧定格）
  await send('Page.navigate', { url: 'http://localhost:8000/?chapter=6&play=1&fresh=1' });
  await sleep(12000);
  await evaljs('StoryAPI.triggerDeath()');
  await sleep(2500);
  const s6 = JSON.parse(await evaljs('JSON.stringify(ChapterAPI.sceneSpot())'));
  await evaljs(`DebugAPI.teleport(${s6.x + 1.6}, ${s6.z + 1.6}, 0.8, ${s6.y})`);
  await sleep(2500);
  await shot('wargrave_ch6_dying.png');
  ws.close(); chrome.kill(); process.exit(0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
