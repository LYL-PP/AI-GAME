// motion_shots2.mjs —— 新动作 clip 验收（修正版）：
// ① 布洛尔自然触发对话手势（ch0 门廊站姿）② 沃格雷夫手势（摆拍：置站姿后开对话；其日程全程就座，实战守卫不触发）
// ③ 指控散场起身过渡（restore 时 blore Sit_to_Stand）④ 阿姆斯特朗 ch5 崩溃瘫坐（摆拍：jump(5) distress 已置位，锁定+置坐姿）
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { get } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EDGE = process.env.CHROME || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9255;
const edge = spawn(EDGE, ['--headless=new','--disable-gpu','--enable-unsafe-swiftshader',`--remote-debugging-port=${PORT}`,`--user-data-dir=${join(ROOT,'tools/.edge-profile-mot2')}`,'--window-size=1280,720','about:blank'], { stdio: 'ignore', cwd: ROOT });
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

  // ① 布洛尔自然手势（ch0 他在门廊/吧台站姿待机）
  await boot(0);
  let tries = 0;
  while (tries++ < 100) {
    const st = JSON.parse(await evaljs('JSON.stringify({w: !!NPCAPI.get("blore")?.walking, seated: !!NPCAPI.get("blore")?.seated})'));
    if (!st.w && !st.seated) break;
    await sleep(500);
  }
  await evaljs(frontCam('blore', 2.2));
  await evaljs('DialogueAPI.start("blore")');
  for (let i = 0; i < 40; i++) { await sleep(250); if ((await evaljs('NPCAPI.get("blore")?._oncePlaying')) === 'gesture') break; }
  console.log('blore once:', await evaljs('NPCAPI.get("blore")?._oncePlaying'), 'clip:', await evaljs('NPCAPI.get("blore")?.rigged?.currentName'));
  await sleep(800);
  await shot('motion_blore_gesture.png');
  await evaljs('DialogueAPI.close()');

  // ② 沃格雷夫手势（摆拍站姿；验证钩子与 clip）
  await evaljs(`(() => {
    const n = NPCAPI.get('wargrave');
    n.prologueLock = true;            // 冻结日程防回坐
    n.walking = false;
    n.setAction('idle');
    n.group.position.y = n.pos.y;     // 站姿高度
  })()`);
  await sleep(400);
  await evaljs(frontCam('wargrave', 2.0));
  await evaljs('DialogueAPI.start("wargrave")');
  for (let i = 0; i < 40; i++) { await sleep(250); if ((await evaljs('NPCAPI.get("wargrave")?._oncePlaying')) === 'talk') break; }
  console.log('wargrave once:', await evaljs('NPCAPI.get("wargrave")?._oncePlaying'), 'clip:', await evaljs('NPCAPI.get("wargrave")?.rigged?.currentName'));
  await sleep(900);
  await shot('motion_wargrave_gesture.png');
  await evaljs('DialogueAPI.close()');
  await evaljs('NPCAPI.get("wargrave").prologueLock = false');

  // ③ 指控散场起身过渡：走完序章（gather→takeSeat→skip 到底→restore），捕 blore stand_up
  await evaljs('PrologueAPI.gather()');
  for (let i = 0; i < 40; i++) { await sleep(3000); if ((await evaljs('PrologueAPI.state()')) === 'await_sit') break; }
  await evaljs('DebugAPI.teleport(2.2, 6.8, 0, 1.8)');
  await sleep(300);
  await evaljs('PrologueAPI.takeSeat()');
  for (let i = 0; i < 90; i++) { await sleep(400); await evaljs('PrologueAPI.skip()'); if ((await evaljs('PrologueAPI.state()')) === 'done') break; }
  let su = null;
  for (let i = 0; i < 40 && !su; i++) {
    await sleep(300);
    for (const cid of ['blore', 'lombard', 'brent', 'marston']) {
      if ((await evaljs(`NPCAPI.get("${cid}")?._oncePlaying`)) === 'stand_up') { su = cid; break; }
    }
  }
  console.log('起身过渡捕获:', su || 'MISS');
  if (su) {
    await evaljs(frontCam(su, 2.6));
    await sleep(150);
    await shot('motion_stand_up_1.png');
    await sleep(800);
    await shot('motion_stand_up_2.png');
  }

  // ④ 阿姆斯特朗 ch5 崩溃瘫坐（jump(5)→distress=true；摆拍落座触发 crisis 分支）
  await boot(0);
  await evaljs('SaveAPI.clear()');
  await boot(0);
  await evaljs('NavAPI.jump(5)');
  await sleep(3000);
  console.log('armstrong distress:', await evaljs('NPCAPI.get("armstrong")?.distress'));
  await evaljs(`(() => {
    const n = NPCAPI.get('armstrong');
    n.prologueLock = true;
    n.walking = false;
    n.setAction('sit');
  })()`);
  for (let i = 0; i < 40; i++) { await sleep(250); if ((await evaljs('NPCAPI.get("armstrong")?.rigged?.currentName')) === 'crisis') break; }
  console.log('armstrong clip:', await evaljs('NPCAPI.get("armstrong")?.rigged?.currentName'));
  await evaljs(frontCam('armstrong', 2.2));
  await sleep(600);
  await shot('motion_armstrong_crisis.png');
  ws.close(); edge.kill(); process.exit(0);
}
main().catch((e) => { console.error(e); edge.kill(); process.exit(1); });
