// lombard_final_shots2.mjs —— 隆巴德收尾补拍（修正版）：
// ① 指控帧：accuseName 元素文本命中"隆巴德"即拍（不再提前 1s 等待导致跳到下一位）
// ② ch9：NavAPI.jump(9) 干净进场 → triggerDeath，轮询 clip 状态取证 + 26m 边界对峙帧 + await 后近景倒地帧
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { get } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EDGE = process.env.CHROME || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9249;
const edge = spawn(EDGE, ['--headless=new','--disable-gpu','--enable-unsafe-swiftshader',`--remote-debugging-port=${PORT}`,`--user-data-dir=${join(ROOT,'tools/.edge-profile-lom2')}`,'--window-size=1280,720','about:blank'], { stdio: 'ignore', cwd: ROOT });
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
async function boot(chapter) {
  await send('Page.navigate', { url: `http://localhost:8000/?chapter=${chapter}&play=1&fresh=1` });
  for (let i = 0; i < 300; i++) { await sleep(1000); if (await evaljs('!!window.__ready')) break; }
  await sleep(1500);
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
  // ① 指控运镜帧（隆巴德 charge；accuseName 命中即拍）
  await boot(0);
  await evaljs('PrologueAPI.gather()');
  for (let i = 0; i < 40; i++) { await sleep(3000); if ((await evaljs('PrologueAPI.state()')) === 'await_sit') break; }
  await evaljs('DebugAPI.teleport(2.2, 6.8, 0, 1.8)');
  await sleep(300);
  await evaljs('PrologueAPI.takeSeat()');
  await sleep(1500);
  const accuseName = "document.getElementById('accuseName')?.textContent || ''";
  let hit = false;
  for (let i = 0; i < 90 && !hit; i++) {
    const t = await evaljs(accuseName);
    if (t && t.includes('隆巴德')) hit = true;
    else { await evaljs('PrologueAPI.skip()'); await sleep(350); }
  }
  console.log('charge 隆巴德', hit ? 'hit' : 'MISS', 'name=', await evaljs(accuseName));
  await sleep(600);   // 立绘淡入 0.28s + 运镜接近落位
  await shot('final_accuse_lombard.png');
  // ② ch9 对峙（jump(9) 干净状态）
  await boot(0);
  await evaljs('SaveAPI.clear()');
  await boot(0);
  await evaljs('NavAPI.jump(9)');
  await sleep(4000);
  console.log('jump9 后 lombard clip:', await evaljs('NPCAPI.get("lombard")?.rigged?.currentName'), 'dead:', await evaljs('NPCAPI.get("lombard")?.dead'));
  await evaljs('DebugAPI.teleport(70, 50, 1.5708, null)');   // lockSpot 26m 边界，朝西望海滩
  await sleep(600);
  await evaljs('StoryAPI.triggerDeath()');
  // 无头 sim 膨胀 ~5x：轮询至戒备建立（parry）与维拉逼近
  for (let i = 0; i < 60; i++) { await sleep(500); if ((await evaljs('NPCAPI.get("lombard")?.rigged?.currentName')) === 'parry') break; }
  for (let i = 0; i < 40; i++) { await sleep(500); const vc = await evaljs('NPCAPI.get("vera")?.rigged?.currentName'); if (vc === 'parry_hold') break; }
  console.log('对峙 clip：lombard=', await evaljs('NPCAPI.get("lombard")?.rigged?.currentName'), 'vera=', await evaljs('NPCAPI.get("vera")?.rigged?.currentName'));
  await shot('new_lombard_ch9_standoff.png');
  // 等事件播完（await，lockSpot 解除），近景拍倒地
  for (let i = 0; i < 120; i++) { await sleep(500); if ((await evaljs('ChapterAPI.state()')) === 'await') break; }
  console.log('事件后 lombard dead:', await evaljs('NPCAPI.get("lombard")?.dead'), 'clip:', await evaljs('NPCAPI.get("lombard")?.rigged?.currentName'));
  await evaljs(`(() => { const n = NPCAPI.get('lombard'); DebugAPI.teleport(n.pos.x + 2.2, n.pos.z + 1.6, 2.2, n.pos.y); })()`);
  await sleep(800);
  await shot('new_lombard_ch9_fallen.png');
  ws.close(); edge.kill(); process.exit(0);
}
main().catch((e) => { console.error(e); edge.kill(); process.exit(1); });
