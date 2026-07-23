// scanCastle.js —— 城堡外观（castle.glb 摄影测量件）
// 模式（回退开关）：
//   'whole' 整体 castle.glb 作城堡外观（2026-07 用户最终裁定；v3 2.0 倍内院方案 + 塔基 CUT）
//   'graft' 立面移植门面目 + Kenney 侧背（前方案，代码保留可回退）
//   'off'   纯 Kenney 外壳
import * as THREE from '../vendor/three.module.js';
import { GLTFLoader } from '../vendor/GLTFLoader.js';

const MODE = 'whole';
const URL = 'assets/models/scene/castle.glb';
const KEEP_MESHES = new Set([6, 7]); // 建筑主体（主堡+塔楼+门楼）；其余为树/地面扫描噪声

// ---------- whole：2.0 倍内院对齐（历史 v3 参数；门脸 z≈13、门中轴对 x=0） ----------
const S = 2.0;
const RY = -Math.PI / 2;                          // 门楼（raw +x 面）→ +Z 码头方向
const POS = { x: 3.0, y: -2.55, z: -3.0 };   // y: -2.2 → -2.55 整体下沉 0.35（基座贴合地形，配合 island.js 垫丘裙带）
// 塔基切除：门楼塔基插入三层书房东墙（v3 唯一遗留问题）——w1 各内部机位复查未见复现，留空备用。
// 启用框组（raw 坐标，三角心判定）：
//   [0] 悬顶碎渣云（raw y>26 ≈ 游戏 y>50，直方图实证塔楼本体 y<50、其上纯碎渣）
//   [1] 东北撕裂带：游戏 x[12,34] y[-2,49] z[-53,-20.5]（用户红框：右侧撕裂底边+悬冠；全区无底缘站立结构，全高切除）
//   [2] 东北内角浮块：游戏 x[17.3,23] y[4.2,9] z[-26,-13.5]
//   [3] 北侧浮块 (3,-35)：游戏 x[1,6] y[3,9] z[-37,-33]
//   [4] 北缘浮块 (-16,-51)：游戏 x[-18,-14] y[2,9] z[-53,-48]
//   [5] 东北内角浮块列：游戏 x[17,19.5] y[4,9] z[-28,-3]（[2] 框 z/x 边界外逃逸列）
//   [6] 北后废墟浮块：游戏 x[10,17.5] y[4.5,20] z[-30,-14]（无底缘；z1 保北面墙 z≈-13.5）
const CUTS = [
  { x0: -70, x1: 40, y0: 26, y1: 40, z0: -40, z1: 75 },
  { x0: -25, x1: -8.75, y0: 0.28, y1: 25.7, z0: -15.5, z1: -4.5 },
  { x0: -11.5, x1: -5.25, y0: 3.38, y1: 5.78, z0: -10, z1: -7.15 },
  { x0: -17, x1: -15, y0: 2.78, y1: 5.78, z0: -1.5, z1: 1 },
  { x0: -25, x1: -22.5, y0: 2.28, y1: 5.78, z0: 8.5, z1: 10.5 },
  { x0: -12.5, x1: 0, y0: 3.28, y1: 5.78, z0: -8.25, z1: -7 },
  { x0: -13.5, x1: -5.5, y0: 3.53, y1: 11.28, z0: -7.25, z1: -3.5 },
];

// ---------- graft：立面移植参数（回退保留） ----------
const G_BOX = { x0: 3.0, x1: 8.2, y0: -1, y1: 32, z0: -2.4, z1: 5.2 };
const G_CUT2 = { x0: 2.6, x1: 6.8, y0: 7.2, y1: 14.5, z0: -2.6, z1: 1.6 };
const G_CUT3 = { x0: 2.6, x1: 4.6, y0: 5.0, y1: 7.9, z0: -2.5, z1: 0.3 };
const G_RY = -Math.PI / 2;
const G_POS = { x: 1.5, y: 0.3, z: 4.9 };

