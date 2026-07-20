import { spawn } from 'node:child_process';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9345;
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--enable-unsafe-swiftshader',`--remote-debugging-port=${PORT}`,`--user-data-dir=D:/AI游戏/game-正式版/tools/.chrome-profile-fq`,'--window-size=1280,720','about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let id = 0; const pending = new Map(); let ws;
const send = (m, p = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const evaljs = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }))?.result?.value;
(async () => {
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
  await sleep(17000);
  const info = await evaljs(`(async () => {
    const THREE = await import('./js/vendor/three.module.js');
    const out = { count: FigurineAPI.count ? FigurineAPI.count() : 'n/a' };
    // 找壁炉台区的小物体
    const found = [];
    __scene.traverse((o) => {
      if (!o.isMesh && !o.isGroup) return;
      const p = o.getWorldPosition ? o.getWorldPosition(new THREE.Vector3()) : o.position;
      if (Math.abs(p.x + 5) < 1.2 && p.y > 3.6 && p.y < 4.1 && Math.abs(p.z + 0.5) < 0.6 && o.visible) {
        const bb = new THREE.Box3().setFromObject(o);
        const s = bb.getSize(new THREE.Vector3());
        if (s.x < 0.5 && s.y < 0.5) found.push({ type: o.type, pos: p.toArray().map(v=>+v.toFixed(2)), size: s.toArray().map(v=>+v.toFixed(3)) });
      }
    });
    out.nearMantel = found.slice(0, 14);
    return out;
  })()`);
  console.log('FIG:', JSON.stringify(info));
  ws.close(); chrome.kill(); process.exit(0);
})().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
