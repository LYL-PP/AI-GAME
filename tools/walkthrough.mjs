// walkthrough.mjs —— 录制动线全程走查（含指控运镜抓拍）
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9292;
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--enable-unsafe-swiftshader',`--remote-debugging-port=${PORT}`,`--user-data-dir=${join(ROOT,'tools/.chrome-profile-walk')}`,'--window-size=1280,720','about:blank'], { stdio: 'ignore', cwd: ROOT });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let id = 0; const pending = new Map(); let ws;
const send = (m, p = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const evaljs = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }))?.result?.value;
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
  await shot('w1_dock.png');                                     // 码头第一眼
  await evaljs('DebugAPI.teleport(0, 40, 0, 1.25)');
  await sleep(300);
  await shot('w2_jetty.png');                                    // 栈桥中段
  await evaljs(look(4.5, 27, 0, 18, 1.2));
  await sleep(300);
  await shot('w3_grass.png');                                    // 草丛路径
  await evaljs('DebugAPI.teleport(0, 12.2, 0, 1.8)');
  await sleep(300);
  await shot('w4_porch.png');                                    // 门廊（写实门楼）
  // 步行进大厅
  for (let i = 0; i < 30; i++) await evaljs('DebugAPI.move(0, -0.2)');
  await sleep(300);
  await shot('w5_hall_first.png');                               // 大厅进门第一眼
  await evaljs(look(-5.0, 0.9, -5.0, -0.5));
  await sleep(300);
  await shot('w6_figurines.png');                                // 瓷人特写
  await evaljs(look(3.3, 1.0, 4.6, -0.9));
  await sleep(300);
  await shot('w7_gramophone.png');                               // 留声机特写
  await evaljs(look(0.5, 5.6, 0, 2.9));
  await sleep(300);
  await shot('w8_chandelier.png');                               // 吊灯仰视
  // gather → 落座 → 圆桌全景
  await evaljs('PrologueAPI.gather()');
  for (let i = 0; i < 34; i++) { await sleep(3000); if ((await evaljs('PrologueAPI.state()')) === 'await_sit') break; }
  await evaljs(`(() => {
    const ids = ['wargrave','vera','lombard','marston'];
    let mx = 0, mz = 0;
    for (const i of ids) { const p = NPCAPI.get(i).pos; mx += p.x / 4; mz += p.z / 4; }
    DebugAPI.teleport(1.1, 2.5, Math.atan2(-(mx - 1.1), -(mz - 2.5)), 1.8);
  })()`);
  await sleep(400);
  await shot('w9_table.png');                                    // 圆桌全景
  // 指控运镜抓拍（提亮以便判读；rigged 四人）
  await evaljs('DebugAPI.teleport(2.2, 6.8, 0, 1.8)');
  await sleep(300);
  await evaljs('PrologueAPI.takeSeat()');
  await sleep(2600);
  await evaljs('WeatherAPI.setChapter(0)');
  const targets = [
    { key: '马尔斯顿', file: 'w10_cine_marston.png' },
    { key: '沃格雷夫', file: 'w11_cine_wargrave.png' },
    { key: '隆巴德', file: 'w12_cine_lombard.png' },
    { key: '维拉', file: 'w13_cine_vera.png' },
    { key: '滑下', file: 'w14_cine_faint.png' },
  ];
  const done = new Set();
  for (let i = 0; i < 420 && done.size < targets.length; i++) {
    const txt = await evaljs(`(document.getElementById('cineText')||{textContent:''}).textContent`);
    for (const t of targets) {
      if (!done.has(t.key) && txt && txt.includes(t.key)) {
        done.add(t.key);
        await sleep(1400);
        await shot(t.file);
      }
    }
    const st = await evaljs('PrologueAPI.state()');
    if (st === 'done' || st === 'idle') break;
    await sleep(700);
  }
  console.log('captured:', [...done].join(','));
  ws.close(); chrome.kill(); process.exit(0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
