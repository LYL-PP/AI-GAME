// frag_ray.mjs —— side45 机位（34,30,yaw0.70）像素射线，钉东翼右侧悬片边界
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9362;
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--enable-unsafe-swiftshader',`--remote-debugging-port=${PORT}`,`--user-data-dir=${join(ROOT,'tools/.chrome-profile-frag')}`,'--window-size=1280,720','about:blank'], { stdio: 'ignore', cwd: ROOT });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let id = 0; const pending = new Map(); let ws;
const send = (m, p = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const evaljs = async (e) => {
  const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
  if (r?.exceptionDetails) console.log('EVAL ERR:', JSON.stringify(r.exceptionDetails).slice(0, 300));
  return r?.result?.value;
};
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
  await send('Page.navigate', { url: 'http://localhost:8000/?chapter=0&play=1&fresh=1&pos=34,30&yaw=0.70' });
  let ready = false;
  for (let i = 0; i < 40 && !ready; i++) { await sleep(1000); ready = await evaljs('!!(window.__scene && window.DebugAPI)'); }
  await sleep(1500);
  const res = await evaljs(`(async () => {
    const THREE = await import('./js/vendor/three.module.js');
    const st = window.DebugAPI.getState();
    const cam = new THREE.PerspectiveCamera(72, 1256/621, 0.1, 1000);
    cam.position.set(st.x, st.y + 1.6, st.z);
    cam.rotation.set(0, 0.70, 0);
    cam.updateMatrixWorld(true);
    const rc = new THREE.Raycaster();
    const out = [];
    // 悬片像素区（side45 画面右侧中部）：粗网格采样
    for (let py = 150; py <= 320; py += 20) {
      for (let px = 790; px <= 980; px += 15) {
        const ndc = new THREE.Vector2((px/1256)*2-1, -(py/621)*2+1);
        rc.setFromCamera(ndc, cam);
        const hits = rc.intersectObjects(window.__scene.children, true).filter((h) => {
          let o = h.object; while (o) { if (o.visible === false) return false; o = o.parent; } return true;
        });
        if (!hits.length) continue;
        const h = hits[0];
        // 只记录近处命中（城堡范围 d<80）
        if (h.distance < 80) out.push([px, py, +h.point.x.toFixed(1), +h.point.y.toFixed(1), +h.point.z.toFixed(1), +h.distance.toFixed(0)]);
      }
    }
    return JSON.stringify(out);
  })()`);
  const arr = JSON.parse(res);
  for (const r of arr) console.log(JSON.stringify(r));
  console.log('hits:', arr.length);
  ws.close(); chrome.kill(); process.exit(0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
