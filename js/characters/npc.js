// npc.js —— 10 名 NPC：程序化低模人形（顶点色单材质）+ 程序动画（无骨骼）
import * as THREE from '../vendor/three.module.js';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { lam, textTexture } from '../world/props.js';
import { KenneyLib } from './kenney.js';
import { RiggedActor } from './rigged.js';

// 骨骼动画角色配置（dir 相对项目根；idle/walk/sit/death 为 clip 名，null 表示无）
const RIGGED_DEFS = {
  wargrave: {
    dir: 'assets/models/characters/rigged/wargrave/',
    files: {
      walking: 'Meshy_AI_Portrait_of_a_Judge_biped_Animation_Walking_withSkin.glb',
      running: 'Meshy_AI_Portrait_of_a_Judge_biped_Animation_Running_withSkin.glb',
      injured: 'Meshy_AI_Portrait_of_a_Judge_biped_Animation_Injured_Walk_Backward_withSkin.glb',
      dying: 'Meshy_AI_Portrait_of_a_Judge_biped_Animation_dying_backwards_withSkin.glb',
    },
    idle: 'walking', idleTS: 0.12, walk: 'walking', walkTS: 1.0, sit: 'Chair_Sit_Idle_M', death: 'dying',
  },
  marston: {
    dir: 'assets/models/characters/rigged/marston/',
    files: {
      Casual_Walk: 'Meshy_AI_Gentleman_in_a_Cream__biped_Animation_Casual_Walk_withSkin.glb',
      Idle_3: 'Meshy_AI_Gentleman_in_a_Cream__biped_Animation_Idle_3_withSkin.glb',
      Sitting_Answering_Questions: 'Meshy_AI_Gentleman_in_a_Cream__biped_Animation_Sitting_Answering_Questions_withSkin.glb',
      Dead: 'Meshy_AI_Gentleman_in_a_Cream__biped_Animation_Dead_withSkin.glb',
      Running: 'Meshy_AI_Gentleman_in_a_Cream__biped_Animation_Running_withSkin.glb',
      Lean_Forward_Sprint: 'Meshy_AI_Gentleman_in_a_Cream__biped_Animation_Lean_Forward_Sprint_inplace_withSkin.glb',
    },
    idle: 'Idle_3', idleTS: 1.0, walk: 'Casual_Walk', walkTS: 1.0,
    sit: 'Sitting_Answering_Questions', death: 'Dead',
  },
  vera: {
    dir: 'assets/models/characters/rigged/vera/',
    files: {
      Walking_Woman: 'Meshy_AI_The_Quiet_Gaze_biped_Animation_Walking_Woman_withSkin.glb',
      Idle_12: 'Meshy_AI_The_Quiet_Gaze_biped_Animation_Idle_12_withSkin.glb',
      Chair_Sit_Idle_F: 'Meshy_AI_The_Quiet_Gaze_biped_Animation_Chair_Sit_Idle_F_withSkin.glb',
      Running: 'Meshy_AI_The_Quiet_Gaze_biped_Animation_Running_withSkin.glb',
      punch: 'Meshy_AI_The_Quiet_Gaze_biped_Animation_Face_Punch_Reaction_2_withSkin.glb',   // 借出：ch9 隆巴德受击
    },
    idle: 'Idle_12', idleTS: 1.0, walk: 'Walking_Woman', walkTS: 1.0,
    sit: 'Chair_Sit_Idle_F', death: null,
  },
  lombard: {
    dir: 'assets/models/characters/rigged/lombard/',
    files: {
      Walking: 'Meshy_AI_Rugged_Explorer_biped_Animation_Walking_withSkin.glb',
      Idle_02: 'Meshy_AI_Rugged_Explorer_biped_Animation_Idle_02_withSkin.glb',
      Chair_Sit_Idle_M: 'Meshy_AI_Rugged_Explorer_biped_Animation_Chair_Sit_Idle_M_withSkin.glb',
      Running: 'Meshy_AI_Rugged_Explorer_biped_Animation_Running_withSkin.glb',
      parry: 'Meshy_AI_Rugged_Explorer_biped_Animation_Two_Handed_Parry_withSkin.glb',       // ch9 持枪戒备
      sprint: 'Meshy_AI_Rugged_Explorer_biped_Animation_Lean_Forward_Sprint_withSkin.glb',   // 备用
    },
    idle: 'Idle_02', idleTS: 1.0, walk: 'Walking', walkTS: 1.0,
    sit: 'Chair_Sit_Idle_M', death: null,
  },
};

