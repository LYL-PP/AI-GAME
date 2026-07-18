// p0_diag.mjs —— 瓷人/壁炉凸台深度诊断
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9279;
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--enable-unsafe-swiftshader',`--remote-debugging-port=${PORT}`,`--user-data-dir=${join(ROOT,'tools/.chrome-profile-props')}`,'--window-size=1280,720','about:blank'], { stdio: 'ignore', cwd: ROOT });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let id = 0; const pending = new Map(); let ws;
const send = (m, p = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const evaljs = async (e) => {
  const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
  if (r?.exceptionDetails) return 'EXC:' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r?.result?.value;
};
async function shot(name) {
  const s = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(ROOT, 'docs/screenshots', name), Buffer.from(s.data, 'base64'));
  console.log('SHOT:', name);
}
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
  // 从壁炉台前 2m (-5, 3.6, 0.5) 向正北打线：第一命中是谁？（扫描凸台面 or 瓷人）
  console.log(await evaljs(`(async () => {
    const T = await import('./js/vendor/three.module.js');
    const scene = NPCAPI.get('vera').group.parent;
    const rc = new T.Raycaster();
    const out = [];
    rc.set(new T.Vector3(-5.0, 3.6, 0.5), new T.Vector3(0, 0, -1));
    for (const h of rc.intersectObjects(scene.children, true).slice(0, 4)) {
      out.push(h.object.name || h.object.type + '@z' + h.point.z.toFixed(2) + 'y' + h.point.y.toFixed(2));
    }
    // 扫描壁炉凸台正面深度：从 (-5, 2.6, 0.5) 向北
    rc.set(new T.Vector3(-5.0, 2.6, 0.5), new T.Vector3(0, 0, -1));
    const h2 = rc.intersectObjects(scene.children, true).slice(0, 3).map((h) => (h.object.name || h.object.type) + '@z' + h.point.z.toFixed(2));
    return JSON.stringify({ mantelRay: out, breastRay: h2 });
  })()`));
  await evaljs('DebugAPI.teleport(-5.0, 0.2, 0, 1.8)');
  await sleep(400);
  await shot('p0_diag_mantel.png');
  ws.close(); chrome.kill(); process.exit(0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
