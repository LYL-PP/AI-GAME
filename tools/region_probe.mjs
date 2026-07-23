// region_probe.mjs —— 游戏坐标区域 [x 15-35, z -45..-12, y 5-30] 三角心散点（y<28）
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9349;
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--enable-unsafe-swiftshader',`--remote-debugging-port=${PORT}`,`--user-data-dir=${join(ROOT,'tools/.chrome-profile-creg')}`,'--window-size=1280,720','about:blank'], { stdio: 'ignore', cwd: ROOT });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let id = 0; const pending = new Map(); let ws;
const send = (m, p = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const evaljs = async (e) => {
  const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
  if (r?.exceptionDetails) console.log('EVAL ERR:', JSON.stringify(r.exceptionDetails).slice(0, 300));
  return r?.result?.value;
};
const PROBE = `(() => {
  const g = window.__scene.getObjectByName('scanCastle');
  if (!g) return 'no scanCastle';
  g.updateMatrixWorld(true);
  const pts = [];
  g.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    const pos = o.geometry.attributes.position;
    const idx = o.geometry.index ? o.geometry.index.array : null;
    const e = o.matrixWorld.elements;
    const triN = idx ? idx.length / 3 : pos.count / 3;
    for (let t = 0; t < triN; t++) {
      let cx = 0, cy = 0, cz = 0;
      for (let k = 0; k < 3; k++) {
        const vi = idx ? idx[t * 3 + k] : t * 3 + k;
        const x = pos.getX(vi), y = pos.getY(vi), z = pos.getZ(vi);
        cx += (e[0]*x + e[4]*y + e[8]*z + e[12]) / 3;
        cy += (e[1]*x + e[5]*y + e[9]*z + e[13]) / 3;
        cz += (e[2]*x + e[6]*y + e[10]*z + e[14]) / 3;
      }
      if (cx > 15 && cx < 35 && cz > -45 && cz < -12 && cy > 5 && cy < 28)
        pts.push([+cx.toFixed(1), +cz.toFixed(1), +cy.toFixed(1)]);
    }
  });
  return JSON.stringify(pts);
})()`;
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
  for (let i = 0; i < 40 && !ready; i++) { await sleep(1000); ready = await evaljs('!!(window.__scene && window.__scene.getObjectByName("scanCastle"))'); }
  if (!ready) { console.log('FAIL'); chrome.kill(); process.exit(1); }
  const res = JSON.parse(await evaljs(PROBE));
  console.log('centroid count:', res.length);
  // y 分层 × x/z 范围
  const bands = {};
  for (const [x, z, y] of res) {
    const b = Math.floor(y / 3) * 3;
    (bands[b] ||= []).push([x, z]);
  }
  for (const [b, arr] of Object.entries(bands).sort((a, b2) => a[0] - b2[0])) {
    const xs = arr.map((p) => p[0]), zs = arr.map((p) => p[1]);
    console.log(`y ${b}-${+b + 3}: n=${arr.length} x[${Math.min(...xs)},${Math.max(...xs)}] z[${Math.min(...zs)},${Math.max(...zs)}]`);
  }
  // y>=9 全量散点打印（找悬冠）
  console.log('--- y>=9 scatter ---');
  for (const p of res.filter((q) => q[2] >= 9)) console.log(JSON.stringify(p));
  ws.close(); chrome.kill(); process.exit(0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
