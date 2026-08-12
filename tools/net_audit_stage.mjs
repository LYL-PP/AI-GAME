// net_audit_stage.mjs —— 分阶段加载字节审计：标题页/可玩(阶段A完)/全部就绪(阶段B完) 三里程碑的请求数与字节
// 用法: node tools/net_audit_stage.mjs [url]
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9369;
const URL_TO_TEST = process.argv[2] || 'http://localhost:8000/?fresh=1';
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--enable-unsafe-swiftshader',`--remote-debugging-port=${PORT}`,`--user-data-dir=${join(ROOT,'tools/.chrome-profile-audit2')}`,'--window-size=1280,720','about:blank'], { stdio: 'ignore', cwd: ROOT });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let id = 0; const pending = new Map(); let ws;
const send = (m, p = {}) => new Promise((r2) => { const i = ++id; pending.set(i, r2); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const evaljs = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }))?.result?.value;
async function main() {
  let wsUrl;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); wsUrl = l.find((t) => t.type === 'page')?.webSocketDebuggerUrl; } catch {}
    if (!wsUrl) await sleep(1000);
  }
  ws = new WebSocket(wsUrl);
  const reqs = new Map();
  const order = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); return; }
    if (m.method === 'Network.requestWillBeSent') { if (!reqs.has(m.params.requestId)) { reqs.set(m.params.requestId, { url: m.params.request.url, bytes: 0 }); order.push(m.params.requestId); } }
    if (m.method === 'Network.loadingFinished') { const r = reqs.get(m.params.requestId); if (r) r.bytes = m.params.encodedDataLength; }
  };
  await new Promise((r) => { ws.onopen = r; });
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  const t0 = Date.now();
  await send('Page.navigate', { url: URL_TO_TEST });
  // 里程碑 1：标题按钮出现
  let tTitle = 0;
  for (let i = 0; i < 60 && !tTitle; i++) { await sleep(500); if (await evaljs('document.querySelector("#titleScreen .title-btns")?.style.display === "flex"')) tTitle = Date.now(); }
  // 点开始
  await evaljs('document.getElementById("btnStart")?.click()');
  // 里程碑 2：startOverlay 出现 = 阶段 A 完成可玩
  let tPlay = 0;
  for (let i = 0; i < 180 && !tPlay; i++) { await sleep(500); if (await evaljs('document.getElementById("startOverlay")?.style.display === "flex"')) tPlay = Date.now(); }
  // 里程碑 3：B 完成（WeatherAPI+NPCAPI）
  let tFull = 0;
  for (let i = 0; i < 300 && !tFull; i++) { await sleep(500); if (await evaljs('!!(window.WeatherAPI && window.NPCAPI)')) tFull = Date.now(); }
  const snap = (t) => {
    let bytes = 0, n = 0;
    for (const id2 of order) { const r = reqs.get(id2); if (r.doneAt && r.doneAt <= t) { bytes += r.bytes; n++; } }
    return { n, mb: +(bytes / 1048576).toFixed(1) };
  };
  // 用 loadingFinished 时间戳不可得（未记录）→ 改为按当前时刻快照+请求明细分类
  const all = order.map((id2) => reqs.get(id2));
  const cls = (u) => {
    if (u.includes('/rigged/')) return 'B_npc';
    if (u.includes('hall.glb')) return 'B_hall';
    if (u.includes('castle')) return 'A_castle';
    if (u.endsWith('.glb')) {
      const f = u.split('/').pop();
      if (['jetty', 'rock1', 'rock2', 'rock3', 'tree', 'cloud', 'boat', 'grass'].some((k) => f.startsWith(k))) return 'A_props';
      return 'B_props';
    }
    return 'core';
  };
  const agg = {};
  for (const r of all) { const c = cls(r.url); agg[c] = agg[c] || { n: 0, mb: 0 }; agg[c].n++; agg[c].mb += r.bytes / 1048576; }
  console.log('== 分阶段字节审计 ==');
  console.log('标题页就绪:', ((tTitle - t0) / 1000).toFixed(1) + 's');
  console.log('可玩(阶段A完成):', ((tPlay - t0) / 1000).toFixed(1) + 's');
  console.log('全部就绪(阶段B完成):', ((tFull - t0) / 1000).toFixed(1) + 's');
  let aBytes = 0, total = 0;
  for (const [k, v] of Object.entries(agg)) {
    console.log(`  ${k}: ${v.n} 个 / ${v.mb.toFixed(1)}MB`);
    total += v.mb;
    if (k.startsWith('A_') || k === 'core') aBytes += v.mb;
  }
  console.log(`阶段A(含核心代码/数据): ${aBytes.toFixed(1)}MB / 全量: ${total.toFixed(1)}MB = ${(aBytes / total * 100).toFixed(1)}%`);
  console.log('200KB/s 估算：A 可玩等待', (aBytes * 1048576 / 200 / 1024 / 60).toFixed(1), 'min；全量', (total * 1048576 / 200 / 1024 / 60).toFixed(1), 'min');
  chrome.kill(); process.exit(0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
