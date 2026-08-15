// lombard_final_shots.mjs —— 隆巴德收尾截图：① 指控运镜帧（cineText 定位隆巴德 charge）② ch9 海滩对峙（戒备/中枪倒地）
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { get } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EDGE = process.env.CHROME || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9248;
const edge = spawn(EDGE, ['--headless=new','--disable-gpu','--enable-unsafe-swiftshader',`--remote-debugging-port=${PORT}`,`--user-data-dir=${join(ROOT,'tools/.edge-profile-lom')}`,'--window-size=1280,720','about:blank'], { stdio: 'ignore', cwd: ROOT });
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
  for (let i = 0; i < 300; i++) { await sleep(1000); if (await evaljs('!!(window.NPCAPI && window.PrologueAPI && window.DebugAPI)')) break; }
  await sleep(2000);
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
  // ① 指控运镜帧（隆巴德 charge）
  await boot(0);
  await evaljs('PrologueAPI.gather()');
  for (let i = 0; i < 40; i++) { await sleep(3000); if ((await evaljs('PrologueAPI.state()')) === 'await_sit') break; }
  await evaljs('DebugAPI.teleport(2.2, 6.8, 0, 1.8)');
  await sleep(300);
  await evaljs('PrologueAPI.takeSeat()');
  await sleep(2000);
  const cineText = "document.getElementById('cineText')?.textContent || ''";
  let hit = false;
  for (let i = 0; i < 80 && !hit; i++) {
    const t = await evaljs(cineText);
    if (t && t.includes('隆巴德')) hit = true;
    else { await evaljs('PrologueAPI.skip()'); await sleep(400); }
  }
  console.log('charge 隆巴德', hit ? 'hit' : 'MISS');
  await sleep(1000);   // 运镜途中即拍（charge 帧），避免 hold 结束跳下一charge
  await shot('final_accuse_lombard.png');
  // ② ch9 海滩对峙（26m 距离限制边缘机位）
  await boot(1);
  await evaljs('PrologueAPI.restore(); ChapterAPI.begin(9)');
  await sleep(1500);
  await evaljs('DebugAPI.teleport(70, 50, 1.5708, null)');
  await sleep(800);
  await evaljs('StoryAPI.triggerDeath()');
  await sleep(9000);   // 对峙戒备 + 维拉逼近
  console.log('ch9 lombard clip:', await evaljs('NPCAPI.get("lombard")?.rigged?.currentName'), '| vera clip:', await evaljs('NPCAPI.get("vera")?.rigged?.currentName'));
  await shot('new_lombard_ch9_standoff.png');
  await sleep(12000);  // 枪响 → punch_react → 放倒
  console.log('中枪后 lombard clip:', await evaljs('NPCAPI.get("lombard")?.rigged?.currentName'), 'dead:', await evaljs('NPCAPI.get("lombard")?.dead'));
  await shot('new_lombard_ch9_fallen.png');
  ws.close(); edge.kill(); process.exit(0);
}
main().catch((e) => { console.error(e); edge.kill(); process.exit(1); });