const MAT_V = new THREE.MeshLambertMaterial({ vertexColors: true });

// 给几何体填充纯色（合并后单网格多色）
function colored(geo, hex) {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}
function mergeGeos(geos) {
  let v = 0, ic = 0;
  for (const g of geos) { v += g.attributes.position.count; ic += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(v * 3), nor = new Float32Array(v * 3), col = new Float32Array(v * 3);
  const idx = v > 65000 ? new Uint32Array(ic) : new Uint16Array(ic);
  let vo = 0, io = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, vo * 3);
    nor.set(g.attributes.normal.array, vo * 3);
    col.set(g.attributes.color.array, vo * 3);
    if (g.index) { const ia = g.index.array; for (let i = 0; i < ia.length; i++) idx[io + i] = ia[i] + vo; io += ia.length; }
    else { for (let i = 0; i < g.attributes.position.count; i++) idx[io + i] = vo + i; io += g.attributes.position.count; }
    vo += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}
const box = (w, h, d, x, y, z, hex) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return colored(g, hex); };
const sph = (r, x, y, z, hex, sx = 1, sy = 1, sz = 1) => { const g = new THREE.SphereGeometry(r, 8, 6); g.scale(sx, sy, sz); g.translate(x, y, z); return colored(g, hex); };
const cyl = (r1, r2, h, x, y, z, hex, seg = 8) => { const g = new THREE.CylinderGeometry(r1, r2, h, seg); g.translate(x, y, z); return colored(g, hex); };

// 外观规格（按 characters.json appearance 程序化拼装）
const SPECS = {
  wargrave:   { h: 1.85, bulk: 0.88, skin: 0xd9b896, hair: null, top: 0x23232a, bottom: 0x1e1e24, shirt: 0xd8d2c0, glasses: true },
  vera:       { h: 1.65, bulk: 0.82, skin: 0xe8c39c, hair: 0x6e4a2f, top: 0x7d8288, bottom: 0x4a4f57, female: 'skirt' },
  lombard:    { h: 1.88, bulk: 1.15, skin: 0xc89a6a, hair: 0x2b2118, top: 0x3a332b, bottom: 0x2b2620, holster: true },
  armstrong:  { h: 1.76, bulk: 0.92, skin: 0xdcb491, hair: 0x4a3a28, top: 0x4e5258, bottom: 0x3a3d44, shirt: 0xe0dcd0, glasses: true },
  blore:      { h: 1.72, bulk: 1.3, skin: 0xd9a07a, hair: 0x3a2e22, top: 0x5a4a3a, bottom: 0x3f3a34 },
  macarthur:  { h: 1.7, bulk: 0.95, skin: 0xd9b896, hair: 0xe8e4da, top: 0x5a5c3f, bottom: 0x4a4c36, stoop: true },
  brent:      { h: 1.62, bulk: 0.85, skin: 0xd9b496, hair: 0xb8b4ac, top: 0x3a3340, bottom: 0x2e2833, female: 'longdress', knit: true },
  rogers:     { h: 1.75, bulk: 0.9, skin: 0xd9c0a8, hair: 0x3a3028, top: 0x1e1e22, bottom: 0x1e1e22, shirt: 0xe8e4da, tray: true },
  mrs_rogers: { h: 1.58, bulk: 0.78, skin: 0xe0c0a8, hair: 0x5a4a3a, top: 0x2e2a30, bottom: 0x262229, female: 'longdress', apron: true },
  marston:    { h: 1.8, bulk: 1.0, skin: 0xe0b490, hair: 0x9a7a42, top: 0xcfc4a4, bottom: 0x8a8578 },
};

