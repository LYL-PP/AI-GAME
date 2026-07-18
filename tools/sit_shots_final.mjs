// sit_shots_final.mjs —— 圆桌真实座位验证（序章 await_sit，玩家平视机位）
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9257;
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--enable-unsafe-swiftshader',`--remote-debugging-port=${PORT}`,`--user-data-dir=${join(ROOT,'tools/.chrome-profile-sit')}`,'--window-size=1280,720','about:blank'], { stdio: 'ignore', cwd: ROOT });
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
  await sleep(14000);
  await evaljs('PrologueAPI.gather()');
  for (let i = 0; i < 34; i++) { await sleep(3000); if ((await evaljs('PrologueAPI.state()')) === 'await_sit') break; }
  console.log('clips:', await evaljs('JSON.stringify({vera: NPCAPI.get("vera").rigged?.currentName, lombard: NPCAPI.get("lombard").rigged?.currentName, marston: NPCAPI.get("marston").rigged?.currentName, wargrave: NPCAPI.get("wargrave").rigged?.currentName})'));
  console.log('groupY:', await evaljs('JSON.stringify({vera: NPCAPI.get("vera").group.position.y, lombard: NPCAPI.get("lombard").group.position.y, posY: NPCAPI.get("vera").pos.y})'));
  // 四人全景：SW 大厅侧 (1.1,2.5) 看向 NE 四连座中点（已验证可达机位）
  await evaljs(`(() => {
    const ids = ['wargrave','vera','lombard','marston'];
    let mx = 0, mz = 0;
    for (const i of ids) { const p = NPCAPI.get(i).pos; mx += p.x / 4; mz += p.z / 4; }
    const px = 1.1, pz = 2.5;
    DebugAPI.teleport(px, pz, Math.atan2(-(mx - px), -(mz - pz)), NPCAPI.get('vera').pos.y);
  })()`);
  await sleep(600);
  await shot('fix_dinner_all4.png');
  // 单人近景：贴桌机位（NPC 与圆心连线上、距 NPC 1.1m，玩家站立平视）
  for (const [id_, f] of [['vera','fix_vera_sit.png'],['lombard','fix_lombard_sit.png'],['marston','fix_marston_sit.png']]) {
    await evaljs(`(() => {
      const n = NPCAPI.get('${id_}');
      const a = n.yaw; // 面向圆心
      DebugAPI.teleport(n.pos.x - Math.sin(a) * 1.1, n.pos.z - Math.cos(a) * 1.1, a + Math.PI, n.pos.y);
    })()`);
    await sleep(500);
    await shot(f);
  }
  ws.close(); chrome.kill(); process.exit(0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
