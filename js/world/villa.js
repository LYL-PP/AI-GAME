// villa.js —— 三层 Art Deco 别墅：墙体/楼梯/全部房间/家具占位/室内灯光
// 布局：坐北朝南（正门 +Z 面向码头）。一层地面 1.8m，层高 3.2m。
import * as THREE from '../vendor/three.module.js';
import {
  GeoBatch, MAT, textPanel, figurineBases, gramophone, marbleStatue,
  bearClock, armchair, bedGeometries, chairGeometry, deskGeometry, nightstandGeometry,
} from './props.js';
import { getParts, buildProp, decimate, sofaInstance } from './sceneProps.js';

const F1 = 1.8, F2 = 5.0, F3 = 8.2;          // 各层地面标高
const T1 = 4.75, T2 = 7.95, T3 = 11.15;      // 各层墙顶标高
const ROOF = 11.45;
const EXT = 0.35, INT = 0.2;                 // 外墙/内墙厚度

export function buildVilla(scene, collision, data, opts = {}) {
  const g = new THREE.Group();
  scene.add(g);
  const HALL_SCAN = !!opts.hallScan;   // 大厅区域由 hall.glb 扫描件呈现
  const nullBatch = { box: () => {}, add: () => {} }; // 仅走碰撞、不出几何

  // 批次（合并 → 少量 draw call）
  const ext = new GeoBatch();      // 外墙灰泥
  const intw = new GeoBatch();     // 内墙
  const trim = new GeoBatch();     // 铅灰 Deco 线条/窗套/楼梯
  const frame = new GeoBatch();    // 墨绿窗框
  const glass = new GeoBatch();    // 玻璃
  const wood = new GeoBatch();     // 暗红木：地板/楼梯踏步
  const carpet = new GeoBatch();   // 地毯
  const tile = new GeoBatch();     // 浴室浅蓝瓷砖
  const marble = new GeoBatch();   // 大理石构件
  const cloth = new GeoBatch();    // 暗红布料（窗帘）

  const windows = [];   // {axis, at, a, b, y0, y1, out, porthole}

  // ---------- 墙体工具 ----------
  function wallSeg(batch, axis, at, a, b, y0, y1, th, collide = true) {
    if (b - a < 0.01 || y1 - y0 < 0.01) return;
    if (axis === 'x') {
      batch.box(b - a, y1 - y0, th, (a + b) / 2, (y0 + y1) / 2, at);
      if (collide) collision.addBox(a, y0, at - th / 2, b, y1, at + th / 2);
    } else {
      batch.box(th, y1 - y0, b - a, at, (y0 + y1) / 2, (a + b) / 2);
      if (collide) collision.addBox(at - th / 2, y0, a, at + th / 2, y1, b);
    }
  }
  // gaps: {a,b,y0,y1,type:'door'|'win'}；collide=false 时只出几何不加碰撞（遮丑盖板用）
  function wallGaps(batch, axis, at, from, to, y0, y1, th, gaps, out = 1, collide = true) {
    let cur = from;
    const gs = [...gaps].sort((p, q) => p.a - q.a);
    for (const gp of gs) {
      if (gp.a > cur) wallSeg(batch, axis, at, cur, gp.a, y0, y1, th, collide);
      const gy0 = gp.y0 ?? y0, gy1 = gp.y1 ?? y1;
      if (gy0 > y0) wallSeg(batch, axis, at, gp.a, gp.b, y0, gy0, th, collide);
      if (gy1 < y1) wallSeg(batch, axis, at, gp.a, gp.b, gy1, y1, th, collide);
      if (gp.type === 'win') windows.push({ axis, at, a: gp.a, b: gp.b, y0: gy0, y1: gy1, out, porthole: gp.porthole });
      cur = gp.b;
    }
    if (cur < to) wallSeg(batch, axis, at, cur, to, y0, y1, th, collide);
  }
  const win = (a, b, y0, y1) => ({ a, b, y0, y1, type: 'win' });
  const door = (a, b, y1) => ({ a, b, y0: undefined, y1, type: 'door' });

  // ---------- 楼板（视觉板 + 行走平台） ----------
  function slab(batch, x1, z1, x2, z2, yTop, th = 0.25) {
    batch.box(x2 - x1, th, z2 - z1, (x1 + x2) / 2, yTop - th / 2, (z1 + z2) / 2);
    collision.addPlatform(x1, z1, x2, z2, yTop);
  }
  // 一层
  if (HALL_SCAN) {
    // 大厅（-8..8, -2..8）地面由 hall.glb 扫描地板呈现；碰撞平台不变
    collision.addPlatform(-12, -8, 12, 8, F1);
    wood.box(24, 0.25, 5.95, 0, F1 - 0.125, -5.025);        // 后廊/厨房/楼梯间（z -8..-2.05）
    wood.box(3.95, 0.25, 10.05, -10.025, F1 - 0.125, 2.975); // 管家房（x -12..-8.05）
    wood.box(3.95, 0.25, 10.05, 10.025, F1 - 0.125, 2.975);  // 餐厅（x 8.05..12）
  } else {
    slab(wood, -12, -8, 12, 8, F1);
  }
  slab(trim, -10, 8, 10, 13, F1);                       // 露台（石板）
  // 二层
  slab(wood, -8, -8, 12, 8, F2);                        // 走廊+客房
  slab(tile, -12, 1.5, -8, 8, F2);                      // 浴室
  slab(wood, -12, -0.25, -8, 1.9, F2);                  // 楼梯平台
  // 三层
  slab(wood, -8, -8, 12, 8, F3);                        // 书房+储藏室
  slab(wood, -12, -0.25, -8, 1.9, F3);                  // 楼梯平台
  // 屋顶
  ext.box(24.6, 0.3, 16.6, 0, ROOF - 0.15, 0);

  // ---------- 外墙 ----------
  for (const [fy, ty] of [[F1, T1], [F2, T2], [F3, T3]]) {
    const w0 = fy + 0.95, w1 = fy + 2.4;                 // 标准窗洞
    const gapsS = [], gapsN = [], gapsE = [], gapsW = [];
    if (fy === F1) {
      gapsS.push(door(-0.9, 0.9, fy + 2.35));            // 正门
      gapsS.push(door(-5.5, -3.5, fy + 2.3), door(3.5, 5.5, fy + 2.3)); // 法式落地窗
      gapsS.push(win(-10.6, -9.4, w0, w1), win(9.2, 10.8, w0, w1));
      gapsN.push(door(-0.75, 0.75, fy + 2.2));           // 后门（通往悬崖小径）
      gapsN.push(win(-5.6, -4.4, fy + 1.1, fy + 2.3), win(4.4, 5.6, fy + 1.1, fy + 2.3), win(9.4, 10.6, w0, w1));
      gapsE.push(win(-5.6, -4.4, w0, w1), win(4.3, 5.7, w0, w1));
      gapsW.push(win(4.2, 5.3, w0, w1));
    }
    // 每层西墙（楼梯间）一个圆形舷窗
    gapsW.push({ ...win(-3.55, -2.45, fy + 1.15, fy + 2.25), porthole: true });
    if (fy === F2) {
      for (const cx of [-6, -2, 2, 6, 10]) gapsN.push(win(cx - 0.65, cx + 0.65, w0, w1));
      for (const cx of [-6, -2, 2, 6, 10]) gapsS.push(win(cx - 0.65, cx + 0.65, w0, w1));
      gapsS.push(win(-10.5, -9.5, w0, w1));              // 浴室窗
      gapsE.push(win(-5.65, -4.35, w0, w1), win(4.35, 5.65, w0, w1));
      gapsW.push(win(4.25, 5.25, w0, w1));
    } else if (fy === F3) {
      gapsN.push(win(-4.8, -3.2, w0, w1), win(1.2, 2.8, w0, w1));   // 书房北窗
      gapsS.push(win(-4.8, -3.2, w0, w1), win(1.2, 2.8, w0, w1));
      gapsE.push(win(-4.6, -3.4, w0, w1));                          // 储藏室窗
    }
    if (HALL_SCAN && fy === F1) {
      // 扫描大厅：南墙 F1 段（-8..8 大厅面）视觉隐藏（碰撞保留），由 hall.glb 立面 + 遮丑盖板接替
      wallGaps(ext, 'x', 8, -12, -8, fy, ty, EXT, [win(-10.6, -9.4, w0, w1)], 1);
      wallGaps(nullBatch, 'x', 8, -8, 8, fy, ty, EXT, [door(-0.9, 0.9, fy + 2.35), door(-5.5, -3.5, fy + 2.3), door(3.5, 5.5, fy + 2.3)], 1);
      wallGaps(ext, 'x', 8, 8, 12, fy, ty, EXT, [win(9.2, 10.8, w0, w1)], 1);
      // 外侧遮丑盖板（plaster 同色，门洞对齐；遮住扫描件白壳）
      wallGaps(ext, 'x', 7.95, -8, 8, fy, ty, 0.2, [door(-0.9, 0.9, fy + 2.35)], 1, false);
    } else {
      wallGaps(ext, 'x', 8, -12, 12, fy, ty, EXT, gapsS, 1);    // 南
    }
    wallGaps(ext, 'x', -8, -12, 12, fy, ty, EXT, gapsN, -1);  // 北
    wallGaps(ext, 'z', 12, -8, 8, fy, ty, EXT, gapsE, 1);     // 东
    wallGaps(ext, 'z', -12, -8, 8, fy, ty, EXT, gapsW, -1);   // 西
  }
  // 修正：外墙洞口补上「舷窗」方洞不应贯通 —— door 类型已贯通，舷窗洞用 glass 封住即可（视觉）

  // ---------- 一层内墙 ----------
  if (HALL_SCAN) {
    // 大厅四壁视觉隐藏（碰撞保留），由 hall.glb 墙面呈现；邻室侧加深色盖板遮扫描件白壳
    wallGaps(nullBatch, 'x', -2, -8, 8, F1, T1, INT, [door(-2.5, 2.5, F1 + 2.5)]);   // 大厅|后廊
    wallGaps(nullBatch, 'z', -8, -2, 2, F1, T1, INT, [door(1.0, 1.9, F1 + 2.1)]);    // 大厅|楼梯间
    wallGaps(nullBatch, 'z', -8, 2, 8, F1, T1, INT, [door(4.6, 5.6, F1 + 2.1)]);     // 大厅|管家房
    wallGaps(nullBatch, 'z', 8, -2, 8, F1, T1, INT, [door(2.4, 4.9, F1 + 2.5)]);     // 大厅|餐厅
    wallGaps(intw, 'x', -2.35, -8, 8, F1, T1, 0.16, [door(-2.5, 2.5, F1 + 2.5)], 1, false);  // 后廊侧盖板
    wallGaps(intw, 'z', -8.35, -2, 8, F1, T1, 0.16, [door(1.0, 1.9, F1 + 2.1), door(4.6, 5.6, F1 + 2.1)], 1, false); // 楼梯间/管家房侧盖板
    wallGaps(intw, 'z', 8.35, -2, 8, F1, T1, 0.16, [door(2.4, 4.9, F1 + 2.5)], 1, false);    // 餐厅侧盖板
  } else {
    wallGaps(intw, 'x', -2, -8, 8, F1, T1, INT, [door(-2.5, 2.5, F1 + 2.5)]);       // 大厅|后廊
    wallGaps(intw, 'z', -8, -2, 2, F1, T1, INT, [door(1.0, 1.9, F1 + 2.1)]);        // 大厅|楼梯间
    wallGaps(intw, 'z', -8, 2, 8, F1, T1, INT, [door(4.6, 5.6, F1 + 2.1)]);         // 大厅|管家房
    wallGaps(intw, 'z', 8, -2, 8, F1, T1, INT, [door(2.4, 4.9, F1 + 2.5)]);         // 大厅|餐厅
  }
  wallGaps(intw, 'z', 8, -8, -2, F1, T1, INT, [door(-5.4, -4.4, F1 + 2.1)]);      // 后廊|厨房
  wallSeg(intw, 'x', -2, 8, 12, F1, T1, INT);                                     // 餐厅|厨房
  wallSeg(intw, 'x', 2, -12, -8, F1, T1, INT);                                    // 管家房|楼梯间
  wallSeg(intw, 'z', -8, -8, -2, F1, T1, INT);                                    // 后廊|楼梯间

  // ---------- 二层内墙 ----------
  const roomXs = [-8, -4, 0, 4, 8, 12];
  const northDoors = [-6, -2, 2, 6, 10].map((cx) => door(cx - 0.5, cx + 0.5, F2 + 2.1));
  const southDoors = northDoors.map((d) => ({ ...d }));
  wallGaps(intw, 'x', -1.5, -8, 12, F2, T2, INT, northDoors);                     // 北排房门
  wallGaps(intw, 'x', 1.5, -8, 12, F2, T2, INT, southDoors);                      // 南排房门
  wallGaps(intw, 'x', 1.5, -12, -8, F2, T2, INT, [door(-10.4, -9.6, F2 + 2.1)]);  // 浴室门
  for (let i = 1; i < 5; i++) {
    wallSeg(intw, 'z', roomXs[i], -8, -1.5, F2, T2, INT);                         // 北排隔墙
    wallSeg(intw, 'z', roomXs[i], 1.5, 8, F2, T2, INT);                           // 南排隔墙
  }
  wallSeg(intw, 'z', -8, -8, -1.5, F2, T2, INT);                                  // 楼梯间|北客房
  wallSeg(intw, 'z', -8, 1.5, 8, F2, T2, INT);                                    // 楼梯间|浴室
  wallSeg(intw, 'z', -8, -1.5, -0.25, F2, F2 + 1.0, 0.12);                        // 楼梯井护栏

  // ---------- 三层内墙 ----------
  wallGaps(intw, 'z', -8, -8, 8, F3, T3, INT, [door(0.0, 1.0, F3 + 2.1)]);        // 楼梯间|书房
  wallGaps(intw, 'z', 8, -8, 8, F3, T3, INT, [door(0.0, 1.0, F3 + 2.1)]);         // 书房|储藏室

  // ---------- 楼梯（L1→L2→L3，双跑折返） ----------
  const RISE = 0.2, TREAD = 0.3;
  function flight(x1, x2, zStart, dirZ, steps, yStart, stepped, skipRail = 2) {
    const m = new THREE.Matrix4();
    for (let i = 0; i < steps; i++) {
      const top = yStart + (i + 1) * RISE;
      const z0 = zStart + i * TREAD * dirZ, z1 = z0 + TREAD * dirZ;
      const zc = (z0 + z1) / 2, zd = Math.abs(z1 - z0);
      // 阶梯体（视觉）。stepped=true 时底板阶梯收薄，保证下面那跑净高
      const bot = stepped ? top - 0.35 : yStart - 0.3;
      wood.box(x2 - x1, top - bot, zd, (x1 + x2) / 2, (top + bot) / 2, zc);
      collision.addPlatform(x1, Math.min(z0, z1), x2, Math.max(z0, z1), top);
      // 中间栏墙（防止从两跑之间跌落；底部若干级留空作入口/转身区）
      if (i >= skipRail) {
        trim.box(0.24, 0.95, zd, -10, top + 0.45, zc);
        collision.addBox(-10.14, top, Math.min(z0, z1), -9.86, top + 0.95, Math.max(z0, z1));
      }
    }
    // 斜梁（视觉）
    const run = steps * TREAD, rise = steps * RISE;
    const len = Math.hypot(run, rise);
    const ang = Math.atan2(rise, run) * dirZ;
    const geo = new THREE.BoxGeometry(x2 - x1, 0.16, len + 0.3);
    m.makeRotationX(ang);
    m.setPosition((x1 + x2) / 2, yStart + rise / 2 - 0.12, zStart + (run / 2 + 0.1) * dirZ);
    trim.add(geo, m);
  }
  function midLanding(yTop) {
    wood.box(3.8, 0.3, 1.8, -10, yTop - 0.15, -1.75);
    collision.addPlatform(-11.9, -2.65, -8.1, -0.85, yTop);
    // 梯下空间封挡（仅一层平台需要：上层平台下方是一层平台，净高 2.95m 无需封）
    if (yTop < 5) collision.addBox(-11.9, yTop - 1.6, -2.65, -8.1, yTop - 0.3, -0.85);
  }
  // L1→L2
  flight(-11.9, -10.1, 1.55, -1, 8, F1);              // 西跑（北上）
  midLanding(F1 + 8 * RISE);                           // 3.4
  flight(-9.9, -8.1, -2.65, 1, 8, F1 + 1.6, false, 4); // 东跑（南下）→ 5.0，底部 4 级留空转身
  collision.addBox(-9.9, 0, -2.65, -8.1, F1 + 1.3, -0.25);   // 东跑梯下封挡
  // L2→L3（stepped=true：阶梯收薄底板，保证下面那跑净高 ~2.85m）
  // 西跑 zStart=1.4：最底一级整体位于二层浴室北墙（z=1.5）以北，踏步不被墙切
  flight(-11.9, -10.1, 1.4, -1, 8, F2, true);
  midLanding(F2 + 8 * RISE);                           // 6.6
  flight(-9.9, -8.1, -2.65, 1, 8, F2 + 1.6, true, 4);  // → 8.2
  // 东跑上方无需封挡：阶梯底板收薄后与下跑净高 ~2.85m
  // 平台边缘护栏（L2/L3，俯瞰楼梯井）
  for (const fy of [F2, F3]) {
    trim.box(2.0, 1.0, 0.1, -10.9, fy + 0.5, -0.28);
    collision.addBox(-11.9, fy, -0.33, -9.9, fy + 1.0, -0.23);
  }
  // 梯下区域由实心阶梯体自然封挡，无需额外封墙

  // ---------- 壁炉 + 烟囱 + 壁炉台（10 瓷人空位） ----------
  // fireplace.glb（大理石壁炉含炉膛火光）：替换下部建筑（柱/楣/裙/烟囱/炉膛/柴火/火苗）；
  // 台面/瓷人/烛台/童谣牌/火光照明全部保留（结算特写锚点 MANTEL 不变）
  const fireParts = getParts('fireplace');
  const useGLBFire = HALL_SCAN && fireParts;
  if (!useGLBFire) {
    trim.box(1.0, 1.35, 0.85, -6.1, F1 + 0.675, -1.55);   // 左柱
    trim.box(1.0, 1.35, 0.85, -3.9, F1 + 0.675, -1.55);   // 右柱
    trim.box(3.2, 0.5, 0.85, -5.0, F1 + 1.6, -1.55);      // 楣
    trim.box(3.2, 0.35, 0.2, -5.0, F1 + 0.175, -1.95);    // 前裙
    ext.box(2.8, ROOF + 0.9 - F1, 1.0, -5.0, (F1 + ROOF + 0.9) / 2, -2.1); // 烟囱体
    trim.box(3.2, 0.25, 1.4, -5.0, ROOF + 1.05, -2.1);    // 烟囱帽
    intw.box(1.8, 1.1, 0.15, -5.0, F1 + 0.55, -1.95);     // 炉膛暗腔
  } else {
    const fp = buildProp(fireParts, { decimateN: 3, tint: [0.82, 0.79, 0.74], castShadow: true });
    fp.scale.set(1.2, 1.45, 1.1);   // 2.4×1.88×0.82，顶平贴台面底（F1+1.88）
    fp.position.set(-5.0, F1 + 0.94, -0.75);   // 扫描北墙面 z≈-0.92（实测），整组前挑
    // 炉膛自发光压曝（保留白石雕细节）
    fp.traverse((o) => {
      if (o.isMesh && o.material?.emissive && (o.material.name || '').toLowerCase().includes('fire')) {
        o.material = o.material.clone();
        o.material.emissiveIntensity = 0.3;
      }
    });
    g.add(fp);
  }
  marble.box(3.5, 0.11, 0.95, -5.0, F1 + 1.9, -0.5);   // 壁炉台面（瓷人列位，前挑）
  collision.addBox(-6.4, F1, -2.6, -3.6, ROOF + 0.9, -1.6);
  const fireGlow = new THREE.MeshBasicMaterial({ color: 0xff8f3f });
  const flames = [];
  for (let i = 0; i < 3 && !useGLBFire; i++) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.13 - i * 0.025, 0.5 - i * 0.08, 6), fireGlow);
    f.position.set(-5.0 + (i - 1) * 0.22, F1 + 0.45, -1.6);
    flames.push(f);
    g.add(f);
  }
  if (!useGLBFire) {
    const logB = new GeoBatch();
    logB.box(0.7, 0.12, 0.12, -5.0, F1 + 0.14, -1.6, 0.3);
    logB.box(0.7, 0.12, 0.12, -5.0, F1 + 0.22, -1.55, -0.25);
    g.add(logB.mesh(MAT.woodDark));
  }
  collision.addBox(-6.6, F1, -1.3, -3.4, F1 + 1.35, -0.2); // 壁炉占位（前挑后）
  if (HALL_SCAN) {
    collision.addBox(-6.6, F1, -1.9, -3.4, F1 + 2.6, -0.8); // 扫描壁炉凸台（挑入大厅部分）
    collision.addBox(-1.0, F1, -1.85, 3.6, F1 + 2.6, -0.2); // 扫描大壁炉凸台（面 z≈-0.23，不入走廊）
  }
  // 10 个瓷人空位底座
  const bases = figurineBases();
  bases.position.set(-5.0, F1 + 1.955, -0.5);
  g.add(bases);
  // 蜡烛（candelabra.glb 烛台 ×3；失败回退程序化烛签）
  const candleFlames = [];
  const candParts = getParts('candelabra');
  for (const [cx, cy, cz] of [[-6.3, F1 + 1.955, -0.5], [-3.7, F1 + 1.955, -0.5], [2.5, F1 + 0.86, 4.0]]) {
    if (candParts) {
      const cd = buildProp(candParts, { tint: [0.6, 0.55, 0.48], castShadow: false });
      cd.scale.setScalar(0.9);   // ~0.34m 高
      cd.position.set(cx, cy, cz);
      g.add(cd);
    } else {
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.22, 8), MAT.porcelain);
      stick.position.set(cx, cy + 0.11, cz);
      g.add(stick);
    }
    const fl = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.09, 6), fireGlow);
    fl.position.set(cx, cy + (candParts ? 0.34 : 0.27), cz);
    candleFlames.push(fl);
    g.add(fl);
  }

  // ---------- 大厅家具 ----------
  // 圆形餐桌（dining_table.glb；失败回退程序化占位）+ 11 把椅子
  const tableParts = getParts('dining_table');
  if (tableParts) {
    const t = buildProp(tableParts, { tint: [0.62, 0.56, 0.5], castShadow: true });
    t.scale.set(1.5, 0.76, 1.5);   // 直径 3.0、桌面高 0.78（与 11 座坐标系/餐盘位一致）
    t.position.set(2.5, F1, 4.0);
    g.add(t);
  } else {
    wood.box(0.24, 0.72, 0.24, 2.5, F1 + 0.36, 4.0);
    marble.box(0.9, 0.06, 0.9, 2.5, F1 + 0.06, 4.0);
    const tableTop = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.07, 24), MAT.redWood);
    tableTop.position.set(2.5, F1 + 0.78, 4.0);
    tableTop.castShadow = true;
    g.add(tableTop);
  }
  collision.addBox(1.0, F1, 2.5, 4.0, F1 + 0.85, 5.5);
  // 留声机（gramophone.glb 扫描件；失败回退程序化）
  const gramParts = getParts('gramophone');
  const gram = gramParts
    ? buildProp(gramParts, { tint: [0.72, 0.66, 0.58], castShadow: true })
    : gramophone();
  gram.position.set(4.6, F1, -0.9);
  gram.rotation.y = -0.7;
  g.add(gram);
  collision.addBox(4.2, F1, -1.3, 5.0, F1 + 0.8, -0.5);
  // 大理石雕像
  const statue = marbleStatue();
  statue.position.set(-6.4, F1, 6.4);
  g.add(statue);
  collision.addBox(-6.8, F1, 6.0, -6.0, F1 + 1.0, 6.8);
  // 扶手椅 ×2（sofa.glb Chesterfield 单人位，替换暗红方块；rotation.y=yaw+π 对齐落座朝向）+ 地毯
  for (const [ax, az, ary] of [[-2.5, 5.5, 2.6], [-2.5, 2.6, 0.5]]) {
    const so = sofaInstance(1.1);
    if (so) {
      so.position.set(ax, F1, az);
      so.rotation.y = ary + Math.PI;
      g.add(so);
    } else {
      const ac = armchair();
      ac.position.set(ax, F1, az);
      ac.rotation.y = ary;
      g.add(ac);
    }
    collision.addBox(ax - 0.55, F1, az - 0.5, ax + 0.55, F1 + 0.95, az + 0.5);
  }
  // 地毯（rug.glb 波斯毯，遮扫描地板孔洞；失败回退程序化毯）
  const rugParts = getParts('rug');
  if (HALL_SCAN && rugParts) {
    const r = buildProp(rugParts, { tint: [0.52, 0.44, 0.44], receiveShadow: true });
    r.scale.set(1.35, 1, 0.65);   // ~4.2×4.2m，圆桌区
    r.position.set(0.5, F1 + 0.002, 4.0);
    g.add(r);
  } else {
    carpet.box(5.5, 0.02, 4.2, 0.5, F1 + 0.012, 4.0);
  }
  // 吊灯（Deco 阶梯铜灯；扫描大厅改用大吊灯罩遮扫描碎裂吊灯簇）
  if (!HALL_SCAN) {
    const chand = new GeoBatch();
    chand.box(0.5, 0.1, 0.5, 0.5, F1 + 2.35, 4.0);
    chand.box(0.34, 0.1, 0.34, 0.5, F1 + 2.24, 4.0);
    chand.box(0.2, 0.1, 0.2, 0.5, F1 + 2.13, 4.0);
    const chandM = chand.mesh(MAT.brass);
    g.add(chandM);
  }
  if (HALL_SCAN) {
    // 大厅顶灯（chandelier.glb，139 mesh 合并减面；净高 ≥2.2m；失败回退深色吊灯罩）
    const chandParts = getParts('chandelier');
    if (chandParts) {
      const ch = buildProp(chandParts, { decimateN: 4, tint: [0.55, 0.5, 0.45], castShadow: false });
      ch.scale.setScalar(0.15);
      ch.position.set(0, F1 + 2.575, 2.9);   // 底沿 4.0m（净高 2.2m）、顶 4.94m < 楼板 5.0
      g.add(ch);
    } else {
      // 大吊灯罩（深色三层盘 + 吊杆，底沿 >1.9m 离地净高）：替代被切除的扫描吊灯
      const fix = new GeoBatch();
      fix.add(new THREE.CylinderGeometry(0.05, 0.05, 0.7, 8), new THREE.Matrix4().setPosition(0, F1 + 2.6, 2.9));
      fix.add(new THREE.CylinderGeometry(0.95, 0.95, 0.09, 16), new THREE.Matrix4().setPosition(0, F1 + 2.25, 2.9));
      fix.add(new THREE.CylinderGeometry(0.68, 0.68, 0.09, 16), new THREE.Matrix4().setPosition(0, F1 + 2.02, 2.9));
      fix.add(new THREE.CylinderGeometry(0.45, 0.45, 0.09, 16), new THREE.Matrix4().setPosition(0, F1 + 1.8, 2.9));
      g.add(fix.mesh(MAT.ironDark));
    }
    // 入口门斗暗廊（遮扫描南墙无门洞：别墅门 → 暗廊 → 大厅）
    intw.box(0.12, 2.7, 1.35, -0.86, F1 + 1.35, 7.4);   // 左帮
    intw.box(0.12, 2.7, 1.35, 0.86, F1 + 1.35, 7.4);    // 右帮
    intw.box(1.85, 0.15, 1.35, 0, F1 + 2.62, 7.4);      // 顶板
    trim.box(0.18, 2.5, 0.18, -0.82, F1 + 1.25, 6.82);  // 门斗框柱
    trim.box(0.18, 2.5, 0.18, 0.82, F1 + 1.25, 6.82);
    trim.box(1.85, 0.22, 0.18, 0, F1 + 2.55, 6.82);     // 门斗楣
    collision.addBox(-0.95, F1, 6.7, -0.78, F1 + 2.7, 8.05);
    collision.addBox(0.78, F1, 6.7, 0.95, F1 + 2.7, 8.05);
  }

  // ---------- 餐厅 ----------
  wood.box(2.6, 0.08, 1.15, 10, F1 + 0.74, 3.0);
  wood.box(0.2, 0.72, 0.9, 9.0, F1 + 0.36, 3.0);
  wood.box(0.2, 0.72, 0.9, 11.0, F1 + 0.36, 3.0);
  collision.addBox(8.7, F1, 2.4, 11.3, F1 + 0.8, 3.6);
  wood.box(1.8, 0.9, 0.5, 11.55, F1 + 0.45, 6.5);       // 餐边柜
  collision.addBox(10.6, F1, 6.2, 12, F1 + 0.95, 6.8);
  carpet.box(3.4, 0.02, 2.4, 10, F1 + 0.012, 3.0);

  // ---------- 厨房 ----------
  tile.box(0.9, 0.9, 0.75, 11.4, F1 + 0.45, -5.0);      // 灶台
  collision.addBox(10.9, F1, -5.4, 11.9, F1 + 0.95, -4.6);
  const burner = new GeoBatch();
  burner.add(new THREE.CylinderGeometry(0.11, 0.11, 0.03, 10), new THREE.Matrix4().setPosition(11.2, F1 + 0.92, -5.15));
  burner.add(new THREE.CylinderGeometry(0.11, 0.11, 0.03, 10), new THREE.Matrix4().setPosition(11.6, F1 + 0.92, -4.85));
  g.add(burner.mesh(MAT.ironDark));
  wood.box(3.4, 0.85, 0.65, 10.1, F1 + 0.425, -7.55);   // 橱柜台
  collision.addBox(8.4, F1, -7.9, 11.8, F1 + 0.9, -7.2);
  wood.box(0.95, 0.05, 0.95, 10, F1 + 0.72, -3.4);      // 小桌
  wood.box(0.08, 0.7, 0.08, 9.6, F1 + 0.35, -3.0);
  wood.box(0.08, 0.7, 0.08, 10.4, F1 + 0.35, -3.8);

  // ---------- 管家房 ----------
  wood.box(2.2, 0.85, 0.6, -10, F1 + 0.425, 7.55);
  collision.addBox(-11.1, F1, 7.25, -8.9, F1 + 0.9, 7.85);
  wood.box(0.3, 2.0, 1.6, -11.8, F1 + 1.0, 4.5);        // 货架
  collision.addBox(-12, F1, 3.7, -11.6, F1 + 2.0, 5.3);

  // ---------- 浴室 ----------
  marble.box(0.85, 0.58, 1.85, -11.35, F2 + 0.29, 5.5); // 浴缸
  collision.addBox(-11.85, F2, 4.5, -10.85, F2 + 0.6, 6.5);
  tile.box(0.5, 0.12, 0.45, -8.6, F2 + 0.85, 7.4);      // 洗手盆
  marble.box(0.12, 0.8, 0.12, -8.6, F2 + 0.4, 7.4);
  collision.addBox(-8.85, F2, 7.15, -8.35, F2 + 0.9, 7.65);
  const mirror = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.75), MAT.glass);
  mirror.position.set(-8.12, F2 + 1.55, 7.4);
  mirror.rotation.y = -Math.PI / 2;
  g.add(mirror);
  // 瓷砖墙裙
  tile.box(3.8, 1.2, 0.04, -10, F2 + 0.6, 7.96);
  tile.box(0.04, 1.2, 6.4, -11.96, F2 + 0.6, 4.75);

  // ---------- 客房（10 间，instanced 家具） ----------
  const northIds = ['bedroom_macarthur', 'bedroom_wargrave', 'bedroom_armstrong', 'bedroom_blore', 'bedroom_rogers'];
  const southIds = ['bedroom_vera', 'bedroom_marston', 'bedroom_brent', 'bedroom_lombard', 'bedroom_player'];
  const cxs = [-6, -2, 2, 6, 10];
  const bedG = bedGeometries();
  const bedWood = new THREE.InstancedMesh(bedG.wood, MAT.redWood, 10);
  const bedCloth = new THREE.InstancedMesh(bedG.cloth, MAT.clothCream, 10);
  const chairs = new THREE.InstancedMesh(chairGeometry(), MAT.redWood, 30);
  const desks = new THREE.InstancedMesh(deskGeometry(), MAT.redWood, 12);
  const stands = new THREE.InstancedMesh(nightstandGeometry(), MAT.redWood, 10);
  const dummy = new THREE.Object3D();
  let ci = 0;
  const zones = [];   // 房间区域（HUD 名牌触发）
  const plates = [];  // 门口小牌
  const byId = {};
  for (const b of data.places.bedrooms) byId[b.id] = b;
  for (const c of data.places.commonRooms) byId[c.id] = c;

  function furnishRoom(cx, south, idx) {
    const zBed = south ? 6.6 : -6.6;
    const zDesk = south ? 7.5 : -7.5;
    const ry = south ? Math.PI : 0;
    dummy.position.set(cx - 0.9, F2, zBed);
    dummy.rotation.set(0, ry, 0);
    dummy.updateMatrix();
    bedWood.setMatrixAt(idx, dummy.matrix);
    bedCloth.setMatrixAt(idx, dummy.matrix);
    collision.addBox(cx - 1.7, F2, zBed - 1.1, cx - 0.1, F2 + 0.6, zBed + 1.1);
    dummy.position.set(cx + 1.25, F2, zDesk);
    dummy.updateMatrix();
    desks.setMatrixAt(idx, dummy.matrix);
    collision.addBox(cx + 0.6, F2, zDesk - 0.35, cx + 1.9, F2 + 0.78, zDesk + 0.35);
    dummy.position.set(cx + 0.35, F2, south ? zDesk - 0.65 : zDesk + 0.65);
    dummy.rotation.set(0, south ? Math.PI : 0, 0);
    dummy.updateMatrix();
    chairs.setMatrixAt(ci++, dummy.matrix);
    dummy.position.set(cx + 0.15, F2, zBed);
    dummy.updateMatrix();
    stands.setMatrixAt(idx, dummy.matrix);
  }
  cxs.forEach((cx, i) => furnishRoom(cx, false, i));
  cxs.forEach((cx, i) => furnishRoom(cx, true, i + 5));
  // 大厅圆桌 11 把椅子（dining_chair.glb InstancedMesh，emptiness 撤椅兼容；失败并入共享 chairs）
  const chairParts = getParts('dining_chair');
  let hallChairs = null;
  if (chairParts) {
    const cgeo = chairParts[0].geometry;   // 不减面：步进减面产生破洞，近景读作"碎裂"
    const cmat = chairParts[0].material.clone();
    cmat.color.setRGB(0.42, 0.38, 0.34, THREE.SRGBColorSpace);   // 金漆压暗
    if (cmat.metalness !== undefined) cmat.metalness = 0.15;     // 哑光深木感
    if (cmat.roughness !== undefined) cmat.roughness = 0.85;
    hallChairs = new THREE.InstancedMesh(cgeo, cmat, 29);
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let k = 0; k < 29; k++) hallChairs.setMatrixAt(k, zero);
    hallChairs.castShadow = true;
    hallChairs.receiveShadow = true;
  }
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2;
    dummy.position.set(2.5 + Math.cos(a) * 2.0, F1, 4.0 + Math.sin(a) * 2.0);
    dummy.rotation.set(0, -a - Math.PI / 2, 0);
    dummy.updateMatrix();
    if (hallChairs) hallChairs.setMatrixAt(10 + i, dummy.matrix);
    else chairs.setMatrixAt(ci++, dummy.matrix);
  }
  if (hallChairs) g.add(hallChairs);
  // 圆桌 11 个餐盘（instanced，随死亡人数递减）
  const plateGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.02, 12);
  const dishes = new THREE.InstancedMesh(plateGeo, MAT.porcelain, 11);
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2;
    dummy.position.set(2.5 + Math.cos(a) * 1.15, F1 + 0.83, 4.0 + Math.sin(a) * 1.15);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    dishes.setMatrixAt(i, dummy.matrix);
  }
  g.add(dishes);
  // 餐厅 6 把
  for (let i = 0; i < 3; i++) {
    dummy.rotation.set(0, 0, 0);
    dummy.position.set(9.3 + i * 0.7, F1, 2.15);
    dummy.updateMatrix();
    chairs.setMatrixAt(ci++, dummy.matrix);
    dummy.position.set(9.3 + i * 0.7, F1, 3.85);
    dummy.rotation.set(0, Math.PI, 0);
    dummy.updateMatrix();
    chairs.setMatrixAt(ci++, dummy.matrix);
  }
  // 管家房 1 把
  dummy.position.set(-11.2, F1, 5.8);
  dummy.rotation.set(0, 0.8, 0);
  dummy.updateMatrix();
  chairs.setMatrixAt(ci++, dummy.matrix);
  chairs.count = ci;
  for (const m of [bedWood, bedCloth, chairs, desks, stands]) {
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  }
  // 管家房小书桌
  dummy.position.set(-11.4, F1, 3.0);
  dummy.rotation.set(0, Math.PI / 2, 0);
  dummy.updateMatrix();
  desks.setMatrixAt(10, dummy.matrix);
  collision.addBox(-11.9, F1, 2.4, -11.0, F1 + 0.78, 3.6);
  // 书房大书桌
  dummy.position.set(-4.0, F3, 2.0);
  dummy.rotation.set(0, 0.4, 0);
  dummy.updateMatrix();
  desks.setMatrixAt(11, dummy.matrix);
  collision.addBox(-4.7, F3, 1.6, -3.3, F3 + 0.78, 2.4);
  // 书房椅子
  dummy.position.set(-3.2, F3, 3.0);
  dummy.rotation.set(0, 0.4 + Math.PI, 0);
  dummy.updateMatrix();
  chairs.setMatrixAt(ci++, dummy.matrix);
  chairs.count = ci;

  // 房间名牌（canvas 贴图小牌）
  const plateMeshes = new THREE.Group();
  function doorPlate(text, sub, x, y, z, ry) {
    const p = textPanel([text, sub], { w: 0.62, h: 0.26, fontMain: 120, fontSub: 52, bg: '#262019' });
    p.position.set(x, y, z);
    p.rotation.y = ry;
    plateMeshes.add(p);
  }
  cxs.forEach((cx, i) => {
    const nb = byId[northIds[i]];
    doorPlate(nb.nameplate, nb.sub, cx + 0.85, F2 + 1.62, -1.42, 0);
    const sb = byId[southIds[i]];
    doorPlate(sb.nameplate, sb.sub, cx + 0.85, F2 + 1.62, 1.42, Math.PI);
    zones.push({ id: northIds[i], nameplate: nb.nameplate, sub: nb.sub, rect: [cx - 2, -8, cx + 2, -1.5], floor: F2 });
    zones.push({ id: southIds[i], nameplate: sb.nameplate, sub: sb.sub, rect: [cx - 2, 1.5, cx + 2, 8], floor: F2 });
  });
  // 维拉房间窗台：白色大理石熊钟
  marble.box(1.0, 0.05, 0.28, -6, F2 + 0.93, 7.82);
  const bear = bearClock();
  bear.position.set(-6, F2 + 0.955, 7.8);
  g.add(bear);

  // ---------- 书房 ----------
  // 书架（满墙法律书籍）
  const shelfUnits = [];
  for (const x of [-6, -4, -2, 0, 2, 4, 6]) shelfUnits.push({ x, z: -7.82, ry: 0 });          // 北墙
  for (const z of [-6, -4, -2]) shelfUnits.push({ x: -7.82, z, ry: Math.PI / 2 });            // 西墙
  for (const z of [-6, -4, -2, 0, 2, 4]) shelfUnits.push({ x: 7.82, z, ry: -Math.PI / 2 });   // 东墙
  for (const u of shelfUnits) {
    wood.box(1.9, 2.6, 0.34, u.x, F3 + 1.3, u.z, u.ry);
    for (let s = 0; s < 4; s++) {
      const off = -0.66 + s * 0.55;
      const sx = u.ry === 0 ? u.x : u.x + (u.ry > 0 ? 0.16 : -0.16);
      const sz = u.ry === 0 ? u.z + 0.16 : u.z;
      trim.box(u.ry === 0 ? 1.8 : 0.3, 0.03, u.ry === 0 ? 0.3 : 1.8, sx, F3 + 0.45 + s * 0.55, sz);
    }
    collision.addBox(u.x - 0.95, F3, u.z - 0.2, u.x + 0.95, F3 + 2.6, u.z + 0.2);
  }
  // 书脊 instanced
  const bookGeo = new THREE.BoxGeometry(0.055, 0.34, 0.24);
  const bookCount = shelfUnits.length * 4 * 24;
  const books = new THREE.InstancedMesh(bookGeo, MAT.bookWhite, bookCount);
  const bookColors = [0x5a2e2e, 0x4a3226, 0x2f4536, 0x3c4148, 0x6e5a44, 0x472626];
  const bc = new THREE.Color();
  let bk = 0;
  for (const u of shelfUnits) {
    for (let s = 0; s < 4; s++) {
      const y = F3 + 0.62 + s * 0.55;
      for (let i = 0; i < 24; i++) {
        const t = -0.82 + i * 0.071 + Math.random() * 0.01;
        if (u.ry === 0) dummy.position.set(u.x + t, y, u.z + 0.17);
        else dummy.position.set(u.x + (u.ry > 0 ? 0.17 : -0.17), y, u.z + t);
        dummy.rotation.set(0, u.ry + (Math.random() - 0.5) * 0.04, 0);
        dummy.updateMatrix();
        books.setMatrixAt(bk, dummy.matrix);
        books.setColorAt(bk, bc.setHex(bookColors[(Math.random() * bookColors.length) | 0]));
        bk++;
      }
    }
  }
  books.count = bk;
  g.add(books);
  // 扶手椅 ×2（书房；sofa.glb 单人位替换方块占位）
  for (const [ax, az, ary] of [[2.5, 5.0, -2.3], [4.2, 3.2, 2.9]]) {
    const so = sofaInstance(1.1);
    if (so) {
      so.position.set(ax, F3, az);
      so.rotation.y = ary + Math.PI;
      g.add(so);
    } else {
      const ac = armchair();
      ac.position.set(ax, F3, az);
      ac.rotation.y = ary;
      g.add(ac);
    }
    collision.addBox(ax - 0.55, F3, az - 0.5, ax + 0.55, F3 + 0.95, az + 0.5);
  }
  carpet.box(5.5, 0.02, 4.5, 0, F3 + 0.012, 1.0);
  // 红色窗帘（布料垂坠：正弦褶皱）
  function curtain(x, z, ry) {
    const geo = new THREE.PlaneGeometry(1.15, 2.7, 14, 1);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setZ(i, Math.sin(pos.getX(i) * 10.5) * 0.07 + Math.sin(pos.getX(i) * 4.2) * 0.04);
    }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, MAT.clothRed);
    m.position.set(x, F3 + 1.62, z);
    m.rotation.y = ry;
    m.castShadow = true;
    g.add(m);
  }
  for (const cx of [-4, 2]) {
    curtain(cx - 1.05, -7.72, 0);
    curtain(cx + 1.05, -7.72, 0);
  }

  // ---------- 储藏室 ----------
  const crateGeo = new THREE.BoxGeometry(0.62, 0.62, 0.62);
  const crates = new THREE.InstancedMesh(crateGeo, MAT.wood, 12);
  const cratePos = [[9, -6.5], [9.8, -6.4], [9.4, -5.8], [10.6, -6.5], [9, -4.8], [11, -5.6], [10.2, -4.9], [9.2, -3.2], [10.4, -3.3], [11.2, -4.1], [9.8, -2.4], [11, -2.6]];
  cratePos.forEach(([x, z], i) => {
    dummy.position.set(x, F3 + 0.31 + (i % 3 === 2 ? 0.62 : 0), z);
    dummy.rotation.set(0, Math.random() * 0.8, 0);
    dummy.updateMatrix();
    crates.setMatrixAt(i, dummy.matrix);
  });
  crates.castShadow = true;
  g.add(crates);
  collision.addBox(8.6, F3, -7.0, 11.6, F3 + 1.4, -2.0);
  // 罐头（instanced 小圆柱，沿东墙架子）
  wood.box(0.35, 2.0, 5.5, 11.7, F3 + 1.0, 2.0);
  collision.addBox(11.5, F3, -0.8, 11.9, F3 + 2.0, 4.8);
  const canGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.15, 8);
  const cans = new THREE.InstancedMesh(canGeo, MAT.ironDark, 24);
  for (let i = 0; i < 24; i++) {
    dummy.position.set(11.62, F3 + 0.55 + (i % 2) * 0.6, -0.4 + Math.floor(i / 2) * 0.42);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    cans.setMatrixAt(i, dummy.matrix);
  }
  g.add(cans);

  // ---------- 露台栏杆（Deco 柱式矮栏） ----------
  function parapet(axis, at, a, b) {
    trim.box(axis === 'x' ? b - a : 0.22, 0.9, axis === 'x' ? 0.22 : b - a,
      axis === 'x' ? (a + b) / 2 : at, F1 + 0.45, axis === 'x' ? at : (a + b) / 2);
    if (axis === 'x') collision.addBox(a, F1, at - 0.11, b, F1 + 0.9, at + 0.11);
    else collision.addBox(at - 0.11, F1, a, at + 0.11, F1 + 0.9, b);
  }
  parapet('x', 13, -10, -1.6);
  parapet('x', 13, 1.6, 10);
  parapet('z', -10, 8, 13);
  parapet('z', 10, 8, 13);
  for (const [px, pz] of [[-1.6, 13], [1.6, 13], [-10, 13], [10, 13], [-10, 8], [10, 8]]) {
    trim.box(0.4, 1.15, 0.4, px, F1 + 0.575, pz);
    collision.addBox(px - 0.2, F1, pz - 0.2, px + 0.2, F1 + 1.15, pz + 0.2);
  }

  // ---------- 外墙 Deco 装饰线 + 屋顶挑檐 + 门廊 ----------
  for (const y of [T1, T2, T3]) {
    trim.box(24.7, 0.16, 0.14, 0, y + 0.05, 8.22);
    trim.box(24.7, 0.16, 0.14, 0, y + 0.05, -8.22);
    trim.box(0.14, 0.16, 16.7, 12.22, y + 0.05, 0);
    trim.box(0.14, 0.16, 16.7, -12.22, y + 0.05, 0);
  }
  // 女儿墙（阶梯式 Deco 檐口）
  for (const [w, y] of [[25.2, ROOF + 0.18], [24.6, ROOF + 0.48]]) {
    trim.box(w, 0.3, 0.3, 0, y, 8.3);
    trim.box(w, 0.3, 0.3, 0, y, -8.3);
    trim.box(0.3, 0.3, 16.9, 12.4, y, 0);
    trim.box(0.3, 0.3, 16.9, -12.4, y, 0);
  }
  // 正门雨棚（阶梯式）
  trim.box(3.0, 0.14, 1.1, 0, F1 + 2.55, 8.7);
  trim.box(2.3, 0.14, 0.75, 0, F1 + 2.4, 8.55);
  trim.box(0.25, 0.5, 0.25, -1.2, F1 + 2.2, 8.5);
  trim.box(0.25, 0.5, 0.25, 1.2, F1 + 2.2, 8.5);
  // 敞开的正门门板（视觉）
  wood.box(0.85, 2.3, 0.06, -1.35, F1 + 1.15, 8.55, -0.9);
  wood.box(0.85, 2.3, 0.06, 1.35, F1 + 1.15, 8.55, 0.9);
  // 别墅名牌
  const villaPlate = textPanel([data.places.villaName], { w: 2.4, h: 0.55, fontMain: 110, bg: '#262019' });
  villaPlate.position.set(0, F1 + 2.95, 8.4);
  g.add(villaPlate);

  // ---------- 窗玻璃/窗框/窗台 ----------
  for (const wdef of windows) {
    const { axis, at, a, b, y0, y1, out, porthole } = wdef;
    const cx = (a + b) / 2, cy = (y0 + y1) / 2;
    const t = 0.08, d = 0.16;
    if (porthole) {
      // 圆形舷窗：铜环 + 圆玻璃
      const ring = new THREE.TorusGeometry(0.55, 0.07, 8, 20);
      const m = new THREE.Matrix4().makeRotationY(axis === 'z' ? Math.PI / 2 : 0);
      m.setPosition(axis === 'z' ? at : cx, cy, axis === 'z' ? cx : at);
      frame.add(ring, m);
      const disc = new THREE.CircleGeometry(0.52, 20);
      const gm = new THREE.Matrix4().makeRotationY(axis === 'z' ? Math.PI / 2 : 0);
      gm.setPosition(axis === 'z' ? at : cx, cy, axis === 'z' ? cx : at);
      glass.add(disc, gm);
      continue;
    }
    if (axis === 'x') {
      frame.box(t, y1 - y0, d, a, cy, at);
      frame.box(t, y1 - y0, d, b, cy, at);
      frame.box(b - a, t, d, cx, y0, at);
      frame.box(b - a, t, d, cx, y1, at);
      if (b - a > 1.1) frame.box(0.05, y1 - y0, 0.05, cx, cy, at);
      glass.box(b - a - 0.06, y1 - y0 - 0.06, 0.03, cx, cy, at);
      trim.box(b - a + 0.2, 0.08, 0.32, cx, y0 - 0.04, at + out * 0.13);
    } else {
      frame.box(d, y1 - y0, t, at, cy, a);
      frame.box(d, y1 - y0, t, at, cy, b);
      frame.box(d, t, b - a, at, y0, cx);
      frame.box(d, t, b - a, at, y1, cx);
      if (b - a > 1.1) frame.box(0.05, y1 - y0, 0.05, at, cy, cx);
      glass.box(0.03, y1 - y0 - 0.06, b - a - 0.06, at, cy, cx);
      trim.box(0.32, 0.08, b - a + 0.2, at + out * 0.13, y0 - 0.04, cx);
    }
  }

  // ---------- 通用房间名牌（公共区域） ----------
  const cp = (id) => byId[id];
  doorPlate(cp('dining').nameplate, cp('dining').sub, 8.14, F1 + 2.35, 3.65, -Math.PI / 2);
  doorPlate(cp('kitchen').nameplate, cp('kitchen').sub, 8.14, F1 + 2.35, -4.9, -Math.PI / 2);
  doorPlate(cp('butler').nameplate, cp('butler').sub, -8.14, F1 + 2.35, 5.1, Math.PI / 2);
  doorPlate(cp('bathroom').nameplate, cp('bathroom').sub, -10.0, F2 + 2.35, 1.44, Math.PI);
  doorPlate(cp('study').nameplate, cp('study').sub, -8.14, F3 + 2.35, 0.5, Math.PI / 2);
  doorPlate(cp('storage').nameplate, cp('storage').sub, 8.14, F3 + 2.35, 0.5, -Math.PI / 2);
  g.add(plateMeshes);

  // 公共区域名牌触发区
  zones.push(
    { id: 'hall', nameplate: cp('hall').nameplate, sub: cp('hall').sub, rect: [-8, -2, 8, 8], floor: F1 },
    { id: 'dining', nameplate: cp('dining').nameplate, sub: cp('dining').sub, rect: [8, -2, 12, 8], floor: F1 },
    { id: 'kitchen', nameplate: cp('kitchen').nameplate, sub: cp('kitchen').sub, rect: [8, -8, 12, -2], floor: F1 },
    { id: 'butler', nameplate: cp('butler').nameplate, sub: cp('butler').sub, rect: [-12, 2, -8, 8], floor: F1 },
    { id: 'terrace', nameplate: cp('terrace').nameplate, sub: cp('terrace').sub, rect: [-10, 8, 10, 13], floor: F1 },
    { id: 'bathroom', nameplate: cp('bathroom').nameplate, sub: cp('bathroom').sub, rect: [-12, 1.5, -8, 8], floor: F2 },
    { id: 'study', nameplate: cp('study').nameplate, sub: cp('study').sub, rect: [-8, -8, 8, 8], floor: F3 },
    { id: 'storage', nameplate: cp('storage').nameplate, sub: cp('storage').sub, rect: [8, -8, 12, 8], floor: F3 },
  );

  // ---------- 室内灯光（天气系统联动） ----------
  const mkPoint = (color, base, dist, x, y, z) => {
    const L = new THREE.PointLight(color, base, dist, 1.6);
    L.position.set(x, y, z);
    L.userData.base = base;
    g.add(L);
    return L;
  };
  const indoor = {
    ceiling: [
      mkPoint(0xffd9a0, 34, 20, 0.5, F1 + 2.2, 4.0),   // 大厅吊灯
      mkPoint(0xffd9a0, 16, 13, 10, F1 + 2.2, 3.0),    // 餐厅
      mkPoint(0xffd9a0, 20, 16, 2, F2 + 2.3, 0),       // 二层走廊
      mkPoint(0xffd9a0, 20, 16, 0, F3 + 2.3, 0),       // 书房
    ],
    fire: mkPoint(0xffa45c, 11, 12, -5.0, F1 + 0.9, -0.7),   // 降强度/色温（瓷人保持白瓷不镀金）
    candles: [
      mkPoint(0xd98e4a, 7, 8, -5.0, F1 + 2.4, -1.5),   // 壁炉台烛
      mkPoint(0xd98e4a, 6, 8, 2.5, F1 + 1.3, 4.0),     // 餐桌烛
    ],
  };

  // ---------- 合并批次成网格 ----------
  g.add(ext.mesh(MAT.plaster, { cast: true }));
  g.add(intw.mesh(MAT.plasterIn, { cast: false }));
  g.add(trim.mesh(MAT.trim, { cast: true }));
  g.add(frame.mesh(MAT.green, { cast: false }));
  const glassM = glass.mesh(MAT.glass);
  glassM.renderOrder = 2;
  g.add(glassM);
  g.add(wood.mesh(MAT.floorWood, { cast: false }));
  g.add(carpet.mesh(MAT.carpet, { cast: false }));
  g.add(tile.mesh(MAT.tileBlue, { cast: false }));
  g.add(marble.mesh(MAT.marble, { cast: false }));
  // 窗帘已在上方单独添加（需要独立法线）

  return { group: g, indoor, flames, candleFlames, zones, refs: { chairs: hallChairs ?? chairs, plates: dishes } };
}