// 构建人形 → { group, body, head, armL, armR, legs, prop }
function buildFigure(spec) {
  const h = spec.h, b = spec.bulk;
  const g = new THREE.Group();
  const legH = h * 0.42, torsoH = h * 0.34, headY = h * 0.87;

  // 腿（独立网格：就座时前屈）
  const legGeos = [];
  if (spec.female === 'skirt') {
    legGeos.push(cyl(0.15, 0.27, h * 0.52, 0, h * 0.26, 0, spec.bottom));
    legGeos.push(box(0.1, 0.05, 0.18, -0.07, 0.025, 0.03, spec.bottom));
    legGeos.push(box(0.1, 0.05, 0.18, 0.07, 0.025, 0.03, spec.bottom));
  } else if (spec.female === 'longdress') {
    legGeos.push(cyl(0.16, 0.3, h * 0.56, 0, h * 0.28, 0, spec.bottom));
  } else {
    const w = 0.13 * b;
    legGeos.push(box(w, legH, 0.15, -0.09 * b, legH / 2, 0, spec.bottom));
    legGeos.push(box(w, legH, 0.15, 0.09 * b, legH / 2, 0, spec.bottom));
  }
  const legs = new THREE.Mesh(mergeGeos(legGeos), MAT_V);
  legs.castShadow = false;
  g.add(legs);

  // 躯干
  const torsoGeos = [];
  const torsoY = legH + torsoH / 2;
  torsoGeos.push(box(0.36 * b, torsoH, 0.2, 0, torsoY, 0, spec.top));
  torsoGeos.push(box(0.4 * b, torsoH * 0.32, 0.21, 0, legH + torsoH * 0.82, 0, spec.top)); // 肩
  if (spec.shirt) torsoGeos.push(box(0.12, torsoH * 0.5, 0.02, 0, torsoY + 0.05, 0.105, spec.shirt));
  if (spec.apron) torsoGeos.push(box(0.24, torsoH * 0.9, 0.02, 0, torsoY - 0.04, 0.105, 0xd8d4c8));
  if (spec.holster) {
    torsoGeos.push(box(0.07, 0.16, 0.05, 0.2 * b, legH - 0.02, 0.08, 0x4a3320));
    torsoGeos.push(box(0.04, 0.08, 0.04, 0.2 * b, legH + 0.07, 0.1, 0x22262c));
  }
  const body = new THREE.Mesh(mergeGeos(torsoGeos), MAT_V);
  body.castShadow = true;
  if (spec.stoop) body.rotation.x = 0.1;
  g.add(body);

  // 头
  const headGeos = [];
  headGeos.push(sph(0.105, 0, 0, 0, spec.skin, 0.92, 1.05, 0.95));
  headGeos.push(box(0.025, 0.02, 0.012, -0.038, 0.012, 0.093, 0x1c1a18)); // 眼
  headGeos.push(box(0.025, 0.02, 0.012, 0.038, 0.012, 0.093, 0x1c1a18));
  if (spec.hair !== null && spec.hair !== undefined) {
    headGeos.push(sph(0.11, 0, 0.028, -0.012, spec.hair, 1, 0.82, 1));
    headGeos.push(box(0.19, 0.06, 0.05, 0, 0.055, 0.075, spec.hair)); // 刘海沿
  }
  if (spec.glasses) {
    headGeos.push(box(0.05, 0.038, 0.012, -0.042, 0.012, 0.1, 0x2a2620));
    headGeos.push(box(0.05, 0.038, 0.012, 0.042, 0.012, 0.1, 0x2a2620));
    headGeos.push(box(0.03, 0.008, 0.012, 0, 0.012, 0.1, 0x2a2620));
  }
  const head = new THREE.Mesh(mergeGeos(headGeos), MAT_V);
  head.position.y = headY;
  head.castShadow = false;
  g.add(head);

  // 手臂（肩部枢轴组）
  const mkArm = (side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * (0.2 * b + 0.04), legH + torsoH * 0.92, 0);
    const armGeos = [
      box(0.085 * b, h * 0.3, 0.095, 0, -h * 0.15, 0, spec.top),
      sph(0.045, 0, -h * 0.32, 0, spec.skin),
    ];
    const m = new THREE.Mesh(mergeGeos(armGeos), MAT_V);
    m.castShadow = false;
    pivot.add(m);
    g.add(pivot);
    return pivot;
  };
  const armL = mkArm(-1), armR = mkArm(1);

  // 手持道具
  let prop = null;
  if (spec.tray) {
    prop = new THREE.Mesh(mergeGeos([
      cyl(0.16, 0.16, 0.02, 0, 0, 0, 0xb8b4ac, 12),
      cyl(0.05, 0.05, 0.06, -0.05, 0.04, 0.03, 0xe8e4da, 8),
    ]), MAT_V);
    prop.position.set(0, -h * 0.34, 0.1);
    armR.add(prop);
    armR.rotation.x = -1.15; // 端托盘姿势
  }
  if (spec.knit) {
    prop = new THREE.Mesh(mergeGeos([
      sph(0.06, 0, 0, 0, 0xb8b4ac),
      box(0.006, 0.2, 0.006, 0.05, 0.1, 0.02, 0x8a8578),
      box(0.006, 0.2, 0.006, -0.05, 0.1, 0.02, 0x8a8578),
    ]), MAT_V);
    prop.position.set(0, legH + 0.08, 0.2); // 腿上毛线团
    g.add(prop);
  }

  // 名牌 sprite
  const label = new THREE.Sprite(new THREE.SpriteMaterial({
    map: textTexture([spec.name], { w: 256, h: 80, bg: 'rgba(20,18,16,0.55)', fg: '#e8ddc9', border: 'rgba(217,142,74,0.0)', fontMain: 46 }),
    transparent: true, depthWrite: false,
  }));
  label.scale.set(0.5, 0.16, 1);
  label.position.y = h + 0.24;
  g.add(label);

  return { group: g, body, head, armL, armR, legs, prop, label };
}

