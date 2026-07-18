// props.js —— 共享几何工具、材质色板、文字贴图与占位道具
// 色板：铅灰 #6b7280 / 墨绿 #2f4536 / 暗红木 #5a2e2e / 烛光橙 #d98e4a
import * as THREE from '../vendor/three.module.js';

export function lam(color, opts = {}) {
  return new THREE.MeshLambertMaterial({ color, ...opts });
}

export const MAT = {
  plaster:   lam(0x9aa0a6),          // 外墙灰泥（浅铅灰）
  plasterIn: lam(0x8f8779),          // 室内墙面（暖灰）
  trim:      lam(0x6b7280),          // 铅灰装饰线条
  leadDark:  lam(0x4b525b),
  green:     lam(0x2f4536),          // 墨绿（窗框/木作）
  redWood:   lam(0x5a2e2e),          // 暗红木
  redWoodL:  lam(0x6e3a34),
  wood:      lam(0x6b4a35),
  woodDark:  lam(0x453023),
  floorWood: lam(0x4e3226),
  carpet:    lam(0x5a2e2e),
  brass:     lam(0xb08d4a),
  candle:    lam(0xd98e4a),
  marble:    lam(0xe8e6e0),
  clothRed:  lam(0x6e2f2f),
  clothCream:lam(0xcfc6b4),
  tileBlue:  lam(0x9fc3d4),
  glass:     lam(0xaebfca, { transparent: true, opacity: 0.28 }),
  ironDark:  lam(0x363c43),
  fireGlow:  new THREE.MeshBasicMaterial({ color: 0xff9a4a }),
  foam:      lam(0xdfe4e6),
  rock:      lam(0xffffff),          // instanceColor 上色
  trunk:     lam(0x2b2320),
  foliage:   lam(0x22301f),
  bookWhite: lam(0xffffff),          // instanceColor 上色
  paper:     lam(0xd9d2c2),
  porcelain: lam(0xf2efe8),
};

// ---------- 几何合并 ----------
export function mergeGeometries(geos) {
  let vCount = 0, iCount = 0;
  for (const g of geos) {
    vCount += g.attributes.position.count;
    iCount += g.index ? g.index.count : g.attributes.position.count;
  }
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const uv  = new Float32Array(vCount * 2);
  const idx = vCount > 65000 ? new Uint32Array(iCount) : new Uint16Array(iCount);
  let vo = 0, io = 0;
  for (const g of geos) {
    const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
    pos.set(p.array, vo * 3);
    nor.set(n.array, vo * 3);
    if (u) uv.set(u.array, vo * 2);
    if (g.index) {
      const ia = g.index.array;
      for (let i = 0; i < ia.length; i++) idx[io + i] = ia[i] + vo;
      io += ia.length;
    } else {
      for (let i = 0; i < p.count; i++) idx[io + i] = vo + i;
      io += p.count;
    }
    vo += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal',   new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv',       new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

// GeoBatch：收集任意几何体（可加变换矩阵），最后合并成一个 Mesh（1 次 draw call）
export class GeoBatch {
  constructor() { this.geos = []; }
  add(geo, matrix) {
    if (matrix) geo.applyMatrix4(matrix);
    this.geos.push(geo);
    return geo;
  }
  box(w, h, d, x, y, z, ry = 0) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    this.geos.push(g);
    return g;
  }
  mesh(material, { cast = false, receive = true } = {}) {
    const m = new THREE.Mesh(mergeGeometries(this.geos), material);
    m.castShadow = cast;
    m.receiveShadow = receive;
    return m;
  }
}

// ---------- 文字贴图（canvas，中文 serif） ----------
export function textTexture(lines, {
  w = 512, h = 256, bg = '#2e2620', fg = '#e8ddc9', border = '#d98e4a',
  fontMain = 96, fontSub = 44,
} = {}) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const c = cv.getContext('2d');
  c.fillStyle = bg;
  c.fillRect(0, 0, w, h);
  // Deco 双线边框
  c.strokeStyle = border; c.lineWidth = 6;
  c.strokeRect(10, 10, w - 20, h - 20);
  c.lineWidth = 2;
  c.strokeRect(24, 24, w - 48, h - 48);
  c.fillStyle = fg;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  const serif = '"Noto Serif SC","SimSun","STSong",serif';
  if (lines.length === 1) {
    c.font = `${fontMain}px ${serif}`;
    c.fillText(lines[0], w / 2, h / 2);
  } else {
    c.font = `bold ${fontMain}px ${serif}`;
    c.fillText(lines[0], w / 2, h * 0.38);
    c.font = `${fontSub}px ${serif}`;
    c.fillStyle = border;
    c.fillText(lines[1], w / 2, h * 0.72);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 文字牌面（MeshBasic，不受光照，夜里也可读）
export function textPanel(lines, { w = 1.2, h = 0.5, ...opts } = {}) {
  const tex = textTexture(lines, opts);
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide })
  );
  return m;
}

