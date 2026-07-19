import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9310;
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--enable-unsafe-swiftshader',`--remote-debugging-port=${PORT}`,`--user-data-dir=${join(ROOT,'tools/.chrome-profile-sv')}`,'--window-size=1280,720','about:blank'], { stdio: 'ignore', cwd: ROOT });
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
  await send('Page.navigate', { url: 'http://localhost:8000/?chapter=1&play=1&fresh=1' });
  await sleep(17000);
  const info = await evaljs(`(() => {
    const sofas = [];
    __scene.traverse((o) => {
      if (o.isGroup && Math.abs(o.scale.x - 0.00675) < 0.0005) sofas.push(['single', ...o.position.toArray().map(v => +v.toFixed(2))]);
      if (o.isGroup && Math.abs(o.scale.x - 0.01105) < 0.0005) sofas.push(['double', ...o.position.toArray().map(v => +v.toFixed(2))]);
    });
    const w = NPCAPI.get('wargrave'), b = NPCAPI.get('brent');
    const npc = (n) => n ? { x: +n.pos.x.toFixed(2), z: +n.pos.z.toFixed(2), act: n.action } : null;
    return { sofaCount: sofas.length, sofas, wargrave: npc(w), brent: npc(b) };
  })()`);
  console.log('VERIFY:', JSON.stringify(info));
  // 提亮到白天重拍 3 机位
  await evaljs('WeatherAPI.setChapter(2)');
  await sleep(800);
  const SHOTS = [
    [2.0, 1.2, Math.PI, 1.8, 'hall_south'],
    [-3.6, 4.0, 2.7, 1.8, 'armchair1'],       // 大厅扶手椅 (-2.5,5.5) 近景
    [-3.3, 6.2, 1.65, 1.8, 'rocker'],         // 摇椅 (-5.5,6.3) 近景（从正东侧平视）
    [1.2, 3.6, -2.39, 8.2, 'study_armchair'], // 书房
  ];
  for (const [x, z, yaw, y, name] of SHOTS) {
    await evaljs(`DebugAPI.teleport(${x}, ${z}, ${yaw}, ${y})`);
    await sleep(1500);
    await shot(`sofa_day_${name}.png`);
  }
  ws.close(); chrome.kill(); process.exit(0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
