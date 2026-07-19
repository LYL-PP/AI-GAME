// schedule.js —— 日程状态机：schedules.json 驱动 NPC 位置/动作 + 室内航点寻路
import * as THREE from '../vendor/three.module.js';
import { GeoBatch, MAT, armchair } from '../world/props.js';
import { sofaInstance } from '../world/sceneProps.js';

const F1 = 1.8, F2 = 5.0, F3 = 8.2;

// 客房中心（与 villa.js 布局一致）
const BEDROOMS = {
  bedroom_macarthur: [-6, -4.75], bedroom_wargrave: [-2, -4.75], bedroom_armstrong: [2, -4.75],
  bedroom_blore: [6, -4.75], bedroom_rogers: [10, -4.75],
  bedroom_vera: [-6, 4.75], bedroom_marston: [-2, 4.75], bedroom_brent: [2, 4.75],
  bedroom_lombard: [6, 4.75], bedroom_player: [10, 4.75],
};
const NPC_BEDROOM = {
  wargrave: 'bedroom_wargrave', vera: 'bedroom_vera', lombard: 'bedroom_lombard',
  armstrong: 'bedroom_armstrong', blore: 'bedroom_blore', macarthur: 'bedroom_macarthur',
  brent: 'bedroom_brent', rogers: 'bedroom_rogers', mrs_rogers: 'bedroom_rogers', marston: 'bedroom_marston',
};

// 楼梯航点（walk_test 验证路径）
const STAIRS_L12 = [[-9, 1.55], [-11, 1.7], [-11, 0], [-11, -1.2], [-11, -2.2], [-9, -2.5], [-9, -0.4], [-8.6, 0.5]];
const STAIRS_L23 = [[-9, 1.5], [-11, 1.25], [-11, 0], [-11, -1.2], [-11, -2.2], [-9, -2.5], [-9, -0.4], [-8.6, 0.5]];

// 区域图边：via 为穿越点
const EDGES = [
  ['hall', 'terrace', [[0, 8.5]]],
  ['hall', 'dining', [[8, 3.65]]],
  ['hall', 'rearhall', [[0, -2]]],
  ['hall', 'butler', [[-8, 5.1]]],
  ['hall', 'stair1', [[-8.3, 1.45]]],
  ['rearhall', 'kitchen', [[8, -4.9]]],
  ['rearhall', 'outdoor', [[0, -8.5]]],
  ['terrace', 'outdoor', [[0, 13.5]]],
  ['stair1', 'corridor2', STAIRS_L12, 'stairs'],
  ['corridor2', 'bathroom', [[-10, 1.5]]],
  ['corridor2', 'stair3', STAIRS_L23, 'stairs'],
  ['stair3', 'study', [[-8, 0.5]]],
  ['study', 'storage', [[8, 0.5]]],
];
for (const [id, [cx, cz]] of Object.entries(BEDROOMS)) {
  EDGES.push(['corridor2', id, [[cx, cz < 0 ? -1.5 : 1.5]]]);
}

const HUBS = { hall: [-1, 5], rearhall: [0, -5], corridor2: [2, 0], study: [0, 0] };

function zoneOf(x, y, z) {
  if (y < 4.5) {
    if (z > 8 && z < 13.5 && x > -10.5 && x < 10.5) return 'terrace';
    if (x >= -8 && x <= 8) { if (z >= -2 && z <= 8) return 'hall'; if (z >= -8 && z < -2) return 'rearhall'; }
    if (x > 8 && x <= 12) { if (z >= -2 && z <= 8) return 'dining'; if (z >= -8 && z < -2) return 'kitchen'; }
    if (x >= -12 && x < -8) { if (z >= 2 && z <= 8) return 'butler'; if (z >= -8 && z < 2) return 'stair1'; }
    return 'outdoor';
  }
  if (y < 7) {
    if (x >= -12 && x < -8 && z >= -8 && z < 2) return 'stair2';
    if (x >= -12 && x < -8 && z >= 1.5) return 'bathroom';
    for (const [id, [cx, cz]] of Object.entries(BEDROOMS))
      if (Math.abs(x - cx) <= 2 && Math.abs(z - cz) <= 3.3 && Math.sign(cz) === Math.sign(z) && Math.abs(z) > 1.5) return id;
    return 'corridor2';
  }
  if (x >= -12 && x < -8 && z >= -8 && z < 2) return 'stair3';
  if (x > 8) return 'storage';
  return 'study';
}

