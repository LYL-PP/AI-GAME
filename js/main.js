// main.js —— 渲染器 / 场景 / 主循环 / 数据加载 / 全系统接线（M1+M2）
import * as THREE from './vendor/three.module.js';
import { CollisionWorld } from './collision.js';
import { Player } from './player.js';
import { Weather, PRESETS } from './weather.js';
import { UI } from './ui.js';
import { buildIsland } from './world/island.js';
import { buildVilla } from './world/villa.js';
import { NPCManager } from './characters/npc.js';
import { ScheduleManager } from './characters/schedule.js';
import { DialoguePlayer } from './dialogue/dialogue.js';
import { Prologue } from './story/prologue.js';
import { Save } from './story/save.js';
import { Figurines } from './story/figurines.js';
import { DeathScenes } from './story/deathScenes.js';
import { ClueManager } from './story/clues.js';
import { ChapterManager } from './story/chapterManager.js';
import { Notebook } from './deduction/notebook.js';
import { AccusationSystem, evaluateAccusation } from './deduction/accusation.js';
import { EndingSystem } from './endings/endings.js';
import { AudioEngine } from './audio/audio.js';
import { Emptiness } from './story/emptiness.js';
import { NavPanel } from './ui/navPanel.js';
import { buildCastleShell } from './world/castle.js';
import { DockCutscene } from './story/dockCutscene.js';

const params = new URLSearchParams(location.search);

async function loadData() {
  const files = ['places', 'chapters', 'ui', 'characters', 'schedules', 'dialogue', 'accusation', 'deaths', 'rhyme', 'clueSpots', 'clues', 'endings', 'confession', 'annotations', 'audio'];
  const out = await Promise.all(
    files.map((f) =>
      fetch(`data/${f}.json`, { cache: 'no-cache' }).then((r) => {
        if (!r.ok) throw new Error(f);
        return r.json();
      })
    )
  );
  return {
    places: out[0].places, chapters: out[1].chapters, ui: out[2].ui,
    characters: out[3].characters, schedules: out[4], dialogue: out[5], accusation: out[6],
    deaths: out[7].deaths, rhyme: out[8], clueSpots: out[9].clueSpots || out[9], clues: out[10],
    endings: out[11], confession: out[12], annotations: out[13], audio: out[14],
  };
}

