// nb_shots.mjs —— 推理板/指认槽规范截图
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9233;
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--enable-unsafe-swiftshader',`--remote-debugging-port=${PORT}`,`--user-data-dir=${join(ROOT,'tools/.chrome-profile')}`,'--window-size=1280,720','about:blank'], { stdio: 'ignore', cwd: ROOT });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let id = 0; const pending = new Map(); let ws;
const send = (m, p = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const evaljs = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }))?.result?.value;
async function shot(name) {
  const s = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(ROOT, 'docs/screenshots', name), Buffer.from(s.data, 'base64'));
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
  await send('Page.navigate', { url: 'http://localhost:8000/?chapter=11&play=1&fresh=1' });
  await sleep(12000);
  // 布置：死者灰显 + 线索 + 连线 + 软标记
  await evaljs(`(() => {
    SaveAPI.data().deadIds = ['marston','mrs_rogers','macarthur','rogers','brent','wargrave','armstrong','blore','lombard','vera'];
    ['clue_01','clue_08','clue_09','clue_10','clue_12'].forEach(c => ClueAPI.add(c));
    DeductionAPI.link('clue_01','marston');
    DeductionAPI.link('clue_08','wargrave');
    DeductionAPI.link('clue_10','wargrave');
    DeductionAPI.link('clue_12','vera');
    DeductionAPI.softMark('lombard');
    DeductionAPI.open();
    document.querySelector('[data-tab="board"]').click();
  })()`);
  await sleep(800);
  console.log('dead cards:', await evaljs("document.querySelectorAll('.nb-suspect.dead').length"));
  await shot('nb_board.png');
  // 指认槽填充
  await evaljs(`(() => {
    document.querySelector('[data-npc="wargrave"]').click();
    const chips = [...document.querySelectorAll('#nbCluePool .nb-chip')];
    chips.find(c => c.dataset.clue === 'clue_08').click();
    chips.find(c => c.dataset.clue === 'clue_10').click();
  })()`);
  await sleep(500);
  await evaljs("document.getElementById('nbPageBoard').scrollTop = 9999");
  await sleep(300);
  await shot('nb_accuse.png');
  const perf = await evaljs('JSON.stringify({tri: PerfAPI.info().render.triangles, calls: PerfAPI.info().render.calls})');
  console.log('PERF:', perf);
  ws.close(); chrome.kill(); process.exit(0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
