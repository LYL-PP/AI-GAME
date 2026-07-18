import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9287;
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--enable-unsafe-swiftshader',`--remote-debugging-port=${PORT}`,`--user-data-dir=${join(ROOT,'tools/.chrome-profile-props')}`,'--window-size=1280,720','about:blank'], { stdio: 'ignore', cwd: ROOT });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let id = 0; const pending = new Map(); let ws;
const send = (m, p = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const evaljs = async (e) => {
  const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
  if (r?.exceptionDetails) return 'EXC:' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text);
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
    const T = await import('./js/vendor/three.module.js');
    const scene = NPCAPI.get('vera').group.parent;
    const found = [];
    scene.traverse((o) => {
      if (o.type === 'Group' && o.position && Math.abs(o.position.y - 3.692) < 0.01 && Math.abs(o.position.z + 0.5) < 0.01) {
        const bb = new T.Box3().setFromObject(o);
        found.push({
          pos: o.position.toArray().map(v=>+v.toFixed(2)),
          children: o.children.length,
          vis: o.visible,
          scale: +o.scale.x.toFixed(5),
          bbMin: bb.min.toArray().map(v=>+v.toFixed(2)),
          bbMax: bb.max.toArray().map(v=>+v.toFixed(2)),
          meshVis: o.children[0] ? o.children[0].visible : '-',
          matCol: o.children[0]?.material?.color?.getHexString?.(),
          idxCount: o.children[0]?.geometry?.index?.count ?? -1,
        });
      }
    });
    return JSON.stringify(found.slice(0, 3)) + ' total=' + found.length;
  })()`));
  ws.close(); chrome.kill(); process.exit(0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
