// scanCastle.js —— castle.glb 立面移植（facade graft）：只取门楼/正立面区段作别墅南立面
// 历史：整体包围三轮失败（见 git 历史），降级为"写实门面 + Kenney 侧背"。
// 裁剪：三角心框选保留 raw x∈[5.5,9.5]（门楼前段 4m 厚）、z∈[-4,8]（12m 宽立面），~5k tris；
// 对齐：rotation.y=-90°（门朝 +Z 码头），原比例 1.0，拱门中心对 x=0，立面脸 z≈10.4（后部没入别墅南墙）。
import * as THREE from '../vendor/three.module.js';
import { GLTFLoader } from '../vendor/GLTFLoader.js';

const URL = 'assets/models/scene/castle.glb';
const KEEP_MESHES = new Set([6, 7]);            // 建筑主体；其余为树/地面
const BOX = { x0: 3.0, x1: 8.2, y0: -1, y1: 32, z0: -2.4, z1: 5.2 }; // 门楼区段（raw：z0 裁左界撕裂边、z1 裁左侧半断面窄塔）
const CUT2 = { x0: 2.6, x1: 6.8, y0: 7.2, y1: 14.5, z0: -2.6, z1: 1.6 }; // 反切：门洞上方垂挂藤蔓/碎布簇（raw；探针实证簇 z -2.3~-0.8）
const CUT3 = { x0: 2.6, x1: 4.6, y0: 5.0, y1: 7.9, z0: -2.5, z1: 0.3 }; // 反切：垂挂簇下段残留（raw；游戏 x1.2~4.0/y5.3~8.2/z7.5~9.5，避开 y<5 门脸结构与中央门窗）
const RY = -Math.PI / 2;
const POS = { x: 1.5, y: 0.3, z: 4.9 };         // 拱门中心 x≈0、门脸 z≈12.9（露台缘）、后部 z≈7.9 没入别墅南墙

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

export async function buildScanCastle(scene, collision) {
  let gltf;
  try {
    gltf = await new GLTFLoader().loadAsync(URL);
  } catch (e) {
    console.warn('[scanCastle] 加载失败，回退纯 Kenney 外壳：', e);
    return null;
  }
  const model = gltf.scene;
  model.updateMatrixWorld(true);
  // 立面区段裁剪（三角心在框内才保留）
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
      const inBox = cx > BOX.x0 && cx < BOX.x1 && cy > BOX.y0 && cy < BOX.y1 && cz > BOX.z0 && cz < BOX.z1;
      const inCut2 = cx > CUT2.x0 && cx < CUT2.x1 && cy > CUT2.y0 && cy < CUT2.y1 && cz > CUT2.z0 && cz < CUT2.z1;
      const inCut3 = cx > CUT3.x0 && cx < CUT3.x1 && cy > CUT3.y0 && cy < CUT3.y1 && cz > CUT3.z0 && cz < CUT3.z1;
      if (inBox && !inCut2 && !inCut3) {
        kept++; keepIdx.push(idx[i], idx[i + 1], idx[i + 2]);
      }
    }
    o.geometry.setIndex(keepIdx);
    o.castShadow = true;
    o.receiveShadow = true;
    mats.add(o.material);
  });
  for (const m of mats) {
    // 烘焙日光压暗（MeshBasicMaterial 不受光照，全靠调色；显式 sRGB 输入，避免线性空间换算变亮）
    if (m.color) m.color.setRGB(0.60, 0.64, 0.70, THREE.SRGBColorSpace);
    if (m.roughness !== undefined) m.roughness = Math.min(1, (m.roughness ?? 1) * 1.05);
  }
  console.log('[scanCastle] 立面移植保留 tris:', kept);
  if (kept < 100) { console.warn('[scanCastle] 立面裁切为空，回退纯 Kenney'); return null; }
  model.scale.setScalar(1.0);
  model.rotation.y = RY;
  const group = new THREE.Group();
  group.name = 'scanCastle';
  group.position.set(POS.x, POS.y, POS.z);
  group.add(model);

  // ---------- 窗火（门楼塔窗 + 拱门灯笼；接口同 Kenney：mats + lights 供 weather 联动） ----------
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xd98e4a, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
  const glowGeos = [];
  // raw 坐标 → 游戏坐标：gx = -z + POS.x；gy = y + POS.y；gz = x + POS.z
  const G = (x, y, z) => [-z + POS.x, y + POS.y, x + POS.z];
  const WIN = [
    [8.1, 8.6, 0.4, 0.7, 1.1], [8.1, 8.6, 2.6, 0.7, 1.1],   // 双塔二层窗
    [8.1, 11.5, 1.5, 0.6, 1.0],                              // 塔顶高窗
    [8.1, 6.0, 5.6, 0.8, 1.2],                               // 右侧墙段窗
  ];
  for (const [x, y, z, w, h] of WIN) {
    const [gx, gy, gz] = G(x, y, z);
    const g = new THREE.PlaneGeometry(w, h);
    g.rotateY(Math.PI / 2); // 面向 +z
    g.translate(gx, gy, gz);
    glowGeos.push(g);
  }
  const glowMesh = new THREE.Mesh(mergeGeos(glowGeos), glowMat);
  glowMesh.renderOrder = 1;
  scene.add(glowMesh);   // 坐标已含 POS（世界坐标），直接挂 scene 防二次偏移
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
  // 拱门两侧灯笼（弱光，贴壁不洗墙）
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

  // 碰撞不变（沿用别墅/门柱 AABB；门洞照常通行）
  scene.add(group);
  console.log('[scanCastle] 立面移植就位');
  return { group, windowGlow: { mats: [glowMat, glowPtsMat], lights: lanternLights } };
}
