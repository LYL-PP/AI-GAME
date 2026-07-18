// scan_verify.mjs —— 扫描城堡/大厅首轮游戏内验收截图
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9261;
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
  console.log('errors:', await evaljs('window.__lastError || "none"'));
  // 1) 码头第一眼（出生点不动）
  await shot('v1_dock.png');
  // 2) 门廊近景（露台望向正门/城堡门楼）
  await evaljs('DebugAPI.teleport(0, 11.6, 0)');
  await sleep(500);
  await shot('v1_porch.png');
  // 3) 大厅内景（进门第一眼，望向壁炉）
  await evaljs('DebugAPI.teleport(0.3, 7.0, 0.35)');
  await sleep(500);
  await shot('v1_hall_entry.png');
  // 4) 大厅望向门口（逆光）
  await evaljs('DebugAPI.teleport(0.2, -0.8, Math.PI)');
  await sleep(500);
  await shot('v1_hall_backlit.png');
  // 5) 大厅望向圆桌/南墙
  await evaljs('DebugAPI.teleport(-5.5, 0.5, -2.2)');
  await sleep(500);
  await shot('v1_hall_table.png');
  // 6) 二楼走廊（确认楼板衔接）
  await evaljs('DebugAPI.teleport(-4, 0, -1.2, 5.0)');
  await sleep(500);
  await shot('v1_f2_corridor.png');
  // 7) 城堡东侧外观（确认别墅角楼未穿出）
  await evaljs('DebugAPI.teleport(22, 30, Math.atan2(-(0 - 22), -(9 - 30))');
  await sleep(500);
  await shot('v1_castle_east.png');
  // 8) 城堡北面（后山视角）
  await evaljs('DebugAPI.teleport(0, -22, Math.PI)');
  await sleep(500);
  await shot('v1_castle_north.png');
  ws.close(); chrome.kill(); process.exit(0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
