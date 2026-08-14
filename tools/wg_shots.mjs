// wg_shots.mjs —— 沃格雷夫真贴图版验收 5 帧：行走近景/坐姿/指控运镜/ch6 假死/夜奔段
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9385;
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--enable-unsafe-swiftshader',`--remote-debugging-port=${PORT}`,`--user-data-dir=${join(ROOT,'tools/.chrome-profile-wgshots')}`,'--window-size=1280,720','about:blank'], { stdio: 'ignore', cwd: ROOT });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let id = 0; const pending = new Map(); let ws;
const send = (m, p = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const evaljs = async (e) => {
  const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
  if (r?.exceptionDetails) console.log('EVAL ERR:', JSON.stringify(r.exceptionDetails).slice(0, 300));
  return r?.result?.value;
};
async function shot(name) {
  const s = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(ROOT, 'docs/screenshots', name), Buffer.from(s.data, 'base64'));
  console.log('SHOT:', name);
}
async function readyWait() {
  for (let i = 0; i < 240; i++) { await sleep(1000); if (await evaljs('!!window.__ready')) return true; }
  return false;
}
async function main() {
  let wsUrl;
  for (let i = 0; i < 90 && !wsUrl; i++) {
    try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); wsUrl = l.find((t) => t.type === 'page')?.webSocketDebuggerUrl; } catch {}
    if (!wsUrl) await sleep(1000);
  }
  if (!wsUrl) { console.log('NO PAGE'); chrome.kill(); process.exit(1); }
  ws = new WebSocket(wsUrl);
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
  await new Promise((r) => { ws.onopen = r; });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Page.navigate', { url: 'http://localhost:8000/?chapter=1&play=1&fresh=1' });
  if (!(await readyWait())) { console.log('READY TIMEOUT'); chrome.kill(); process.exit(1); }

  // ---------- 1) 行走近景（真贴图正脸） ----------
  const wg = JSON.parse(await evaljs('JSON.stringify((() => { const n = NPCAPI.get("wargrave"); return { x: n.group.position.x, y: n.group.position.y, z: n.group.position.z, yaw: n.group.rotation.y }; })())'));
  console.log('wargrave at', JSON.stringify(wg));
  await evaljs(`NPCAPI.get('wargrave').rigged.play('walking')`);
  // 机位：他面前 2.2m（考虑朝向，取他面朝方向前方）
  const fx = wg.x - Math.sin(wg.yaw) * 2.2, fz = wg.z - Math.cos(wg.yaw) * 2.2;
  await evaljs(`DebugAPI.teleport(${fx}, ${fz}, ${wg.yaw + Math.PI}, ${wg.y + 0.2})`);
  await sleep(1000);
  await shot('wg_walk.png');
  // ---------- 2) 坐姿（借隆巴德 Chair_Sit_Idle_M） ----------
  await evaljs(`NPCAPI.get('wargrave').rigged.play('Chair_Sit_Idle_M')`);
  await sleep(1200);
  await shot('wg_sit.png');
  // ---------- 3) ch6 假死现场 ----------
  await evaljs('StoryAPI.jumpToChapter(6, false)');
  await sleep(2000);
  await evaljs('StoryAPI.triggerDeath()');
  for (let i = 0; i < 120; i++) { await sleep(500); if ((await evaljs('ChapterAPI.state()')) === 'await') break; }
  const spot = JSON.parse(await evaljs('JSON.stringify(ChapterAPI.sceneSpot())'));
  console.log('ch6 spot', JSON.stringify(spot));
  await evaljs(`DebugAPI.teleport(${spot.x + 1.8}, ${spot.z + 1.8}, ${Math.PI * 0.25 + Math.PI}, ${spot.y + 0.4})`);
  await sleep(2000);
  await shot('wg_ch6_dead.png');
  // ---------- 4) 指控运镜帧 ----------
  await evaljs('StoryAPI.jumpToChapter(8, true)');
  await sleep(2000);
  // 玩家在书房附近，wargrave 也在场（ch8 他"复活"前已死？ch6 假死 ch8 仍"死"——指控在书房/指控现场找 vera/lombard）
  // 直接发起指控，运镜会给出指控对象
  await evaljs(`DeductionAPI.accuse('wargrave', ['clue_08', 'clue_10'])`);
  await sleep(3500);
  await shot('wg_accuse.png');
  // ---------- 5) 夜奔段 ----------
  for (let i = 0; i < 90; i++) {
    const n = await evaljs('JSON.stringify(window.__endings && __endings.night ? __endings.night.phase : null)');
    if (n && n !== 'null') { console.log('night phase:', n); break; }
    await evaljs('EndingAPI.skip()');
    await sleep(1000);
  }
  // injured 段（背光剪影）拍一帧
  await sleep(1500);
  await shot('wg_nightrun_injured.png');
  // 等到 run 段
  for (let i = 0; i < 60; i++) {
    const n = await evaljs('JSON.stringify(window.__endings && __endings.night ? __endings.night.phase : null)');
    if (n === '"run"') break;
    await sleep(500);
  }
  await sleep(800);
  await shot('wg_nightrun.png');
  ws.close(); chrome.kill(); process.exit(0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
