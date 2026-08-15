// motion_gesture_reshoot.mjs —— 对话手势补拍：摆拍站姿 → 等 clip 落定 idle → 开对话捕 gesture/talk
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { get } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EDGE = process.env.CHROME || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9256;
const edge = spawn(EDGE, ['--headless=new','--disable-gpu','--enable-unsafe-swiftshader',`--remote-debugging-port=${PORT}`,`--user-data-dir=${join(ROOT,'tools/.edge-profile-gest')}`,'--window-size=1280,720','about:blank'], { stdio: 'ignore', cwd: ROOT });
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
  if (!wsUrl) { console.log('NO PAGE'); edge.kill(); process.exit(1); }
  ws = new WebSocket(wsUrl);
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
  await new Promise((r) => { ws.onopen = r; });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Page.navigate', { url: 'http://localhost:8000/?chapter=0&play=1&fresh=1' });
  for (let i = 0; i < 300; i++) { await sleep(1000); if (await evaljs('!!window.__ready')) break; }
  await sleep(1500);
  for (const [cid, idleKey, dist] of [['wargrave', 'dozing', 2.0], ['blore', 'idle11', 2.3]]) {
    // 摆拍站姿：冻结日程 + 清坐姿 + 等待 update 切到 idle clip（swiftshader 帧慢，轮询而非定拍）
    await evaljs(`(() => {
      const n = NPCAPI.get('${cid}');
      n.prologueLock = true;
      n.walking = false;
      n._oncePlaying = null;
      n.setAction('idle');
      n.group.position.y = n.pos.y;
    })()`);
    for (let i = 0; i < 80; i++) { await sleep(250); if ((await evaljs(`NPCAPI.get('${cid}')?.rigged?.currentName`)) === idleKey) break; }
    console.log(cid, '落定 clip:', await evaljs(`NPCAPI.get('${cid}')?.rigged?.currentName`));
    await evaljs(`(() => {
      const n = NPCAPI.get('${cid}');
      const a = n.yaw;
      DebugAPI.teleport(n.pos.x - Math.sin(a) * ${dist}, n.pos.z - Math.cos(a) * ${dist}, a + Math.PI, n.pos.y);
    })()`);
    await sleep(300);
    await evaljs(`DialogueAPI.start('${cid}')`);
    for (let i = 0; i < 60; i++) { await sleep(250); if (await evaljs(`NPCAPI.get('${cid}')?._oncePlaying`)) break; }
    console.log(cid, 'once:', await evaljs(`NPCAPI.get('${cid}')?._oncePlaying`), 'clip:', await evaljs(`NPCAPI.get('${cid}')?.rigged?.currentName`));
    await sleep(900);   // 手势进入中段
    await shot(`motion_${cid}_gesture.png`);
    await evaljs('DialogueAPI.close()');
    await evaljs(`NPCAPI.get('${cid}').prologueLock = false`);
  }
  ws.close(); edge.kill(); process.exit(0);
}
main().catch((e) => { console.error(e); edge.kill(); process.exit(1); });
