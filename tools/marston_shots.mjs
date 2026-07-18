// marston_shots.mjs —— 马尔斯顿骨骼模型验证截图
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9242;
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
  console.log('rigged:', await evaljs('JSON.stringify({rigged: !!NPCAPI.get("marston").rigged, clip: NPCAPI.get("marston").rigged?.currentName})'));
  // 正面近景
  await evaljs(`(() => {
    const n = NPCAPI.get('marston');
    const a = n.yaw;
    DebugAPI.teleport(n.pos.x - Math.sin(a) * 1.9, n.pos.z - Math.cos(a) * 1.9, a + Math.PI, n.pos.y);
  })()`);
  await sleep(600);
  await shot('marston_front.png');
  // 行走中（gather 走向圆桌）
  await evaljs('PrologueAPI.gather()');
  await sleep(4500);
  await evaljs(`(() => {
    const n = NPCAPI.get('marston');
    const a = n.yaw;
    DebugAPI.teleport(n.pos.x - Math.sin(a) * 2.6, n.pos.z - Math.cos(a) * 2.6, a + Math.PI, n.pos.y);
  })()`);
  await sleep(300);
  await shot('marston_walk.png');
  // 晚餐坐姿（sitting clip）
  for (let i = 0; i < 34; i++) { await sleep(3000); if ((await evaljs('PrologueAPI.state()')) === 'await_sit') break; }
  await evaljs(`(() => {
    const n = NPCAPI.get('marston');
    const a = n.yaw;
    DebugAPI.teleport(n.pos.x - Math.sin(a) * 2.2, n.pos.z - Math.cos(a) * 2.2, a + Math.PI, n.pos.y);
  })()`);
  await sleep(1200);
  await shot('marston_sit.png');

  // 第 1 章 Dead clip：触发死亡，中段+末帧
  await send('Page.navigate', { url: 'http://localhost:8000/?chapter=1&play=1&fresh=1' });
  await sleep(12000);
  await evaljs('ChapterAPI.begin(1)');
  await sleep(500);
  await evaljs('StoryAPI.triggerDeath()');
  await sleep(1400);
  await evaljs('DebugAPI.teleport(9.2, 6.6, 0, 1.8)');
  await sleep(300);
  await shot('marston_dead_mid.png');
  await sleep(2600);
  await shot('marston_dead_final.png');
  ws.close(); chrome.kill(); process.exit(0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
