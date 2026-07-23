// castle_probe.mjs —— 扫描城堡底缘 vs 地形间隙探针
// 输出：整体 bbox、底缘格网（顶点最低 y / 地形高 / 间隙）、城堡周边地形参考网格
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9345;
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--enable-unsafe-swiftshader',`--remote-debugging-port=${PORT}`,`--user-data-dir=${join(ROOT,'tools/.chrome-profile-cprobe')}`,'--window-size=1280,720','about:blank'], { stdio: 'ignore', cwd: ROOT });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let id = 0; const pending = new Map(); let ws;
const send = (m, p = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const evaljs = async (e) => {
  const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
  if (r?.exceptionDetails) console.log('EVAL ERR:', JSON.stringify(r.exceptionDetails).slice(0, 400));
  return r?.result?.value;
};
const PROBE = `(() => {
  const g = window.__scene.getObjectByName('scanCastle');
  if (!g) return JSON.stringify({ err: 'no scanCastle' });
  g.updateMatrixWorld(true);
  const min = [1e9,1e9,1e9], max = [-1e9,-1e9,-1e9];
  const cells = new Map(); // key "x,z" -> minY
  g.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    const pos = o.geometry.attributes.position;
    const idx = o.geometry.index ? o.geometry.index.array : null;
    const e = o.matrixWorld.elements;
    const triN = idx ? idx.length / 3 : pos.count / 3;
    for (let t = 0; t < triN; t++) {
      // 按索引三角形口径（CUT 切除的三角不计入）
      let cx = 0, cy = 0, cz = 0;
      for (let k = 0; k < 3; k++) {
        const vi = idx ? idx[t * 3 + k] : t * 3 + k;
        const x = pos.getX(vi), y = pos.getY(vi), z = pos.getZ(vi);
        cx += (e[0]*x + e[4]*y + e[8]*z + e[12]) / 3;
        cy += (e[1]*x + e[5]*y + e[9]*z + e[13]) / 3;
        cz += (e[2]*x + e[6]*y + e[10]*z + e[14]) / 3;
      }
      if (cx < min[0]) min[0] = cx; if (cy < min[1]) min[1] = cy; if (cz < min[2]) min[2] = cz;
      if (cx > max[0]) max[0] = cx; if (cy > max[1]) max[1] = cy; if (cz > max[2]) max[2] = cz;
      if (cy < 6) {
        const k = Math.round(cx) + ',' + Math.round(cz);
        if (!cells.has(k) || cells.get(k) > cy) cells.set(k, cy);
      }
    }
  });
  const rows = [];
  for (const [k, my] of cells) {
    const [x, z] = k.split(',').map(Number);
    const gr = window.__col.groundAt(x, z, 50);
    const gap = my - gr;
    if (gap > 0.04) rows.push([x, z, +my.toFixed(2), +gr.toFixed(2), +gap.toFixed(2)]);
  }
  rows.sort((a, b) => b[4] - a[4]);
  // 周边地形参考（step 2）
  const ground = [];
  for (let x = -32; x <= 32; x += 2) for (let z = -26; z <= 30; z += 2)
    ground.push([x, z, +window.__col.groundAt(x, z, 50).toFixed(2)]);
  return JSON.stringify({
    bbox: { min: min.map((v) => +v.toFixed(2)), max: max.map((v) => +v.toFixed(2)) },
    floatCells: rows,
    ground,
  });
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
  // 就绪等待：__scene 挂上（禁缓存后大模型加载变慢）
  let ready = false;
  for (let i = 0; i < 40 && !ready; i++) {
    await sleep(1000);
    ready = await evaljs('!!(window.__scene && window.__scene.getObjectByName("scanCastle"))');
  }
  if (!ready) { console.log('FAIL: scene not ready in 40s'); chrome.kill(); process.exit(1); }
  const res = await evaljs(PROBE);
  const d = JSON.parse(res);
  if (d.err) { console.log('ERR', d.err); chrome.kill(); process.exit(1); }
  console.log('BBOX', JSON.stringify(d.bbox));
  console.log('FLOAT CELLS (x,z,vertY,ground,gap) top40:');
  for (const r of d.floatCells.slice(0, 40)) console.log(' ', JSON.stringify(r));
  console.log('float cell count:', d.floatCells.length);
  // 分区统计
  const zones = { south: [], east: [], west: [], north: [] };
  for (const [x, z, vy, gr, gap] of d.floatCells) {
    if (z > 13) zones.south.push([x, z, gap]);
    else if (x > 20) zones.east.push([x, z, gap]);
    else if (x < -20) zones.west.push([x, z, gap]);
    else if (z < -13) zones.north.push([x, z, gap]);
  }
  for (const [k, arr] of Object.entries(zones)) {
    if (!arr.length) { console.log(k + ': none'); continue; }
    const xs = arr.map((a) => a[0]), zs = arr.map((a) => a[1]), gs = arr.map((a) => a[2]);
    console.log(`${k}: n=${arr.length} x[${Math.min(...xs)},${Math.max(...xs)}] z[${Math.min(...zs)},${Math.max(...zs)}] gap[${Math.min(...gs).toFixed(2)},${Math.max(...gs).toFixed(2)}]`);
  }
  writeFileSync(join(ROOT, 'tools/.castle_probe.json'), JSON.stringify(d));
  ws.close(); chrome.kill(); process.exit(0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
