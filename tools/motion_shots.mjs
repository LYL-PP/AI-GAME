// motion_shots.mjs —— 新增动作 clip 验收截图：
// ① 沃格雷夫对话手势（talk once）② 晚餐入座过渡 2 帧（lombard/armstrong Stand_to_Sit）③ 阿姆斯特朗 ch5 崩溃瘫坐（crisis）
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { get } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EDGE = process.env.CHROME || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9254;
const edge = spawn(EDGE, ['--headless=new','--disable-gpu','--enable-unsafe-swiftshader',`--remote-debugging-port=${PORT}`,`--user-data-dir=${join(ROOT,'tools/.edge-profile-motion')}`,'--window-size=1280,720','about:blank'], { stdio: 'ignore', cwd: ROOT });
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
const frontCam = (cid, dist) => `(() => {
  const n = NPCAPI.get("${cid}");
  const a = n.yaw;
  DebugAPI.teleport(n.pos.x - Math.sin(a) * ${dist}, n.pos.z - Math.cos(a) * ${dist}, a + Math.PI, n.pos.y);
})()`;
async function boot(chapter) {
  await send('Page.navigate', { url: `http://localhost:8000/?chapter=${chapter}&play=1&fresh=1` });
  for (let i = 0; i < 300; i++) { await sleep(1000); if (await evaljs('!!window.__ready')) break; }
  await sleep(1500);
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

  // ① 沃格雷夫对话手势（ch0 初始位站姿，开对话即播 talk once）
  await boot(0);
  await evaljs(frontCam('wargrave', 2.0));
  await sleep(300);
  await evaljs('DialogueAPI.start("wargrave")');
  for (let i = 0; i < 40; i++) { await sleep(250); if ((await evaljs('NPCAPI.get("wargrave")?._oncePlaying')) === 'talk') break; }
  console.log('wargrave once:', await evaljs('NPCAPI.get("wargrave")?._oncePlaying'), 'clip:', await evaljs('NPCAPI.get("wargrave")?.rigged?.currentName'));
  await sleep(700);   // 手势进入中段（fade 0.25 + 抬手）
  await shot('motion_wargrave_gesture.png');
  await evaljs('DialogueAPI.close()');

  // ② 晚餐入座过渡 2 帧（gather 后 lombard/armstrong 到座播 Stand_to_Sit）
  await evaljs('PrologueAPI.gather()');
  let target = null;
  for (let i = 0; i < 240 && !target; i++) {
    await sleep(500);
    for (const cid of ['lombard', 'armstrong']) {
      if ((await evaljs(`NPCAPI.get("${cid}")?._oncePlaying`)) === 'sit_down') { target = cid; break; }
    }
  }
  console.log('入座过渡捕获:', target || 'MISS');
  if (target) {
    await evaljs(frontCam(target, 2.4));
    await sleep(150);
    await shot('motion_sit_down_1.png');
    await sleep(700);
    await shot('motion_sit_down_2.png');
  } else {
    await shot('motion_sit_down_1.png');   // 兜底：晚宴全景
    await shot('motion_sit_down_2.png');
  }

  // ③ 阿姆斯特朗 ch5 崩溃瘫坐（jump(5) → 日程到 hall_sofa 坐下 → 坐姿分支换 crisis）
  await boot(0);
  await evaljs('SaveAPI.clear()');
  await boot(0);
  await evaljs('NavAPI.jump(5)');
  await sleep(3000);
  let ok = false;
  for (let i = 0; i < 240 && !ok; i++) {
    await sleep(500);
    ok = (await evaljs('NPCAPI.get("armstrong")?.rigged?.currentName')) === 'crisis';
  }
  console.log('armstrong distress:', await evaljs('NPCAPI.get("armstrong")?.distress'), 'seated:', await evaljs('NPCAPI.get("armstrong")?.seated'), 'clip:', await evaljs('NPCAPI.get("armstrong")?.rigged?.currentName'));
  await evaljs(frontCam('armstrong', 2.2));
  await sleep(400);
  await shot('motion_armstrong_crisis.png');
  ws.close(); edge.kill(); process.exit(0);
}
main().catch((e) => { console.error(e); edge.kill(); process.exit(1); });
