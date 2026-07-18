// dlg_check.mjs —— 对话分支（requireClue 过滤）验证
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9229;
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--enable-unsafe-swiftshader',`--remote-debugging-port=${PORT}`,`--user-data-dir=${join(ROOT,'tools/.chrome-profile')}`,'--window-size=1280,720','about:blank'], { stdio: 'ignore', cwd: ROOT });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let id = 0; const pending = new Map(); let ws;
const send = (m, p = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const evaljs = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r?.exceptionDetails) console.log('ERR', JSON.stringify(r.exceptionDetails).slice(0,300)); return r?.result?.value; };
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
  await send('Page.navigate', { url: 'http://localhost:8000/?chapter=1&play=1' });
  await sleep(12000);
  // 无线索：推进到 arm_c1_2（choices 节点）
  const r1 = await evaljs(`(() => {
    DialogueAPI.start('armstrong');
    for (let i = 0; i < 6; i++) { document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyE'})); }
    const btns = document.querySelectorAll('.dlg-choice');
    return JSON.stringify({ choices: btns.length, labels: [...btns].map(b=>b.textContent) });
  })()`);
  console.log('无线索:', r1);
  // 加入线索后重开
  const r2 = await evaljs(`(() => {
    DialogueAPI.close();
    ClueAPI.add('clue_01');
    DialogueAPI.start('armstrong');
    for (let i = 0; i < 6; i++) { document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyE'})); }
    const btns = document.querySelectorAll('.dlg-choice');
    return JSON.stringify({ choices: btns.length, labels: [...btns].map(b=>b.textContent) });
  })()`);
  console.log('有线索:', r2);
  // 选第 1 项（出示线索）→ 应进入 arm_c1_3 并写 flag
  const r3 = await evaljs(`(() => {
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'1'}));
    return new Promise(res => setTimeout(() => {
      res(JSON.stringify({ text: document.getElementById('dlgText').textContent.slice(0,20), flag: SaveAPI.data().flags.armstrong_cyanide_detail === true }));
    }, 800));
  })()`);
  console.log('分支进入:', r3);
  ws.close(); chrome.kill(); process.exit(0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
