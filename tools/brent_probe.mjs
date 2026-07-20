import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9340;
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--enable-unsafe-swiftshader',`--remote-debugging-port=${PORT}`,`--user-data-dir=${join(ROOT,'tools/.chrome-profile-bq')}`,'--window-size=1280,720','about:blank'], { stdio: 'ignore', cwd: ROOT });
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
  await send('Page.navigate', { url: 'http://localhost:8000/?chapter=8&play=1&fresh=1' });
  await sleep(16000);
  const info = await evaljs(`(async () => {
    const THREE = await import('./js/vendor/three.module.js');
    const n = NPCAPI.get('brent');
    if (!n || !n.rigged) return 'no rigged';
    const out = { items: {}, label: null };
    for (const [k, it] of Object.entries(n.rigged.items)) {
      const bb = new THREE.Box3().setFromObject(it.root);
      const mats = [];
      it.root.traverse((o) => { if (o.isMesh) mats.push({ hasMap: !!o.material.map, hasShader: !!o.material.userData.shader, color: o.material.color ? o.material.color.getHexString() : null }); });
      out.items[k] = { size: bb.getSize(new THREE.Vector3()).toArray().map(v=>+v.toFixed(2)), mats: mats.slice(0, 3) };
    }
    return out;
  })()`);
  console.log('BRENT RIG:', JSON.stringify(info).slice(0, 1400));
  // 正面特写（餐桌区她位置）
  const n1 = await evaljs(`(()=>{const n=NPCAPI.get('brent');return {x:+n.pos.x.toFixed(2),z:+n.pos.z.toFixed(2),y:+n.pos.y.toFixed(2),yaw:+n.yaw.toFixed(2)};})()`);
  const dx = -Math.sin(n1.yaw), dz = -Math.cos(n1.yaw);
  const px = n1.x + dx * 1.5, pz = n1.z + dz * 1.5;
  await evaljs(`DebugAPI.teleport(${px}, ${pz}, ${Math.atan2(-(n1.x - px), -(n1.z - pz))}, ${n1.y})`);
  await sleep(1200);
  const s = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(ROOT, 'docs/screenshots', 'brent_close.png'), Buffer.from(s.data, 'base64'));
  console.log('SHOT: brent_close.png');
  ws.close(); chrome.kill(); process.exit(0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
