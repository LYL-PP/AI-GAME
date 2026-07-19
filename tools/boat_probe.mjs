import { spawn } from 'node:child_process';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9324;
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--enable-unsafe-swiftshader',`--remote-debugging-port=${PORT}`,`--user-data-dir=D:/AI游戏/game-正式版/tools/.chrome-profile-bp`,'--window-size=1280,720','about:blank'], { stdio: 'ignore' });
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
  await sleep(16000);
  const info = await evaljs(`(async () => {
    const THREE = await import('./js/vendor/three.module.js');
    const { getParts, buildProp } = await import('./js/world/sceneProps.js');
    const parts = getParts('boat');
    if (!parts) return 'no parts';
    const out = { parts: parts.length };
    const b = buildProp(parts, {});
    const bb = new THREE.Box3().setFromObject(b);
    out.size = bb.getSize(new THREE.Vector3()).toArray().map(v=>+v.toFixed(2));
    out.min = bb.min.toArray().map(v=>+v.toFixed(2));
    out.center = bb.getCenter(new THREE.Vector3()).toArray().map(v=>+v.toFixed(2));
    // 场景里找泊船实例
    let found = null;
    __scene.traverse((o) => { if (Math.abs(o.scale.x - 0.01) < 0.001 && o.isGroup) { const b2 = new THREE.Box3().setFromObject(o); const s = b2.getSize(new THREE.Vector3()); if (s.x > 1 && s.x < 12 && s.z > 4 && s.z < 12) found = { pos: o.position.toArray().map(v=>+v.toFixed(2)), vis: o.visible, size: s.toArray().map(v=>+v.toFixed(2)) }; } });
    out.sceneBoat = found;
    return out;
  })()`);
  console.log('BOAT:', JSON.stringify(info));
  ws.close(); chrome.kill(); process.exit(0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
