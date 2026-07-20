import { spawn } from 'node:child_process';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9341;
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--enable-unsafe-swiftshader',`--remote-debugging-port=${PORT}`,`--user-data-dir=D:/AI游戏/game-正式版/tools/.chrome-profile-bu`,'--window-size=1280,720','about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let id = 0; const pending = new Map(); let ws;
const send = (m, p = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const evaljs = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }))?.result?.value;
(async () => {
  let wsUrl;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); wsUrl = l.find((t) => t.type === 'page')?.webSocketDebuggerUrl; } catch {}
    if (!wsUrl) await sleep(1000);
  }
  ws = new WebSocket(wsUrl);
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
  await new Promise((r) => { ws.onopen = r; });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: 'http://localhost:8000/?chapter=1&play=1&fresh=1' });
  await sleep(16000);
  const info = await evaljs(`(()=>{const n=NPCAPI.get('brent');const it=n.rigged.items.Chair_Sit_Idle_F;const sh=it.mat.userData.shader;
    if (!sh) return 'no shader';
    const u = sh.uniforms;
    return {
      hasProjMap: !!u.uProjMap,
      texType: u.uProjMap?.value?.isTexture ? 'Texture' : String(u.uProjMap?.value),
      imgW: u.uProjMap?.value?.image?.width ?? null,
      imgOk: !!(u.uProjMap?.value?.image),
      origin: u.uProjOrigin?.value?.toArray?.().map(v=>+v.toFixed(2)) ?? null,
      size: u.uProjSize?.value?.toArray?.().map(v=>+v.toFixed(2)) ?? null,
      backColor: u.uBackColor?.value?.getHexString?.() ?? null,
    };})()`);
  console.log('UNI:', JSON.stringify(info));
  // 染色试验：Chair_Sit 材质设纯红，看模型是否变红
  await evaljs(`(()=>{const n=NPCAPI.get('brent');const m=n.rigged.items.Chair_Sit_Idle_F.mat;m.color.setHex(0xff0000);})()`);
  await sleep(800);
  const { writeFileSync } = await import('node:fs');
  const s2 = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync('docs/screenshots/brent_red.png', Buffer.from(s2.data, 'base64'));
  console.log('SHOT: brent_red.png');
  ws.close(); chrome.kill(); process.exit(0);
})().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
// 追加：染色试验
