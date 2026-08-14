// wg_shots2.mjs —— 沃格雷夫验收重拍：行走近景/坐姿/ch6 假死（提亮）/指控运镜
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { get } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// undici fetch 对本机调试端口间歇性失败；用 node:http 探测
const getJson = (url) => new Promise((res, rej) => {
  get(url, (r) => { let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on('error', rej);
});
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9386;
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--enable-unsafe-swiftshader',`--remote-debugging-port=${PORT}`,`--user-data-dir=${join(ROOT,'tools/.chrome-profile-wgshots2')}`,'--window-size=1280,720','about:blank'], { stdio: 'ignore', cwd: ROOT });
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
async function main() {
  let wsUrl;
  for (let i = 0; i < 90 && !wsUrl; i++) {
    for (const host of ['localhost', '127.0.0.1']) {
      if (wsUrl) break;
      try { const l = await getJson(`http://${host}:${PORT}/json/list`); wsUrl = l.find((t) => t.type === 'page')?.webSocketDebuggerUrl; } catch {}
    }
    if (!wsUrl) await sleep(1000);
  }
  if (!wsUrl) { console.log('NO PAGE'); chrome.kill(); process.exit(1); }
  ws = new WebSocket(wsUrl);
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
  await new Promise((r) => { ws.onopen = r; });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Page.navigate', { url: 'http://localhost:8000/?chapter=1&play=1&fresh=1' });
  for (let i = 0; i < 240; i++) { await sleep(1000); if (await evaljs('!!window.__ready')) break; }

  // ---------- 1) 行走近景（他面朝南；机位南侧 2.6m 平视） ----------
  const wg = JSON.parse(await evaljs('JSON.stringify((() => { const n = NPCAPI.get("wargrave"); return { x: n.group.position.x, y: n.group.position.y, z: n.group.position.z }; })())'));
  await evaljs(`DebugAPI.teleport(${wg.x}, ${wg.z + 2.6}, 0, ${wg.y + 0.2})`);
  await evaljs(`NPCAPI.get('wargrave').rigged.play('walking')`);
  await sleep(1000);
  await shot('wg_walk.png');
  // ---------- 2) 坐姿（借坐 clip 绑定验证） ----------
  await evaljs(`NPCAPI.get('wargrave').rigged.play('Chair_Sit_Idle_M')`);
  await sleep(1500);
  await shot('wg_sit.png');
  // ---------- 3) ch6 假死现场（先提亮再触发，防日程重置尸体） ----------
  await evaljs('StoryAPI.jumpToChapter(6, false)');
  await sleep(2000);
  await evaljs('WeatherAPI.setChapter(8)');   // 提亮（大熊·晨）
  await sleep(600);
  await evaljs('StoryAPI.triggerDeath()');
  for (let i = 0; i < 120; i++) { await sleep(500); if ((await evaljs('ChapterAPI.state()')) === 'await') break; }
  const spot = JSON.parse(await evaljs('JSON.stringify(ChapterAPI.sceneSpot())'));
  await evaljs(`DebugAPI.teleport(${spot.x + 1.6}, ${spot.z + 1.6}, ${Math.PI / 4}, ${spot.y + 0.5})`);
  for (let i = 0; i < 30; i++) { await sleep(500); if ((await evaljs('ChapterAPI.state()')) === 'scene') break; }
  await sleep(1800);
  await shot('wg_ch6_dead.png');
  // ---------- 4) 指控运镜帧（ch8 携带线索，大厅内发起） ----------
  await evaljs('StoryAPI.jumpToChapter(8, true)');
  await sleep(2200);
  await evaljs('DebugAPI.teleport(0, 4, 0, 2.4)');
  await sleep(600);
  await evaljs(`DeductionAPI.accuse('wargrave', ['clue_08', 'clue_10'])`);
  await sleep(2500);
  await shot('wg_accuse.png');
  await sleep(2500);
  await shot('wg_accuse2.png');
  ws.close(); chrome.kill(); process.exit(0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