export class NPC {
  constructor(def, scene, kenneyLib = null) {
    this.id = def.id;
    this.def = def;
    this.spec = { ...SPECS[def.id], name: def.name };
    // Kenney 方块人物（characters.json modelHint.kenney 数据驱动）；失败退回程序化模型
    const kid = def.modelHint?.kenney;
    if (RIGGED_DEFS[def.id] && kenneyLib?.rigged?.[def.id]) {
      const rig = kenneyLib.rigged[def.id];
      // Meshy 模型本地前向为 +z，与全工程"朝向=-(sin yaw,cos yaw)"约定相反：
      // 内层根节点预转 π，使 movers/座位/站位 yaw 语义统一（endings 法官独立实例不受影响）
      for (const o of Object.values(rig.items)) o.root.rotation.y = Math.PI;
      this.rigCfg = RIGGED_DEFS[def.id];
      this.kenney = true;
      this.rigged = rig;
      rig.group.visible = true;
      this.group = rig.group;
      this.inner = rig.group;
      this.legs = new THREE.Group();
      this.body = new THREE.Group();
      this.head = new THREE.Group();
      this.armL = new THREE.Group();
      this.armR = new THREE.Group();
      rig.play(this.rigCfg.idle, { timeScale: this.rigCfg.idleTS });
      const label = new THREE.Sprite(new THREE.SpriteMaterial({
        map: textTexture([def.name], { w: 256, h: 80, bg: 'rgba(20,18,16,0.55)', fg: '#e8ddc9', border: 'rgba(217,142,74,0.0)', fontMain: 46 }),
        transparent: true, depthWrite: false,
      }));
      label.scale.set(0.5, 0.16, 1);
      label.position.y = this.spec.h + 0.24;
      this.group.add(label);
      this.label = label;
      scene.add(this.group);
      this._initState();
      return;
    }
    if (kid && kenneyLib?.has(kid)) {
      const hint = def.modelHint;
      const built = kenneyLib.build(kid, {
        tex: hint.tex ?? null,
        tint: hint.tint ?? null,
        height: this.spec.h,
        accessories: hint.accessories || [],
      });
      this.kenney = true;
      this.group = built.group;
      this.inner = built.inner;
      const legs = new THREE.Group();
      if (built.parts.legL) legs.add(built.parts.legL);
      if (built.parts.legR) legs.add(built.parts.legR);
      this.legs = legs;
      this.body = built.parts.body || new THREE.Group();
      this.head = built.parts.head || new THREE.Group();
      this.armL = built.parts.armL || new THREE.Group();
      this.armR = built.parts.armR || new THREE.Group();
      // 名牌
      const label = new THREE.Sprite(new THREE.SpriteMaterial({
        map: textTexture([def.name], { w: 256, h: 80, bg: 'rgba(20,18,16,0.55)', fg: '#e8ddc9', border: 'rgba(217,142,74,0.0)', fontMain: 46 }),
        transparent: true, depthWrite: false,
      }));
      label.scale.set(0.5, 0.16, 1);
      label.position.y = this.spec.h + 0.24;
      this.group.add(label);
      this.label = label;
      scene.add(this.group);
      this._initState();
      return;
    }
    this.kenney = false;
    const parts = buildFigure(this.spec);
    Object.assign(this, parts);
    scene.add(this.group);
    this._initState();
  }

