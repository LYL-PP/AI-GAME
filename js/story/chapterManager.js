// chapterManager.js —— 章节流程：自由探索 → 死亡触发 → 现场 → 结算 → 下一章
import * as THREE from '../vendor/three.module.js';

const F1 = 1.8;
// mapPing → 地名（优先 places.json 名牌；porch 为系统补充）
const PING_ALIAS = { porch: '门廊', dining: '餐厅', hall: '大厅', study: '书房' };

export class ChapterManager {
  // o: { scene, camera, player, mgr, schedule, weather, save, ui, data:{deaths, uiData, places}, figurines, deathScenes, clues, setChapter }
  constructor(o) {
    Object.assign(this, o);
    this.state = 'idle';   // idle/explore/event/await/scene/settling/finale
    this.chapter = 0;
    this.timer = 0;
    this.sceneTimer = 0;
    this.current = null;   // {spot, victimId}
    this.lockSpot = null;
    this.movers = new Map();
    this.eventStep = null;
    this.names = {};
    // mapPing → 显示名
    for (const c of o.data.places.commonRooms) this.names[c.id] = c.nameplate;
    for (const b of o.data.places.bedrooms) this.names[b.id] = b.nameplate + '的房间';
    for (const p of o.data.places.pois) this.names[p.id] = p.nameplate;
    Object.assign(this.names, PING_ALIAS);
  }

  begin(chapter) {
    this.chapter = chapter;
    this.chapterStarted = true;
    if (chapter >= 11) { this._finale(); return; }
    this.state = 'explore';
    this.timer = 90 + Math.random() * 90;
    this.current = null;
    this.lockSpot = null;
    // 第 1 章：马尔斯顿到场（餐厅敬酒位）
    if (chapter === 1) {
      const m = this.mgr.get('marston');
      if (m && !m.dead) {
        this.schedule.states.delete('marston');
        m.place(9.2, F1, 4.3, -0.6);
        m.setAction('idle');
      }
    }
    // 第 9 章起：沃格雷夫假死现场清理（“尸体”消失）
    if (chapter >= 9) this.deathScenes.cleanup(6);
    this.save.setChapter(chapter);
  }

  deathDef() { return this.data.deaths[this.chapter - 1]; }

  triggerDeath() {
    if (this.state !== 'explore' || this.chapter < 1 || this.chapter > 10) return false;
    const def = this.deathDef();
    this.current = this.deathScenes.build(this.chapter, def.victimId);
    const ping = def.cue?.mapPing;
    this.guideText = '前往' + (this.names[ping] || ping);
    if (def.presentation === 'onscreen') this._eventMarston();
    else if (def.presentation === 'distant_witness') this._eventLombard();
    else this.state = 'await';
    window.AudioAPI?.play?.(def.cue?.sound);
    return true;
  }

  // 第 1 章：当众呛咳（骨骼模型走 Dead clip；旧模型走 choke 反应）
  _eventMarston() {
    this.state = 'event';
    this.eventStep = { kind: 'marston', t: 0, deadStarted: false };
    const m = this.mgr.get('marston');
    if (m?.rigged && m.rigCfg?.death) return; // 由 _updateEvent 按节奏触发
    m?.playReaction('choke', 2.6);
  }

  // 第 9 章：海滩远观对峙
  _eventLombard() {
    this.state = 'event';
    this.eventStep = { kind: 'lombard', t: 0, shot: false, veraLeft: false };
    const v = this.mgr.get('vera');
    const l = this.mgr.get('lombard');
    this.schedule.states.delete('vera');
    this.schedule.states.delete('lombard');
    const gy = this.current.spot.y;
    v?.place(43.2, gy, 49.0, 0.9);
    v?.setAction('idle');
    l?.place(45.6, gy, 50.6, -2.3);
    l?.setAction('idle');
    // 距离限制：玩家不可靠近 26m 内
    this.lockSpot = { x: 44.5, z: 50, r: 26 };
  }

  // 附近 2-3 名存活 NPC 赶到
  _sendWitnesses() {
    const spot = this.current.spot;
    const living = [...this.mgr.npcs.values()].filter((n) => !n.dead && !n.removed && n.id !== this.current.victimId);
    living.sort((a, b) =>
      Math.hypot(a.pos.x - spot.x, a.pos.z - spot.z) - Math.hypot(b.pos.x - spot.x, b.pos.z - spot.z));
    const reactions = ['tremble', 'bowhead', 'lookaround'];
    living.slice(0, 3).forEach((n, i) => {
      this.schedule.states.delete(n.id);
      n.prologueLock = true;
      const tx = spot.x + Math.cos(i * 2.1) * 1.8;
      const tz = spot.z + Math.sin(i * 2.1) * 1.8;
      const route = this.schedule.route({ x: n.pos.x, y: n.pos.y, z: n.pos.z }, { x: tx, y: spot.y, z: tz });
      this.movers.set(n.id, { npc: n, route, idx: 0, timeout: 22, then: () => n.playReaction(reactions[i % 3], 8) });
    });
  }

  _arrive() {
    this.state = 'scene';
    this.sceneTimer = 75;
    const def = this.deathDef();
    const banner = def.presentation === 'frozen_scene'
      ? this.data.uiData.deathBanner.found
      : this.data.uiData.deathBanner.witnessed;
    this.ui.toast(banner);
    setTimeout(() => this.ui.toast(this.data.uiData.deathBanner.locked), 3500);
    this._sendWitnesses();
    this.guideTarget = null;
  }

