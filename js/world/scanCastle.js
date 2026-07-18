// scanCastle.js —— 扫描级城堡外观（castle.glb 摄影测量件）
// 只用建筑主体（mesh 6/7：主堡+塔楼+门楼，剔除树木/地面扫描噪声）；
// 门楼朝向 +Z（码头方向），窗火/灯笼接口与 Kenney 外壳一致（weather 联动不变）。
import * as THREE from '../vendor/three.module.js';
import { GLTFLoader } from '../vendor/GLTFLoader.js';

const URL = 'assets/models/scene/castle.glb';
const KEEP_MESHES = new Set([6, 7]); // 建筑主体；其余为树/地面
// —— 降级开关（2026-07 三轮实测结论）——
// 0.8 倍：城翼/扫描地面穿插一层房间与露台；2.0 倍内院：门楼塔基仍插入三层书房东墙。
// 该扫描件为真实比例紧凑型城堡，净内院无法容纳 24×16 别墅，三轮内无可行对齐 → 退回 Kenney 外壳。
// 置 true 可重新启用（窗火/灯笼接口已就绪）。
const ENABLED = false;
const S = 2.0;
const RY = -Math.PI / 2;               // 门楼（raw +x 面）→ +Z
const POS = { x: 3.0, y: -2.2, z: -3.0 }; // 门脸 z≈13、门中轴对 x=0

// 小几何合并（窗火面片用，免引入依赖）
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
  if (!ENABLED) return null; // 降级：退回 Kenney 外壳（见文件头结论）
  let gltf;
  try {
    gltf = await new GLTFLoader().loadAsync(URL);
  } catch (e) {
    console.warn('[scanCastle] 加载失败，回退 Kenney 外壳：', e);
    return null;
  }
  const model = gltf.scene;
  // 剔除树木/地面网格 + 整体压暗调铅灰（摄影测量偏亮）
  let mi = 0;
  const mats = new Set();
  model.traverse((o) => {
    if (!o.isMesh) return;
    if (!KEEP_MESHES.has(mi++)) { o.visible = false; return; }
    o.castShadow = true;
    o.receiveShadow = true;
    mats.add(o.material);
  });
  for (const m of mats) {
    if (m.color) m.color.setRGB(0.60, 0.64, 0.70); // 压暗 + 铅灰蓝调
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
  // 窗火面片（raw 坐标猜想位，截图后校准）：[x, y, z, w, h, face] face: px=门楼面/pz=主堡面
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
  // 远读光点层
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

  // 扫描城堡不加新碰撞（别墅 AABB 不动；外圈路径在凹进立面处允许贴墙通过）
  scene.add(group);
  console.log('[scanCastle] 扫描城堡就位（mesh 6/7，~62k tris）');
  return { group, windowGlow: { mats: [glowMat, glowPtsMat], lights: lanternLights } };
}
