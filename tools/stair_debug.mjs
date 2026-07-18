// stair_debug.mjs —— 楼梯行走逐步诊断
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9225;
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--enable-unsafe-swiftshader',`--remote-debugging-port=${PORT}`,`--user-data-dir=${join(ROOT,'tools/.chrome-profile')}`,'--window-size=1280,720','about:blank'], { stdio: 'ignore', cwd: ROOT });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let id = 0; const pending = new Map(); let ws;
const send = (m, p = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const evaljs = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }))?.result?.value;
async function main() {
  let wsUrl;
  for (let i = 0; i < 40 && !wsUrl; i++) {
    try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); wsUrl = l.find((t) => t.type === 'page')?.webSocketDebuggerUrl; } catch {}
    if (!wsUrl) await sleep(500);
  }
  ws = new WebSocket(wsUrl);
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
  await new Promise((r) => { ws.onopen = r; });
  await send('Page.enable');
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true }); await send('Runtime.enable');
  await send('Page.navigate', { url: 'http://localhost:8000/?chapter=0&play=1' });
  await sleep(11000);
  const trace = await evaljs(`(() => {
    const D = window.DebugAPI;
    const log = [];
    D.teleport(-9, 1.5, 0, 5.0);
    log.push(['start', JSON.stringify(D.getState())]);
    const path = [[-11, 1.7], [-11, 0], [-11, -1.2], [-11, -2.2], [-9, -2.5], [-9, -1.0], [-9, -0.4], [-8.6, 0.5]];
    for (const [tx, tz] of path) {
      for (let i = 0; i < 60; i++) {
        const s = D.getState();
        const dx = tx - s.x, dz = tz - s.z;
        if (Math.hypot(dx, dz) < 0.12) break;
        const l = Math.hypot(dx, dz);
        D.move(dx / l * 0.1, dz / l * 0.1);
      }
      const s = D.getState();
      log.push(['wp(' + tx + ',' + tz + ')', JSON.stringify(s)]);
    }
    return JSON.stringify(log);
  })()`);
  for (const l of JSON.parse(trace)) console.log(l[0], '→', l[1]);
  // 诊断：找出阻挡 (-11,-0.6) 的碰撞盒
  const diag = await evaljs(`(() => {
    const D = window.DebugAPI;
    const px=-11, pz=-0.6, feet=3.2, height=1.7, r=0.35;
    const boxes = (window.__col ? window.__col.boxes : []);
    const hits = boxes.filter(b => !(feet+0.35>=b.y2) && !(feet+height<=b.y1) &&
      Math.max(b.x1, Math.min(px, b.x2)) - px < r && px - Math.max(b.x1, Math.min(px, b.x2)) < r &&
      ((cx=Math.max(b.x1,Math.min(px,b.x2)), cz=Math.max(b.z1,Math.min(pz,b.z2)), (px-cx)**2+(pz-cz)**2 < r*r)));
    return JSON.stringify(hits);
  })()`);
  console.log('BLOCKERS:', diag);
  // 微步探测：从 (-10.3,-2.5,3.4) 向东 0.05 步长
  const probe = await evaljs(`(() => {
    const D = window.DebugAPI, col = window.__col;
    const log = [];
    D.teleport(-9.5, 1.5, 0, 5.0);
    for (let i = 0; i < 14; i++) {
      const before = D.getState();
      D.move(-0.05, 0);
      const after = D.getState();
      log.push(before.x.toFixed(2) + '->' + after.x.toFixed(2) + ' y=' + after.y + ' g=' + after.ground);
    }
    const feet=5.0, height=1.7, r=0.35;
    const hits = [];
    for (let px=-9.6; px>=-10.5; px-=0.1) {
      for (const b of col.boxes) {
        if (feet+0.35>=b.y2 || feet+height<=b.y1) continue;
        const cx=Math.max(b.x1,Math.min(px,b.x2)), cz=Math.max(b.z1,Math.min(1.5,b.z2));
        if ((px-cx)**2+(1.5-cz)**2 < r*r) { hits.push({px:+px.toFixed(2), b}); break; }
      }
    }
    return JSON.stringify({log, hits});
  })()`);
  console.log('PROBE:', probe);
  ws.close(); chrome.kill(); process.exit(0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