  _initState() {
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.action = 'idle';
    this.seated = false;
    this.lying = null;
    this.reaction = null;
    this.walking = null;
    this.removed = false;
    this.dead = false;
    this.permaHidden = false;
    this._t = Math.random() * 10;
  }

  place(x, y, z, yaw = 0) {
    this.pos.set(x, y, z);
    this.yaw = yaw;
    this.group.position.set(x, y, z);
    this.group.rotation.set(0, yaw, 0);
  }

  setAction(action) {
    this.action = action;
    this.seated = ['sit', 'sit_read', 'knit'].includes(action);
    this.lying = action === 'faint' ? 'side' : action === 'sleep' ? 'back' : null;
    // 姿态应用（骨骼角色有真实坐姿 clip：不含在内，clip 自带椅子高度，避免双倍下沉折进椅子）
    const rigSit = this.rigged && this.seated && this.rigCfg?.sit;
    this.legs.rotation.x = this.seated ? -Math.PI / 2 : 0;
    this.group.rotation.x = this.lying === 'back' ? -Math.PI / 2 : 0;
    this.group.rotation.z = this.lying === 'side' ? Math.PI / 2.2 : 0;
    this.group.position.y = this.pos.y - (this.seated && !rigSit ? 0.42 : 0) + (this.lying ? 0.12 : 0);
    if (this.spec.tray) this.armR.rotation.x = -1.15;
  }

  playReaction(type, dur = 3.2) {
    this.reaction = { type, t: 0, dur };
  }