async function boot() {
  // ---------- 渲染器 ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  document.getElementById('app').appendChild(renderer.domElement);

  // ---------- 数据 ----------
  let data;
  try {
    data = await loadData();
  } catch (e) {
    new UI({
      places: { pois: [] },
      chapters: [],
      ui: { controls: {}, system: { gameTitle: '', warning: '' } },
    }).showFetchError();
    return;
  }

  const playMode = params.get('play') === '1';
  const ui = new UI(data, { playMode });
  ui.hideLoading();
  ui.bindLock(renderer.domElement);

  // ---------- 场景 / 相机 / 光照 ----------
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 1000);

  const hemi = new THREE.HemisphereLight(0x9aa3ad, 0x3a453c, 0.75);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xcfd6dd, 0.55);
  sun.position.set(60, 90, 30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -65;
  sun.shadow.camera.right = 65;
  sun.shadow.camera.top = 65;
  sun.shadow.camera.bottom = -65;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 300;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(sun.target);

  // ---------- 世界 ----------
  const collision = new CollisionWorld();
  collision.boundaryRadius = 95;
  // 录制动线道具预载（失败件回退程序化占位；须先于 buildIsland/buildVilla）
  const { preloadSceneProps } = await import('./world/sceneProps.js');
  await preloadSceneProps({
    gramophone: 'assets/models/scene/gramophone.glb',
    figurine: 'assets/models/scene/figurine.glb',
    dining_table: 'assets/models/scene/dining_table.glb',
    dining_chair: { url: 'assets/models/scene/dining_chair.glb', filter: (o, bb) => bb.max.y > 1.0 },   // 只留椅、剔除配套脚凳
    candelabra: 'assets/models/scene/candelabra.glb',
    chandelier: 'assets/models/scene/chandelier.glb',
    rug: 'assets/models/scene/rug.glb',
    sofa: 'assets/models/scene/sofa.glb',
    jetty: 'assets/models/scene/jetty.glb',
    rock1: 'assets/models/scene/rock1.glb',
    rock2: 'assets/models/scene/rock2.glb',
    rock3: 'assets/models/scene/rock3.glb',
    tree: 'assets/models/scene/tree.glb',
    cloud: 'assets/models/scene/cloud.glb',
    boat: 'assets/models/scene/boat.glb',
    grass: 'assets/models/scene/grass.glb',
  });
  const island = buildIsland(scene, collision, data);
  collision.setGroundFunction(island.groundHeight);
  // 扫描大厅：先探载 hall.glb（失败则 villa 按原样构建程序化大厅）
  const { preloadHallScan, buildHallScan } = await import('./world/hallScan.js');
  const hallScanOk = await preloadHallScan();
  const villa = buildVilla(scene, collision, data, { hallScan: hallScanOk });
  const hallScanGroup = hallScanOk ? buildHallScan(scene) : null;

  // 城堡外壳（Kenney CC0；失败兜底保留程序化外墙）
  let castleRefs = null;
  try {
    castleRefs = await buildCastleShell(scene, collision);
  } catch (e) {
    console.warn('[castle] 外壳构建失败，使用程序化外墙', e);
  }

  // ---------- 天气 ----------
  const weather = new Weather(scene, renderer, {
    sun, hemi,
    seaMat: island.seaMat,
    seaUniforms: island.seaUniforms,
    indoor: villa.indoor,
    flames: villa.flames,
    candleFlames: villa.candleFlames,
    windowGlow: castleRefs?.windowGlow,
    clouds: island.clouds,
    boat: island.boat,
  });

  // ---------- 存档 / NPC / 日程 / 对话 / 序章 ----------
  if (params.get('fresh') === '1') localStorage.removeItem('attwn_save');
  const save = new Save();
  const npcManager = await NPCManager.create(scene, data.characters);
  const schedule = new ScheduleManager(scene, collision, npcManager, data.schedules, data.places);
  const portraits = {}, fullPortraits = {}, accuseNames = {};
  for (const c of data.characters) {
    portraits[c.id] = c.portrait?.file;
    fullPortraits[c.id] = c.portrait?.full || c.portrait?.file;
    accuseNames[c.id] = c.fullName || c.name;
  }
  const dialogue = new DialoguePlayer({
    data: data.dialogue,
    save,
    getChapter: () => weather.getChapter(),
    portraits,
    onClose: () => { if (!playMode) renderer.domElement.requestPointerLock(); },
  });
  const prologue = new Prologue({
    scene, camera, player: null, mgr: npcManager, schedule, weather, save,
    acc: data.accusation, ui, dom: renderer.domElement, fullPortraits, accuseNames,
  });

  // ---------- 瓷人 / 死亡现场 / 线索 / 章节 ----------
  const figurines = new Figurines({
    scene, camera, player: null, save, ui, rhyme: data.rhyme, uiData: data.ui, weather,
    annotations: data.annotations,
  });
  figurines.setCount(save.data.figurines ?? 10);
  const deathScenes = new DeathScenes({ scene, collision, mgr: npcManager, schedule });
  const clues = new ClueManager({
    scene, save, ui, spots: data.clueSpots, cluesData: data.clues,
    schedule, getChapter: () => weather.getChapter(),
  });

  const setChapter = (n) => {
    weather.setChapter(n);
    ui.showChapter(n);
    schedule.applyChapter(n);
    save.setChapter(n);
    audio.chapterChanged(n);
    emptiness.onChapterChanged(n);
    if (n > 0) prologue.skipAll();
  };
  const chapterManager = new ChapterManager({
    scene, camera, player: null, mgr: npcManager, schedule, weather, save, ui,
    data: { deaths: data.deaths, uiData: data.ui, places: data.places, chapters: data.chapters },
    figurines, deathScenes, clues, setChapter,
  });

  // ---------- 推理（笔记本 + 指认） ----------
  const accusation = new AccusationSystem(save, ui, data.ui);
  const notebook = new Notebook({
    save, ui, accusation,
    data: { ui: data.ui, clues: data.clues, characters: data.characters, rhyme: data.rhyme, dialogue: data.dialogue },
    getChapter: () => weather.getChapter(),
    onClose: () => { if (!playMode) renderer.domElement.requestPointerLock(); },
  });

  // ---------- 音频引擎 / 空掉感 ----------
  const audio = new AudioEngine(data.audio.music);
  const emptiness = new Emptiness({ scene, save, ui, villa, collision, uiData: data.ui });

  // ---------- 结局系统 ----------
  const endings = new EndingSystem({
    scene, camera, player: null, save, ui, weather,
    dialogueData: data.dialogue, endings: data.endings, confession: data.confession,
    annotations: data.annotations, deaths: data.deaths, uiData: data.ui,
    clueSpots: data.clueSpots, collision,
  });
  chapterManager.onFinale = () => endings.enterFinale();
  // 终章码头可选过场（瓶中信 → 书房终局；E 触发/跳过，可重复）
  const dockCS = new DockCutscene({
    player: null, ui, audio,
    getChapter: () => chapterManager.chapter,
    getEndingsActive: () => endings.active,
    data: data.endings.dockCutscene,
  });
  window.__dockCS = dockCS;

  // ---------- 章节跳转（复用现有系统函数） ----------
  function jumpToChapter(n, carryClues = true) {
    if (n === 0) {
      localStorage.removeItem('attwn_save');
      location.reload();
      return;
    }
    // 结局/对话/笔记本状态复位
    endings.reset();
    if (dialogue.isOpen()) dialogue.close();
    if (notebook.isOpen()) notebook.close_();
    // 死亡状态重排：chapter<n（或终章全灭）标记移除，其余复活
    const deadSet = new Set();
    for (const d of data.deaths) {
      const npc = npcManager.get(d.victimId);
      const shouldDead = d.chapter < n || n >= 11;
      if (shouldDead) {
        deadSet.add(d.victimId);
        if (npc) {
          npc.dead = true;
          npc.permaHidden = true;
          npc.group.visible = false;
          npc.prologueLock = true;
        }
        schedule.states.delete(d.victimId);
      } else if (npc && npc.dead) {
        npc.dead = false;
        npc.permaHidden = false;
        npc.group.visible = true;
        npc.prologueLock = false;
        npc.head.rotation.set(0, 0, 0);
        npc.armL.rotation.set(0, 0, 0);
        npc.armR.rotation.set(0, npc.spec.tray ? -1.15 : 0, 0);
        npc.body.rotation.x = npc.spec.stoop ? 0.1 : 0;
        npc.body.position.y = 0;
        npc.body.scale.y = 1;
        npc.group.rotation.x = 0;
        npc.group.rotation.z = 0;
        npc.setAction('idle');
      }
    }
    save.data.deadIds = [...deadSet];
    // 现场道具与章节流程复位
    deathScenes.cleanupAll();
    chapterManager.movers.clear();
    chapterManager.current = null;
    chapterManager.lockSpot = null;
    chapterManager.guideTarget = null;
    // 序章完成 / 瓷人 / 空掉感
    prologue.skipAll();
    save.data.prologueDone = true;
    const fig = n >= 11 ? 0 : 11 - n;
    figurines.setCount(fig);
    save.data.figurines = fig;
    emptiness.onChapterChanged(n);
    // 携带线索
    if (carryClues) {
      for (const s of data.clueSpots.spots) {
        if (s.chapterAvailable <= n) save.addClue(s.clueId);
      }
    }
    // 天气/日程/章节状态/存档
    setChapter(n);
    chapterManager.begin(n);
    player.enabled = true;
    save.write();
  }

  // ---------- 章节导航面板 ----------
  const navPanel = new NavPanel({
    chapters: data.chapters,
    getChapter: () => weather.getChapter(),
    onJump: (n, carry) => jumpToChapter(n, carry),
    onGotoScene: (n) => {
      const s = deathScenes.navSpot(n);
      if (s) player.spawn(s.x, s.z, 0, s.y);
    },
    onOpenBoard: () => { notebook.open_(); notebook.showTab('board'); },
    ui,
  });
  navPanel.onClose = () => { if (!playMode) renderer.domElement.requestPointerLock(); };

  const hasSave = save.data.prologueDone || (save.data.chapter ?? 0) > 0;
  const explicitChapter = params.get('chapter') !== null;
  const startChapter = Math.max(0, Math.min(11, parseInt(params.get('chapter') ?? '0', 10) || 0));
  if (explicitChapter || !hasSave) setChapter(startChapter);

  // ---------- 对外 API ----------
  window.WeatherAPI = {
    setChapter: (n) => setChapter(n),
    getChapter: () => weather.getChapter(),
    presets: PRESETS,
  };
  window.setChapter = (n) => window.WeatherAPI.setChapter(n);
  window.StoryAPI = {
    getChapter: () => weather.getChapter(),
    setChapter: (n) => { setChapter(n); chapterManager.begin(n); },
    triggerDeath: () => chapterManager.triggerDeath(),
    settle: () => chapterManager.settle(),
    state: () => chapterManager.state,
    jumpToChapter: (n, carry = true) => jumpToChapter(n, carry),
  };
  window.NavAPI = {
    open: () => navPanel.open_(),
    close: () => navPanel.close_(),
    toggle: () => navPanel.toggle(),
    isOpen: () => navPanel.isOpen(),
    jump: (n, carry = true) => jumpToChapter(n, carry),
    setCarry: (b) => { navPanel.carryClues = b; document.getElementById('navCarry').checked = b; },
  };
  window.NPCAPI = {
    remove: (id) => npcManager.remove(id),
    get: (id) => npcManager.get(id),
    list: () => [...npcManager.npcs.keys()],
  };
  window.ClueAPI = { has: (id) => save.hasClue(id), add: (id) => save.addClue(id) };
  window.SaveAPI = { data: () => save.data, write: () => save.write(), clear: () => { localStorage.removeItem('attwn_save'); } };
  window.DialogueAPI = { start: (id) => dialogue.start(id), close: () => dialogue.close(), isOpen: () => dialogue.isOpen() };
  window.PrologueAPI = {
    state: () => prologue.state,
    camBusy: () => !!prologue.cam,
    camPos: () => { const c = prologue.camera.position; return { x: +c.x.toFixed(2), y: +c.y.toFixed(2), z: +c.z.toFixed(2) }; },
    gather: () => prologue.gather(),
    takeSeat: () => prologue.takeSeat(),
    skip: () => prologue.onE(),
    restore: () => prologue.restore(),
  };
  window.FigurineAPI = {
    count: () => figurines.count(),
    breakNext: (ch) => figurines.settle(ch, () => {}),
    skip: () => figurines.skip(),
  };
  window.ChapterAPI = {
    state: () => chapterManager.state,
    sceneSpot: () => chapterManager.sceneSpot(),
    begin: (n) => chapterManager.begin(n),
    chapter: () => chapterManager.chapter,
  };
  window.__nb = notebook;
  window.AudioAPI = {
    play: (n) => audio.play(n),
    speak: (t) => audio.speak(t),
    settlementRitual: () => audio.settlementRitual(),
    setStorm: (l) => audio.setStorm(l),
    chapterChanged: (n) => audio.chapterChanged(n),
    step: (c) => audio.step(c),
    stemCount: () => audio.stemCount,
    ready: () => audio.ready,
    toggleMute: () => audio.toggleMute(),
  };
  window.EndingAPI = {
    submit: (r) => endings.onAccusation(r),
    giveUp: () => endings.giveUp(),
    enterFinale: () => endings.enterFinale(),
    state: () => endings.state,
    skip: () => endings.onE(),
    debug: () => ({ state: endings.state, endingId: endings.endingId, hiddenOk: endings.hiddenOk, step: endings.hold }),
  };
  window.DeductionAPI = {
    open: () => notebook.open_(),
    close: () => notebook.close_(),
    isOpen: () => notebook.isOpen(),
    link: (c, n) => notebook.link(c, n),
    softMark: (id) => notebook.toggleSoftMark(id),
    accuse: (a, ev) => accusation.submit(a, ev),
    evaluate: (a, ev) => evaluateAccusation(a, ev, save),
  };
  window.PerfAPI = { info: () => renderer.info };

  // ---------- 玩家 ----------
  const player = new Player(camera, collision, renderer.domElement);
  prologue.player = player;
  figurines.player = player;
  chapterManager.player = player;
  endings.player = player;
  dockCS.player = player;
  player.spawn(island.spawn.x, island.spawn.z, island.spawn.yaw);
  if (save.data.prologueDone && startChapter === 0) prologue.state = 'done';
  if (params.get('pos')) {
    const [px, pz] = params.get('pos').split(',').map(Number);
    if (Number.isFinite(px) && Number.isFinite(pz)) {
      player.spawn(px, pz, Number(params.get('yaw') || 0));
      if (params.get('y')) player.feet.y = Number(params.get('y'));
    }
  }
  if (params.get('pitch')) player.pitch = Number(params.get('pitch'));
  // 调试/自动验收
  window.DebugAPI = {
    teleport: (x, z, yaw = 0, y = null) => player.spawn(x, z, yaw, y),
    getState: () => ({
      x: +player.feet.x.toFixed(2), y: +player.feet.y.toFixed(2), z: +player.feet.z.toFixed(2),
      grounded: player.grounded, ground: +collision.groundAt(player.feet.x, player.feet.z, player.feet.y).toFixed(2),
    }),
    move: (dx, dz) => {
      player.moveAxis(dx, 0);
      player.moveAxis(0, dz);
      const g = collision.groundAt(player.feet.x, player.feet.z, player.feet.y);
      if (player.feet.y - g <= 0.5) { player.feet.y = g; player.vy = 0; player.grounded = true; }
    },
  };
  window.__col = collision;
  window.__scene = scene;
  window.__emp = emptiness;
  window.__endings = endings;

  // ---------- 标题画面（开始/继续） ----------
  const titleEl = document.getElementById('titleScreen');
  const startOverlay = document.getElementById('startOverlay');
  const sys = data.ui.system;
  const setText = (id, v) => { if (v != null) document.getElementById(id).textContent = v; };
  setText('titleName', sys.gameTitleMain);
  setText('titleSub', sys.gameTitleEn);
  setText('titleTag', sys.gameTagline);
  setText('titleAuthor', sys.gameAuthor);
  setText('titleEdition', sys.gameEdition);
  setText('titleWarn', sys.warning);
  const btnStart = document.getElementById('btnStart');
  const btnContinue = document.getElementById('btnContinue');
  btnStart.textContent = data.ui.system.start;
  btnContinue.textContent = data.ui.system.continue;
  function applySave() {
    const d = save.data;
    figurines.setCount(d.figurines ?? 10);
    for (const id of d.deadIds || []) {
      const n = npcManager.get(id);
      if (n) { n.dead = true; n.permaHidden = true; n.group.visible = false; schedule.states.delete(id); }
    }
    if ((d.chapter ?? 0) >= 9) deathScenes.cleanup(6);
    prologue.state = 'done';
    const ch = Math.max(1, d.chapter || 1);
    setChapter(ch);
    chapterManager.begin(ch);
  }
  if (!playMode) {
    startOverlay.style.display = 'none';
    titleEl.style.display = 'flex';
    if (hasSave) btnContinue.style.display = 'inline-block';
    btnStart.onclick = () => {
      if (hasSave) { localStorage.removeItem('attwn_save'); location.reload(); return; }
      titleEl.style.display = 'none';
      startOverlay.style.display = 'flex';
    };
    btnContinue.onclick = () => {
      applySave();
      titleEl.style.display = 'none';
      startOverlay.style.display = 'flex';
    };
  } else if (hasSave && params.get('fresh') !== '1') {
    applySave();
  }

  // ---------- POI（点位 + 房间 + NPC + 线索） ----------
  const pois = island.pois;
  const zones = villa.zones;
  let currentPoi = null;
  let nearNpc = null;
  function updatePoi() {
    if (prologue.cineActive || dialogue.isOpen() || figurines.active || endings.active) {
      if (currentPoi) { currentPoi = null; nearNpc = null; ui.setPoi(null); }
      return;
    }
    const { x, y, z } = player.feet;
    if (dockCS.tryPoi(x, z)) { currentPoi = dockCS.poiRef; nearNpc = null; return; }
    if (clues.near) {
      currentPoi = { id: 'clue_' + clues.near.clueId, nameplate: clues.near.itemDesc, sub: data.ui.controls.interact };
      ui.setPoi(currentPoi);
      nearNpc = null;
      return;
    }
    nearNpc = npcManager.nearest(x, y, z, 2.4);
    if (nearNpc) {
      currentPoi = { id: 'npc_' + nearNpc.id, nameplate: nearNpc.def.name, sub: data.ui.controls.interact, note: nearNpc.def.role };
      ui.setPoi(currentPoi);
      return;
    }
    let found = null;
    for (const zn of zones) {
      const [x1, z1, x2, z2] = zn.rect;
      if (x >= x1 && x <= x2 && z >= z1 && z <= z2 && Math.abs(y - zn.floor) < 1.6) {
        found = zn;
        break;
      }
    }
    if (!found) {
      let best = Infinity;
      for (const p of pois) {
        const d = Math.hypot(x - p.x, z - p.z);
        if (d < p.r && d < best) { best = d; found = p; }
      }
    }
    currentPoi = found;
    ui.setPoi(found);
  }
  document.addEventListener('keydown', (e) => {
    if (e.code === 'KeyQ') {
      e.preventDefault();
      navPanel.toggle();
      if (!navPanel.isOpen() && !playMode) renderer.domElement.requestPointerLock();
      return;
    }
    if (navPanel.isOpen()) {
      if (e.code === 'Escape') {
        navPanel.close_();
        if (!playMode) renderer.domElement.requestPointerLock();
      }
      return;
    }
    if (e.code === 'Tab') {
      e.preventDefault();
      notebook.toggle();
      audio.play('paper');
      if (!notebook.isOpen() && !playMode) renderer.domElement.requestPointerLock();
      return;
    }
    if (notebook.isOpen()) {
      if (e.code === 'Escape') {
        notebook.close_();
        if (!playMode) renderer.domElement.requestPointerLock();
      }
      return;
    }
    if (e.code !== 'KeyE') return;
    if (endings.active) { endings.onE(); return; }
    if (dockCS.playing) { dockCS.onE(); return; }
    if (dialogue.isOpen()) { dialogue.advance(); return; }
    if (prologue.wantsE()) { prologue.onE(); return; }
    if (figurines.active) { figurines.skip(); return; }
    if (chapterManager.onE(player.feet.x, player.feet.y, player.feet.z)) return;
    if (emptiness.onE(player.feet.x, player.feet.y, player.feet.z)) return;
    if (clues.onE()) return;
    if (nearNpc && prologue.state !== 'gather') { dialogue.start(nearNpc.id); return; }
    if (currentPoi?.id === '__dock_view') { dockCS.play(); return; }
    if (currentPoi && !currentPoi.id?.startsWith('npc_')) {
      ui.toast(currentPoi.note || currentPoi.sub || currentPoi.nameplate);
    }
  });

  // 玩家是否在别墅内（室内不显示雨）
  const insideVilla = () => {
    const { x, y, z } = player.feet;
    return x > -12.4 && x < 12.4 && z > -8.4 && z < 8.4 && y > 1.5 && y < 11.2;
  };

  // ---------- 引导箭头 ----------
  const guideEl = document.getElementById('guide');
  const guideArrow = document.getElementById('guideArrow');
  const guideText = document.getElementById('guideText');

  // 章节卡点击打开导航
  document.getElementById('chapterCard').addEventListener('click', () => navPanel.toggle());

  // ---------- 主循环 ----------
  const clock = new THREE.Clock();
  let perfLogged = false;
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    if (endings.active || dialogue.isOpen() || figurines.active || notebook.isOpen() || navPanel.isOpen() || dockCS.playing) player.enabled = false;
    else if (!prologue.cineActive && prologue.state !== 'take_seat') player.enabled = true;
    player.update(dt);
    npcManager.collide(player.feet, 0.35);
    if (!figurines.active && !prologue.cineActive) {
      camera.position.set(player.feet.x, player.feet.y + 1.62, player.feet.z);
      camera.rotation.set(player.pitch, player.yaw, 0);
    }
    // 序章完成后进入第 1 章
    if (!chapterManager.chapterStarted && prologue.state === 'done') {
      chapterManager.begin(Math.max(1, weather.getChapter()));
    }
    chapterManager.update(dt);
    schedule.update(dt);
    prologue.update(dt);
    dialogue.update(dt);
    figurines.update(dt);
    endings.update(dt);
    deathScenes.update(dt, performance.now() / 1000);
    clues.update(dt, player.feet.x, player.feet.y, player.feet.z);
    npcManager.update(dt, performance.now() / 1000, player.feet);
    weather.update(dt, camera.position, insideVilla());
    // 扫描大厅室外剔除（236k 面室内专用，出别墅即隐藏）
    if (hallScanGroup) hallScanGroup.visible = insideVilla();
    // 引导箭头
    const gt = chapterManager.guideTarget;
    if (gt && !prologue.cineActive && !figurines.active) {
      const ang = Math.atan2(-(gt.x - player.feet.x), -(gt.z - player.feet.z));
      guideEl.classList.add('show');
      guideArrow.style.transform = `rotate(${ang - player.yaw}rad)`;
      guideText.textContent = gt.text;
    } else {
      guideEl.classList.remove('show');
    }
    // 脚步声（ch6+ 带回响）
    if (player.enabled && player.grounded) {
      const dx = player.feet.x - (window.__lastPX ?? player.feet.x);
      const dz = player.feet.z - (window.__lastPZ ?? player.feet.z);
      if (Math.hypot(dx, dz) > 0.62) {
        audio.step(weather.getChapter());
        window.__lastPX = player.feet.x;
        window.__lastPZ = player.feet.z;
      }
    }
    updatePoi();
    renderer.render(scene, camera);
    if (!perfLogged && performance.now() > 2500) {
      perfLogged = true;
      const i = renderer.info;
      console.log(`[Perf] triangles=${i.render.triangles} calls=${i.render.calls} geometries=${i.memory.geometries} textures=${i.memory.textures}`);
    }
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

boot();
