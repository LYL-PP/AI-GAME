import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9270;
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--enable-unsafe-swiftshader',`--remote-debugging-port=${PORT}`,`--user-data-dir=${join(ROOT,'tools/.chrome-profile-fac')}`,'--window-size=1280,720','about:blank'], { stdio: 'ignore', cwd: ROOT });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let id = 0; const pending = new Map(); let ws;
const send = (m, p = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const evaljs = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }))?.result?.value;
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
  await evaljs('DebugAPI.teleport(0, 12.2, 0, 1.8)');
  await sleep(400);
  // 报告 scanCastle 组内结构
  console.log(await evaljs(`(() => {
    const scene = NPCAPI.get('vera').group.parent;
    const g = scene.getObjectByName('scanCastle');
    if (!g) return 'no scanCastle';
    const out = [];
    g.traverse((o) => { if (o.isMesh || o.isPoints || o.isLight) out.push([o.type, o.name || '-', o.position.toArray().map(v=>+v.toFixed(1)), o.material ? (o.material.type + ' op:' + (o.material.opacity ?? 1)) : '-']); });
    return JSON.stringify(out);
  })()`));
  // 隐藏组内非 GLB 网格（glow/points/灯笼）再拍
  await evaljs(`(() => {
    const scene = NPCAPI.get('vera').group.parent;
    const g = scene.getObjectByName('scanCastle');
    g.traverse((o) => { if ((o.isMesh && !o.geometry.attributes.position.name) || o.isPoints) { if (!o.parent || o.parent.type !== 'Group' || o === g) return; } });
    // 直接按引用隐藏：glow mesh 是 group 的直接子 Mesh，GLB 在 group 的孙级
    for (const c of g.children) {
      if (c.isMesh || c.isPoints || c.isLight) c.visible = false;
      if (c.isLight) c.userData._bak = c.intensity, c.intensity = 0;
    }
  })()`);
  await sleep(400);
  await shot('glow_off.png');
  ws.close(); chrome.kill(); process.exit(0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
