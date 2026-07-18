// prologue.js —— 序章晚餐戏：门廊触发 → 全员入席 → 留声机指控 → 昏厥 → 恢复
import * as THREE from '../vendor/three.module.js';

const F1 = 1.8;
const TABLE = { x: 2.5, z: 4.0, r: 1.95 };
const GRAM = { x: 4.6, y: F1 + 0.9, z: -0.9 };
const NPC_ORDER = ['wargrave', 'vera', 'lombard', 'armstrong', 'blore', 'macarthur', 'brent', 'rogers', 'mrs_rogers', 'marston'];
const PLAYER_SEAT = 3; // 圆桌 11 椅中的玩家座位
const REACT = {
  marston: 'shrug', rogers: 'stiffen', mrs_rogers: 'tremble', macarthur: 'sigh',
  brent: 'stiffen', wargrave: 'still', armstrong: 'tremble', blore: 'lookaround',
  lombard: 'smirk', vera: 'flinch',
};

function seatPos(i) {
  const a = (i * Math.PI * 2) / 11;
  const x = TABLE.x + Math.cos(a) * TABLE.r;
  const z = TABLE.z + Math.sin(a) * TABLE.r;
  return { x, z, yaw: Math.atan2(-(TABLE.x - x), -(TABLE.z - z)) };
}

export class Prologue {
  // o: { scene, camera, player, mgr, schedule, weather, save, acc (accusation.json), ui, dom }
  constructor(o) {
    Object.assign(this, o);
    this.state = 'idle';   // idle → gather → await_sit → take_seat → cine → faint → restore → done
    this.t = 0;
    this.movers = new Map();
    this.cam = null;       // {fp, tp, fl, tl, t, dur}
    this.sub = null;       // {full, shown}
    this.stepQueue = [];
    this.step = null;
    this.hold = 0;
    this.el = {
      bars: [document.getElementById('cineTop'), document.getElementById('cineBottom')],
      sub: document.getElementById('cineSub'),
      subSpeaker: document.getElementById('cineSpeaker'),
      subText: document.getElementById('cineText'),
    };
    this.seatOf = {};
    NPC_ORDER.forEach((id, k) => { this.seatOf[id] = [0, 1, 2, 4, 5, 6, 7, 8, 9, 10][k]; });
  }

  get active() { return !['idle', 'done'].includes(this.state); }
  get cineActive() { return ['take_seat', 'cine', 'faint'].includes(this.state); }

  // ---------- 相机 ----------
  camTo(px, py, pz, lx, ly, lz, dur = 1.6) {
    const c = this.camera;
    this.cam = {
      fp: c.position.clone(), tp: new THREE.Vector3(px, py, pz),
      fl: this._look ? this._look.clone() : new THREE.Vector3(0, 0, -1).applyQuaternion(c.quaternion).add(c.position),
      tl: new THREE.Vector3(lx, ly, lz), t: 0, dur,
    };
  }
  stepCam(dt) {
    const c = this.cam;
    if (!c) return;
    c.t = Math.min(c.dur, c.t + dt);
    const k = c.t / c.dur, e = k * k * (3 - 2 * k);
    this.camera.position.lerpVectors(c.fp, c.tp, e);
    this._look = new THREE.Vector3().lerpVectors(c.fl, c.tl, e);
    this.camera.lookAt(this._look);
    if (c.t >= c.dur) this.cam = null;
  }

  // ---------- 流程 ----------
  gather() {
    this.state = 'gather';
    this.ui.toast('晚宴已备好——请入席');
    for (const id of NPC_ORDER) {
      const npc = this.mgr.get(id);
      if (!npc) continue;
      npc.prologueLock = true;
      const s = seatPos(this.seatOf[id]);
      const route = this.schedule.route({ x: npc.pos.x, y: npc.pos.y, z: npc.pos.z }, { x: s.x, y: F1, z: s.z });
      this.movers.set(id, { npc, route, idx: 0, seat: s, timeout: 20 });
    }
  }

  seatAll(teleport = false) {
    for (const [id, m] of this.movers) {
      if (teleport) {
        m.npc.place(m.seat.x, F1, m.seat.z, m.seat.yaw);
        m.npc.setAction('sit');
        this.movers.delete(id);
      }
    }
  }

