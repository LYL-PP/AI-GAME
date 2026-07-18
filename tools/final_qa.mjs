// final_qa.mjs —— 最终 QA：序章→10 章→终章→真结局全链路 + 音频/空掉感断言 + 读档恢复 + 性能
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9235;
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

  // ============ 序章全跑 ============
  check('序章 idle', (await evaljs('PrologueAPI.state()')) === 'idle');
  // 序章风暴暗示：码头收音机
  await evaljs('DebugAPI.teleport(1.2, 97.5, 0, 1.25)');
  await sleep(300);
  await evaljs(`(() => { document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' })); })()`);
  await sleep(500);
  const toast = await evaljs(`document.getElementById('toast').textContent`);
  check('序章风暴暗示（收音机 E）', toast.includes('风暴') || toast.includes('海务'), toast.slice(0, 30));
  // 音频枚举触发无异常
  const sfxOk = await evaljs(`(() => {
    const names = ['figurine_break','clue_pickup','accuse_bass','gunshot_beach','gunshot_final','waves','bee_hum','choking','morning_bell_silence','distant_shout','axe_drop_echo','vera_scream','door_lock_night','marble_crash','chair_topple','paper','type_tick','npc_blip','clock_tick','gramophone_voice','step'];
    try { for (const n of names) AudioAPI.play(n); return 'ok'; } catch (e) { return 'err:' + e.message; }
  })()`);
  check('SFX 全部可触发无异常', sfxOk === 'ok', sfxOk);
  check('声部计数 ch0 = 10', (await evaljs('AudioAPI.stemCount()')) === 10);

  // 序章 gather → 入座 → 指控 → done
  await evaljs('PrologueAPI.gather()');
  for (let i = 0; i < 34; i++) { await sleep(3000); if ((await evaljs('PrologueAPI.state()')) === 'await_sit') break; }
  await evaljs('DebugAPI.teleport(2.2, 6.8, 0, 1.8)');
  await sleep(300);
  await evaljs('PrologueAPI.takeSeat()');
  for (let i = 0; i < 60; i++) { await evaljs('PrologueAPI.skip()'); await sleep(700); if ((await evaljs('PrologueAPI.state()')) === 'done') break; }
  check('序章完成(done)', (await evaljs('PrologueAPI.state()')) === 'done');
  check('第 1 章开始', (await evaljs('ChapterAPI.state()')) === 'explore');
  const perfDinner = await evaljs('JSON.stringify({tri: PerfAPI.info().render.triangles, calls: PerfAPI.info().render.calls})');
  console.log('PERF 晚餐后:', perfDinner);

  // ============ 章节循环 ============
  const VICTIM = { 1: 'marston', 2: 'mrs_rogers', 3: 'macarthur', 4: 'rogers', 5: 'brent', 6: 'wargrave', 7: 'armstrong', 8: 'blore', 9: 'lombard', 10: 'vera' };
  let reloaded = false;
  for (let ch = 1; ch <= 10; ch++) {
    await evaljs('StoryAPI.triggerDeath()');
    for (let i = 0; i < 40; i++) { await sleep(500); if ((await evaljs('ChapterAPI.state()')) === 'await') break; }
    const s = JSON.parse(await evaljs('JSON.stringify(ChapterAPI.sceneSpot())'));
    await evaljs(`DebugAPI.teleport(${s.x + 1.5}, ${s.z + 1.5}, 0, ${s.y})`);
    let st = '';
    for (let i = 0; i < 24; i++) { await sleep(500); st = await evaljs('ChapterAPI.state()'); if (st === 'scene') break; }
    check(`ch${ch} 抵达现场`, st === 'scene', `state=${st}`);
    await evaljs('StoryAPI.settle()');
    await sleep(800);
    for (let i = 0; i < 45; i++) {
      await evaljs('FigurineAPI.skip()');
      await sleep(450);
      const s2 = await evaljs('ChapterAPI.state()');
      if (s2 === 'explore' || s2 === 'finale') break;
    }
    const fig = await evaljs('FigurineAPI.count()');
    const wc = await evaljs('WeatherAPI.getChapter()');
    check(`ch${ch} 结算（瓷人 ${fig} / 天气 ${wc}）`, fig === 10 - ch && wc === ch + 1, '');
    // 声部递减
    const stems = await evaljs('AudioAPI.stemCount()');
    check(`ch${ch} 声部=${10 - ch}`, stems === Math.max(0, 10 - ch), `got=${stems}`);
    // 中途读档（ch5 后）
    if (ch === 5 && !reloaded) {
      reloaded = true;
      await send('Page.navigate', { url: 'http://localhost:8000/?play=1' });
      await sleep(12000);
      const rc = await evaljs('WeatherAPI.getChapter()');
      const rf = await evaljs('FigurineAPI.count()');
      const rd = await evaljs('SaveAPI.data().deadIds.length');
      const rst = await evaljs('ChapterAPI.state()');
      check('读档恢复（章/瓷人/死者/流程）', rc === 6 && rf === 5 && rd === 5 && rst === 'explore', `ch=${rc} fig=${rf} dead=${rd} state=${rst}`);
    }
    if (ch === 6) {
      const vc = await evaljs('window.__emp ? __emp.visibleChairs() : -1');
      check('ch6 椅子递减=5', vc === 5, `got=${vc}`);
      const yarn = await evaljs('window.__emp ? __emp.yarn.visible : true');
      check('ch6 毛线消失', yarn === false);
      await shot('empty_hall_ch6.png');
    }
    if (ch === 2) {
      const perf2 = await evaljs('JSON.stringify({tri: PerfAPI.info().render.triangles, calls: PerfAPI.info().render.calls})');
      console.log('PERF 暴雨 ch2:', perf2);
    }
  }

  check('终章 finale', (await evaljs('ChapterAPI.state()')) === 'finale');
  check('终章声部=0', (await evaljs('AudioAPI.stemCount()')) === 0);
  const perfFinale = await evaljs('JSON.stringify({tri: PerfAPI.info().render.triangles, calls: PerfAPI.info().render.calls})');
  console.log('PERF 终章:', perfFinale);

  // ============ 真结局 ============
  await evaljs(`(() => {
    for (let i = 1; i <= 13; i++) ClueAPI.add('clue_' + String(i).padStart(2, '0'));
  })()`);
  await evaljs('DeductionAPI.accuse("wargrave", ["clue_08", "clue_10"])');
  await sleep(2000);
  const dbg = JSON.parse(await evaljs('JSON.stringify(EndingAPI.debug())'));
  check('真结局进入', dbg.state === 'playing' && dbg.endingId === 'ending_true', JSON.stringify(dbg));
  for (let i = 0; i < 160; i++) {
    // 隐藏结局二选一时点第一个
    if (await evaljs(`document.querySelectorAll('.end-choice').length >= 2`)) {
      await evaljs(`document.querySelectorAll('.end-choice')[0].click()`);
    }
    await evaljs('EndingAPI.skip()');
    await sleep(500);
    if (await evaljs(`document.getElementById('stats').classList.contains('show')`)) break;
  }
  check('统计页', (await evaljs(`document.getElementById('stats').classList.contains('show')`)) === true);
  await shot('final_stats.png');

  console.log(`\n${pass} PASS / ${fail} FAIL`);
  ws.close(); chrome.kill();
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
