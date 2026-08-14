// mac_special_shots.mjs —— 麦克阿瑟特例验收：ch1 北岬角长椅 gaze_sea + ch3 死亡现场（sit 冻结+前倾）
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { get } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EDGE = process.env.CHROME || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9243;
const edge = spawn(EDGE, ['--headless=new','--disable-gpu','--enable-unsafe-swiftshader',`--remote-debugging-port=${PORT}`,`--user-data-dir=${join(ROOT,'tools/.edge-profile-mac')}`,'--window-size=1280,720','about:blank'], { stdio: 'ignore', cwd: ROOT });
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
async function boot(chapter) {
  await send('Page.navigate', { url: `http://localhost:8000/?chapter=${chapter}&play=1&fresh=1` });
  for (let i = 0; i < 120; i++) { await sleep(1000); if (await evaljs('!!(window.NPCAPI && window.StoryAPI && window.DebugAPI)')) break; }
  await sleep(2500);
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
  // ① ch1：北岬角长椅 gaze_sea
  await boot(1);
  console.log('ch1 macarthur action:', await evaljs('NPCAPI.get("macarthur")?.action'), 'clip:', await evaljs('NPCAPI.get("macarthur")?.rigged?.currentName'));
  await evaljs(`(() => {
    const n = NPCAPI.get('macarthur');
    const a = n.yaw;
    DebugAPI.teleport(n.pos.x - Math.sin(a) * 2.6, n.pos.z - Math.cos(a) * 2.6, a + Math.PI, n.pos.y);
  })()`);
  await sleep(500);
  await shot('new_macarthur_gaze_sea.png');
  // ② ch3：死亡现场（sit 低速冻结 + 前倾）
  await boot(3);
  await evaljs('StoryAPI.triggerDeath()');
  await sleep(3500);
  console.log('ch3 macarthur clip:', await evaljs('NPCAPI.get("macarthur")?.rigged?.currentName'), 'dead:', await evaljs('NPCAPI.get("macarthur")?.dead'));
  const s3 = JSON.parse(await evaljs('JSON.stringify(ChapterAPI.sceneSpot())'));
  await evaljs(`DebugAPI.teleport(${s3.x - 2.2}, ${s3.z - 2.6}, 0.55, ${s3.y})`);
  await sleep(2000);
  await shot('new_macarthur_ch3_dead.png');
  ws.close(); edge.kill(); process.exit(0);
}
main().catch((e) => { console.error(e); edge.kill(); process.exit(1); });
