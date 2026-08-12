// vc_check.mjs —— 运行页检查 scanCastle 顶点色与尖刺区三角
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9353;
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--enable-unsafe-swiftshader',`--remote-debugging-port=${PORT}`,`--user-data-dir=${join(ROOT,'tools/.chrome-profile-vcc')}`,'--window-size=1280,720','about:blank'], { stdio: 'ignore', cwd: ROOT });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let id = 0; const pending = new Map(); let ws;
const send = (m, p = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const evaljs = async (e) => {
  const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
  if (r?.exceptionDetails) console.log('EVAL ERR:', JSON.stringify(r.exceptionDetails).slice(0, 400));
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
  await send('Page.navigate', { url: 'http://localhost:8000/?chapter=0&play=1&fresh=1' });
  let ready = false;
  for (let i = 0; i < 40 && !ready; i++) { await sleep(1000); ready = await evaljs('!!(window.__scene && window.__scene.getObjectByName("scanCastle"))'); }
  if (!ready) { console.log('FAIL not ready'); chrome.kill(); process.exit(1); }
  const res = await evaljs(`(() => {
    const g = window.__scene.getObjectByName('scanCastle');
    const out = [];
    g.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      const hasCol = !!o.geometry.attributes.color;
      const vc = o.material.vertexColors;
      // 尖刺区顶点统计
      o.updateMatrixWorld(true);
      const pos = o.geometry.attributes.position;
      const e = o.matrixWorld.elements;
      let n = 0, dark = 0;
      const col = o.geometry.attributes.color;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const wx = e[0]*x + e[4]*y + e[8]*z + e[12];
        const wy = e[1]*x + e[5]*y + e[9]*z + e[13];
        const wz = e[2]*x + e[6]*y + e[10]*z + e[14];
        if (wx > 16 && wx < 23 && wy > 6 && wy < 10 && wz > 9.5 && wz < 13) {
          n++;
          if (col && col.getX(i) < 0.5) dark++;
        }
      }
      out.push({ hasCol, vc, matColor: o.material.color ? o.material.color.getHexString() : null, zoneVerts: n, zoneDark: dark, matType: o.material.type });
    });
    return JSON.stringify(out);
  })()`);
  console.log(res);
  ws.close(); chrome.kill(); process.exit(0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
