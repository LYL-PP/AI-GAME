import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9318;
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--enable-unsafe-swiftshader',`--remote-debugging-port=${PORT}`,`--user-data-dir=${join(ROOT,'tools/.chrome-profile-cv')}`,'--window-size=1280,720','about:blank'], { stdio: 'ignore', cwd: ROOT });
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
  await send('Page.navigate', { url: 'http://localhost:8000/?chapter=0&play=1&fresh=1' });
  await sleep(15000);
  const pts = await evaljs(`(async () => {
    const THREE = await import('./js/vendor/three.module.js');
    const g = __scene.getObjectByName('scanCastle');
    const vv = new THREE.Vector3(); const out = [];
    g.traverse((o) => {
      if (!o.isMesh || !o.geometry.index || !o.visible) return;
      const pos = o.geometry.attributes.position, idx = o.geometry.index.array;
      for (let i = 0; i < idx.length; i += 3) {
        let cx=0, cy=0, cz=0;
        for (let k = 0; k < 3; k++) { vv.fromBufferAttribute(pos, idx[i+k]).applyMatrix4(o.matrixWorld); cx+=vv.x/3; cy+=vv.y/3; cz+=vv.z/3; }
        if (cx > 0.8 && cx < 4.5 && cy > 3.5 && cy < 9.5 && cz > 7.5) out.push([Math.round(cx*10), Math.round(cy*10)]);
      }
    });
    return out;
  })()`);
  writeFileSync(join(ROOT, 'tools/.graft_front_pts.json'), JSON.stringify(pts));
  console.log('pts:', pts.length);
  ws.close(); chrome.kill(); process.exit(0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