  takeSeat() {
    this.state = 'take_seat';
    this.player.enabled = false;
    this.mgr.setLabelsVisible(false);
    const s = seatPos(PLAYER_SEAT);
    this._playerSeat = s;
    this.camTo(s.x, F1 + 1.02, s.z, TABLE.x, F1 + 0.75, TABLE.z, 1.5);
    this.ui.setPoi(null);
    this.el.bars.forEach((b) => b.classList.add('show'));
    setTimeout(() => this.startCine(), 1700);
  }

  startCine() {
    this.state = 'cine';
    // 灯光骤暗
    const refs = this.weather.refs;
    refs.hemi.intensity *= 0.22;
    refs.sun.intensity *= 0.1;
    for (const L of refs.indoor.ceiling) L.intensity *= 0.06;
    refs.indoor.fire.intensity *= 0.5;
    // 步骤队列
    const A = this.acc.accusation;
    this.stepQueue = [
      { kind: 'intro', text: A.scriptIntro },
      ...A.charges.map((c) => ({ kind: 'charge', ...c })),
      { kind: 'outro', text: A.scriptOutro },
      { kind: 'faint' },
    ];
    this.nextStep();
  }

  nextStep() {
    this.step = this.stepQueue.shift();
    if (!this.step) { this.restore(); return; }
    const s = this.step;
    if (s.kind === 'intro') {
      this.camTo(3.3, F1 + 1.5, 1.0, GRAM.x, GRAM.y, GRAM.z, 1.8);
      this.say('留声机', s.text);
    } else if (s.kind === 'charge') {
      if (s.targetId === 'player') {
        const ps = this._playerSeat;
        this.camTo(ps.x, F1 + 1.02, ps.z, GRAM.x, GRAM.y, GRAM.z, 1.4);
      } else {
        const tgt = this.mgr.get(s.targetId);
        const seat = seatPos(this.seatOf[s.targetId]);
        let look = { x: seat.x, y: F1 + 1.0, z: seat.z };
        if (s.jointWith) {
          const s2 = seatPos(this.seatOf[s.jointWith]);
          look = { x: (seat.x + s2.x) / 2, y: F1 + 1.0, z: (seat.z + s2.z) / 2 };
          const n2 = this.mgr.get(s.jointWith);
          n2?.playReaction(REACT[s.jointWith] || 'stiffen', 6);
        }
        this.camTo(
          look.x + (TABLE.x - look.x) * 0.55, F1 + 1.35, look.z + (TABLE.z - look.z) * 0.55,
          look.x, look.y, look.z, 1.3
        );
        tgt?.playReaction(REACT[s.targetId] || 'stiffen', 6);
      }
      this.say('留声机', s.text);
    } else if (s.kind === 'outro') {
      this.camTo(3.3, F1 + 1.5, 1.0, GRAM.x, GRAM.y, GRAM.z, 1.5);
      this.say('留声机', s.text);
    } else if (s.kind === 'faint') {
      this.state = 'faint';
      const mrs = this.mgr.get('mrs_rogers');
      const rog = this.mgr.get('rogers');
      mrs?.setAction('faint');
      const ms = seatPos(this.seatOf.mrs_rogers);
      this.camTo(ms.x + (TABLE.x - ms.x) * 0.5, F1 + 1.3, ms.z + (TABLE.z - ms.z) * 0.5, ms.x, F1 + 0.5, ms.z, 1.2);
      this.say('', '（罗杰斯太太滑下了椅子。）');
      if (rog) {
        rog.setAction('idle');
        const route = this.schedule.route({ x: rog.pos.x, y: F1, z: rog.pos.z }, { x: ms.x + 0.7, y: F1, z: ms.z + 0.3 });
        this.movers.set('rogers', { npc: rog, route, idx: 0, seat: null, timeout: 8, then: () => rog.playReaction('bowhead', 10) });
      }
      this.hold = 5.0;
    }
  }

  say(speaker, text) {
    if (speaker === '留声机') window.AudioAPI?.speak?.(text);
    this.el.subSpeaker.textContent = speaker;
    this.sub = { full: text, shown: 0, speed: 26 };
    this.el.subText.textContent = '';
    this.el.sub.classList.add('show');
  }

