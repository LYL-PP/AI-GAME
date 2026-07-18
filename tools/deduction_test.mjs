// deduction_test.mjs —— 推理系统 CDP 验收（5 项）
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9232;
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
  if (r?.exceptionDetails) console.log('EVAL ERR:', JSON.stringify(r.exceptionDetails).slice(0, 900));
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
  await sleep(3000);
  await evaljs('SaveAPI.clear()');
  await send('Page.navigate', { url: 'http://localhost:8000/?chapter=0&play=1&fresh=1' });
  await sleep(12000);

  // 环境探针
  console.log('PROBE:', await evaljs(`(() => {
    return JSON.stringify({
      nbSuspects: !!document.getElementById('nbSuspects'),
      chars: (window.__nb ? window.__nb.data.characters.characters.length : 'no __nb'),
    });
  })()`));
  // ① 开笔记本 + 切分页
  await evaljs('DeductionAPI.open()');
  await sleep(400);
  const t1 = await evaljs(`(() => {
    const tabs = [...document.querySelectorAll('.nb-tab')].map(b => b.textContent);
    document.querySelector('[data-tab="board"]').click();
    return JSON.stringify({ tabs, boardVisible: document.getElementById('nbPageBoard').style.display !== 'none', open: DeductionAPI.isOpen() });
  })()`);
  const o1 = JSON.parse(t1);
  check('① 开笔记本切分页', o1.open && o1.boardVisible && o1.tabs.length === 4, t1);

  // ② 拾取 2 条线索后列表显示
  await evaljs(`(() => { ClueAPI.add('clue_01'); ClueAPI.add('clue_08'); DeductionAPI.open(); DeductionAPI.open(); })()`);
  await sleep(300);
  const t2 = await evaljs(`(() => {
    document.querySelector('[data-tab="clues"]').click();
    return JSON.stringify({
      count: document.getElementById('nbClueCount').textContent,
      names: [...document.querySelectorAll('.nb-clue-name')].map(e => e.textContent),
      unknowns: document.querySelectorAll('.nb-clue.unknown').length,
    });
  })()`);
  const o2 = JSON.parse(t2);
  check('② 线索列表 2/13', o2.count.includes('2') && o2.names.length === 2 && o2.unknowns === 11, t2);
  await shot('nb_clues.png');

  // ③ 拖线建立连线 + 存档 + 读档恢复
  await evaljs(`DeductionAPI.link('clue_01', 'vera'); DeductionAPI.link('clue_08', 'wargrave');`);
  await sleep(300);
  const t3a = await evaljs(`JSON.stringify({ links: SaveAPI.data().boardLinks, lines: document.querySelectorAll('#nbLines line').length })`);
  const o3a = JSON.parse(t3a);
  check('③ 连线建立+存档', o3a.links.length === 2 && o3a.lines === 2, t3a);
  await shot('nb_board.png');
  await send('Page.navigate', { url: 'http://localhost:8000/?chapter=0&play=1' });
  await sleep(11000);
  const t3b = await evaljs('JSON.stringify(SaveAPI.data().boardLinks)');
  check('③ 读档恢复连线', JSON.parse(t3b).length === 2, t3b);
  // 恢复现场：再开板截一张（含死者灰显前先造一个死者）
  await evaljs(`(() => { SaveAPI.data.deadIds.push('marston'); DeductionAPI.open(); document.querySelector('[data-tab="board"]').click(); })()`);
  await sleep(400);
  await shot('nb_board_dead.png');

  // ④ chapter=3 软指认标记 + suspect_reaction 对话
  await evaljs('DeductionAPI.close()');
  await evaljs('StoryAPI.setChapter(3)');
  await sleep(1200);
  await evaljs(`DeductionAPI.softMark('vera')`);
  const t4a = await evaljs('JSON.stringify(SaveAPI.data().softMarks)');
  check('④ 软指认标记存档', JSON.parse(t4a).vera === true, t4a);
  // 与维拉对话 → 应播放 suspect_reaction
  await evaljs(`(() => { const v = NPCAPI.get('vera'); DebugAPI.teleport(v.pos.x + 1.2, v.pos.z + 1.2, 0, v.pos.y); DialogueAPI.start('vera'); })()`);
  await sleep(1500);
  const t4b = await evaljs(`(() => {
    const txt = document.getElementById('dlgText').textContent;
    const stashed = (SaveAPI.data().suspectReactions.vera || []).length > 0;
    return JSON.stringify({ txt: txt.slice(0, 24), stashed, open: DialogueAPI.isOpen() });
  })()`);
  const o4 = JSON.parse(t4b);
  check('④ suspect_reaction 对话触发', o4.open && o4.stashed && o4.txt.length > 4, t4b);
  await evaljs('DialogueAPI.close()');

  // ⑤ chapter=11 终局指认：wargrave 达标 / vera 错判
  await evaljs('StoryAPI.setChapter(11)');
  await sleep(1200);
  await evaljs(`(() => { ['clue_08','clue_09','clue_10','clue_01'].forEach(c => ClueAPI.add(c)); })()`);
  const t5a = await evaljs('JSON.stringify(DeductionAPI.evaluate("wargrave", ["clue_08", "clue_10"]))');
  const o5a = JSON.parse(t5a);
  check('⑤ 指认 wargrave+链A×2 = 真结局达标', o5a.result === 'true' && o5a.evidenceOk === true, t5a);
  const t5b = await evaljs('JSON.stringify(DeductionAPI.evaluate("vera", ["clue_01"]))');
  const o5b = JSON.parse(t5b);
  check('⑤ 指认 vera+clue_01 = 错判', o5b.result === 'wrong' && o5b.evidenceOk === false, t5b);
  // UI 提交 + 存档
  await evaljs(`(() => { DeductionAPI.open(); document.querySelector('[data-tab="board"]').click(); })()`);
  await sleep(500);
  await evaljs(`(() => {
    document.querySelector('[data-npc="wargrave"]').click();
  })()`);
  await sleep(200);
  await evaljs(`(() => {
    const chips = [...document.querySelectorAll('#nbCluePool .nb-chip')];
    chips.find(c => c.dataset.clue === 'clue_08').click();
    chips.find(c => c.dataset.clue === 'clue_10').click();
  })()`);
  await sleep(300);
  await shot('nb_accuse.png');
  const t5c = await evaljs(`(() => {
    document.getElementById('nbAccuseGo').click();
    return JSON.stringify(SaveAPI.data().accusation);
  })()`);
  const o5c = JSON.parse(t5c);
  check('⑤ 提交指认写存档', o5c.accusedId === 'wargrave' && o5c.result === 'true', t5c);

  const perf = await evaljs('JSON.stringify({tri: PerfAPI.info().render.triangles, calls: PerfAPI.info().render.calls})');
  console.log('PERF:', perf);
  console.log(`\n${pass} PASS / ${fail} FAIL`);
  ws.close(); chrome.kill();
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