  update(dt, t) {
    this._t += dt;
    const tt = this._t;
    if (this.removed || this.dead) return;

    // 行走由 schedule 驱动位移；这里只播动画
    if (this.rigged) {
      const rc = this.rigCfg;
      this.rigged.setSitMix(this.seated ? 1 : 0);   // 坐姿：下半身投影渐隐入罩染，遮拉伸涂抹
      this.rigged.update(dt);
      // 死亡 clip 播放期间不干预（否则会被待机分支覆盖）
      if (this.dead || this.rigged.currentName === rc.death) return;
      if (this.walking) {
        if (this.rigged.currentName !== rc.walk) this.rigged.play(rc.walk, { timeScale: rc.walkTS });
        else this.rigged.current.action.timeScale = rc.walkTS;
      } else if (this.seated && rc.sit) {
        if (this.rigged.currentName !== rc.sit) this.rigged.play(rc.sit, { timeScale: 0.6 });
      } else if (this.rigged.currentName !== rc.idle) {
        this.rigged.play(rc.idle, { timeScale: rc.idleTS });
      } else {
        this.rigged.current.action.timeScale = rc.idleTS;
      }
      return;
    }
    if (this.walking) {
      const bobTarget = this.kenney ? this.inner : this.body;
      bobTarget.position.y = Math.abs(Math.sin(tt * 7)) * 0.035;
      this.armL.rotation.x = Math.sin(tt * 7) * 0.5;
      this.armR.rotation.x = this.spec.tray ? -1.15 : -Math.sin(tt * 7) * 0.5;
      this.legs.rotation.x = this.kenney ? Math.sin(tt * 7) * 0.4 : this.legs.rotation.x;
      return;
    }
    (this.kenney ? this.inner : this.body).position.y = 0;

    const R = this.reaction;
    if (R) {
      R.t += dt;
      const k = Math.min(1, R.t / 0.5), out = R.t > R.dur - 0.5 ? Math.max(0, (R.dur - R.t) / 0.5) : 1;
      const a = k * out;
      switch (R.type) {
        case 'shrug':    // 马尔斯顿：摊手
          this.armL.rotation.z = -1.2 * a; this.armR.rotation.z = 1.2 * a;
          this.armL.rotation.x = this.armR.rotation.x = -0.5 * a;
          this.head.rotation.z = 0.12 * a;
          break;
        case 'stiffen':  // 布伦特：挺直
          this.body.rotation.x = -0.08 * a;
          this.head.rotation.x = -0.1 * a;
          break;
        case 'still':    // 沃格雷夫：不动如山（冻结一切）
          break;
        case 'tremble':  // 颤抖
          this.armL.rotation.x = -0.3 + Math.sin(tt * 22) * 0.06 * a;
          this.armR.rotation.x = -0.3 + Math.sin(tt * 25 + 1) * 0.06 * a;
          this.head.rotation.z = Math.sin(tt * 18) * 0.03 * a;
          break;
        case 'bowhead':  // 低头
          this.head.rotation.x = 0.55 * a;
          break;
        case 'sigh':     // 麦克阿瑟：缓缓低头
          this.head.rotation.x = 0.4 * a;
          this.body.rotation.x = 0.12 + 0.06 * a;
          break;
        case 'smirk':    // 隆巴德：歪头咧嘴
          this.head.rotation.z = 0.18 * a;
          this.head.rotation.y = 0.25 * a;
          break;
        case 'flinch':   // 维拉：瑟缩
          this.head.rotation.x = 0.3 * a + Math.sin(tt * 10) * 0.02 * a;
          this.body.rotation.x = 0.1 * a;
          break;
        case 'lookaround':
          this.head.rotation.y = Math.sin(tt * 1.8) * 0.6 * a;
          break;
        case 'choke':    // 呛咳：弯腰、双手扼喉、痉挛
          this.body.rotation.x = 0.55 * a + Math.sin(tt * 14) * 0.05 * a;
          this.armL.rotation.x = -2.1 * a;
          this.armR.rotation.x = -2.1 * a;
          this.head.rotation.x = 0.3 * a + Math.sin(tt * 18) * 0.04 * a;
          break;
      }
      if (R.t >= R.dur) {
        this.reaction = null;
        this.armL.rotation.set(0, 0, 0);
        if (!this.spec.tray) this.armR.rotation.set(0, 0, 0);
        else this.armR.rotation.x = -1.15;
        this.head.rotation.set(0, 0, 0);
        this.body.rotation.x = this.spec.stoop ? 0.1 : 0;
      }
      return;
    }

    // 待机动作
    switch (this.action) {
      case 'knit':
        this.armL.rotation.x = -0.7 + Math.sin(tt * 5.5) * 0.12;
        this.armR.rotation.x = -0.7 + Math.sin(tt * 5.5 + Math.PI) * 0.12;
        this.head.rotation.x = 0.28;
        break;
      case 'gaze_sea':
        this.armL.rotation.x = 0; this.armR.rotation.x = 0;
        this.head.rotation.y = Math.sin(tt * 0.23) * 0.15;
        break;
      case 'serve':
        this.head.rotation.x = Math.sin(tt * 0.8) > 0.92 ? 0.2 : 0; // 偶而欠身
        break;
      case 'wipe':
        this.armR.rotation.x = -0.9 + Math.sin(tt * 4) * 0.15;
        this.armR.rotation.z = Math.cos(tt * 4) * 0.15;
        break;
      case 'cook':
        this.armR.rotation.x = -0.8 + Math.sin(tt * 3.2) * 0.25;
        break;
      case 'write_note':
        this.head.rotation.x = 0.35;
        this.armR.rotation.x = -0.8 + Math.sin(tt * 9) * 0.05;
        break;
      case 'smoke': {
        const cyc = tt % 4.5;
        this.armR.rotation.x = cyc < 1.2 ? -1.9 : -0.2;
        if (cyc < 1.2) this.head.rotation.x = 0.1;
        break;
      }
      case 'chop':
        this.armR.rotation.x = -0.4 - Math.abs(Math.sin(tt * 2.2)) * 1.6;
        break;
      case 'sit_read':
        this.head.rotation.x = 0.3;
        this.armL.rotation.x = -0.5; this.armR.rotation.x = -0.5;
        break;
      case 'tend_bar':
        this.armR.rotation.x = -0.7 + Math.sin(tt * 3.5) * 0.12;
        this.armR.rotation.z = Math.cos(tt * 3.5) * 0.12;
        break;
      case 'pace':
      case 'patrol':
        break; // 位移由 schedule
      case 'faint':
      case 'sleep':
        break;
      default: { // idle：呼吸起伏 + 偶尔张望
        const br = Math.sin(tt * 1.6) * 0.008;
        this.body.scale.y = 1 + br;
        this.head.rotation.y = Math.sin(tt * 0.31) * 0.3;
      }
    }
  }

