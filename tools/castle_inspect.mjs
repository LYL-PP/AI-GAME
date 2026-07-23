// castle_inspect.mjs —— 撕裂带/北侧碎块特写（序章白天默认天气）
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9347;
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--enable-unsafe-swiftshader',`--remote-debugging-port=${PORT}`,`--user-data-dir=${join(ROOT,'tools/.chrome-profile-cinsp')}`,'--window-size=1280,720','about:blank'], { stdio: 'ignore', cwd: ROOT });
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
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Page.navigate', { url: 'http://localhost:8000/?chapter=0&play=1&fresh=1' });
  let ready = false;
  for (let i = 0; i < 40 && !ready; i++) { await sleep(1000); ready = await evaljs('!!(window.__scene && window.DebugAPI)'); }
  if (!ready) { console.log('FAIL: not ready'); chrome.kill(); process.exit(1); }
  await sleep(1500);
  // 1) 撕裂带特写（东侧平视）——CUT 后应只剩垫丘台面
  await evaljs('DebugAPI.teleport(40, -32, 1.5708)');
  await sleep(1200);
  await shot('insp2_tear.png');
  // 2) 撕裂带环境（东北 45°）
  await evaljs('DebugAPI.teleport(36, -18, 0.69)');
  await sleep(1200);
  await shot('insp2_tear_ctx.png');
  // 3) 北侧（岛背碎块区）
  await evaljs('DebugAPI.teleport(3, -48, 3.14159)');
  await sleep(1200);
  await shot('insp2_north.png');
  // 4) 西翼前角（左红框区：西翼墙+柴棚）
  await evaljs('DebugAPI.teleport(-30, 16, -0.6)');
  await sleep(1200);
  await shot('insp2_west.png');
  // 5) 内院看西墙内面底（内面残余缝复查）
  await evaljs('DebugAPI.teleport(-8, -6, 1.35)');
  await sleep(1200);
  await shot('insp2_court_w.png');
  // 6) 内院看东墙内面底
  await evaljs('DebugAPI.teleport(8, 0, -1.35)');
  await sleep(1200);
  await shot('insp2_court_e.png');
  ws.close(); chrome.kill(); process.exit(0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
