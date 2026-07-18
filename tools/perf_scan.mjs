// perf_scan.mjs —— 扫描件替换后性能实测（码头全景 + 大厅内视角）
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9267;
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--enable-unsafe-swiftshader',`--remote-debugging-port=${PORT}`,`--user-data-dir=${join(ROOT,'tools/.chrome-profile-verify')}`,'--window-size=1280,720','about:blank'], { stdio: 'ignore', cwd: ROOT });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let id = 0; const pending = new Map(); let ws;
const send = (m, p = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const evaljs = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }))?.result?.value;
const INFO = `JSON.stringify((() => { const i = PerfAPI.info(); return { calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures, programs: i.programs.length }; })())`;
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
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'http://localhost:8000/?chapter=0&play=1&fresh=1' });
  await sleep(16000);
  // 码头全景（出生视角看城堡+海岛）
  await sleep(2000);
  console.log('DOCK:', await evaljs(INFO));
  // 大厅内视角（望向北壁炉，含全部 NPC + 扫描厅 236k）
  await evaljs('DebugAPI.teleport(0.5, 5.5, 0.5, 1.8)');
  await sleep(2500);
  console.log('HALL:', await evaljs(INFO));
  // 晚餐全员（对比基线）
  await evaljs('PrologueAPI.gather()');
  let st = '';
  for (let i = 0; i < 34; i++) { await sleep(3000); st = await evaljs('PrologueAPI.state()'); if (st === 'await_sit') break; }
  await evaljs('DebugAPI.teleport(0.5, 5.5, 0.5, 1.8)');
  await sleep(2500);
  console.log('DINNER:', await evaljs(INFO));
  const s = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(ROOT, 'docs/screenshots', 'v4_perf_dinner.png'), Buffer.from(s.data, 'base64'));
  ws.close(); chrome.kill(); process.exit(0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
