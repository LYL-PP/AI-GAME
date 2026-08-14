// wg_shots3.mjs —— 补拍：行走近景(东侧)/坐姿(东侧)/指控全身像运镜帧（序章宣读信）
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { get } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9389;
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--enable-unsafe-swiftshader',`--remote-debugging-port=${PORT}`,`--user-data-dir=${join(ROOT,'tools/.chrome-profile-wgs3')}`,'--window-size=1280,720','about:blank'], { stdio: 'ignore', cwd: ROOT });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJson = (url) => new Promise((res, rej) => { get(url, (r) => { let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on('error', rej); });
let id = 0; const pending = new Map(); let ws;
const send = (m, p = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const evaljs = async (e) => {
  const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
  if (r?.exceptionDetails) console.log('EVAL ERR:', JSON.stringify(r.exceptionDetails).slice(0, 300));
  return r?.result?.value;
};
async function shot(name) {
  const s = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(ROOT, 'docs/screenshots', name), Buffer.from(s.data, 'base64'));
  console.log('SHOT:', name);
}
async function main() {
  let wsUrl;
  for (let i = 0; i < 90 && !wsUrl; i++) {
    for (const host of ['localhost', '127.0.0.1']) {
      if (wsUrl) break;
      try { const l = await getJson(`http://${host}:${PORT}/json/list`); wsUrl = l.find((t) => t.type === 'page')?.webSocketDebuggerUrl; } catch {}
    }
    if (!wsUrl) await sleep(1000);
  }
  if (!wsUrl) { console.log('NO PAGE'); chrome.kill(); process.exit(1); }
  ws = new WebSocket(wsUrl);
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
  await new Promise((r) => { ws.onopen = r; });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });

  // ---------- 1/2) ch1 行走+坐姿近景（他东侧 2.3m 朝西平视） ----------
  await send('Page.navigate', { url: 'http://localhost:8000/?chapter=1&play=1&fresh=1' });
  for (let i = 0; i < 240; i++) { await sleep(1000); if (await evaljs('!!window.__ready')) break; }
  const wg = JSON.parse(await evaljs('JSON.stringify((() => { const n = NPCAPI.get("wargrave"); return { x: n.group.position.x, y: n.group.position.y, z: n.group.position.z }; })())'));
  await evaljs(`DebugAPI.teleport(${wg.x + 2.3}, ${wg.z}, ${Math.PI / 2}, ${wg.y + 0.2})`);
  await evaljs(`NPCAPI.get('wargrave').rigged.play('walking')`);
  await sleep(900);
  await shot('wg_walk.png');
  await evaljs(`NPCAPI.get('wargrave').rigged.play('Chair_Sit_Idle_M')`);
  await sleep(1500);
  await shot('wg_sit.png');

  // ---------- 3) 指控全身像运镜帧（序章宣读信：留声机段） ----------
  await send('Page.navigate', { url: 'http://localhost:8000/?chapter=0&play=1&fresh=1' });
  for (let i = 0; i < 240; i++) { await sleep(1000); if (await evaljs('!!window.__ready')) break; }
  // 序章驱动：齐聚 → 就座 → 运镜宣读
  await evaljs('PrologueAPI.gather()');
  for (let i = 0; i < 120; i++) { await sleep(500); const s = await evaljs('PrologueAPI.state()'); if (s === 'await_sit' || s === 'take_seat') break; }
  await evaljs('PrologueAPI.takeSeat()');
  // 等全身像轮到沃格雷夫
  let got = false;
  for (let i = 0; i < 300; i++) {
    await sleep(400);
    const cur = await evaljs(`JSON.stringify({ show: document.getElementById('accusePortrait').classList.contains('show'), name: document.getElementById('accuseName').textContent })`);
    const c = JSON.parse(cur || '{}');
    if (c.show && (c.name || '').includes('沃格雷夫')) { got = true; break; }
  }
  console.log('accuse wargrave shown:', got);
  await shot('wg_accuse.png');
  ws.close(); chrome.kill(); process.exit(0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
