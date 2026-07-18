// ending_test.mjs —— 四结局 CDP 验收
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9234;
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
  if (r?.exceptionDetails) console.log('EVAL ERR:', JSON.stringify(r.exceptionDetails).slice(0, 500));
  return r?.result?.value;
};
async function shot(name) {
  const s = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(SHOTS, name), Buffer.from(s.data, 'base64'));
  console.log('SHOT:', name);
}
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`); ok ? pass++ : fail++; };

async function boot(url) {
  await send('Page.navigate', { url });
  await sleep(12000);
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

  // ============ ① 真结局 + 隐藏结局 ============
  await boot('http://localhost:8000/?chapter=11&play=1&fresh=1');
  await evaljs(`(() => {
    for (let i = 1; i <= 13; i++) ClueAPI.add('clue_' + String(i).padStart(2, '0'));
  })()`);
  await evaljs('DeductionAPI.accuse("wargrave", ["clue_08", "clue_10"])');
  await sleep(2500);
  let dbg = JSON.parse(await evaljs('JSON.stringify(EndingAPI.debug())'));
  check('① 进入真结局演出', dbg.state === 'playing' && dbg.endingId === 'ending_true', JSON.stringify(dbg));
  check('① hiddenOk 判定', dbg.hiddenOk === true, '');
  // 空镜截图（第一步运镜）
  await shot('end_true_island.png');
  // 推进到瓶子
  for (let i = 0; i < 12; i++) { await evaljs('EndingAPI.skip()'); await sleep(900); }
  await shot('end_true_bottle.png');
  // 推进自白信：每段等文本出现再 skip；同循环监视夜奔段/书房终局图/瓶中信终帧
  let letterSeen = 0, nightSeen = false, runSeen = false, studySeen = false, bottleSeen = false;
  for (let i = 0; i < 60; i++) {
    const night = await evaljs('JSON.stringify((() => { const e = window.__endings; return e && e.night ? e.night.phase : null; })())');
    if (night && night !== 'null' && !nightSeen) {
      nightSeen = true;
      await sleep(1500);
      await shot('end_judge_night.png');
    }
    if (nightSeen && !runSeen && night === '"run"') {
      runSeen = true;
      await sleep(2500);
      await shot('end_judge_night2.png');
    }
    if (night && night !== 'null' && !runSeen) { await sleep(700); continue; }  // 夜奔段不跳过
    if (!studySeen && await evaljs(`document.getElementById('endStudyImg').classList.contains('show')`)) {
      studySeen = true;
      await sleep(2200); // 等渐显完成再截
      await shot('end_study_img.png');
    }
    if (!bottleSeen && await evaljs(`document.getElementById('endBottleImg').classList.contains('show')`)) {
      bottleSeen = true;
      await sleep(1500);
      await shot('end_bottle_theend.png');
    }
    const t = await evaljs(`document.getElementById('endLetterText').textContent.length`);
    if (t > 30) letterSeen++;
    if (i === 6) await shot('end_true_letter.png');
    await evaljs('EndingAPI.skip()');
    await sleep(1100);
  }
  check('① 自白信多段可推进', letterSeen >= 3, `letterSeen=${letterSeen}`);
  check('① 书房终局图出现', studySeen === true);
  check('① 瓶中信 THE END 终帧出现', bottleSeen === true);
  // 隐藏结局选择
  let choiceSeen = false;
  for (let i = 0; i < 20; i++) {
    const n = await evaljs(`document.querySelectorAll('.end-choice').length`);
    if (n >= 2) { choiceSeen = true; break; }
    await evaljs('EndingAPI.skip()');
    await sleep(600);
  }
  check('① 隐藏结局二选一出现', choiceSeen === true);
  await shot('end_hidden_choice.png');
  if (choiceSeen) await evaljs(`document.querySelectorAll('.end-choice')[0].click()`);
  await sleep(1500);
  // 统计页
  for (let i = 0; i < 16; i++) { await evaljs('EndingAPI.skip()'); await sleep(700); }
  const st = await evaljs(`(() => {
    const rows = document.getElementById('stRows').textContent;
    return JSON.stringify({ show: document.getElementById('stats').classList.contains('show'), rows });
  })()`);
  const ost = JSON.parse(st || '{}');
  check('① 统计页+结局名', ost.show === true && ost.rows?.includes('真结局'), (ost.rows || '').slice(0, 60));
  await shot('end_stats.png');

  // ============ ② 结局 B 错判 ============
  await boot('http://localhost:8000/?chapter=11&play=1&fresh=1');
  await evaljs(`(() => { ClueAPI.add('clue_01'); })()`);
  await evaljs('DeductionAPI.accuse("vera", ["clue_01"])');
  await sleep(2500);
  dbg = JSON.parse(await evaljs('JSON.stringify(EndingAPI.debug())'));
  check('② 进入结局 B', dbg.state === 'playing' && dbg.endingId === 'ending_wrong', JSON.stringify(dbg));
  const contra = await evaljs(`document.getElementById('endLetterText').textContent`);
  check('② 矛盾文案生成', typeof contra === 'string' && contra.length > 10, (contra || '').slice(0, 50));
  await shot('end_wrong_reason.png');
  for (let i = 0; i < 22; i++) { await evaljs('EndingAPI.skip()'); await sleep(700); }
  const st2 = JSON.parse(await evaljs(`JSON.stringify({ show: document.getElementById('stats').classList.contains('show'), rows: document.getElementById('stRows').textContent })`));
  check('② 统计页+结局 B', st2.show === true && st2.rows.includes('错判'), (st2.rows || '').slice(0, 60));

  // ============ ③ 结局 C 沉默 ============
  await boot('http://localhost:8000/?chapter=11&play=1&fresh=1');
  await evaljs('EndingAPI.enterFinale()');
  await evaljs('EndingAPI.giveUp()');
  await sleep(2500);
  dbg = JSON.parse(await evaljs('JSON.stringify(EndingAPI.debug())'));
  check('③ 进入结局 C', dbg.state === 'playing' && dbg.endingId === 'ending_silence', JSON.stringify(dbg));
  let cText = '';
  // 先轮询等待官方结论字幕出现（不打断），找不到再推进
  for (let i = 0; i < 25; i++) {
    const t = await evaljs(`document.getElementById('endSubtitles').textContent`);
    if (t.includes('官方结论')) { cText = t; break; }
    await sleep(700);
  }
  if (!cText) {
    for (let i = 0; i < 30; i++) {
      const t = await evaljs(`document.getElementById('endSubtitles').textContent`);
      if (t.includes('官方结论') || t.includes('无人生还')) { cText = t; break; }
      await evaljs('EndingAPI.skip()');
      await sleep(600);
    }
  }
  check('③ 官方结论字幕', cText.includes('官方结论'), cText.slice(0, 40));
  await shot('end_silence.png');
  for (let i = 0; i < 20; i++) { await evaljs('EndingAPI.skip()'); await sleep(600); }
  const st3 = JSON.parse(await evaljs(`JSON.stringify({ show: document.getElementById('stats').classList.contains('show'), rows: document.getElementById('stRows').textContent })`));
  check('③ 统计页+结局 C', st3.show === true && st3.rows.includes('沉默'), (st3.rows || '').slice(0, 60));

  // ============ ④ 隐藏结局否决（含非 wargrave 软指认） ============
  await boot('http://localhost:8000/?chapter=11&play=1&fresh=1');
  await evaljs(`(() => {
    for (let i = 1; i <= 13; i++) ClueAPI.add('clue_' + String(i).padStart(2, '0'));
    SaveAPI.data().softMarks.vera = true;
    DeductionAPI.accuse('wargrave', ['clue_08', 'clue_10']);
  })()`);
  await sleep(2000);
  dbg = JSON.parse(await evaljs('JSON.stringify(EndingAPI.debug())'));
  check('④ hiddenOk 被否决', dbg.endingId === 'ending_true' && dbg.hiddenOk === false, JSON.stringify(dbg));
  // 推进到演出结束，确认不出现二选一
  let choiceSeen4 = false;
  for (let i = 0; i < 45; i++) {
    const n = await evaljs(`document.querySelectorAll('.end-choice').length`);
    if (n >= 2) { choiceSeen4 = true; break; }
    const st4 = await evaljs(`document.getElementById('stats').classList.contains('show')`);
    if (st4) break;
    await evaljs('EndingAPI.skip()');
    await sleep(600);
  }
  check('④ 真结局后无隐藏追加', choiceSeen4 === false);

  const perf = await evaljs('JSON.stringify({tri: PerfAPI.info().render.triangles, calls: PerfAPI.info().render.calls})');
  console.log('PERF:', perf);
  console.log(`\n${pass} PASS / ${fail} FAIL`);
  ws.close(); chrome.kill();
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