  setRemoved() {
    this.removed = true;
    this.group.visible = false;
  }

  // 死亡定格姿态（静态，update 直接跳过）
  setDeadPose(type) {
    this.dead = true;
    this.deadPose = type;
    this.walking = false;
    this.reaction = null;
    const deathClip = this.rigged && this.rigCfg?.death;
    if (deathClip && this.rigged.has(deathClip)) {
      // 死亡 clip 末帧定格（已在播放则不重启；组变换不再叠加）
      if (this.rigged.currentName !== deathClip) this.rigged.play(deathClip, { loop: false, fade: 0.2, timeScale: 1.0 });
      return;
    }
    const g = this.group;
    switch (type) {
      case 'slump':   // 坐姿垮下（头垂、手垂）
        this.seated = true;
        this.legs.rotation.x = -Math.PI / 2;
        g.position.y = this.pos.y - 0.42;
        this.body.rotation.x = 0.22;
        this.head.rotation.x = 0.75;
        this.head.rotation.z = 0.15;
        this.armL.rotation.x = 0.1;
        this.armR.rotation.x = this.spec.tray ? -1.15 : 0.1;
        break;
      case 'prone':   // 俯卧
        g.rotation.x = Math.PI / 2;
        g.position.y = this.pos.y + 0.12;
        this.head.rotation.x = -0.2;
        this.head.rotation.z = 0.4;
        break;
      case 'back':    // 仰卧（床上）
        g.rotation.x = -Math.PI / 2;
        g.position.y = this.pos.y + 0.12;
        this.head.rotation.x = 0.1;
        break;
      case 'hang':    // 悬吊剪影（脚离地、头侧垂）
        g.position.y = this.pos.y + 0.38;
        this.head.rotation.z = 0.42;
        this.head.rotation.x = 0.25;
        this.armL.rotation.x = 0.05;
        this.armR.rotation.x = 0.05;
        this.body.rotation.x = 0.04;
        break;
    }
  }
}