// 室外点位立牌：木柱 + 牌面
export function signPost(lines, plateW = 1.3, plateH = 0.55) {
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.6, 0.12), MAT.woodDark);
  post.position.y = 0.8;
  post.castShadow = true;
  const panel = textPanel(lines, { w: plateW, h: plateH, fontMain: 88, fontSub: 40 });
  panel.position.y = 1.62;
  g.add(post, panel);
  return g;
}

// ---------- 占位道具 ----------
// 壁炉台 10 个瓷人空位（小底座，InstancedMesh）
export function figurineBases() {
  const geo = new THREE.CylinderGeometry(0.075, 0.09, 0.06, 10);
  const im = new THREE.InstancedMesh(geo, MAT.redWood, 10);
  const d = new THREE.Object3D();
  for (let i = 0; i < 10; i++) {
    d.position.set(-1.44 + i * 0.32, 0.03, 0);
    d.updateMatrix();
    im.setMatrixAt(i, d.matrix);
  }
  im.castShadow = true;
  return im;
}

// 留声机（大喇叭）
export function gramophone() {
  const g = new THREE.Group();
  const wood = new GeoBatch();
  wood.box(0.55, 0.28, 0.55, 0, 0.42, 0);          // 机箱
  wood.box(0.5, 0.28, 0.5, 0, 0.14, 0);            // 桌台
  wood.box(0.08, 0.14, 0.08, -0.18, 0.0, -0.18);
  wood.box(0.08, 0.14, 0.08, 0.18, 0.0, -0.18);
  wood.box(0.08, 0.14, 0.08, -0.18, 0.0, 0.18);
  wood.box(0.08, 0.14, 0.08, 0.18, 0.0, 0.18);
  g.add(wood.mesh(MAT.redWood, { cast: true }));
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 20), MAT.ironDark);
  disc.position.set(0, 0.57, 0);
  g.add(disc);
  const horn = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.62, 14, 1, true), MAT.brass);
  horn.material = MAT.brass;
  horn.position.set(0.1, 0.95, -0.1);
  horn.rotation.set(-Math.PI / 2.4, 0, 0.35);
  horn.castShadow = true;
  g.add(horn);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.35, 8), MAT.brass);
  neck.position.set(0.05, 0.72, 0.02);
  neck.rotation.z = 0.4;
  g.add(neck);
  return g;
}

// 大理石雕像（抽象人形）
export function marbleStatue() {
  const g = new THREE.Group();
  const b = new GeoBatch();
  b.box(0.56, 0.9, 0.56, 0, 0.45, 0);              // 基座
  b.box(0.66, 0.08, 0.66, 0, 0.94, 0);
  g.add(b.mesh(MAT.marble, { cast: true }));
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), MAT.marble);
  body.scale.set(0.75, 1.7, 0.6);
  body.position.y = 1.6;
  body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), MAT.marble);
  head.position.y = 2.2;
  g.add(body, head);
  return g;
}

