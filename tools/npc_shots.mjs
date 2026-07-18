// npc_shots.mjs —— NPC 近景对照截图（对话 UI：左侧立绘 + 背景 3D 模型同屏）
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9238;
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--enable-unsafe-swiftshader',`--remote-debugging-port=${PORT}`,`--user-data-dir=${join(ROOT,'tools/.chrome-profile')}`,'--window-size=1280,720','about:blank'], { stdio: 'ignore', cwd: ROOT });
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
  for (let i = 0; i < 40 && !wsUrl; i++) {
    try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); wsUrl = l.find((t) => t.type === 'page')?.webSocketDebuggerUrl; } catch {}
    if (!wsUrl) await sleep(500);
  }
  ws = new WebSocket(wsUrl);
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
  await new Promise((r) => { ws.onopen = r; });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Page.navigate', { url: 'http://localhost:8000/?chapter=0&play=1&fresh=1' });
  await sleep(14000);
  // 近景：传送到 NPC 面前 2m 开对话（立绘 + 3D 同屏）
  for (const npc of ['armstrong']) {
    await evaljs(`(() => {
      const n = NPCAPI.get('${npc}');
      const a = n.yaw + 0.5;
      const px = n.pos.x - Math.sin(a) * 2.4, pz = n.pos.z - Math.cos(a) * 2.4;
      DebugAPI.teleport(px, pz, a + Math.PI, n.pos.y);
      DialogueAPI.start('${npc}');
    })()`);
    await sleep(1800);
    await shot(`npc_${npc}.png`);
    await evaljs('DialogueAPI.close()');
    await sleep(300);
  }
  // 死亡现场（ch3 长椅）
  await send('Page.navigate', { url: 'http://localhost:8000/?chapter=3&play=1&fresh=1' });
  await sleep(12000);
  await evaljs('StoryAPI.triggerDeath()');
  await sleep(1500);
  const s = JSON.parse(await evaljs('JSON.stringify(ChapterAPI.sceneSpot())'));
  await evaljs(`DebugAPI.teleport(${s.x + 2}, ${s.z + 2.5}, 0.6, ${s.y})`);
  await sleep(1500);
  await shot('npc_death_ch3.png');
  const perf = await evaljs('JSON.stringify({tri: PerfAPI.info().render.triangles, calls: PerfAPI.info().render.calls})');
  console.log('PERF:', perf);
  ws.close(); chrome.kill(); process.exit(0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
