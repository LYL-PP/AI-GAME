// marston_special_shots.mjs —— 马尔斯顿特例验收：ch1 呛死事件（借 legacy Dead clip → 新 body 宿主，末帧定格）
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { get } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EDGE = process.env.CHROME || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9247;
const edge = spawn(EDGE, ['--headless=new','--disable-gpu','--enable-unsafe-swiftshader',`--remote-debugging-port=${PORT}`,`--user-data-dir=${join(ROOT,'tools/.edge-profile-mars')}`,'--window-size=1280,720','about:blank'], { stdio: 'ignore', cwd: ROOT });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJson = (url) => new Promise((res, rej) => {
  get(url, (r) => { let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on('error', rej);
});
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
  if (!wsUrl) { console.log('NO PAGE'); edge.kill(); process.exit(1); }
  ws = new WebSocket(wsUrl);
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
  await new Promise((r) => { ws.onopen = r; });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Page.navigate', { url: 'http://localhost:8000/?chapter=1&play=1&fresh=1' });
  for (let i = 0; i < 300; i++) { await sleep(1000); if (await evaljs('!!(window.NPCAPI && window.StoryAPI && window.DebugAPI)')) break; }
  await sleep(2500);
  console.log('marston items:', await evaljs('Object.keys(NPCAPI.get("marston")?.rigged?.items || {}).join(",")'));
  // ch1 呛死事件（举杯→Dead clip 倒地定格）
  await evaljs('StoryAPI.triggerDeath()');
  await sleep(2500);
  console.log('death 播放中 clip:', await evaljs('NPCAPI.get("marston")?.rigged?.currentName'));
  const s1 = JSON.parse(await evaljs('JSON.stringify(ChapterAPI.sceneSpot())'));
  await evaljs(`DebugAPI.teleport(${s1.x - 1.6}, ${s1.z + 2.0}, 2.6, ${s1.y})`);
  await sleep(1200);
  await shot('new_marston_ch1_dying.png');
  await sleep(4500);   // 倒地定格后
  console.log('定格后 clip:', await evaljs('NPCAPI.get("marston")?.rigged?.currentName'), 'dead:', await evaljs('NPCAPI.get("marston")?.dead'));
  await shot('new_marston_ch1_dead.png');
  ws.close(); edge.kill(); process.exit(0);
}
main().catch((e) => { console.error(e); edge.kill(); process.exit(1); });
