// stage_shots.mjs —— 分阶段加载全流程截图（节流 400KB/s 看进度条）
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9368;
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--enable-unsafe-swiftshader',`--remote-debugging-port=${PORT}`,`--user-data-dir=${join(ROOT,'tools/.chrome-profile-stage')}`,'--window-size=1280,720','about:blank'], { stdio: 'ignore', cwd: ROOT });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let id = 0; const pending = new Map(); let ws;
const send = (m, p = {}) => new Promise((r2) => { const i = ++id; pending.set(i, r2); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
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
  // 节流 ~2MB/s 模拟弱网（兼顾演示与时长）
  await send('Network.emulateNetworkConditions', { offline: false, latency: 60, downloadThroughput: 2 * 1024 * 1024, uploadThroughput: 2 * 1024 * 1024 });
  await send('Page.navigate', { url: 'http://localhost:8000/?fresh=1' });
  // 标题页秒出
  for (let i = 0; i < 30; i++) { await sleep(500); if (await evaljs('document.querySelector("#titleScreen .title-btns")?.style.display === "flex"')) break; }
  await shot('stage_1_title.png');
  // 点开始 → 加载页
  await evaljs('document.getElementById("btnStart").click()');
  await sleep(2500);
  await shot('stage_2_loading.png');   // 进度条 + 当前载入项
  // 等阶段 A 完成（fresh 模式：加载页隐藏即放行）
  for (let i = 0; i < 240; i++) { await sleep(1000); if (await evaljs('document.getElementById("loadScreen")?.style.display === "none"')) break; }
  console.log('A done (loadScreen hidden)');
  // 放行进入（直接隐藏 overlay，无头不便 pointer lock）
  await evaljs('document.getElementById("startOverlay").style.display = "none"');
  await sleep(600);
  await shot('stage_3_playable.png');  // 阶段 A 可玩帧（码头出生，城堡就位）
  // 走向别墅轮廓内 → 门口拦截（B 未完时）
  await evaljs('DebugAPI.teleport(0, 6, 0)');
  await sleep(1200);
  const gated = await evaljs('document.getElementById("gateWait").style.display');
  console.log('gate display:', gated);
  await shot('stage_4_gate.png');
  // 等 B 完成（WeatherAPI 就位）
  for (let i = 0; i < 240; i++) { await sleep(1000); if (await evaljs('!!(window.WeatherAPI && window.NPCAPI)')) break; }
  console.log('B done');
  await evaljs('DebugAPI.teleport(0, 10.5, 0)');
  await sleep(800);
  const gated2 = await evaljs('document.getElementById("gateWait").style.display');
  console.log('gate after B:', gated2);
  // 进大厅（显式落一层地面）
  await evaljs('DebugAPI.teleport(0, 4, 3.14159, 2.4)');
  await sleep(1500);
  await shot('stage_5_hall.png');      // 大厅就位帧
  ws.close(); chrome.kill(); process.exit(0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