export class NPCManager {
  static async create(scene, characters) {
    const kids = characters.map((c) => c.modelHint?.kenney).filter(Boolean);
    const lib = await KenneyLib.load(kids);
    // 骨骼动画角色（立绘平面投影贴图；夜奔段另有黑化剪影实例，互不影响）
    lib.rigged = {};
    for (const [id, def] of Object.entries(RIGGED_DEFS)) {
      try {
        lib.rigged[id] = await RiggedActor.load(def.dir, def.files, { tint: 0x1a1a20 });
      } catch (e) {
        console.warn(`[rigged ${id}] 日常骨骼加载失败，退回 kenney 模型`, e);
      }
    }
    // 沃格雷夫无原生坐姿 clip：借隆巴德同骨架 Chair_Sit_Idle_M 重定向
    // （两者 26/26 节点、24/24 动画轨道同名，clip 可直接按名绑定）
    try {
      const wg = lib.rigged.wargrave, lm = lib.rigged.lombard;
      const clip = lm?.items.Chair_Sit_Idle_M?.action?.getClip();
      if (wg && clip && !wg.has('Chair_Sit_Idle_M')) {
        const g = await new GLTFLoader().loadAsync(RIGGED_DEFS.wargrave.dir + RIGGED_DEFS.wargrave.files.walking);
        wg.addClipModel('Chair_Sit_Idle_M', g.scene, clip);
      }
    } catch (e) { console.warn('[rigged wargrave] 借用坐姿失败，维持站姿下沉', e); }
    // ch9 海滩对峙借用（同骨架）：隆巴德←维拉受击反应；维拉←隆巴德持枪戒备
    try {
      const lm = lib.rigged.lombard, vr = lib.rigged.vera;
      if (lm && vr) {
        const pClip = vr.items.punch?.action?.getClip();
        if (pClip && !lm.has('punch_react')) {
          const g = await new GLTFLoader().loadAsync(RIGGED_DEFS.lombard.dir + RIGGED_DEFS.lombard.files.Walking);
          lm.addClipModel('punch_react', g.scene, pClip);
        }
        const hClip = lm.items.parry?.action?.getClip();
        if (hClip && !vr.has('parry_hold')) {
          const g = await new GLTFLoader().loadAsync(RIGGED_DEFS.vera.dir + RIGGED_DEFS.vera.files.Walking_Woman);
          vr.addClipModel('parry_hold', g.scene, hClip);
        }
      }
    } catch (e) { console.warn('[rigged] ch9 对峙借用失败', e); }
    // 统一立绘投影材质（含借用模型）
    for (const [id, def] of Object.entries(RIGGED_DEFS)) {
      const rig = lib.rigged[id];
      if (!rig) continue;
      const tex = new THREE.TextureLoader().load(def.dir + 'tex_fullbody.jpg');
      tex.flipY = false;
      tex.colorSpace = THREE.SRGBColorSpace;
      rig.applyPortraitProjection(tex, { marginX: 0.04 });   // 收缩采样防手臂取到立绘灰底（维拉灰臂）
      rig.group.visible = false;
      scene.add(rig.group);
    }
    return new NPCManager(scene, characters, lib);
  }
  constructor(scene, characters, kenneyLib = null) {
    this.scene = scene;
    this.kenneyLib = kenneyLib;
    this.npcs = new Map();
    for (const def of characters) {
      if (def.id === 'player') continue;
      this.npcs.set(def.id, new NPC(def, scene, kenneyLib));
    }
  }
  get(id) { return this.npcs.get(id); }
  setLabelsVisible(v) {
    for (const n of this.npcs.values()) if (n.label) n.label.visible = v;
  }
  remove(id) {
    const n = this.npcs.get(id);
    if (n) n.setRemoved();
  }
  // 距 (x,z) 最近且在 maxD 内的 NPC（同楼层 |Δy|<2）
  nearest(x, y, z, maxD = 2.4) {
    let best = null, bd = maxD;
    for (const n of this.npcs.values()) {
      if (n.removed || n.dead) continue;
      if (Math.abs(n.pos.y - y) > 2) continue;
      const d = Math.hypot(n.pos.x - x, n.pos.z - z);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }
  // 玩家胶囊体 vs NPC 圆柱推出
  collide(feet, radius) {
    for (const n of this.npcs.values()) {
      if (n.removed || n.dead) continue;
      if (Math.abs(n.pos.y - feet.y) > 2) continue;
      const dx = feet.x - n.pos.x, dz = feet.z - n.pos.z;
      const d2 = dx * dx + dz * dz, rr = radius + 0.32;
      if (d2 < rr * rr && d2 > 1e-6) {
        const d = Math.sqrt(d2), push = (rr - d) / d;
        feet.x += dx * push; feet.z += dz * push;
      }
    }
  }
  update(dt, t, playerPos) {
    for (const n of this.npcs.values()) {
      if (playerPos && !n.removed && !n.permaHidden) {
        n.group.visible = n.pos.distanceTo(playerPos) < 48;
      }
      n.update(dt, t);
    }
  }
}