  settle() {
    if (this.state === 'settling' || this.state === 'finale' || this.chapter < 1) return false;
    this.state = 'settling';
    this.lockSpot = null;
    this.guideTarget = null;
    // 尸体移除（彻底）
    const victim = this.mgr.get(this.current.victimId);
    if (victim) {
      victim.dead = true;
      victim.permaHidden = true;
      victim.group.visible = false;
    }
    this.schedule.states.delete(this.current.victimId);
    if (!this.save.data.deadIds.includes(this.current.victimId)) {
      this.save.data.deadIds.push(this.current.victimId);
      this.save.write();
    }
    const ch = this.chapter;
    this.figurines.settle(ch, () => {
      if (ch >= 10) this.begin(11);
      else {
        this.setChapter(ch + 1);
        this.begin(ch + 1);
      }
    });
    return true;
  }

  _finale() {
    this.state = 'finale';
    this.onFinale?.();
    this.setChapter(11);
    this.save.setChapter(11);
    const fin = this.data.chapters?.find((c) => c.id === 11);
    if (fin) this.ui.toast(`${fin.title} —— ${fin.subtitle}`);
  }

  sceneSpot() { return this.current?.spot || null; }

  // E 检视尸体
  onE(px, py, pz) {
    if (this.state !== 'scene' || !this.current) return false;
    const s = this.current.spot;
    if (Math.hypot(px - s.x, pz - s.z) > 3 || Math.abs(py - s.y) > 2.5) return false;
    const def = this.deathDef();
    this.ui.toast(`${def.method} —— ${def.scene}`);
    return true;
  }

  update(dt) {
    // movers（目击 NPC 赶到）
    for (const [id, m] of [...this.movers]) {
      const { npc, route } = m;
      m.timeout -= dt;
      const tp = route[m.idx];
      if (m.timeout <= 0 || !tp) {
        npc.walking = false;
        if (tp) { npc.pos.set(tp.x, npc.pos.y, tp.z); npc.group.position.copy(npc.pos); }
        m.then?.();
        this.movers.delete(id);
        continue;
      }
      const dx = tp.x - npc.pos.x, dz = tp.z - npc.pos.z;
      const d = Math.hypot(dx, dz);
      const sp = 1.4 * dt;
      if (d < Math.max(0.12, sp)) m.idx++;
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

    const p = this.player.feet;
    switch (this.state) {
      case 'explore':
        this.timer -= dt;
        if (this.timer <= 0) this.triggerDeath();
        break;
      case 'event': this._updateEvent(dt); break;
      case 'await': {
        const s = this.current.spot;
        this.guideTarget = { x: s.x, z: s.z, text: this.guideText };
        if (Math.hypot(p.x - s.x, p.z - s.z) < 4.5 && Math.abs(p.y - s.y) < 3) this._arrive();
        break;
      }
      case 'scene': {
        this.sceneTimer -= dt;
        const s = this.current.spot;
        if (this.sceneTimer <= 0 || Math.hypot(p.x - s.x, p.z - s.z) > 11) this.settle();
        break;
      }
    }

    // 距离限制（海滩事件）
    if (this.lockSpot) {
      const dx = p.x - this.lockSpot.x, dz = p.z - this.lockSpot.z;
      const d = Math.hypot(dx, dz);
      if (d < this.lockSpot.r && d > 1e-4) {
        const k = this.lockSpot.r / d;
        p.x = this.lockSpot.x + dx * k;
        p.z = this.lockSpot.z + dz * k;
      }
    }
  }

  _updateEvent(dt) {
    const ev = this.eventStep;
    ev.t += dt;
    if (ev.kind === 'marston') {
      const m = this.mgr.get('marston');
      const useRig = m?.rigged && m.rigCfg?.death;
      // 举杯停顿半拍 → Dead clip 倒地（骨骼）/ choke 反应（旧模型）
      if (useRig && ev.t > 0.5 && !ev.deadStarted) {
        ev.deadStarted = true;
        m.rigged.play(m.rigCfg.death, { loop: false, fade: 0.15, timeScale: 1.0 });
        window.AudioAPI?.play?.('choking');
      }
      const fellAt = useRig ? 3.2 : 2.6;
      if (ev.t > fellAt && !ev.fell) {
        ev.fell = true;
        if (m && !useRig) {
          m.pos.set(9.0, F1, 4.0);
          m.group.position.set(9.0, F1, 4.0);
          m.setDeadPose('prone');
        } else if (m) {
          m.setDeadPose('prone'); // rigged：走 death clip 定格
        }
        for (const n of this.mgr.npcs.values()) {
          if (!n.dead && !n.removed && n.id !== 'marston' && Math.hypot(n.pos.x - 9, n.pos.z - 4) < 9)
            n.playReaction('tremble', 4);
        }
      }
      if (ev.t > (useRig ? 5.0 : 4.2)) this.state = 'await';
    } else if (ev.kind === 'lombard') {
      if (ev.t > 2.2 && !ev.shot) {
        ev.shot = true;
        const fl = document.getElementById('flashWhite');
        fl.classList.add('show');
        setTimeout(() => fl.classList.remove('show'), 180);
        window.AudioAPI?.play?.('gunshot_beach');
        const l = this.mgr.get('lombard');
        if (l) { l.setDeadPose('prone'); }
        const v = this.mgr.get('vera');
        if (v) { v.armR.rotation.x = -1.4; v.playReaction('still', 2.4); }
      }
      if (ev.t > 5.0 && !ev.veraLeft) {
        ev.veraLeft = true;
        const v = this.mgr.get('vera');
        if (v) {
          const route = this.schedule.route({ x: v.pos.x, y: v.pos.y, z: v.pos.z }, { x: 0, y: F1, z: 11 });
          this.movers.set('vera', { npc: v, route, idx: 0, timeout: 60, then: () => {} });
        }
        this.lockSpot = null;
        this.state = 'await';
      }
    }
  }
}
