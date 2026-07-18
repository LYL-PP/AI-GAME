// walk_test.mjs —— 可达性/碰撞自动验收：传送到各点位，验证落地高度与阻挡行为
// 用法: node tools/walk_test.mjs
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9224;
const URL_GAME = 'http://localhost:8000/?chapter=0&play=1';

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--enable-unsafe-swiftshader',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(ROOT, 'tools/.chrome-profile')}`,
  '--window-size=1280,720', 'about:blank',
], { stdio: 'ignore', cwd: ROOT });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let id = 0;
const pending = new Map();
let ws;
const send = (method, params = {}) => new Promise((resolve) => {
  const mid = ++id;
  pending.set(mid, resolve);
  ws.send(JSON.stringify({ id: mid, method, params }));
});
async function evaljs(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r?.exceptionDetails) console.log('EVAL ERROR:', JSON.stringify(r.exceptionDetails).slice(0, 400));
  return r?.result?.value;
}

const TEST = `(async () => {
  const D = window.DebugAPI;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = [];
  const spot = async (name, x, z, expectY, tol = 0.3) => {
    D.teleport(x, z, 0, expectY + 0.5);
    await sleep(900);
    const s = D.getState();
    const ok = Math.abs(s.y - expectY) <= tol;
    out.push({ name, y: s.y, expectY, ok });
  };
  // 室外点位
  await spot('码头', 0, 100, 1.25);
  await spot('北岬角', 0, -76, 1.1, 0.6);
  await spot('柴棚', -18, 3, 1.55, 0.5);
  await spot('海滩', 44, 50, 0.72, 0.5);
  await spot('悬崖小径', -14, -20, 3.2, 1.2);
  await spot('孤树(台地)', -52, -48, 10.0, 0.8);
  // 别墅一层
  await spot('大厅', 0, 4, 1.8);
  await spot('餐厅', 10, 3, 1.8);
  await spot('厨房', 10, -5, 1.8);
  await spot('管家房', -10, 5, 1.8);
  await spot('后廊', 0, -5, 1.8);
  await spot('露台', 0, 10, 1.8);
  // 二层
  await spot('走廊L2', 2, 0, 5.0);
  await spot('北客房N2', -2, -4.75, 5.0);
  await spot('南客房S1(维拉)', -6, 4.75, 5.0);
  await spot('南客房S5', 10, 4.75, 5.0);
  await spot('浴室', -10, 5, 5.0);
  // 三层
  await spot('书房', 0, 0, 8.2);
  await spot('储藏室', 10, -4, 8.2);
  // 楼梯行走：从 L1 走上 L2 平台
  D.teleport(-9, 1.5, 0, 1.8);
  const path = [[-11, 1.7], [-11, 0], [-11, -1.2], [-11, -2.2], [-9, -2.5], [-9, -1.0], [-9, -0.4], [-8.6, 0.5]];
  for (const [tx, tz] of path) {
    for (let i = 0; i < 40; i++) {
      const s = D.getState();
      const dx = tx - s.x, dz = tz - s.z;
      if (Math.hypot(dx, dz) < 0.15) break;
      const l = Math.hypot(dx, dz);
      D.move(dx / l * 0.12, dz / l * 0.12);
      await sleep(16);
    }
  }
  await sleep(300);
  const sEnd = D.getState();
  out.push({ name: '楼梯 L1→L2 平台', y: sEnd.y, expectY: 5.0, ok: Math.abs(sEnd.y - 5.0) < 0.3 });
  // 楼梯 L2→L3
  D.teleport(-9, 1.5, 0, 5.0);
  const path2 = [[-11, 1.2], [-11, 0], [-11, -1.2], [-11, -2.2], [-9, -2.5], [-9, -1.0], [-9, -0.4], [-8.6, 0.5]];
  for (const [tx, tz] of path2) {
    for (let i = 0; i < 40; i++) {
      const s = D.getState();
      const dx = tx - s.x, dz = tz - s.z;
      if (Math.hypot(dx, dz) < 0.15) break;
      const l = Math.hypot(dx, dz);
      D.move(dx / l * 0.12, dz / l * 0.12);
      await sleep(16);
    }
  }
  await sleep(300);
  const sEnd2 = D.getState();
  out.push({ name: '楼梯 L2→L3 平台', y: sEnd2.y, expectY: 8.2, ok: Math.abs(sEnd2.y - 8.2) < 0.3 });
  // 入海阻挡：码头向南走进海（应被拦在栈道/浅水）
  D.teleport(0, 94, 0);
  for (let i = 0; i < 40; i++) { D.move(0, 0.3); await sleep(8); }
  const sSea = D.getState();
  out.push({ name: '入海阻挡(停于栈道南端)', z: sSea.z, y: sSea.y, ok: sSea.z <= 105 && sSea.y > 0.5 });
  // 边界圆柱：向东冲（非码头方向，应被浅水/边界拦下）
  D.teleport(30, 0, 0);
  for (let i = 0; i < 200; i++) { D.move(0.5, 0); await sleep(4); }
  const sB = D.getState();
  const rB = Math.hypot(sB.x, sB.z);
  out.push({ name: '岛屿边界(东侧, r<=95.5)', r: +rB.toFixed(1), y: sB.y, ok: rB <= 95.5 && sB.y > -0.5 });
  // 悬崖阻挡：台地顶向西北冲（应被陡坡拦住，不坠落）
  D.teleport(-45, -45, 0);
  for (let i = 0; i < 80; i++) { D.move(-0.4, -0.4); await sleep(8); }
  const sC = D.getState();
  out.push({ name: '悬崖陡坡阻挡(不坠落)', y: sC.y, x: sC.x, z: sC.z, ok: sC.y > 6 });
  // 穿墙测试：大厅向北推墙（z=-2 墙，开口在 x -2.5..2.5，选 x=-6 撞墙）
  D.teleport(-6, 0, 0);
  for (let i = 0; i < 30; i++) { D.move(0, -0.15); await sleep(8); }
  const sW = D.getState();
  out.push({ name: '墙体阻挡(大厅北墙)', z: sW.z, ok: sW.z > -2.2 });
  return JSON.stringify(out);
})()`;

async function main() {
  let wsUrl;
  for (let i = 0; i < 40 && !wsUrl; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      wsUrl = list.find((t) => t.type === 'page')?.webSocketDebuggerUrl;
    } catch {}
    if (!wsUrl) await sleep(500);
  }
  ws = new WebSocket(wsUrl);
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
  };
  await new Promise((r) => { ws.onopen = r; });
  await send('Page.enable');
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Runtime.enable');
  await send('Page.navigate', { url: URL_GAME });
  await sleep(12000);
  const ready = await evaljs('!!window.DebugAPI');
  if (!ready) { console.log('FAIL: DebugAPI not ready'); chrome.kill(); process.exit(1); }
  const res = JSON.parse(await evaljs(TEST));
  let pass = 0;
  for (const r of res) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  ${JSON.stringify(r)}`);
    if (r.ok) pass++;
  }
  console.log(`\n${pass}/${res.length} 通过`);
  ws.close();
  chrome.kill();
  process.exit(pass === res.length ? 0 : 1);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
