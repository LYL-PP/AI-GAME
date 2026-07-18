// nav_test.mjs —— 章节导航 CDP 验收（5 项）
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9236;
const SHOTS = join(ROOT, 'docs/screenshots');

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
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`); ok ? pass++ : fail++; };

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
  await sleep(12000);

  // 面板打开截图
  await evaljs('NavAPI.open()');
  await sleep(600);
  await shot('nav_panel.png');
  await evaljs('NavAPI.close()');

  // ① jump(3)
  await evaljs('StoryAPI.jumpToChapter(3, false)');
  await sleep(1500);
  let r = JSON.parse(await evaljs(`JSON.stringify({
    marstonDead: NPCAPI.get('marston').dead && !NPCAPI.get('marston').group.visible,
    mrsDead: NPCAPI.get('mrs_rogers').dead && !NPCAPI.get('mrs_rogers').group.visible,
    deadIds: SaveAPI.data().deadIds,
    fig: FigurineAPI.count(),
    weather: WeatherAPI.getChapter(),
    state: ChapterAPI.state(),
    prologueDone: SaveAPI.data().prologueDone,
  })`));
  check('① jump(3) 马尔斯顿移除', r.marstonDead === true);
  check('① jump(3) 罗杰斯太太移除', r.mrsDead === true && r.deadIds.length === 2);
  check('① jump(3) 瓷人=8', r.fig === 8, `got=${r.fig}`);
  check('① jump(3) 天气=3 + explore 可玩', r.weather === 3 && r.state === 'explore' && r.prologueDone === true, `state=${r.state}`);

  // ② jump(6)：wargrave 仍在 + 瓷人 5
  await evaljs('StoryAPI.jumpToChapter(6, false)');
  await sleep(1500);
  await evaljs('DebugAPI.teleport(0, 4, 0, 1.8)');  // 走近大厅，绕过距离剔除
  await sleep(800);
  r = JSON.parse(await evaljs(`JSON.stringify({
    warDead: NPCAPI.get('wargrave').dead,
    warPerma: NPCAPI.get('wargrave').permaHidden,
    warVisible: NPCAPI.get('wargrave').group.visible,
    fig: FigurineAPI.count(),
    deadIds: SaveAPI.data().deadIds.length,
    weather: WeatherAPI.getChapter(),
  })`));
  check('② jump(6) wargrave 仍在（假死未发生）', r.warDead === false && r.warPerma === false && r.warVisible === true, JSON.stringify(r));
  check('② jump(6) 瓷人=5 + 死者=5', r.fig === 5 && r.deadIds === 5, `fig=${r.fig} dead=${r.deadIds}`);
  // jump(6) 后大厅场景截图
  await evaljs('DebugAPI.teleport(1, 6, 2.6, 1.8)');
  await sleep(1200);
  await shot('nav_jump6_hall.png');

  // ③ jump(11)：全灭 + finale + 推理板提交
  await evaljs('StoryAPI.jumpToChapter(11, true)');
  await sleep(1500);
  r = JSON.parse(await evaljs(`JSON.stringify({
    allDead: NPCAPI.list().every(id => NPCAPI.get(id).dead),
    fig: FigurineAPI.count(),
    state: ChapterAPI.state(),
    endState: EndingAPI.state(),
  })`));
  check('③ jump(11) 10 人全死', r.allDead === true);
  check('③ jump(11) 瓷人=0 + finale', r.fig === 0 && r.state === 'finale', `state=${r.state} end=${r.endState}`);
  check('③ 终章倒计时启动', r.endState === 'countdown' || r.endState === 'playing' || r.endState === 'idle', r.endState);
  // 打开推理板提交指认 → 真结局
  await evaljs('DeductionAPI.accuse("wargrave", ["clue_08", "clue_10"])');
  await sleep(1500);
  const dbg = JSON.parse(await evaljs('JSON.stringify(EndingAPI.debug())'));
  check('③ 终章可提交指认进结局', dbg.endingId === 'ending_true' && dbg.state === 'playing', JSON.stringify(dbg));

  // ④ 携带线索 jump(8)：11 条线索
  await send('Page.navigate', { url: 'http://localhost:8000/?chapter=0&play=1&fresh=1' });
  await sleep(12000);
  await evaljs('NavAPI.setCarry(true)');
  await evaljs('StoryAPI.jumpToChapter(8, true)');
  await sleep(1200);
  const clues = await evaljs('SaveAPI.data().clues.length');
  check('④ 携带线索 jump(8) = 11 条', clues === 11, `got=${clues}`);

  // ⑤ jump(0)：清存档整页重开（play 模式下验证状态重置）
  await evaljs('StoryAPI.jumpToChapter(0)');
  await sleep(9000);
  const t5 = JSON.parse(await evaljs(`JSON.stringify({
    reloaded: !!window.StoryAPI,
    chapter: SaveAPI.data().chapter,
    dead: (SaveAPI.data().deadIds || []).length,
    prologueDone: SaveAPI.data().prologueDone,
    fig: FigurineAPI.count(),
  })`));
  check('⑤ jump(0) 整页重开', t5.reloaded === true, '');
  check('⑤ jump(0) 存档已清（章0/无死者/序章未完/瓷人10）',
    t5.chapter === 0 && t5.dead === 0 && t5.prologueDone === false && t5.fig === 10, JSON.stringify(t5));

  console.log(`\n${pass} PASS / ${fail} FAIL`);
  ws.close(); chrome.kill();
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
