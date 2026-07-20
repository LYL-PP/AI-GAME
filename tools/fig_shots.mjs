// 瓷人换模验证：白天特写 / 烛光特写 / 结算碎裂 / 圆桌远景
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9344;
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--enable-unsafe-swiftshader',`--remote-debugging-port=${PORT}`,`--user-data-dir=${join(ROOT,'tools/.chrome-profile-fig')}`,'--window-size=1280,720','about:blank'], { stdio: 'ignore', cwd: ROOT });
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
  // 1) 白天壁炉台特写（提亮）
  await evaljs('WeatherAPI.setChapter(8)');
  await sleep(600);
  await evaljs('DebugAPI.teleport(-5.0, 1.5, 0, 2.35)');
  await sleep(1200);
  await shot('fig_day.png');
  // 2) 烛光特写（chapter 1 夜）
  await evaljs('WeatherAPI.setChapter(1)');
  await sleep(600);
  await shot('fig_candle.png');
  // 3) 圆桌远景含壁炉台（白天恢复）
  await evaljs('WeatherAPI.setChapter(8)');
  await sleep(400);
  await evaljs('DebugAPI.teleport(-1.0, 3.5, 0.81, 1.8)');
  await sleep(1200);
  await shot('fig_wide.png');
  // 4) 结算碎裂（FigurineAPI.breakNext 触发演出）
  await evaljs('FigurineAPI.breakNext(1)');
  for (let i = 0; i < 30; i++) { await sleep(400); if (await evaljs('FigurineAPI.count()') !== undefined) break; }
  await sleep(2500);
  await shot('fig_shatter.png');
  ws.close(); chrome.kill(); process.exit(0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
