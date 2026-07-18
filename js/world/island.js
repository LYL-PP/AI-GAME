// island.js —— 岛屿地形 / 海面 / 礁石 / 码头 / 6 个室外点位
import * as THREE from '../vendor/three.module.js';
import { GeoBatch, MAT, lam, signPost, bench, woodpile, axeInStump, loneTree } from './props.js';
import { getParts, buildProp, decimate, cutGeometryBox } from './sceneProps.js';

const V2 = (x, z) => new THREE.Vector2(x, z);

// 悬崖台地中心（西北）与小径折线
const PLATEAU_C = V2(-42, -42);
const PATH = [V2(0, -14), V2(-14, -20), V2(-6, -30), V2(-24, -36), V2(-36, -43)];
const VILLA_PAD = { x1: -16, z1: -12, x2: 16, z2: 18 }; // 别墅地基整平区
const BEACH_DIR = V2(0.65, 0.76).normalize();            // 东南海滩方向
// 崖后石坡：台地南缘下切至潮间石台（通往崖下礁石滩的可行走坡道，绕开孤树）
const PATH2 = [V2(-50, -38), V2(-58, -46), V2(-65, -56)];

function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// 小径信息：t = 沿路径进度 0..1，d = 到路径的距离
function pathInfo(x, z, pts = PATH) {
  const p = V2(x, z);
  let best = { d: Infinity, t: 0 };
  let total = 0, acc = 0;
  const lens = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const l = pts[i].distanceTo(pts[i + 1]);
    lens.push(l); total += l;
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const ab = V2(b.x - a.x, b.y - a.y);
    const t = Math.max(0, Math.min(1, (p.x - a.x) * ab.x / (lens[i] * lens[i]) + (p.y - a.y) * ab.y / (lens[i] * lens[i])));
    const q = V2(a.x + ab.x * t, a.y + ab.y * t);
    const d = p.distanceTo(q);
    if (d < best.d) best = { d, t: (acc + t * lens[i]) / total };
    acc += lens[i];
  }
  return best;
}

// 地形高度（也是碰撞的地面函数）
export function groundHeight(x, z) {
  const r = Math.hypot(x, z);
  // 基础岛面：中央 ~1.6m，向海缓降至水下
  let h = 1.6 - smoothstep(70, 96, r) * 3.4;
  // 西北悬崖台地（+9.2m）
  const dp = Math.hypot(x - PLATEAU_C.x, z - PLATEAU_C.y);
  const pm = smoothstep(34, 16, dp);
  h += pm * 9.2;
  // 台地外侧（西北向海一侧）陡削成悬崖（仅限西北扇区，避开正北岬角；
  // 削减系数随台地遮罩衰减：台地内部不被削，外缘才陡落）
  const rl = Math.max(r, 1e-4);
  const nw = smoothstep(0.8, 0.95, (x / rl) * -0.707 + (z / rl) * -0.707);
  h -= smoothstep(64, 72, r) * 12 * nw * (1 - pm * 0.999);
  // 东南海滩：缓坡入海
  const bs = smoothstep(0.72, 0.9, (x / rl) * BEACH_DIR.x + (z / rl) * BEACH_DIR.y);
  const beachH = 1.3 - Math.max(0, r - 56) * 0.055;
  h = h * (1 - bs) + Math.min(h, beachH) * bs;
  // 悬崖小径：沿折线切割/填出平滑坡道
  const pi = pathInfo(x, z);
  const rampH = 1.5 + 8.8 * smoothstep(0, 1, pi.t);
  const w = smoothstep(6.5, 2.2, pi.d);
  h = h * (1 - w) + rampH * w;
  // 崖后石坡：台地南缘 → 潮间石台（潮水中礁石滩可抵达）
  const pi2 = pathInfo(x, z, PATH2);
  const rampH2 = 10.4 - 9.85 * smoothstep(0, 1, pi2.t);
  const w2 = smoothstep(4.5, 1.6, pi2.d);
  h = h * (1 - w2) + rampH2 * w2;
  // 潮间石台整平
  const dshelf = Math.hypot(x + 65, z + 56);
  const sh = smoothstep(5.5, 2.5, dshelf);
  h = h * (1 - sh) + 0.6 * sh;
  // 南向小海湾（码头内移用）：椭圆水面切入岛南，水深 ~-1.3m，湾口连外海
  const cove = (x / 10) * (x / 10) + ((z - 56) / 26) * ((z - 56) / 26);
  const cw = smoothstep(1.05, 0.5, cove);
  h = h * (1 - cw) + Math.min(h, -1.3) * cw;
  // 别墅地基整平
  const dx = Math.max(VILLA_PAD.x1 - x, 0, x - VILLA_PAD.x2);
  const dz = Math.max(VILLA_PAD.z1 - z, 0, z - VILLA_PAD.z2);
  const dpv = Math.hypot(dx, dz);
  h = h * smoothstep(1.5, 5, dpv) + 1.5 * (1 - smoothstep(1.5, 5, dpv));
  return h;
}

