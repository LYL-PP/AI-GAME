// rigged 4 人站姿近景（白天提亮）：动态取 NPC 位置/朝向，正面 1.6m 机位
// 用法：node tools/rig_shots.mjs <tag>
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TAG = process.argv[2] || 'x';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9313;
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--enable-unsafe-swiftshader',`--remote-debugging-port=${PORT}`,`--user-data-dir=${join(ROOT,'tools/.chrome-profile-rig')}`,'--window-size=1280,720','about:blank'], { stdio: 'ignore', cwd: ROOT });
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
  await send('Page.navigate', { url: 'http://localhost:8000/?chapter=2&play=1&fresh=1' });
  await sleep(16000);
  for (const nid of ['wargrave', 'marston', 'vera', 'lombard']) {
    const n = await evaljs(`(()=>{const x=NPCAPI.get('${nid}');return x?{x:+x.pos.x.toFixed(2),y:+x.pos.y.toFixed(2),z:+x.pos.z.toFixed(2),yaw:+x.yaw.toFixed(2),act:x.action}:null;})()`);
    if (!n) { console.log(nid, 'MISSING'); continue; }
    // 正反两面各拍一张（3m 距离看清与家具相对位置）
    const dx = -Math.sin(n.yaw), dz = -Math.cos(n.yaw);
    for (const [sgn, side] of [[1, 'front'], [-1, 'back']]) {
      const cx = n.x + dx * 3.0 * sgn, cz = n.z + dz * 3.0 * sgn;
      const camYaw = Math.atan2(-(n.x - cx), -(n.z - cz));
      await evaljs(`DebugAPI.teleport(${cx}, ${cz}, ${camYaw}, ${n.y})`);
      await sleep(1300);
      await shot(`rig_${TAG}_${nid}_${side}.png`);
    }
    console.log(nid, JSON.stringify(n));
  }
  ws.close(); chrome.kill(); process.exit(0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
