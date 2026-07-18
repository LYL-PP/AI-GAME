// dead_probe.mjs —— Dead clip 状态探针
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9243;
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--enable-unsafe-swiftshader',`--remote-debugging-port=${PORT}`,`--user-data-dir=${join(ROOT,'tools/.chrome-profile')}`,'--window-size=1280,720','about:blank'], { stdio: 'ignore', cwd: ROOT });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let id = 0; const pending = new Map(); let ws;
const send = (m, p = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const evaljs = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }))?.result?.value;
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
  await send('Page.navigate', { url: 'http://localhost:8000/?chapter=1&play=1&fresh=1' });
  await sleep(13000);
  await evaljs('ChapterAPI.begin(1)');
  await sleep(400);
  await evaljs('StoryAPI.triggerDeath()');
  for (let k = 0; k < 8; k++) {
    await sleep(800);
    const s = await evaljs(`(() => {
      const n = NPCAPI.get('marston');
      const r = n.rigged;
      const st = {};
      for (const [k, o] of Object.entries(r.items)) st[k] = +o.action.getEffectiveWeight().toFixed(2) + '/' + o.action.time.toFixed(1) + '/' + o.root.visible;
      return JSON.stringify({ cur: r.currentName, dead: n.dead, state: ChapterAPI.state(), items: st });
    })()`);
    console.log(k, s);
  }
  ws.close(); chrome.kill(); process.exit(0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
