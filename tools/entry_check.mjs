// entry_check.mjs —— 进门动线步行验证 + 终版机位截图
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9266;
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--enable-unsafe-swiftshader',`--remote-debugging-port=${PORT}`,`--user-data-dir=${join(ROOT,'tools/.chrome-profile-verify')}`,'--window-size=1280,720','about:blank'], { stdio: 'ignore', cwd: ROOT });
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
  await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Page.navigate', { url: 'http://localhost:8000/?chapter=0&play=1&fresh=1' });
  await sleep(16000);
  // 步行验证：门廊 (0,11.6) 朝北连走 60 步（每步 0.2m）应进入大厅
  await evaljs('DebugAPI.teleport(0, 11.6, 0, 1.8)');
  await sleep(400);
  for (let i = 0; i < 60; i++) await evaljs('DebugAPI.move(0, -0.2)');
  console.log('走完位置:', await evaljs('JSON.stringify(DebugAPI.getState())'));
  await shot('v4_hall_first_look.png');
  // 门外看门斗（facade + 雨棚 + 门洞）
  await evaljs('DebugAPI.teleport(0, 9.4, 0, 1.8)');
  await sleep(400);
  await shot('v4_door_front.png');
  // 大厅中心看吊灯罩（平视北）
  await evaljs('DebugAPI.teleport(0.5, 4.5, 0.6, 1.8)');
  await sleep(400);
  await shot('v4_fixture.png');
  // 东侧黑色碎片区（圆桌旁看东南）
  await evaljs('DebugAPI.teleport(2.5, 4.0, -2.4, 1.8)');
  await sleep(400);
  await shot('v4_east_blob.png');
  // 码头第一眼（Kenney 外壳回退验证）
  await evaljs('DebugAPI.teleport(0, 58, 0, 1.25)');
  await sleep(400);
  await shot('v4_dock.png');
  ws.close(); chrome.kill(); process.exit(0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
