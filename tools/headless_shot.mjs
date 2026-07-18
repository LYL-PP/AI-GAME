// headless_shot.mjs —— 用 CDP 驱动无头 Chrome 截图并读取 renderer.info
// 用法: node tools/headless_shot.mjs <url> <outPng> [waitMs]
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const [url, out, waitMs = '12000'] = process.argv.slice(2);
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9223;

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--enable-unsafe-swiftshader',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(ROOT, 'tools/.chrome-profile')}`,
  '--window-size=1280,720', 'about:blank',
], { stdio: 'ignore', cwd: ROOT });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getWsUrl() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await r.json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(500);
  }
  throw new Error('chrome devtools not ready');
}

let id = 0;
const pending = new Map();
let ws;
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
}

async function main() {
  const wsUrl = await getWsUrl();
  ws = new WebSocket(wsUrl);
  const errors = [];
  const consoles = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id).resolve(m.result);
      pending.delete(m.id);
    } else if (m.method === 'Runtime.exceptionThrown') {
      errors.push((m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text) + ' @' + (m.params.exceptionDetails?.stackTrace?.callFrames?.[0]?.url || '') + ':' + (m.params.exceptionDetails?.stackTrace?.callFrames?.[0]?.lineNumber || ''));
    } else if (m.method === 'Runtime.consoleAPICalled') {
      if (m.params.type === 'error' || m.params.type === 'warning') errors.push('CONSOLE-'+m.params.type+': ' + m.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0,300));
      consoles.push(m.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
    }
  };
  await new Promise((r) => { ws.onopen = r; });
  await send('Page.enable');
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url });
  await sleep(Number(waitMs));
  const perf = await send('Runtime.evaluate', {
    expression: `JSON.stringify(window.PerfAPI ? {tri: PerfAPI.info().render.triangles, calls: PerfAPI.info().render.calls, geos: PerfAPI.info().memory.geometries, ch: WeatherAPI.getChapter()} : null)`,
    returnByValue: true,
  });
  console.log('PERF:', perf?.result?.value);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(out, Buffer.from(shot.data, 'base64'));
  console.log('SAVED:', out);
  if (consoles.length) console.log('CONSOLE:', consoles.slice(0, 8).join(' | '));
  if (errors.length) console.log('ERRORS:', errors.join('\n'));
  ws.close();
  chrome.kill();
  process.exit(0);
}

main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
