// clues.js —— 线索检视点（clueSpots.json）：浮动标记 + E 检视 + 写存档
import * as THREE from '../vendor/three.module.js';
import { MAT } from '../world/props.js';

const F2 = 5.0;
// clueSpots 中的 bedroom_* 符号解析（schedules 的 bedroom_own 语义）
const BEDROOM_PTS = {
  bedroom_mrs_rogers: [10, -4.75, F2], bedroom_rogers: [10, -4.75, F2],
  bedroom_armstrong: [2, -4.75, F2], bedroom_vera: [-6, 4.75, F2],
};

export class ClueManager {
  // o: { scene, save, ui, spots (clueSpots.json), cluesData (clues.json), schedule, getChapter }
  constructor(o) {
    Object.assign(this, o);
    this.spots = [];
    this.collected = new Set(o.save.data.clues || []);
    this.near = null;
    this._t = 0;
    const clueById = {};
    for (const c of o.cluesData.clues) clueById[c.id] = c;
    this.clueById = clueById;
    for (const s of o.spots.spots) {
      const pt = this._resolve(s.poi);
      if (!pt) continue;
      const marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.055, 0), MAT.candle);
      marker.position.set(pt[0], pt[2] !== undefined ? pt[2] + 0.55 : 2.5, pt[1]);
      o.scene.add(marker);
      this.spots.push({ clueId: s.clueId, poi: s.poi, itemDesc: s.itemDesc, chapter: s.chapterAvailable, x: pt[0], y: marker.position.y, z: pt[1], marker });
    }
  }

  _resolve(poi) {
    if (BEDROOM_PTS[poi]) return BEDROOM_PTS[poi];
    const p = this.schedule.pois[poi];
    if (p) {
      const y = p.y !== undefined ? p.y : this.schedule.col.groundAt(p.x, p.z, 50);
      return [p.x, p.z, y];
    }
    return null;
  }

  // 当前可交互线索点（最近且 <1.9m）
  update(dt, px, py, pz) {
    this._t += dt;
    const ch = this.getChapter();
    this.near = null;
    let bd = 1.9;
    for (const s of this.spots) {
      const got = this.collected.has(s.clueId);
      s.marker.visible = !got && ch >= s.chapter;
      if (s.marker.visible) {
        s.marker.rotation.y += dt * 1.5;
        s.marker.position.y = s.y + Math.sin(this._t * 2 + s.x) * 0.03;
        const d = Math.hypot(px - s.x, pz - s.z);
        if (d < bd && Math.abs(py - s.y) < 2.2) { bd = d; this.near = s; }
      }
    }
    return this.near;
  }

  onE() {
    const s = this.near;
    if (!s) return false;
    this.collected.add(s.clueId);
    s.marker.visible = false;
    this.save.addClue(s.clueId);
    const c = this.clueById[s.clueId];
    this.ui.toast(c ? `${c.name} —— ${c.note}` : s.itemDesc);
    window.AudioAPI?.play?.('clue_pickup');
    return true;
  }
}