  restore() {
    this.state = 'restore';
    this.weather.setChapter(this.weather.getChapter()); // 恢复预设灯光
    this.el.bars.forEach((b) => b.classList.remove('show'));
    this.el.sub.classList.remove('show');
    // 玩家起身（显式指定大厅地面，避免落到上层楼板）
    const s = this._playerSeat || seatPos(PLAYER_SEAT);
    this.player.enabled = true;
    this.player.spawn(s.x, s.z + 0.9, Math.atan2(-(TABLE.x - s.x), -(TABLE.z - s.z)), F1);
    // 解锁 NPC 日程
    for (const id of NPC_ORDER) {
      const npc = this.mgr.get(id);
      if (npc) npc.prologueLock = false;
    }
    this.mgr.setLabelsVisible(true);
    this.movers.clear();
    this.save.setPrologueDone();
    this.state = 'done';
  }

  skipAll() {
    if (this.state === 'done') return;
    this.movers.clear();
    for (const id of NPC_ORDER) {
      const npc = this.mgr.get(id);
      if (npc) npc.prologueLock = false;
    }
    this.mgr.setLabelsVisible(true);
    this.el.bars.forEach((b) => b.classList.remove('show'));
    this.el.sub.classList.remove('show');
    this.weather.setChapter(this.weather.getChapter());
    if (this.player) this.player.enabled = true;
    this.state = 'done';
  }

  // E 键：入座 / 跳过当前运镜段
  onE() {
    if (this.state === 'await_sit') {
      const s = seatPos(PLAYER_SEAT);
      const p = this.player.feet;
      if (Math.hypot(p.x - s.x, p.z - s.z) < 2.6) { this.takeSeat(); return true; }
      return false;
    }
    if (this.cineActive) {
      if (this.cam) { this.cam.t = this.cam.dur; return true; }
      if (this.sub) { this.sub.shown = this.sub.full.length; this.el.subText.textContent = this.sub.full; this.sub = null; this.hold = 0.3; return true; }
      this.hold = 0;
      return true;
    }
    if (this.state === 'faint') { this.hold = 0; return true; }
    return false;
  }

  wantsE() { return this.state === 'await_sit' || this.cineActive || this.state === 'faint'; }

  update(dt) {
    // 门廊触发
    if (this.state === 'idle') {
      const p = this.player.feet;
      if (Math.hypot(p.x - 0, p.z - 9.6) < 3.4) this.gather();
      return;
    }
    if (this.state === 'done') return;

    // 相机运镜
    this.stepCam(dt);

    // NPC  movers（入席/罗杰斯）
    for (const [id, m] of [...this.movers]) {
      const { npc, route } = m;
      m.timeout -= dt;
      if (m.timeout <= 0) { // 超时降级：瞬移
        npc.walking = false;
        if (m.seat) { npc.place(m.seat.x, F1, m.seat.z, m.seat.yaw); npc.setAction('sit'); }
        m.then?.();
        this.movers.delete(id);
        continue;
      }
      const tp = route[m.idx];
      if (!tp) {
        npc.walking = false;
        if (m.seat) { npc.place(m.seat.x, F1, m.seat.z, m.seat.yaw); npc.setAction('sit'); }
        m.then?.();
        this.movers.delete(id);
        continue;
      }
      const dx = tp.x - npc.pos.x, dz = tp.z - npc.pos.z;
      const d = Math.hypot(dx, dz);
      const sp = 1.35 * dt;
      if (d < Math.max(0.1, sp)) m.idx++;
      else {
        npc.pos.x += (dx / d) * sp;
        npc.pos.z += (dz / d) * sp;
        npc.pos.y = this.schedule.col.groundAt(npc.pos.x, npc.pos.z, npc.pos.y);
        npc.yaw = Math.atan2(-dx, -dz);
        npc.group.position.copy(npc.pos);
        npc.group.rotation.y = npc.yaw;
        npc.walking = true;
      }
    }

    if (this.state === 'gather') {
      if (this.movers.size === 0) {
        this.state = 'await_sit';
        this.ui.setPoi({ id: '__seat', nameplate: '晚餐', sub: '走近你的座位，按 E 入座' });
      }
      return;
    }

    // 字幕打字机与推进
    if (this.sub) {
      this.sub.shown = Math.min(this.sub.full.length, this.sub.shown + this.sub.speed * dt);
      this.el.subText.textContent = this.sub.full.slice(0, Math.floor(this.sub.shown));
      if (this.sub.shown >= this.sub.full.length) { this.sub = null; this.hold = 1.5; }
      return;
    }
    if (this.state === 'cine') {
      if (this.cam) return;
      this.hold -= dt;
      if (this.hold <= 0) this.nextStep();
    } else if (this.state === 'faint') {
      this.hold -= dt;
      if (this.hold <= 0) this.restore();
    }
  }
}