export class ScheduleManager {
  constructor(scene, collision, npcManager, schedulesData, placesData) {
    this.scene = scene;
    this.col = collision;
    this.mgr = npcManager;
    this.data = schedulesData;
    this.places = placesData;
    this.states = new Map();  // npcId → {entries, idx, dwell, route, mode}
    this.chapter = 0;
    this.islandWalkPts = [[18, 20], [38, 0], [22, -28], [-8, -34], [-30, -12], [-34, 14], [-12, 30]];
    this.buildExtraProps();
    // poi 符号 → 静态坐标（y 运行时按地面取）
    this.pois = {
      hall_fireplace: { x: -5, z: 0.4, y: F1, yaw: 0 },
      hall_armchair: { x: -2.5, z: 5.5, y: F1, yaw: 2.6, seat: true },
      hall_window_chair: { x: -5.5, z: 6.3, y: F1, yaw: 0.35, seat: true },
      hall_table: { x: 4.4, z: 3.6, y: F1, yaw: -1.6 },
      hall_bar: { x: -6.8, z: -0.2, y: F1, yaw: -Math.PI / 2 },
      hall_sofa: { x: 6.3, z: 6.4, y: F1, yaw: 0, seat: true },
      dining_table: { x: 9.2, z: 4.3, y: F1, yaw: -0.6 },
      kitchen_stove: { x: 10.6, z: -4.6, y: F1, yaw: -Math.PI / 2 },
      butler_pantry: { x: -10, z: 6.6, y: F1, yaw: 0 },
      terrace_sea: { x: 0, z: 11.3, y: F1, yaw: Math.PI },
      corridor_f2: { x: 0, z: 0, y: F2, yaw: Math.PI / 2, pace: [5, 0] },
      bathroom_f2: { x: -10, z: 4.5, y: F2, yaw: 0 },
      study_armchair: { x: 2.5, z: 5.0, y: F3, yaw: -2.3, seat: true },
      study_books: { x: 0, z: -7.1, y: F3, yaw: 0 },
      storage_f3: { x: 10, z: -1.5, y: F3, yaw: 0 },
      porch: { x: 0, z: 9.6, y: F1, yaw: Math.PI },
      dock_end: { x: 0, z: 103, y: 1.25, yaw: Math.PI },
      cape_bench: { x: 0, z: -77.1, yaw: Math.PI, seat: true },
      woodshed_block: { x: -19.2, z: 3.2, yaw: 0.5 },
      beach_mid: { x: 44, z: 50, yaw: -2.2 },
      cliff_path_mid: { x: -14, z: -20, yaw: 0.8 },
      island_walk: { roam: true },
    };
  }

