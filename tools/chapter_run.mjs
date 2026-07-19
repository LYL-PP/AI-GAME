// chapter_run.mjs —— 全章 CDP 验收：序章→10 死亡事件→终章
// 断言每章：天气切换 / 死者移除 / 瓷人数递减 / 存档章节号
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9230;
const SHOTS = join(ROOT, 'docs/screenshots');
const SHOT_AT = new Set([1, 3, 6, 9, 10]); // 需要截图的章节

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--enable-unsafe-swiftshader',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(ROOT, 'tools/.chrome-profile')}`,
  '--window-size=1280,720', 'about:blank',
], { stdio: 'ignore', cwd: ROOT });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let id = 0; const pending = new Map(); let ws;
const send = (m, p = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const evaljs = async (e) => {
  const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
  if (r?.exceptionDetails) console.log('EVAL ERR:', JSON.stringify(r.exceptionDetails).slice(0, 400));
  return r?.result?.value;
};
async function shot(name) {
  const s = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(SHOTS, name), Buffer.from(s.data, 'base64'));
  console.log('SHOT:', name);
}

const VICTIM = { 1: 'marston', 2: 'mrs_rogers', 3: 'macarthur', 4: 'rogers', 5: 'brent', 6: 'wargrave', 7: 'armstrong', 8: 'blore', 9: 'lombard', 10: 'vera' };
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`);
  ok ? pass++ : fail++;
};

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
  // fresh=1 清存档重来
  await send('Page.navigate', { url: 'http://localhost:8000/?chapter=0&play=1&fresh=1' });
  await sleep(3000);
  await evaljs('SaveAPI.clear()');
  await send('Page.navigate', { url: 'http://localhost:8000/?chapter=0&play=1&fresh=1' });
  await sleep(12000);

  check('序章待命(idle)', (await evaljs('PrologueAPI.state()')) === 'idle');
  // 跳过序章直接进第 1 章（序章已由 story_test 验收）
  await evaljs('ChapterAPI.begin(1)');
  await sleep(1500);

  for (let ch = 1; ch <= 10; ch++) {
    // 触发死亡
    const triggered = await evaljs('StoryAPI.triggerDeath()');
    check(`ch${ch} 死亡触发`, triggered === true);
    // 演出章节（1/9）先等事件播完进入 await（无头 SwiftShader 下 sim 膨胀 ~5x，
    // ch9 演出 5s sim 需 25s+ 真实，20s 窗口会在 lockSpot 激活期 teleport 被弹飞）
    for (let i = 0; i < 120; i++) { await sleep(500); const s2 = await evaljs('ChapterAPI.state()'); if (s2 === 'await') break; }
    await sleep(300);
    // 玩家抵达现场
    const spot = await evaljs('JSON.stringify(ChapterAPI.sceneSpot())');
    const s = JSON.parse(spot);
    await evaljs(`DebugAPI.teleport(${s.x + 1.5}, ${s.z + 1.5}, 0, ${s.y})`);
    // 等待进入 scene 状态
    let st = '';
    for (let i = 0; i < 20; i++) { await sleep(500); st = await evaljs('ChapterAPI.state()'); if (st === 'scene') break; }
    if (st !== 'scene') {
      const dbgP = await evaljs('JSON.stringify(DebugAPI.getState())');
      console.log(`  [dbg] ch${ch} spot=${spot} feet=${dbgP}`);
    }
    check(`ch${ch} 抵达现场(scene)`, st === 'scene', `state=${st}`);
    if (SHOT_AT.has(ch)) { await sleep(1500); await shot(`death_ch${ch}.png`); }
    // 结算（轮询至结算完成，跳过演出等待）
    await evaljs('StoryAPI.settle()');
    await sleep(800);
    for (let i = 0; i < 45; i++) {
      await evaljs('FigurineAPI.skip()');
      await sleep(450);
      const st = await evaljs('ChapterAPI.state()');
      if (st === 'explore' || st === 'finale') break;
    }
    // 断言
    const want = ch + 1;
    const got = await evaljs('WeatherAPI.getChapter()');
    check(`ch${ch} 结算后天气=${want}`, got === want, `got=${got}`);
    const fig = await evaljs('FigurineAPI.count()');
    check(`ch${ch} 瓷人数=${10 - ch}`, fig === 10 - ch, `got=${fig}`);
    const victim = VICTIM[ch];
    const dead = await evaljs(`(() => { const n = NPCAPI.get('${victim}'); return n.dead && !n.group.visible; })()`);
    check(`ch${ch} 死者移除(${victim})`, dead === true);
    const saved = await evaljs('SaveAPI.data().chapter');
    check(`ch${ch} 存档章节=${want}`, saved === want, `got=${saved}`);
  }

  const finale = await evaljs('ChapterAPI.state()');
  check('终章状态(finale)', finale === 'finale');
  const finW = await evaljs('WeatherAPI.getChapter()');
  check('终章天气=11', finW === 11, `got=${finW}`);
  // 终章空大厅截图
  await evaljs('DebugAPI.teleport(0, 6.5, 2.6, 1.8)');
  await sleep(1200);
  await shot('finale_hall.png');

  const perf = await evaljs('JSON.stringify({tri: PerfAPI.info().render.triangles, calls: PerfAPI.info().render.calls})');
  console.log('PERF:', perf);
  console.log(`\n${pass} PASS / ${fail} FAIL`);
  ws.close(); chrome.kill();
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