function mergeGeos(list) {
  let v = 0, ic = 0;
  for (const g of list) { v += g.attributes.position.count; ic += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(v * 3), nor = new Float32Array(v * 3), uv = new Float32Array(v * 2);
  const idx = v > 65000 ? new Uint32Array(ic) : new Uint16Array(ic);
  let vo = 0, io = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, vo * 3);
    nor.set(g.attributes.normal.array, vo * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, vo * 2);
    if (g.index) { const ia = g.index.array; for (let i = 0; i < ia.length; i++) idx[io + i] = ia[i] + vo; io += ia.length; }
    else { for (let i = 0; i < g.attributes.position.count; i++) idx[io + i] = vo + i; io += g.attributes.position.count; }
    vo += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

async function loadCastle() {
  const gltf = await new GLTFLoader().loadAsync(URL);
  return gltf;
}

// ================= whole：整体 castle.glb =================
async function buildWhole(scene, collision) {
  let gltf;
  try { gltf = await loadCastle(); } catch (e) {
    console.warn('[scanCastle] 加载失败，回退 Kenney 外壳：', e);
    return null;
  }
  const model = gltf.scene;
  model.updateMatrixWorld(true);
  // 剔除树木/地面网格 + CUT 框组（三角心框选） + 整体压暗调铅灰
  const vv = new THREE.Vector3();
  let mi = 0; const cutTris = CUTS.map(() => 0);
  const mats = new Set();
  model.traverse((o) => {
    if (!o.isMesh) return;
    if (!KEEP_MESHES.has(mi++)) { o.visible = false; return; }
    {
      const pos = o.geometry.attributes.position;
      const idx = o.geometry.index.array;
      const keepIdx = [];
      for (let i = 0; i < idx.length; i += 3) {
        let cx = 0, cy = 0, cz = 0;
        for (let k = 0; k < 3; k++) {
          vv.fromBufferAttribute(pos, idx[i + k]).applyMatrix4(o.matrixWorld);
          cx += vv.x / 3; cy += vv.y / 3; cz += vv.z / 3;
        }
        const ci = CUTS.findIndex((c) => cx > c.x0 && cx < c.x1 && cy > c.y0 && cy < c.y1 && cz > c.z0 && cz < c.z1);
        if (ci >= 0) { cutTris[ci]++; continue; }
        keepIdx.push(idx[i], idx[i + 1], idx[i + 2]);
      }
      if (keepIdx.length !== idx.length) o.geometry.setIndex(keepIdx);
    }
    o.castShadow = true;
    o.receiveShadow = true;
    mats.add(o.material);
  });
  if (cutTris.some((n) => n)) console.log('[scanCastle] CUT 框组切除 tris:', cutTris);
  for (const m of mats) {
    if (m.color) m.color.setRGB(0.60, 0.64, 0.70, THREE.SRGBColorSpace); // 压暗 + 铅灰蓝调
    if (m.roughness !== undefined) m.roughness = Math.min(1, (m.roughness ?? 1) * 1.05);
  }
  model.scale.set(S, S, S);
  model.rotation.y = RY;
  const group = new THREE.Group();
  group.name = 'scanCastle';
  group.position.set(POS.x, POS.y, POS.z);
  group.add(model);

  // ---------- 窗火（贴扫描立面，接口同 Kenney：mats + lights 供 weather 联动） ----------
  // raw 坐标 → 游戏坐标：gx = -z*S + POS.x；gy = y*S + POS.y；gz = x*S + POS.z
  const G = (x, y, z) => [-z * S + POS.x, y * S + POS.y, x * S + POS.z];
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xd98e4a, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
  const glowGeos = [];
  const WIN = [
    [8.2, 5.5, 0.3, 0.9, 1.3, 'px'], [8.2, 5.5, 2.7, 0.9, 1.3, 'px'],   // 门楼二层
    [8.2, 9.5, 1.5, 0.8, 1.1, 'px'],                                     // 门楼三层
    [-3.0, 8.0, 16.9, 1.0, 1.6, 'pz'], [-8.0, 10.5, 16.9, 1.0, 1.6, 'pz'],// 主堡东南面
    [-13.0, 9.0, 16.9, 0.9, 1.4, 'pz'],
    [1.0, 7.0, 16.9, 0.9, 1.3, 'pz'],
    [-5.0, 14.0, 16.9, 0.8, 1.2, 'pz'],                                  // 主堡高窗
  ];
  for (const [x, y, z, w, h, f] of WIN) {
    const [gx, gy, gz] = G(x, y, z);
    const g = new THREE.PlaneGeometry(w, h);
    if (f === 'px') g.rotateY(Math.PI / 2); // 面向 +z（门楼面，旋转后朝码头）
    g.translate(gx, gy, gz);
    glowGeos.push(g);
  }
  const glowMesh = new THREE.Mesh(mergeGeos(glowGeos), glowMat);
  glowMesh.renderOrder = 1;
  group.add(glowMesh);
  const pts = [];
  for (const [x, y, z] of WIN) { const [gx, gy, gz] = G(x, y, z); pts.push(gx, gy, gz); }
  pts.push(0, 4.0, 13.4, -3.2, 4.2, 13.2, 3.2, 4.2, 13.2); // 门口 + 灯笼
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
  const glowPtsMat = new THREE.PointsMaterial({
    color: 0xffb35c, size: 2.1, transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  });
  const glowPts = new THREE.Points(pg, glowPtsMat);
  glowPts.renderOrder = 2;
  group.add(glowPts);
  // 门楼两侧灯笼
  const lanternLights = [];
  const lanternB = [];
  for (const lx of [-3.2, 3.2]) {
    const g = new THREE.BoxGeometry(0.16, 0.24, 0.16);
    g.translate(lx, 4.15, 13.2);
    lanternB.push(g);
    const L = new THREE.PointLight(0xd98e4a, 3, 7, 1.8);
    L.position.set(lx, 4.2, 13.2);
    L.userData.base = 3;
    lanternLights.push(L);
    group.add(L);
  }
  group.add(new THREE.Mesh(mergeGeos(lanternB), new THREE.MeshBasicMaterial({ color: 0xffb35c })));

  // ---------- 内院外墙碰撞（视觉翼墙近似圈；城门洞可通行，北面西半开放通悬崖动线） ----------
  {
    const W = (x0, z0, x1, z1) => collision.addBox(x0, -0.5, z0, x1, 12, z1);
    W(-20, 12.9, -1.8, 13.5);   // 南墙西段
    W(1.8, 12.9, 20, 13.5);     // 南墙东段（x ±1.8 城门洞）
    W(19.7, -13.5, 20.3, 13.5); // 东墙
    W(-20.3, -13.5, -19.7, 13.5); // 西墙
    W(4, -13.6, 20, -13.0);     // 北墙东半（x<4 开放：别墅→悬崖小径动线）
  }

  scene.add(group);
  console.log('[scanCastle] 整体扫描城堡就位（whole 模式，mesh 6/7）');
  return { group, whole: true, windowGlow: { mats: [glowMat, glowPtsMat], lights: lanternLights } };
}

// ================= graft：立面移植（回退保留） =================
async function buildGraft(scene, collision) {
  let gltf;
  try { gltf = await loadCastle(); } catch (e) {
    console.warn('[scanCastle] 加载失败，回退纯 Kenney 外壳：', e);
    return null;
  }
  const model = gltf.scene;
  model.updateMatrixWorld(true);
  const vv = new THREE.Vector3();
  let kept = 0, mi = 0;
  const mats = new Set();
  model.traverse((o) => {
    if (!o.isMesh) return;
    const isKeep = KEEP_MESHES.has(mi++);
    if (!isKeep) { o.visible = false; return; }
    const pos = o.geometry.attributes.position;
    const idx = o.geometry.index.array;
    const keepIdx = [];
    for (let i = 0; i < idx.length; i += 3) {
      let cx = 0, cy = 0, cz = 0;
      for (let k = 0; k < 3; k++) {
        vv.fromBufferAttribute(pos, idx[i + k]).applyMatrix4(o.matrixWorld);
        cx += vv.x / 3; cy += vv.y / 3; cz += vv.z / 3;
      }
      const inBox = cx > G_BOX.x0 && cx < G_BOX.x1 && cy > G_BOX.y0 && cy < G_BOX.y1 && cz > G_BOX.z0 && cz < G_BOX.z1;
      const inCut2 = cx > G_CUT2.x0 && cx < G_CUT2.x1 && cy > G_CUT2.y0 && cy < G_CUT2.y1 && cz > G_CUT2.z0 && cz < G_CUT2.z1;
      const inCut3 = cx > G_CUT3.x0 && cx < G_CUT3.x1 && cy > G_CUT3.y0 && cy < G_CUT3.y1 && cz > G_CUT3.z0 && cz < G_CUT3.z1;
      if (inBox && !inCut2 && !inCut3) { kept++; keepIdx.push(idx[i], idx[i + 1], idx[i + 2]); }
    }
    o.geometry.setIndex(keepIdx);
    o.castShadow = true;
    o.receiveShadow = true;
    mats.add(o.material);
  });
  for (const m of mats) {
    if (m.color) m.color.setRGB(0.60, 0.64, 0.70, THREE.SRGBColorSpace);
    if (m.roughness !== undefined) m.roughness = Math.min(1, (m.roughness ?? 1) * 1.05);
  }
  if (kept < 100) { console.warn('[scanCastle] 立面裁切为空，回退纯 Kenney'); return null; }
  model.scale.setScalar(1.0);
  model.rotation.y = G_RY;
  const group = new THREE.Group();
  group.name = 'scanCastle';
  group.position.set(G_POS.x, G_POS.y, G_POS.z);
  group.add(model);

  const glowMat = new THREE.MeshBasicMaterial({ color: 0xd98e4a, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
  const glowGeos = [];
  const G = (x, y, z) => [-z + G_POS.x, y + G_POS.y, x + G_POS.z];
  const WIN = [
    [8.1, 8.6, 0.4, 0.7, 1.1], [8.1, 8.6, 2.6, 0.7, 1.1],
    [8.1, 11.5, 1.5, 0.6, 1.0],
    [8.1, 6.0, 5.6, 0.8, 1.2],
  ];
  for (const [x, y, z, w, h] of WIN) {
    const [gx, gy, gz] = G(x, y, z);
    const g = new THREE.PlaneGeometry(w, h);
    g.rotateY(Math.PI / 2);
    g.translate(gx, gy, gz);
    glowGeos.push(g);
  }
  const glowMesh = new THREE.Mesh(mergeGeos(glowGeos), glowMat);
  glowMesh.renderOrder = 1;
  scene.add(glowMesh);
  const pts = [];
  for (const [x, y, z] of WIN) { const [gx, gy, gz] = G(x, y, z); pts.push(gx, gy, gz); }
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
  const glowPtsMat = new THREE.PointsMaterial({
    color: 0xffb35c, size: 0.9, transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  });
  const glowPts = new THREE.Points(pg, glowPtsMat);
  glowPts.renderOrder = 2;
  scene.add(glowPts);
  const lanternLights = [];
  const lanternB = [];
  for (const lx of [-1.7, 1.7]) {
    const g = new THREE.BoxGeometry(0.16, 0.24, 0.16);
    g.translate(lx, 3.3, 12.6);
    lanternB.push(g);
    const L = new THREE.PointLight(0xd98e4a, 0.55, 3.0, 1.8);
    L.position.set(lx, 3.35, 12.6);
    L.userData.base = 0.55;
    lanternLights.push(L);
    scene.add(L);
  }
  scene.add(new THREE.Mesh(mergeGeos(lanternB), new THREE.MeshBasicMaterial({ color: 0xffb35c })));

  scene.add(group);
  console.log('[scanCastle] 立面移植就位（graft 回退模式）');
  return { group, windowGlow: { mats: [glowMat, glowPtsMat], lights: lanternLights } };
}

export async function buildScanCastle(scene, collision) {
  if (MODE === 'off') return null;
  if (MODE === 'graft') return buildGraft(scene, collision);
  return buildWhole(scene, collision);
}
