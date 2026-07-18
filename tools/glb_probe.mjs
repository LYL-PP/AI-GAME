// glb_probe.mjs —— GLB 加载卡点探测
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9237;
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
  await send('Page.navigate', { url: 'http://localhost:8000/?chapter=0&play=1&fresh=1' });
  await sleep(9000);
  console.log('PerfAPI:', await evaljs('!!window.PerfAPI'));
  console.log('main module loaded:', await evaljs('!!document.querySelector("canvas")'));
  // 直接在页面里手动加载一个 GLB 测试
  const r = await evaljs(`(async () => {
    try { await import('three'); return 'import three OK'; }
    catch (e) { return 'import three FAIL: ' + e.message; }
  })()`);
  console.log('importmap three:', r);
  const r2 = await evaljs(`(async () => {
    const { GLTFLoader } = await import('./js/vendor/GLTFLoader.js');
    const L = new GLTFLoader();
    const g = await L.loadAsync('assets/models/castle/wall.glb');
    const THREE = await import('three');
    const out = [];
    g.scene.traverse(o => {
      if (o.isMesh) {
        o.geometry.computeBoundingBox();
        const bb = o.geometry.boundingBox;
        out.push({
          mat: o.material.name || o.material.type,
          size: bb.max.toArray().map((v,i)=>(v-bb.min.toArray()[i]).toFixed(2)).join('x'),
          min: bb.min.toArray().map(v=>v.toFixed(2)),
          verts: o.geometry.attributes.position.count,
          groups: o.geometry.groups.length,
        });
      }
    });
    return JSON.stringify(out);
  })()`);
  console.log('wall.glb structure:', r2);
  const r3 = await evaljs(`(() => {
    const out = [];
    window.__sceneTraverse = window.__sceneTraverse || null;
    const scene = window.__scene;
    if (!scene) return 'no __scene';
    scene.traverse(o => { if (o.isInstancedMesh) out.push({count: o.count, mat: (Array.isArray(o.material)?o.material:[o.material]).map(m=>m.name).join('+')}); });
    return JSON.stringify(out);
  })()`);
  console.log('instanced meshes:', r3);
  ws.close(); chrome.kill(); process.exit(0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
