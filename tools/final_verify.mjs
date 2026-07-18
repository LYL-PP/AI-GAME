// final_verify.mjs —— 全道具终验 + 性能
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9288;
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--enable-unsafe-swiftshader',`--remote-debugging-port=${PORT}`,`--user-data-dir=${join(ROOT,'tools/.chrome-profile-props')}`,'--window-size=1280,720','about:blank'], { stdio: 'ignore', cwd: ROOT });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let id = 0; const pending = new Map(); let ws;
const send = (m, p = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const evaljs = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }))?.result?.value;
const INFO = `JSON.stringify((() => { const i = PerfAPI.info(); return { calls: i.render.calls, triangles: i.render.triangles, programs: i.programs.length }; })())`;
async function shot(name) {
  const s = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(ROOT, 'docs/screenshots', name), Buffer.from(s.data, 'base64'));
  console.log('SHOT:', name);
}
const look = (px, pz, tx, tz, y = 1.8) => `DebugAPI.teleport(${px}, ${pz}, ${Math.atan2(-(tx - px), -(tz - pz))}, ${y})`;
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
  await sleep(17000);
  console.log('DOCK:', await evaljs(INFO));
  await evaljs(look(-5.0, 0.9, -5.0, -0.5));      // 瓷人特写（结算机位）
  await sleep(400);
  await shot('f_figurines.png');
  await evaljs(look(-5.0, 2.8, -5.0, -1.0));     // 壁炉全景
  await sleep(400);
  await shot('f_fireplace.png');
  await evaljs(look(-1.5, 6.8, 2.5, 4.0));       // 圆桌+餐椅
  await sleep(400);
  await shot('f_table.png');
  await evaljs(look(3.3, 1.0, 4.6, -0.9));       // 留声机特写（指控机位）
  await sleep(400);
  await shot('f_gramophone.png');
  console.log('HALL:', await evaljs(INFO));
  await evaljs(look(0.5, 5.5, -2.0, -0.5));      // 吊灯+烛台氛围
  await sleep(400);
  await shot('f_chandelier.png');
  await evaljs('DebugAPI.teleport(0, 40, 0, 1.25)'); // 栈道中段看新栈桥
  await sleep(400);
  await shot('f_jetty.png');
  await evaljs(look(-2.5, 22, 2.5, 18, 1.2));    // 路径草丛
  await sleep(400);
  await shot('f_grass.png');
  // 晚餐全员性能
  await evaljs('PrologueAPI.gather()');
  let st = '';
  for (let i = 0; i < 34; i++) { await sleep(3000); st = await evaljs('PrologueAPI.state()'); if (st === 'await_sit') break; }
  console.log('DINNER:', await evaljs(INFO));
  await evaljs('DebugAPI.teleport(1.1, 2.5, ' + Math.atan2(-(3.9 - 1.1), -(4.9 - 2.5)) + ', 1.8)');
  await sleep(400);
  await shot('f_dinner.png');
  ws.close(); chrome.kill(); process.exit(0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
