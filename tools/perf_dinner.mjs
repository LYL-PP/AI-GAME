// perf_dinner.mjs —— 晚餐全员场景性能实测（renderer.info + FPS）
// 序章 gather 后全员围圆桌坐下（await_sit），此时 10 NPC + 场景全负载。
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9251;
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--enable-unsafe-swiftshader',`--remote-debugging-port=${PORT}`,`--user-data-dir=${join(ROOT,'tools/.chrome-profile')}`,'--window-size=1280,720','about:blank'], { stdio: 'ignore', cwd: ROOT });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let id = 0; const pending = new Map(); let ws;
const send = (m, p = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const evaljs = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }))?.result?.value;
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
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'http://localhost:8000/?chapter=0&play=1&fresh=1' });
  await sleep(14000);
  await evaljs('PrologueAPI.gather()');
  // 轮询至全员落座（无头低速，sim 时间约为墙钟一半，放宽到 ~100s）
  let st = '';
  for (let i = 0; i < 34; i++) { await sleep(3000); st = await evaljs('PrologueAPI.state()'); if (st === 'await_sit') break; }
  console.log('prologue state:', st);
  if (st !== 'await_sit') { console.error('FAIL: 未到达晚餐落座状态'); ws.close(); chrome.kill(); process.exit(1); }
  // 机位：拉到圆桌一侧看全员（取 marston 对面方向）
  await evaljs(`(() => {
    const n = NPCAPI.get('marston');
    const a = n.yaw;
    DebugAPI.teleport(n.pos.x - Math.sin(a) * 4.2, n.pos.z - Math.cos(a) * 4.2, a + Math.PI, n.pos.y + 0.4);
  })()`);
  await sleep(2500); // 稳定几帧，等动画/剔除收敛
  const info = await evaljs(`JSON.stringify((() => {
    const i = PerfAPI.info();
    return { calls: i.render.calls, triangles: i.render.triangles, lines: i.render.lines, points: i.render.points,
             geometries: i.memory.geometries, textures: i.memory.textures, programs: i.programs.length };
  })())`);
  console.log('RENDERER.INFO:', info);
  // FPS：连续计数 rAF 3 秒（SwiftShader 软渲染，仅作相对参考）
  const fps = await evaljs(`new Promise((res) => {
    let n = 0; const t0 = performance.now();
    const tick = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(tick); else res((n / ((performance.now() - t0) / 1000)).toFixed(1)); };
    requestAnimationFrame(tick);
  })`);
  console.log('FPS(SwiftShader):', fps);
  const s = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(ROOT, 'docs/screenshots', 'perf_dinner.png'), Buffer.from(s.data, 'base64'));
  console.log('SHOT: perf_dinner.png');
  ws.close(); chrome.kill(); process.exit(0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
