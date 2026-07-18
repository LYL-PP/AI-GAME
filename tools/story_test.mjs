// story_test.mjs —— 序章/NPC/对话 CDP 验收：位置检查 + 晚餐/指控/对话截图
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9226;
const SHOTS = join(ROOT, 'docs/screenshots');

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--enable-unsafe-swiftshader',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(ROOT, 'tools/.chrome-profile')}`,
  '--window-size=1280,720', 'about:blank',
], { stdio: 'ignore', cwd: ROOT });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let id = 0; const pending = new Map(); let ws;
const send = (m, p = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const evaljs = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r?.exceptionDetails) console.log('EVAL ERR:', JSON.stringify(r.exceptionDetails).slice(0, 500));
  return r?.result?.value;
};
async function shot(name) {
  const s = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(SHOTS, name), Buffer.from(s.data, 'base64'));
  console.log('SHOT:', name);
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
  await send('Page.navigate', { url: 'http://localhost:8000/?chapter=0&play=1' });
  await sleep(12000);

  // 1) NPC 在场与初始位置（chapter 0 日程第一条）
  const npcCheck = await evaljs(`(() => {
    const out = [];
    const expect = {
      wargrave: [-2.5, 5.5], brent: [-5.5, 6.3], marston: [-6.8, -0.2],
      macarthur: [0, 11.3], rogers: [9.2, 4.3], mrs_rogers: [10.6, -4.6],
    };
    for (const id of NPCAPI.list()) {
      const n = NPCAPI.get(id);
      out.push(id + ':' + n.pos.x.toFixed(1) + ',' + n.pos.z.toFixed(1));
    }
    const pos = {};
    for (const [id, [ex, ez]] of Object.entries(expect)) {
      const n = NPCAPI.get(id);
      pos[id] = Math.hypot(n.pos.x - ex, n.pos.z - ez) < 1.2 ? 'PASS' : 'FAIL(' + n.pos.x.toFixed(1) + ',' + n.pos.z.toFixed(1) + ')';
    }
    return JSON.stringify({ count: NPCAPI.list().length, pos });
  })()`);
  console.log('NPC:', npcCheck);

  // 2) 触发聚集（直接调 gather，等价于门廊触发）
  await evaljs('PrologueAPI.gather()');
  console.log('gathering…');
  for (let i = 0; i < 34; i++) {
    await sleep(3000);
    const st = await evaljs('PrologueAPI.state()');
    if (st === 'await_sit') break;
  }
  const seated = await evaljs(`(() => {
    const out = [];
    for (const id of NPCAPI.list()) {
      const n = NPCAPI.get(id);
      const seated = n.seated || n.action === 'sit';
      const d = Math.hypot(n.pos.x - 2.5, n.pos.z - 4.0);
      out.push(id + '=' + (seated && d < 3.5 ? 'Y' : 'N(' + n.action + '@' + n.pos.x.toFixed(1) + ',' + n.pos.z.toFixed(1) + ')'));
    }
    return JSON.stringify({ state: PrologueAPI.state(), out });
  })()`);
  console.log('SEATED:', seated);

  // 3) 玩家传送到自己座位旁 → 入座
  await evaljs(`(() => { DebugAPI.teleport(2.2, 6.8, 0, 1.8); })()`);
  await sleep(400);
  await evaljs('PrologueAPI.takeSeat()');
  await sleep(2500);
  await shot('story_dinner.png');          // 入座后视角：圆桌全员
  console.log('cine state:', await evaljs('PrologueAPI.state()'));

  // 4) 指控 intro（留声机特写 + 字幕）
  await sleep(3000);
  await shot('story_accusation_intro.png');
  // 跳到第 3 条（macarthur）途中截一张 NPC 反应镜头
  for (let i = 0; i < 8; i++) { await evaljs('PrologueAPI.skip()'); await sleep(700); }
  await sleep(1200);
  await shot('story_accusation_npc.png');
  // 跳到玩家条目（第 11 条）
  for (let i = 0; i < 22; i++) { await evaljs('PrologueAPI.skip()'); await sleep(350); }
  await sleep(800);
  await shot('story_accusation_player.png');
  // 跳到昏厥/恢复
  for (let i = 0; i < 10; i++) { await evaljs('PrologueAPI.skip()'); await sleep(400); }
  await sleep(2500);
  await shot('story_faint.png');
  await evaljs('PrologueAPI.restore()');
  await sleep(1500);
  console.log('final state:', await evaljs('PrologueAPI.state()'));

  // 5) 对话 UI：传送到维拉身边开聊
  await evaljs(`(() => {
    const v = NPCAPI.get('vera');
    DebugAPI.teleport(v.pos.x + 1.2, v.pos.z + 1.2, 0, 1.8);
    DialogueAPI.start('vera');
  })()`);
  await sleep(2500);
  await shot('story_dialogue.png');
  // 播完维拉 ch0 全部节点
  for (let i = 0; i < 10; i++) { await evaljs(`(() => { const b = document.getElementById('dlgBox'); return b.classList.contains('show'); })()`); await evaljs('window.dispatchEvent(new KeyboardEvent("keydown",{code:"KeyE"}))'); await sleep(500); }

  // 6) 性能
  const perf = await evaljs('JSON.stringify({tri: PerfAPI.info().render.triangles, calls: PerfAPI.info().render.calls})');
  console.log('PERF:', perf);

  ws.close(); chrome.kill(); process.exit(0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
