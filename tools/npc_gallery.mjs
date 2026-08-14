// npc_gallery.mjs —— rigged_view2.html 逐角色逐 clip 截图（真贴图新版验收；Edge 无头，CDP localhost 优先）
// 用法: node tools/npc_gallery.mjs [id ...]   （默认全部 4 人）
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { get } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EDGE = process.env.CHROME || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9388;
const edge = spawn(EDGE, ['--headless=new','--disable-gpu','--enable-unsafe-swiftshader',`--remote-debugging-port=${PORT}`,`--user-data-dir=${join(ROOT,'tools/.edge-profile-gal')}`,'--window-size=1000,800','about:blank'], { stdio: 'ignore', cwd: ROOT });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJson = (url) => new Promise((res, rej) => {
  get(url, (r) => { let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on('error', rej);
});
let id = 0; const pending = new Map(); let ws;
const send = (m, p = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const evaljs = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }))?.result?.value;
async function shot(name) {
  const s = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(ROOT, 'docs/screenshots', name), Buffer.from(s.data, 'base64'));
  console.log('SHOT:', name);
}
const PLAN = {
  vera:       ['walking', 'idle3', 'sitting'],
  rogers:     ['walking', 'body', 'sitting'],
  mrs_rogers: ['walking', 'body', 'sitting'],
  macarthur:  ['walking', 'idle11', 'sitting'],
  marston:    ['walking', 'idle2', 'sitting'],
};
async function main() {
  const ids = process.argv.slice(2).filter((x) => PLAN[x]);
  const chars = ids.length ? ids : Object.keys(PLAN);
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
  for (const c of chars) {
    for (const clip of PLAN[c]) {
      await send('Page.navigate', { url: `http://localhost:8000/tools/rigged_view2.html?id=${c}&clip=${encodeURIComponent(clip)}` });
      for (let i = 0; i < 60; i++) { await sleep(500); if ((await evaljs('document.title')) === `ready:${c}:${clip}`) break; }
      await sleep(1500);
      await shot(`new_${c}_${clip}.png`);
    }
  }
  ws.close(); edge.kill(); process.exit(0);
}
main().catch((e) => { console.error(e); edge.kill(); process.exit(1); });
