// boot_check.mjs —— 启动自检：全 rigged 角色 items/材质路径/沃格雷夫借坐/ch9 借用/马尔斯顿 dying
import { spawn } from 'node:child_process';
import { get } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EDGE = process.env.CHROME || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9250;
const edge = spawn(EDGE, ['--headless=new','--disable-gpu','--enable-unsafe-swiftshader',`--remote-debugging-port=${PORT}`,`--user-data-dir=${join(ROOT,'tools/.edge-profile-boot')}`,'--window-size=800,600','about:blank'], { stdio: 'ignore', cwd: ROOT });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJson = (url) => new Promise((res, rej) => {
  get(url, (r) => { let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on('error', rej);
});
let id = 0; const pending = new Map(); let ws;
const send = (m, p = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const evaljs = async (e) => {
  const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
  if (r?.exceptionDetails) console.log('EVAL ERR:', JSON.stringify(r.exceptionDetails).slice(0, 300));
  return r?.result?.value;
};
async function main() {
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
  // 收集控制台告警（借用失败等）
  await send('Log.enable');
  const logs = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Log.entryAdded' && /rigged|404|Failed/i.test(m.params.entry.text || '')) logs.push(m.params.entry.text.slice(0, 160));
  });
  await send('Page.navigate', { url: 'http://localhost:8000/?chapter=0&play=1&fresh=1' });
  for (let i = 0; i < 300; i++) { await sleep(1000); if (await evaljs('!!window.__ready')) break; }
  const report = await evaljs(`(() => {
    const out = {};
    for (const id of NPCAPI.list()) {
      const n = NPCAPI.get(id);
      if (n.rigged) out[id] = Object.keys(n.rigged.items).join(',');
      else out[id] = n.kenney ? 'KENNEY' : 'PROC';
    }
    return JSON.stringify(out);
  })()`);
  console.log('ITEMS:', report);
  console.log('wargrave 借坐:', await evaljs('NPCAPI.get("wargrave")?.rigged?.has("Chair_Sit_Idle_M")'));
  console.log('lombard parry:', await evaljs('NPCAPI.get("lombard")?.rigged?.has("parry")'), '| punch_react:', await evaljs('NPCAPI.get("lombard")?.rigged?.has("punch_react")'));
  console.log('vera parry_hold:', await evaljs('NPCAPI.get("vera")?.rigged?.has("parry_hold")'), '| marston dying:', await evaljs('NPCAPI.get("marston")?.rigged?.has("dying")'));
  console.log('LOGS:', logs.length ? logs.join(' || ') : '（无 rigged/404 告警）');
  ws.close(); edge.kill(); process.exit(0);
}
main().catch((e) => { console.error(e); edge.kill(); process.exit(1); });