// 维拉窗台：白色大理石熊钟（简单几何拼出熊轮廓 + 钟面）
export function bearClock() {
  const g = new THREE.Group();
  const add = (geo, x, y, z) => {
    const m = new THREE.Mesh(geo, MAT.marble);
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  add(new THREE.CylinderGeometry(0.16, 0.18, 0.05, 12), 0, 0.025, 0); // 底座
  const body = add(new THREE.SphereGeometry(0.14, 10, 8), 0, 0.2, 0); // 身
  body.scale.set(1, 1.15, 0.9);
  add(new THREE.SphereGeometry(0.09, 8, 6), 0, 0.42, 0.01);           // 头
  add(new THREE.SphereGeometry(0.032, 6, 5), -0.06, 0.49, 0.01);      // 耳
  add(new THREE.SphereGeometry(0.032, 6, 5), 0.06, 0.49, 0.01);
  add(new THREE.BoxGeometry(0.05, 0.04, 0.05), 0, 0.4, 0.09);         // 吻部
  // 钟面（抱在怀中）
  const face = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.02, 14), MAT.porcelain);
  face.rotation.x = Math.PI / 2;
  face.position.set(0, 0.24, 0.13);
  g.add(face);
  const handMat = MAT.ironDark;
  const h1 = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.04, 0.004), handMat);
  h1.position.set(0, 0.25, 0.145);
  const h2 = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.006, 0.004), handMat);
  h2.position.set(0.008, 0.24, 0.145);
  g.add(h1, h2);
  return g;
}

// 北岬角望海长椅（面向大海）
export function bench() {
  const g = new THREE.Group();
  const b = new GeoBatch();
  for (let i = 0; i < 3; i++) b.box(1.8, 0.05, 0.14, 0, 0.48, -0.18 + i * 0.17); // 坐板
  b.box(1.8, 0.05, 0.14, 0, 0.78, 0.3);                                          // 靠背上
  b.box(1.8, 0.05, 0.14, 0, 0.62, 0.32);
  b.box(0.1, 0.48, 0.5, -0.75, 0.24, 0.02);                                      // 侧腿
  b.box(0.1, 0.48, 0.5, 0.75, 0.24, 0.02);
  const m = b.mesh(MAT.woodDark, { cast: true });
  g.add(m);
  return g;
}

// 柴堆（instanced 圆木金字塔）
export function woodpile() {
  const log = new THREE.CylinderGeometry(0.09, 0.09, 0.85, 8);
  log.rotateZ(Math.PI / 2);
  const rows = [5, 4, 3, 2];
  const count = rows.reduce((a, b) => a + b, 0);
  const im = new THREE.InstancedMesh(log, MAT.wood, count);
  const d = new THREE.Object3D();
  let k = 0;
  rows.forEach((n, r) => {
    for (let i = 0; i < n; i++) {
      d.position.set((i - (n - 1) / 2) * 0.22, 0.1 + r * 0.17, 0);
      d.rotation.y = (Math.random() - 0.5) * 0.12;
      d.updateMatrix();
      im.setMatrixAt(k++, d.matrix);
    }
  });
  im.castShadow = true;
  return im;
}

// 斧头（插在木桩上）
export function axeInStump() {
  const g = new THREE.Group();
  const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.4, 10), MAT.woodDark);
  stump.position.y = 0.2;
  stump.castShadow = true;
  g.add(stump);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.75, 0.045), MAT.wood);
  handle.position.set(0.05, 0.65, 0);
  handle.rotation.z = -0.5;
  g.add(handle);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.11, 0.03), MAT.ironDark);
  head.position.set(0.21, 0.9, 0);
  head.rotation.z = -0.5;
  g.add(head);
  return g;
}

