// castle.js —— 城堡外壳：优先扫描级 castle.glb（scanCastle.js），失败回退 Kenney Retro Fantasy Kit（CC0）组装
// Kenney 版只包外立面：四角塔楼 + 石墙五层 + 顶部雉堞 + 南门 gate；内部布局/碰撞布局不变
import * as THREE from '../vendor/three.module.js';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { buildScanCastle } from './scanCastle.js';

export async function buildCastleShell(scene, collision) {
  const scan = await buildScanCastle(scene, collision);   // 立面移植（门楼）；失败为 null
  const kenney = await buildKenneyShell(scene, collision, { skipSouthCenter: !!scan });
  if (!kenney) return scan;                                // Kenney 全灭 → 只留门面（不应发生）
  if (!scan) return kenney;                                // 纯 Kenney
  return {                                                 // 门面 + Kenney 侧背：窗火合并
    windowGlow: {
      mats: [...kenney.windowGlow.mats, ...scan.windowGlow.mats],
      lights: [...kenney.windowGlow.lights, ...scan.windowGlow.lights],
    },
  };
}

const BASE = 'assets/models/castle/';
const FILES = {
  wall: 'wall.glb',
  win: 'wall-fortified-window.glb',
  gate: 'wall-fortified-gate.glb',
  gate2: 'wall-gate.glb',
  towerBase: 'tower-base.glb',
  tower: 'tower.glb',
  towerTop: 'tower-top.glb',
  battle: 'battlement.glb',
  woodPile: 'column-wood.glb',
};

// 把 GLB scene 合并成 { material → geometry }（实例化用）
function mergeByMaterial(scene) {
  const groups = new Map();
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const geos = o.geometry.groups && o.geometry.groups.length
      ? o.geometry.groups.map((g) => {
          const sub = o.geometry.clone();
          sub.clearGroups();
          const idx = o.geometry.index.array.slice(g.start, g.start + g.count);
          sub.setIndex(new THREE.BufferAttribute(idx, 1));
          return { geo: sub, mat: mats[g.materialIndex] || mats[0] };
        })
      : [{ geo: o.geometry.clone(), mat: mats[0] }];
    for (const { geo, mat } of geos) {
      geo.applyMatrix4(o.matrixWorld);
      if (!groups.has(mat)) groups.set(mat, []);
      groups.get(mat).push(geo);
    }
  });
  return groups;
}

function mergeGeos(list) {
  let v = 0, ic = 0;
  for (const g of list) {
    v += g.attributes.position.count;
    ic += g.index ? g.index.count : g.attributes.position.count;
  }
  const pos = new Float32Array(v * 3), nor = new Float32Array(v * 3), uv = new Float32Array(v * 2);
  const idx = v > 65000 ? new Uint32Array(ic) : new Uint16Array(ic);
  let vo = 0, io = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, vo * 3);
    nor.set(g.attributes.normal.array, vo * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, vo * 2);
    if (g.index) {
      const ia = g.index.array;
      for (let i = 0; i < ia.length; i++) idx[io + i] = ia[i] + vo;
      io += ia.length;
    } else {
      for (let i = 0; i < g.attributes.position.count; i++) idx[io + i] = vo + i;
      io += g.attributes.position.count;
    }
    vo += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