  // 大厅补充道具：吧台、摇椅、双人沙发
  buildExtraProps() {
    const g = new THREE.Group();
    // 吧台（西墙）
    const bar = new GeoBatch();
    bar.box(0.65, 1.0, 2.2, -7.55, F1 + 0.5, -0.2);
    bar.box(0.75, 0.06, 2.35, -7.55, F1 + 1.03, -0.2);
    g.add(bar.mesh(MAT.redWood, { cast: true }));
    const bottles = new GeoBatch();
    [[-7.5, -0.9], [-7.6, -0.5], [-7.45, 0.1], [-7.6, 0.45]].forEach(([x, z], i) => {
      bottles.add(new THREE.CylinderGeometry(0.045, 0.05, 0.28, 8), new THREE.Matrix4().setPosition(x, F1 + 1.2, z));
    });
    g.add(bottles.mesh(MAT.green));
    this.col.addBox(-7.95, F1, -1.35, -7.15, F1 + 1.05, 0.95);
    // 摇椅（布伦特专座，靠窗；sofa.glb 单人位替换方块扶手椅，坐向对齐落座 yaw）
    const rocker = sofaInstance(1.1);
    if (rocker) {
      rocker.position.set(-5.5, F1, 6.3);
      rocker.rotation.y = 0.35 + Math.PI;
      g.add(rocker);
    } else {
      const rk = armchair(MAT.redWood);
      rk.position.set(-5.5, F1, 6.3);
      rk.rotation.y = 0.35;
      g.add(rk);
    }
    this.col.addBox(-6.05, F1, 5.85, -4.95, F1 + 0.95, 6.75);
    // 双人沙发（南墙侧；sofa.glb 双人位替换暗红方块，座面中心对齐 poi (6.3, 6.4)）
    const sofa2 = sofaInstance(1.8);
    if (sofa2) {
      sofa2.position.set(6.3, F1, 6.55);
      sofa2.rotation.y = Math.PI;
      g.add(sofa2);
    } else {
      const sofa = new GeoBatch();
      sofa.box(1.5, 0.32, 0.66, 6.3, F1 + 0.28, 6.55);
      sofa.box(1.5, 0.62, 0.18, 6.3, F1 + 0.62, 6.86);
      sofa.box(0.16, 0.32, 0.62, 5.63, F1 + 0.52, 6.55);
      sofa.box(0.16, 0.32, 0.62, 6.97, F1 + 0.52, 6.55);
      g.add(sofa.mesh(MAT.clothRed, { cast: true }));
    }
    this.col.addBox(5.4, F1, 5.85, 7.2, F1 + 1.05, 7.25);
    this.scene.add(g);
  }

  // poi 符号 → {x, y, z, yaw, seat}
  poiPoint(sym, npcId) {
    if (sym === 'bedroom_own') {
      const bd = BEDROOMS[NPC_BEDROOM[npcId]] || [0, 0];
      return { x: bd[0], y: F2, z: bd[1], yaw: bd[1] < 0 ? Math.PI : 0 };
    }
    const p = this.pois[sym];
    if (!p) return { x: 0, y: 1.5, z: 20, yaw: 0 };
    if (p.roam) return { roam: true };
    const y = p.y !== undefined ? p.y : this.col.groundAt(p.x, p.z, 50);
    return { x: p.x, y, z: p.z, yaw: p.yaw || 0, seat: p.seat, pace: p.pace };
  }

  // 区域寻路：fromPt/toPt {x,y,z} → 航点数组
  route(a, b) {
    const za = zoneOf(a.x, a.y, a.z), zb = zoneOf(b.x, b.y, b.z);
    if (za === zb) return [{ x: b.x, z: b.z }];
    // BFS
    const adj = new Map();
    for (const [z1, z2, via, kind] of EDGES) {
      if (!adj.has(z1)) adj.set(z1, []);
      if (!adj.has(z2)) adj.set(z2, []);
      adj.get(z1).push({ to: z2, via, kind });
      adj.get(z2).push({ to: z1, via: [...via].reverse(), kind });
    }
    const prev = new Map([[za, null]]);
    const q = [za];
    while (q.length) {
      const z = q.shift();
      if (z === zb) break;
      for (const e of adj.get(z) || []) {
        if (!prev.has(e.to)) { prev.set(e.to, { from: z, edge: e }); q.push(e.to); }
      }
    }
    if (!prev.has(zb)) return [{ x: b.x, z: b.z }];
    const zones = [];
    for (let z = zb; z; z = prev.get(z)?.from) zones.unshift(z);
    const pts = [];
    for (let i = 0; i < zones.length - 1; i++) {
      const rec = prev.get(zones[i + 1]);
      for (const [vx, vz] of rec.edge.via) pts.push({ x: vx, z: vz });
    }
    pts.push({ x: b.x, z: b.z });
    return pts;
  }

  entriesFor(npcId, chapter) {
    const sch = this.data.schedules[npcId];
    if (!sch) return null;
    for (let c = chapter; c >= 0; c--) {
      if (sch[String(c)]) return sch[String(c)];
    }
    return null;
  }

  applyChapter(n) {
    this.chapter = n;
    for (const [id, npc] of this.mgr.npcs) {
      if (npc.removed) continue;
      const entries = this.entriesFor(id, n);
      if (!entries) continue;
      const st = { entries, idx: 0, dwell: 2, route: null, mode: 'go', paceDir: 1, roamIdx: 0 };
      this.states.set(id, st);
      this.sendTo(npc, st, 0, true);
    }
  }

