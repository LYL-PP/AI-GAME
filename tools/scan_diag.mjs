// scan_diag.mjs —— 扫描件包围盒实测 + 显式高度大厅重拍
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9262;
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--enable-unsafe-swiftshader',`--remote-debugging-port=${PORT}`,`--user-data-dir=${join(ROOT,'tools/.chrome-profile-verify')}`,'--window-size=1280,720','about:blank'], { stdio: 'ignore', cwd: ROOT });
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
  console.log(await evaljs(`(async () => {
    const T = await import('./js/vendor/three.module.js');
    const out = {};
    window.__sceneRef = window.__sceneRef || null;
    // 从 renderer 找 scene：main.js 没暴露，借 NPCAPI 的 group 反向取
    const scene = NPCAPI.get('vera').group.parent;
    for (const n of ['hallScan', 'scanCastle']) {
      const g = scene.getObjectByName(n);
      if (!g) { out[n] = 'MISSING'; continue; }
      const bb = new T.Box3().setFromObject(g);
      out[n] = { pos: g.position.toArray(), min: bb.min.toArray().map(v=>+v.toFixed(2)), max: bb.max.toArray().map(v=>+v.toFixed(2)) };
    }
    return JSON.stringify(out);
  })()`));
  // 显式 y=1.8 大厅重拍
  await evaljs('DebugAPI.teleport(0.3, 7.0, 0.35, 1.8)');
  await sleep(500);
  await shot('v3_dock.png'); // （先拍码头第一眼再进厅）
  await evaljs('DebugAPI.teleport(0, 58, Math.PI, 1.25)'); // 栈道南端回看城堡
  await sleep(500);
  await shot('v3_jetty_castle.png');
  await evaljs('DebugAPI.teleport(0.3, 7.0, 0.35, 1.8)');
  await sleep(500);
  await shot('v3_hall_entry.png');
  await evaljs('DebugAPI.teleport(0.2, -0.8, Math.PI, 1.8)');
  await sleep(500);
  await shot('v3_hall_backlit.png');
  await evaljs('DebugAPI.teleport(-5.5, 0.5, -2.2, 1.8)');
  await sleep(500);
  await shot('v3_hall_table.png');
  // 门廊外看南立面（遮丑盖板+扫描门洞）
  await evaljs('DebugAPI.teleport(0, 11.6, 0, 1.8)');
  await sleep(500);
  await shot('v3_porch.png');
  // 柴棚（ch4 现场，x -19.2 z 3.2）看是否被城翼吞
  await evaljs('DebugAPI.teleport(-19.2, 3.2, -1.5)');
  await sleep(500);
  await shot('v3_shed.png');
  // 二楼走廊 + 三楼书房（楼板衔接）
  await evaljs('DebugAPI.teleport(-4, 0, -1.2, 5.0)');
  await sleep(500);
  await shot('v3_f2.png');
  await evaljs('DebugAPI.teleport(0, 0, 0.8, 8.2)');
  await sleep(500);
  await shot('v3_f3.png');
  ws.close(); chrome.kill(); process.exit(0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