export function buildIsland(scene, collision, data) {
  const group = new THREE.Group();
  scene.add(group);
  const pois = []; // {id, x, z, r, nameplate, sub, note}

  // ---------- 地形网格（顶点色 + flat shading） ----------
  const SIZE = 240, SEG = 110;
  const tg = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  tg.rotateX(-Math.PI / 2);
  const tp = tg.attributes.position;
  const colors = new Float32Array(tp.count * 3);
  const cGrass = new THREE.Color(0x39523f), cGrass2 = new THREE.Color(0x2f4536);
  const cRock = new THREE.Color(0x6b7280), cRock2 = new THREE.Color(0x565d66);
  const cSand = new THREE.Color(0xb09b6d), cDirt = new THREE.Color(0x6e5a44);
  const tmp = new THREE.Color();
  for (let i = 0; i < tp.count; i++) {
    const x = tp.getX(i), z = tp.getZ(i);
    const h = groundHeight(x, z);
    tp.setY(i, h);
    // 坡度（用于岩/草着色）
    const e = 1.2;
    const gx = (groundHeight(x + e, z) - groundHeight(x - e, z)) / (2 * e);
    const gz = (groundHeight(x, z + e) - groundHeight(x, z - e)) / (2 * e);
    const slope = Math.hypot(gx, gz);
    const r = Math.hypot(x, z);
    const rl = Math.max(r, 1e-4);
    const bs = smoothstep(0.72, 0.9, (x / rl) * BEACH_DIR.x + (z / rl) * BEACH_DIR.y) * smoothstep(52, 62, r);
    const pi = pathInfo(x, z);
    const onPath = smoothstep(3.2, 1.6, pi.d);
    // 基础：草地（双色噪点混合）
    const n = Math.sin(x * 0.35 + z * 0.13) * Math.sin(z * 0.29 - x * 0.11);
    tmp.copy(cGrass).lerp(cGrass2, 0.5 + 0.5 * n);
    // 陡坡与高处 → 岩石
    const rockW = Math.max(smoothstep(0.45, 0.9, slope), smoothstep(7.5, 10, h) * 0.7);
    tmp.lerp(n > 0 ? cRock : cRock2, rockW);
    // 沙滩
    tmp.lerp(cSand, bs * smoothstep(0.9, 0.3, slope));
    // 小径土路
    tmp.lerp(cDirt, onPath * 0.85);
    colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
  }
  tg.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  tg.computeVertexNormals();
  const terrain = new THREE.Mesh(tg, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  terrain.receiveShadow = true;
  group.add(terrain);

  // ---------- 海面（顶点波浪着色器，flat 风格化浪） ----------
  const seaUniforms = {
    uTime: { value: 0 },
    uWaveH: { value: 0.6 },
  };
  const seaMat = new THREE.MeshLambertMaterial({ color: 0x4c5a63, flatShading: true });
  seaMat.onBeforeCompile = (s) => {
    s.uniforms.uTime = seaUniforms.uTime;
    s.uniforms.uWaveH = seaUniforms.uWaveH;
    s.vertexShader = 'uniform float uTime;\nuniform float uWaveH;\n' + s.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       float w1 = sin(position.x * 0.10 + uTime * 1.15);
       float w2 = sin(position.y * 0.13 - uTime * 0.85);
       float w3 = sin((position.x + position.y) * 0.055 + uTime * 0.5);
       transformed.z += uWaveH * (w1 * 0.5 + w2 * 0.35 + w3 * 0.45);`
    );
  };
  const seaGeo = new THREE.PlaneGeometry(900, 900, 96, 96);
  const sea = new THREE.Mesh(seaGeo, seaMat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = 0;
  group.add(sea);

  // ---------- 岸边礁石（instanced；rock2.glb 减面缩放替换，失败回退低面岩） ----------
  const rock2Parts = getParts('rock2');
  let rockGeo = new THREE.IcosahedronGeometry(1, 0);
  if (rock2Parts) {
    rockGeo = rock2Parts[0].geometry;
    decimate(rockGeo, 2);
    rockGeo.scale(0.005, 0.004, 0.005);   // ~2.5×1.3×1.1m 基础块
  }
  const rockCount = 190;
  const rocks = new THREE.InstancedMesh(rockGeo, rock2Parts ? rock2Parts[0].material : MAT.rock, rockCount);
  const dummy = new THREE.Object3D();
  const rc = new THREE.Color();
  let ri = 0;
  const putRock = (x, z, y, s) => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    dummy.scale.set(s * (0.7 + Math.random() * 0.7), s * (0.5 + Math.random() * 0.5), s * (0.7 + Math.random() * 0.7));
    dummy.updateMatrix();
    rocks.setMatrixAt(ri, dummy.matrix);
    const g = 0.34 + Math.random() * 0.14;
    rocks.setColorAt(ri, rc.setRGB(g, g * 1.04, g * 1.12));
    ri++;
  };
  for (let i = 0; i < 130; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 88 + Math.random() * 15;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.abs(x) < 5 && z > 26 && z < 64) continue;  // 小海湾+码头通道留空
    putRock(x, z, -0.6 + Math.random() * 0.9, 0.6 + Math.random() * 1.6);
  }
  for (let i = 0; i < 25; i++) putRock(-2 + Math.random() * 14 - 7, -78 - Math.random() * 12, -0.4 + Math.random() * 0.8, 0.8 + Math.random() * 2.0); // 北岬角
  for (let i = 0; i < 35; i++) { // 悬崖底部礁石
    const x = -52 - Math.random() * 30, z = -52 - Math.random() * 30;
    if (Math.hypot(x, z) > 108) continue;
    putRock(x, z, -0.5 + Math.random() * 1.0, 0.8 + Math.random() * 2.2);
  }
  rocks.count = ri;
  rocks.castShadow = true;
  group.add(rocks);

  // 浪尖白沫（instanced 扁平白块）
  const foamGeo = new THREE.BoxGeometry(1, 0.05, 0.4);
  const foam = new THREE.InstancedMesh(foamGeo, MAT.foam, 70);
  for (let i = 0; i < 70; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 92 + Math.random() * 12;
    dummy.position.set(Math.cos(a) * r, 0.12, Math.sin(a) * r);
    dummy.rotation.set(0, Math.random() * Math.PI, 0);
    dummy.scale.set(0.8 + Math.random() * 1.6, 1, 0.6 + Math.random() * 0.8);
    dummy.updateMatrix();
    foam.setMatrixAt(i, dummy.matrix);
  }
  group.add(foam);

  // ---------- 码头（jetty.glb 木栈道；失败回退程序化板。碰撞平台不变） ----------
  const deckY = 1.25;
  const jettyParts = getParts('jetty');
  if (jettyParts) {
    const j = buildProp(jettyParts, { tint: [0.55, 0.5, 0.45], castShadow: true });
    j.scale.set(0.45, 0.5, 1.06);   // 3.0 宽 × 25m，板面 ≈1.25
    j.position.set(0, 0.02, 46.0);
    group.add(j);
  } else {
    const dock = new GeoBatch();
    for (let z = 33.5; z <= 58; z += 0.62)
      dock.box(3.0, 0.1, 0.5, 0, deckY - 0.05, z);                       // 木板
    dock.box(0.25, 0.22, 24.5, -1.35, deckY - 0.2, 45.8);                // 纵梁
    dock.box(0.25, 0.22, 24.5, 1.35, deckY - 0.2, 45.8);
    for (let z = 35; z <= 57; z += 3.2) {                                // 桩（打入湾水）
      dock.box(0.22, 3.4, 0.22, -1.35, deckY - 1.8, z);
      dock.box(0.22, 3.4, 0.22, 1.35, deckY - 1.8, z);
    }
    dock.box(0.3, 0.55, 0.3, -1.2, deckY + 0.22, 57);                    // 系船柱
    dock.box(0.3, 0.55, 0.3, 1.2, deckY + 0.22, 57);
    const dockMesh = dock.mesh(MAT.woodDark, { cast: true });
    group.add(dockMesh);
  }
  collision.addPlatform(-1.5, 33.2, 1.5, 58.5, deckY);

  // ---------- 草圃（grass.glb 切小块 Instanced 散布路径两侧，不入碰撞、禁挡路） ----------
  const grassParts = getParts('grass');
  if (grassParts) {
    const ggeo = grassParts[0].geometry;
    cutGeometryBox(ggeo, { x0: -750, x1: 750, y0: -1e9, y1: 1e9, z0: -750, z1: 750 });   // 中央 ~1.5m 见方
    decimate(ggeo, 3);
    const gmat = grassParts[0].material.clone();
    gmat.color.setRGB(0.5, 0.55, 0.45, THREE.SRGBColorSpace);
    const G_N = 16;
    const gmesh = new THREE.InstancedMesh(ggeo, gmat, G_N);
    const gd = new THREE.Object3D();
    let gn = 0, gseed = 13;
    const grand = () => { gseed = (gseed * 16807) % 2147483647; return gseed / 2147483647; };
    for (let i = 0; i < G_N; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const gx = side * (2.8 + grand() * 2.0);
      const gz = 14.5 + i * 1.15 + grand() * 0.8;
      gd.position.set(gx, collision.groundAt(gx, gz, 5) - 0.02, gz);
      gd.rotation.set(0, grand() * Math.PI * 2, 0);
      const gs = 1.2 + grand() * 0.9;
      gd.scale.set(gs, gs, gs);
      gd.updateMatrix();
      gmesh.setMatrixAt(gn++, gd.matrix);
    }
    gmesh.count = gn;
    group.add(gmesh);
  }
  collision.addPlatform(-0.8, 32.0, 0.8, 33.3, 0.9);                   // 登栈道台阶
  collision.addPlatform(-0.8, 30.9, 0.8, 32.1, 0.5);
  const stepB = new GeoBatch();
  stepB.box(1.6, 0.42, 1.2, 0, 0.72, 32.6);
  stepB.box(1.6, 0.42, 1.1, 0, 0.3, 31.5);
  group.add(stepB.mesh(MAT.trim, { cast: true }));

  // ---------- 柴棚（别墅西侧：斜顶木棚 + 柴堆 + 斧头） ----------
  const shed = new THREE.Group();
  const shedB = new GeoBatch();
  shedB.box(0.16, 2.4, 0.16, -1.6, 1.2, -1.2);   // 柱
  shedB.box(0.16, 2.4, 0.16, 1.6, 1.2, -1.2);
  shedB.box(0.16, 2.9, 0.16, -1.6, 1.45, 1.2);
  shedB.box(0.16, 2.9, 0.16, 1.6, 1.45, 1.2);
  shedB.box(3.4, 0.08, 2.6, 0, 1.35, -1.25);     // 背板…改用低墙
  const shedWall = new GeoBatch();
  shedWall.box(3.4, 2.2, 0.1, 0, 1.1, 1.28);     // 背墙
  shed.add(shedB.mesh(MAT.woodDark, { cast: true }), shedWall.mesh(MAT.wood, { cast: true }));
  const roof = new THREE.Mesh(new THREE.BoxGeometry(3.9, 0.09, 3.2), MAT.leadDark);
  roof.position.set(0, 2.62, 0);
  roof.rotation.x = 0.18;                        // 斜顶
  roof.castShadow = true;
  shed.add(roof);
  const pile = woodpile();
  pile.position.set(-0.5, 0, 0.5);
  shed.add(pile);
  const axe = axeInStump();
  axe.position.set(1.1, 0, -0.3);
  shed.add(axe);
  const shedX = -20, shedZ = 4, shedY = groundHeight(shedX, shedZ);
  shed.position.set(shedX, shedY, shedZ);
  shed.rotation.y = 0.5;
  group.add(shed);
  collision.addBox(shedX - 1.8, shedY, shedZ - 1.6, shedX + 1.8, shedY + 2.6, shedZ - 0.9); // 柴堆区占位（近似）

  // ---------- 北岬角长椅 ----------
  const benchM = bench();
  const bnX = 0, bnZ = -77;
  benchM.position.set(bnX, groundHeight(bnX, bnZ), bnZ);
  benchM.rotation.y = Math.PI;                    // 面向北（大海）
  group.add(benchM);
  collision.addBox(bnX - 0.95, groundHeight(bnX, bnZ), bnZ - 0.3, bnX + 0.95, groundHeight(bnX, bnZ) + 0.9, bnZ + 0.35);

  // ---------- 孤树（悬崖台地边缘） ----------
  const tree = loneTree();
  const trX = -55, trZ = -50;
  tree.position.set(trX, groundHeight(trX, trZ), trZ);
  group.add(tree);
  collision.addBox(trX - 0.35, groundHeight(trX, trZ), trZ - 0.35, trX + 0.35, groundHeight(trX, trZ) + 3, trZ + 0.35);

  // ---------- 小径石板（instanced 踏步石） ----------
  const stoneGeo = new THREE.BoxGeometry(0.9, 0.07, 0.65);
  const pathLenPts = [];
  for (let i = 0; i < PATH.length - 1; i++) {
    const a = PATH[i], b = PATH[i + 1];
    const n = Math.ceil(a.distanceTo(b) / 1.15);
    for (let j = 0; j < n; j++) {
      const t = j / n;
      pathLenPts.push([a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t]);
    }
  }
  const stones = new THREE.InstancedMesh(stoneGeo, MAT.trim, pathLenPts.length);
  pathLenPts.forEach(([x, z], i) => {
    const off = (i % 2 === 0 ? 0.25 : -0.25);
    dummy.position.set(x + off, groundHeight(x + off, z) + 0.03, z);
    dummy.rotation.set(0, Math.random() * 0.6 - 0.3, 0);
    dummy.scale.setScalar(0.85 + Math.random() * 0.3);
    dummy.updateMatrix();
    stones.setMatrixAt(i, dummy.matrix);
  });
  group.add(stones);

  // ---------- 低矮灌木点缀 ----------
  const bushGeo = new THREE.ConeGeometry(0.7, 0.9, 7);
  const bushes = new THREE.InstancedMesh(bushGeo, MAT.foliage, 26);
  let bi = 0;
  for (let i = 0; i < 60 && bi < 26; i++) {
    const a = Math.random() * Math.PI * 2, r = 25 + Math.random() * 55;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (x > VILLA_PAD.x1 - 3 && x < VILLA_PAD.x2 + 3 && z > VILLA_PAD.z1 - 3 && z < VILLA_PAD.z2 + 3) continue;
    if (groundHeight(x, z) < 0.6) continue;
    dummy.position.set(x, groundHeight(x, z) + 0.35, z);
    dummy.rotation.set(0, Math.random() * 3, (Math.random() - 0.5) * 0.25);
    dummy.scale.setScalar(0.6 + Math.random() * 0.9);
    dummy.updateMatrix();
    bushes.setMatrixAt(bi++, dummy.matrix);
  }
  bushes.count = bi;
  bushes.castShadow = true;
  group.add(bushes);

  // ---------- 6 个室外点位 + 立牌 ----------
  const p = data.places.pois;
  const byId = Object.fromEntries(p.map((q) => [q.id, q]));
  const addPoi = (id, x, z, signDX = 1.8, signDZ = 0.8) => {
    const info = byId[id];
    const y = groundHeight(x, z);
    pois.push({ id, x, z, r: 3.5, nameplate: info.nameplate, sub: info.sub, note: info.note });
    const sign = signPost([info.nameplate, info.sub]);
    sign.position.set(x + signDX, groundHeight(x + signDX, z + signDZ), z + signDZ);
    sign.rotation.y = Math.atan2(-(x + signDX), -(z + signDZ)); // 面向岛心
    group.add(sign);
  };
  addPoi('dock', 0, 46, 2.2, -10.5);
  addPoi('cape_north', 0, -76, 1.6, 1.4);
  addPoi('woodshed', shedX, shedZ, 2.2, -1.8);
  addPoi('beach', 44, 50, -1.8, 1.6);
  addPoi('cliff_path', -14, -20, 1.2, 1.4);
  addPoi('lone_tree', trX, trZ, 1.6, 1.2);

  // ---------- 沿途点缀（湾岸木桩 ×3，不挡路） ----------
  for (const [px, pz] of [[10.8, 34], [11.2, 48], [-10.8, 44]]) {
    const pile = new THREE.Mesh(new THREE.BoxGeometry(0.32, 2.2, 0.32), MAT.woodDark);
    pile.position.set(px, groundHeight(px, pz) + 0.9, pz);
    pile.rotation.y = px * 0.7;
    pile.castShadow = true;
    group.add(pile);
    collision.addBox(px - 0.18, groundHeight(px, pz), pz - 0.18, px + 0.18, groundHeight(px, pz) + 2.2, pz + 0.18);
  }

  return {
    group, pois, groundHeight, seaUniforms, seaMat,
    spawn: { x: 0, z: 48, yaw: 0 },   // 新码头出生（湾中栈道），面朝别墅（-Z）
  };
}
