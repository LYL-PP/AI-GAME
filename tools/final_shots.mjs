// final_shots.mjs —— 收尾精简重拍（当前代码状态）
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9301;
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--enable-unsafe-swiftshader',`--remote-debugging-port=${PORT}`,`--user-data-dir=${join(ROOT,'tools/.chrome-profile-final')}`,'--window-size=1280,720','about:blank'], { stdio: 'ignore', cwd: ROOT });
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
  await shot('z_dock.png');                       // 码头第一眼
  await evaljs('DebugAPI.teleport(0, 12.2, 0, 1.8)');
  await sleep(300);
  await shot('z_porch.png');                      // 门廊/接缝盖板
  await evaljs(look(4.5, 26, 0, 18, 1.2));
  await sleep(300);
  await shot('z_grass.png');                      // 草丛路径
  await evaljs(look(-5.0, 0.9, -5.0, -0.5));
  await sleep(300);
  await shot('z_figurines.png');                  // 瓷人特写
  await evaljs(look(-3.2, 2.6, -5.0, -0.75));
  await sleep(300);
  await shot('z_fireplace.png');                  // 壁炉近景
  // 落座后：圆桌全景 + 餐椅近景
  await evaljs('PrologueAPI.gather()');
  for (let i = 0; i < 34; i++) { await sleep(3000); if ((await evaljs('PrologueAPI.state()')) === 'await_sit') break; }
  await evaljs(`(() => {
    const ids = ['wargrave','vera','lombard','marston'];
    let mx = 0, mz = 0;
    for (const i of ids) { const p = NPCAPI.get(i).pos; mx += p.x / 4; mz += p.z / 4; }
    DebugAPI.teleport(1.1, 2.5, Math.atan2(-(mx - 1.1), -(mz - 2.5)), 1.8);
  })()`);
  await sleep(400);
  await shot('z_table.png');                      // 圆桌全景
  await evaljs(`(() => {
    const v = NPCAPI.get('vera');
    const fx = -Math.sin(v.yaw), fz = -Math.cos(v.yaw);
    DebugAPI.teleport(v.pos.x + fx * 1.5 - Math.cos(v.yaw) * 0.8, v.pos.z + fz * 1.5 + Math.sin(v.yaw) * 0.8, v.yaw + 0.5, v.pos.y - 0.3);
  })()`);
  await sleep(400);
  await shot('z_chair_vera.png');                 // 餐椅+维拉落座近景
  // 指控运镜 2 帧（头脸居中）
  await evaljs('DebugAPI.teleport(2.2, 6.8, 0, 1.8)');
  await sleep(300);
  await evaljs('PrologueAPI.takeSeat()');
  await sleep(2600);
  await evaljs('WeatherAPI.setChapter(0)');
  const targets = [
    { key: '马尔斯顿', file: 'z_cine_marston.png' },
    { key: '维拉', file: 'z_cine_vera.png' },
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