  targetPoint(st, npc, i) {
    const e = st.entries[i];
    return { entry: e, pt: this.poiPoint(e.poi, npc.id) };
  }

  sendTo(npc, st, i, teleport = false) {
    const { entry, pt } = this.targetPoint(st, npc, i);
    st.current = { entry, pt };
    npc.walking = false;
    if (pt.roam) { st.mode = 'roam'; st.route = null; return; }
    if (teleport) {
      npc.place(pt.x, pt.y, pt.z, pt.yaw || 0);
      npc.setAction(entry.action);
      st.mode = entry.pace || pt.pace ? 'pace' : 'dwell';
      st.dwell = 14 + Math.random() * 16;
      st.route = null;
      return;
    }
    st.route = this.route({ x: npc.pos.x, y: npc.pos.y, z: npc.pos.z }, pt);
    st.routeIdx = 0;
    st.mode = 'walk';
    npc.walking = true;
    npc.setAction('walk');
  }

  update(dt) {
    for (const [id, st] of this.states) {
      const npc = this.mgr.get(id);
      if (!npc || npc.removed || npc.prologueLock) continue;
      if (st.mode === 'walk' && st.route) {
        const tp = st.route[st.routeIdx];
        const dx = tp.x - npc.pos.x, dz = tp.z - npc.pos.z;
        const d = Math.hypot(dx, dz);
        const sp = 1.15 * dt;
        if (d < Math.max(0.12, sp)) {
          st.routeIdx++;
          if (st.routeIdx >= st.route.length) {
            const { entry, pt } = st.current;
            npc.walking = false;
            npc.place(pt.x, pt.y, pt.z, pt.yaw || 0);
            npc.setAction(entry.action);
            st.mode = entry.pace || pt.pace ? 'pace' : 'dwell';
            st.dwell = 14 + Math.random() * 16;
            continue;
          }
        } else {
          npc.pos.x += (dx / d) * sp;
          npc.pos.z += (dz / d) * sp;
          npc.pos.y = this.col.groundAt(npc.pos.x, npc.pos.z, npc.pos.y);
          npc.yaw = Math.atan2(-dx, -dz);
          npc.group.position.copy(npc.pos);
          npc.group.rotation.y = npc.yaw;
        }
      } else if (st.mode === 'pace' && st.current) {
        // 踱步：在 poi 点附近沿指定轴往返
        const { pt } = st.current;
        const [ax] = pt.pace || [3, 0];
        npc.pos.x += st.paceDir * 0.55 * dt;
        if (Math.abs(npc.pos.x - pt.x) > ax) st.paceDir *= -1;
        npc.yaw = st.paceDir > 0 ? -Math.PI / 2 : Math.PI / 2;
        npc.pos.y = this.col.groundAt(npc.pos.x, npc.pos.z, npc.pos.y);
        npc.group.position.copy(npc.pos);
        npc.group.rotation.y = npc.yaw;
        npc.walking = true;
        st.dwell -= dt;
        if (st.dwell <= 0) { npc.walking = false; this.next(npc, st); }
      } else if (st.mode === 'roam') {
        const wp = this.islandWalkPts[st.roamIdx];
        const dx = wp[0] - npc.pos.x, dz = wp[1] - npc.pos.z;
        const d = Math.hypot(dx, dz);
        const sp = 1.2 * dt;
        if (d < Math.max(0.3, sp)) st.roamIdx = (st.roamIdx + 1) % this.islandWalkPts.length;
        else {
          npc.pos.x += (dx / d) * sp;
          npc.pos.z += (dz / d) * sp;
          npc.pos.y = this.col.groundAt(npc.pos.x, npc.pos.z, npc.pos.y);
          npc.yaw = Math.atan2(-dx, -dz);
          npc.group.position.copy(npc.pos);
          npc.group.rotation.y = npc.yaw;
          npc.walking = true;
        }
      } else { // dwell
        st.dwell -= dt;
        if (st.dwell <= 0) this.next(npc, st);
      }
    }
  }

  next(npc, st) {
    if (st.entries.length < 2) { st.dwell = 30; return; }
    st.idx = (st.idx + 1) % st.entries.length;
    this.sendTo(npc, st, st.idx);
  }
}
