import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9272;
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--enable-unsafe-swiftshader',`--remote-debugging-port=${PORT}`,`--user-data-dir=${join(ROOT,'tools/.chrome-profile-fac')}`,'--window-size=1280,720','about:blank'], { stdio: 'ignore', cwd: ROOT });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let id = 0; const pending = new Map(); let ws;
const send = (m, p = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const evaljs = async (e) => {
  const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
  if (r?.exceptionDetails) return 'EXC: ' + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
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
  await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Page.navigate', { url: 'http://localhost:8000/?chapter=0&play=1&fresh=1' });
  await sleep(16000);
  console.log(await evaljs(`(async () => {
    try {
      const T = await import('./js/vendor/three.module.js');
      const scene = NPCAPI.get('vera').group.parent;
      const g = scene.getObjectByName('scanCastle');
      const rc = new T.Raycaster();
      const lines = [];
      const graft = [];
      g.traverse((o) => { if (o.isMesh) graft.push(o); });
      lines.push('graft meshes: ' + graft.length + ', mat color: ' + (graft[0]?.material.color.getHexString() ?? '?') + ', idxCount: ' + (graft[0]?.geometry.index ? graft[0].geometry.index.count : -1));
      for (const px of [-3.3, 3.3, 0]) {
        rc.set(new T.Vector3(px, 3.4, 12.2), new T.Vector3(0, 0, -1));
        const hs = rc.intersectObjects(graft, false).slice(0, 1).map((h) => h.object.name + '@z' + h.point.z.toFixed(2));
        lines.push(px + ' -> ' + (hs.join(',') || 'no-hit'));
      }
      return lines.join(' | ');
    } catch (err) { return 'ERR: ' + err.message; }
  })()`));
  ws.close(); chrome.kill(); process.exit(0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