// 悬崖孤树（低多边形扭曲树干，剪影感）
export function loneTree() {
  const g = new THREE.Group();
  const tb = new GeoBatch();
  // 分段扭曲树干（海风吹向东侧）
  const seg = [
    [0, 0, 0, 0.35, 1.6, 0.1],
    [0.18, 1.5, 0, 0.26, 1.5, 0.32],
    [0.6, 2.8, 0, 0.18, 1.3, 0.5],
  ];
  for (const [x, y, z, r, h, rz] of seg) {
    const c = new THREE.CylinderGeometry(r * 0.7, r, h, 7);
    c.rotateZ(rz);
    c.translate(x, y + h / 2, z);
    tb.add(c);
  }
  // 两根枯枝
  const br1 = new THREE.CylinderGeometry(0.03, 0.06, 1.1, 5);
  br1.rotateZ(1.1); br1.translate(-0.35, 2.3, 0.1);
  tb.add(br1);
  const br2 = new THREE.CylinderGeometry(0.025, 0.05, 0.9, 5);
  br2.rotateZ(-0.9); br2.rotateY(0.6); br2.translate(0.75, 3.4, -0.1);
  tb.add(br2);
  g.add(tb.mesh(MAT.trunk, { cast: true }));
  // 稀疏风剪形树冠（偏东侧）
  const fb = new GeoBatch();
  const clumps = [[1.35, 3.9, 0, 0.85], [0.9, 4.35, 0.25, 0.62], [1.9, 3.5, -0.2, 0.5]];
  for (const [x, y, z, s] of clumps) {
    const i = new THREE.IcosahedronGeometry(s, 0);
    i.scale(1.25, 0.7, 1);
    i.translate(x, y, z);
    fb.add(i);
  }
  g.add(fb.mesh(MAT.foliage, { cast: true }));
  return g;
}

// 沙发扶手椅（大厅/书房用，暗红）
export function armchair(mat = MAT.clothRed) {
  const b = new GeoBatch();
  b.box(0.72, 0.28, 0.66, 0, 0.32, 0);       // 坐垫
  b.box(0.72, 0.62, 0.18, 0, 0.62, -0.32);   // 靠背
  b.box(0.16, 0.3, 0.6, -0.36, 0.52, 0);     // 扶手
  b.box(0.16, 0.3, 0.6, 0.36, 0.52, 0);
  b.box(0.6, 0.1, 0.55, 0, 0.05, 0);         // 底座
  return b.mesh(mat, { cast: true });
}

// 床（木架 + 布面分两个 InstancedMesh，10 间客房共用）
export function bedGeometries() {
  const wood = new GeoBatch();
  wood.box(1.5, 0.22, 2.05, 0, 0.24, 0);         // 床架
  wood.box(1.5, 0.7, 0.08, 0, 0.6, -1.0);        // 床头板
  wood.box(0.08, 0.24, 0.08, -0.68, 0.12, -0.95);
  wood.box(0.08, 0.24, 0.08, 0.68, 0.12, -0.95);
  wood.box(0.08, 0.24, 0.08, -0.68, 0.12, 0.95);
  wood.box(0.08, 0.24, 0.08, 0.68, 0.12, 0.95);
  const cloth = new GeoBatch();
  cloth.box(1.4, 0.16, 1.9, 0, 0.43, 0);         // 床垫
  cloth.box(0.62, 0.1, 0.34, -0.3, 0.55, -0.72); // 枕
  cloth.box(0.62, 0.1, 0.34, 0.3, 0.55, -0.72);
  cloth.box(1.42, 0.05, 1.15, 0, 0.52, 0.35);    // 毯
  return { wood: mergeGeometries(wood.geos), cloth: mergeGeometries(cloth.geos) };
}

// 椅子（餐厅 11 把 + 房间，InstancedMesh）
export function chairGeometry() {
  const b = new GeoBatch();
  b.box(0.44, 0.05, 0.44, 0, 0.46, 0);
  b.box(0.44, 0.55, 0.05, 0, 0.75, -0.2);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]])
    b.box(0.05, 0.46, 0.05, sx * 0.18, 0.23, sz * 0.18);
  return mergeGeometries(b.geos);
}

// 书桌/床头柜
export function deskGeometry() {
  const b = new GeoBatch();
  b.box(1.25, 0.05, 0.65, 0, 0.74, 0);
  b.box(0.06, 0.72, 0.6, -0.58, 0.37, 0);
  b.box(0.06, 0.72, 0.6, 0.58, 0.37, 0);
  b.box(1.1, 0.35, 0.05, 0, 0.5, -0.29);
  b.box(0.4, 0.12, 0.5, 0.3, 0.62, 0);         // 抽屉
  return mergeGeometries(b.geos);
}

export function nightstandGeometry() {
  const b = new GeoBatch();
  b.box(0.45, 0.55, 0.4, 0, 0.275, 0);
  b.box(0.38, 0.1, 0.34, 0, 0.42, 0.02);
  return mergeGeometries(b.geos);
}