export async function buildKenneyShell(scene, collision, opts = {}) {
  const skipSC = !!opts.skipSouthCenter;   // 立面移植模式：南面中央 |x|<6.2 让位给扫描门楼
  const loader = new GLTFLoader();
  const models = {};
  try {
    await Promise.all(Object.entries(FILES).map(async ([k, f]) => {
      models[k] = await loader.loadAsync(BASE + f);
    }));
  } catch (e) {
    console.warn('[castle] GLB 加载失败，保留程序化外墙：', e);
    return false;
  }

  const shell = new THREE.Group();
  const dummy = new THREE.Object3D();
  const S = 2; // 1m 模块 ×2 = 2m
  // 每模型的实例放置表：modelKey → [{x,y,z,ry,scale}]
  const placements = {};
  const put = (key, x, y, z, ry = 0, scale = S) => (placements[key] ||= []).push({ x, y, z, ry, scale });

  // ---------- 主体石墙（5 层 2m 模块，奇偶层错缝 + 变体混拼，包裹 ±12.55 / ±8.55） ----------
  const XO = 12.55, ZO = 8.55;
  const ROWS = [1.8, 3.8, 5.8, 7.8, 9.8];
  const xs = [-11, -9, -7, -5, -3, -1, 1, 3, 5, 7, 9, 11];
  const xsFront = [-11, -9, -7, -5, -3, -2, 2, 3, 5, 7, 9, 11]; // 让出正中 gate 位
  const xsOff = [-10, -8, -6, -4, -2, 0, 2, 4, 6, 8, 10];       // 错缝层（端部由塔楼收边）
  const zs = [-7, -5, -3, -1, 1, 3, 5, 7];
  const zsOff = [-6, -4, -2, 0, 2, 4, 6];
  // 可放窗洞变体的面（混拼打破条纹）
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let ri = 0; ri < ROWS.length; ri++) {
    const y = ROWS[ri];
    const off = ri % 2 === 1;
    // 南面
    const gridS = y === 1.8 ? xsFront : (off ? xsOff : xs);
    for (const x of gridS) {
      if (skipSC && Math.abs(x) < 6.2) continue;         // 中央让位给扫描门楼
      let key = 'wall';
      if (y === 1.8 && (x === -5 || x === 5)) key = 'win';      // 法式落地窗位
      else if (y === 5.8 && (x === -7 || x === -5)) key = 'win'; // 维拉窗台
      else if (rnd() < 0.14) key = 'win';                        // 变体混拼
      put(key, x, y, ZO, 0);
    }
    // 北面（后门位置开口：y=1.8 时中央 2m 不放件）
    const gridN = off ? xsOff : xs;
    for (const x of gridN) {
      if (y === 1.8 && Math.abs(x) <= 1) continue;
      put(rnd() < 0.12 ? 'win' : 'wall', x, y, -ZO, Math.PI);
    }
    // 东/西面
    const gridZ = off ? zsOff : zs;
    for (const z of gridZ) {
      put(rnd() < 0.12 ? 'win' : 'wall', XO, y, z, -Math.PI / 2);
      put(rnd() < 0.12 ? 'win' : 'wall', -XO, y, z, Math.PI / 2);
    }
  }
  // 正南门 fortified gate（×2，门洞居中；立面移植模式下让位）
  if (!skipSC) put('gate', 0, 1.8, ZO, 0);

  // ---------- 四角塔楼（加高至 ~18.4m，外移突出） ----------
  const corners = [
    [XO + 0.65, ZO + 0.65], [-XO - 0.65, ZO + 0.65],
    [XO + 0.65, -ZO - 0.65], [-XO - 0.65, -ZO - 0.65],
  ];
  for (const [tx, tz] of corners) {
    put('towerBase', tx, 1.8, tz);
    for (let ty = 3.8; ty <= 15.8; ty += 2) put('tower', tx, ty, tz);
    put('towerTop', tx, 17.8, tz);
    collision.addBox(tx - 1.1, 1.5, tz - 1.1, tx + 1.1, 19, tz + 1.1);
  }
  // 中央主塔/望楼（北侧，~20m，形成天际线层次；避开后门 x 0）
  const keep = [5.5, -ZO - 0.65];
  put('towerBase', keep[0], 1.8, keep[1]);
  for (let ty = 3.8; ty <= 17.8; ty += 2) put('tower', keep[0], ty, keep[1]);
  put('towerTop', keep[0], 19.8, keep[1]);
  collision.addBox(keep[0] - 1.1, 1.5, keep[1] - 1.1, keep[0] + 1.1, 20.5, keep[1] + 1.1);

  // ---------- 顶部雉堞一圈（贴外墙面，y=11.8） ----------
  const BY = 11.8, BO = 0.6;
  for (const x of xs) {
    if (!(skipSC && Math.abs(x) < 6.2)) put('battle', x, BY, ZO + BO + 1, 0);  // 南（中央让位）
    put('battle', x, BY, -ZO - BO - 1, Math.PI);   // 北
  }
  for (const z of zs) {
    put('battle', XO + BO + 1, BY, z, -Math.PI / 2);
    put('battle', -XO - BO - 1, BY, z, Math.PI / 2);
  }

  // 立面移植接缝盖板（扫描门楼与 Kenney 南墙之间，深色石柱面遮缝）
  if (skipSC) {
    const seamMat = new THREE.MeshLambertMaterial({ color: 0x5f666d });   // 调暗（防 Kenney 门灯洗白盖过门楼）
    for (const [sx0, sx1] of [[5.3, 7.35], [-7.95, -5.9]]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx1 - sx0, 10.0, 0.26), seamMat);
      m.position.set((sx0 + sx1) / 2, 1.8 + 5.0, ZO + 0.02);
      m.castShadow = true;
      m.receiveShadow = true;
      shell.add(m);
    }
  }

  // 正门 gate 门柱碰撞（门洞中央 ≥0.7m 通行）
  collision.addBox(-1.05, 1.8, 8.0, -0.7, 5.0, 9.6);
  collision.addBox(0.7, 1.8, 8.0, 1.05, 5.0, 9.6);

  // ---------- 烛光橙窗火（emissive 面片，随天气预设联动） ----------
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xd98e4a, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
  const glowGeos = [];
  const glowPlane = (w, h, x, y, z, ry = 0) => {
    const g = new THREE.PlaneGeometry(w, h);
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    glowGeos.push(g);
  };
  // 收集所有 win 实例位置 → 发光面片贴墙外面（读作亮窗）
  for (const p of (placements.win || [])) {
    const off = 1.02;
    let gx = p.x, gz = p.z, gry = p.ry;
    if (p.ry === 0) gz = p.z + off;
    else if (Math.abs(p.ry - Math.PI) < 0.01) gz = p.z - off;
    else if (Math.abs(p.ry + Math.PI / 2) < 0.01) gx = p.x + off;
    else gx = p.x - off;
    glowPlane(1.1, 1.5, gx, p.y + 1.1, gz, gry);
  }
  // 正门透光大面片（贴 gate 外面）
  glowPlane(1.5, 2.3, 0, 3.0, ZO + 1.02, 0);
  const glowMesh = new THREE.Mesh(mergeGeos(glowGeos), glowMat);
  glowMesh.renderOrder = 1;
  shell.add(glowMesh);
  // 远读光点层（Additive Points，1 draw call，夜/雨/雾远看情绪关键）
  const pts = [];
  const pushPt = (x, y, z) => pts.push(x, y, z);
  for (const p of (placements.win || [])) {
    const off = 1.3;
    let gx = p.x, gz = p.z;
    if (p.ry === 0) gz = p.z + off;
    else if (Math.abs(p.ry - Math.PI) < 0.01) gz = p.z - off;
    else if (Math.abs(p.ry + Math.PI / 2) < 0.01) gx = p.x + off;
    else gx = p.x - off;
    pushPt(gx, p.y + 1.1, gz);
  }
  pushPt(0, 3.1, ZO + 1.4);          // 正门
  pushPt(-1.45, 3.4, ZO + 1.15);     // 灯笼
  pushPt(1.45, 3.4, ZO + 1.15);
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
  const glowPtsMat = new THREE.PointsMaterial({
    color: 0xffb35c, size: 2.1, transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  });
  const glowPts = new THREE.Points(pg, glowPtsMat);
  glowPts.renderOrder = 2;
  shell.add(glowPts);
  // 大门两侧灯笼（emissive 灯罩 + 小 PointLight，无阴影）
  const lanternLights = [];
  const lanternB = [];
  for (const lx of [-1.45, 1.45]) {
    lanternB.push((() => {
      const g = new THREE.BoxGeometry(0.16, 0.24, 0.16);
      g.translate(lx, 3.35, ZO + 1.05);
      return g;
    })());
    const L = new THREE.PointLight(0xd98e4a, 2.0, 7, 1.8);
    L.position.set(lx, 3.4, ZO + 1.05);
    L.userData.base = 2.0;
    lanternLights.push(L);
    shell.add(L);
  }
  const lanternMesh = new THREE.Mesh(mergeGeos(lanternB), new THREE.MeshBasicMaterial({ color: 0xffb35c }));
  shell.add(lanternMesh);

  // 码头栈道旁素材木桩（前景层次，不挡路）
  put('woodPile', -2.6, -0.6, 96.5, 0, 2.4);
  put('woodPile', 2.7, -0.7, 100.5, 0.4, 2.2);

  // ---------- 生成 InstancedMesh ----------
  for (const [key, list] of Object.entries(placements)) {
    const groups = mergeByMaterial(models[key].scene);
    for (const [mat0, geos] of groups) {
      const geo = mergeGeos(geos);
      const mat = mat0.clone();
      // 石材调铅灰做旧（Kenney 贴图偏亮，按项目色板压暗）
      if (mat.color) mat.color.multiplyScalar(1).setHex(0x8a9096);
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      const jitter = new THREE.Color();
      list.forEach((p, i) => {
        dummy.position.set(p.x, p.y, p.z);
        dummy.rotation.set(0, p.ry, 0);
        dummy.scale.setScalar(p.scale ?? S);
        dummy.updateMatrix();
        im.setMatrixAt(i, dummy.matrix);
        // 每实例明暗抖动，打散堆叠规则感
        const j = 0.88 + ((i * 2654435761) % 1000) / 1000 * 0.2;
        im.setColorAt(i, jitter.setScalar(j));
      });
      im.castShadow = true;
      im.receiveShadow = true;
      shell.add(im);
    }
  }
  scene.add(shell);
  console.log('[castle] 外壳组装完成：', Object.fromEntries(Object.entries(placements).map(([k, v]) => [k, v.length])));
  return { windowGlow: { mats: [glowMat, glowPtsMat], lights: lanternLights } };
}
