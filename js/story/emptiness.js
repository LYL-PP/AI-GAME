// emptiness.js —— 空掉感细节：椅子餐具递减 / 毛线消失 / 序章风暴暗示
import * as THREE from '../vendor/three.module.js';
import { GeoBatch, MAT } from '../world/props.js';

const F1 = 1.8;
const HALL_CHAIR_BASE = 10; // 大厅 11 椅在 chairs InstancedMesh 中的起始索引（0-9 为客房椅）

export class Emptiness {
  // o: { scene, save, ui, villa, collision, uiData }
  constructor(o) {
    Object.assign(this, o);
    this._buildYarn();
    this._buildRadio();
  }

  // 布伦特毛线团+针（大厅摇椅，第 6 章后消失）
  _buildYarn() {
    const b = new GeoBatch();
    b.add(new THREE.SphereGeometry(0.06, 8, 6), new THREE.Matrix4().setPosition(0, 0.05, 0));
    b.box(0.006, 0.22, 0.006, 0.06, 0.12, 0.02, 0x8a8578);
    b.box(0.006, 0.22, 0.006, -0.04, 0.12, 0.02, 0x8a8578);
    this.yarn = b.mesh(MAT.paper);
    this.yarn.position.set(-5.9, F1 + 0.55, 6.5);
    this.scene.add(this.yarn);
  }

  // 码头旧收音机（序章风暴暗示）
  _buildRadio() {
    const b = new GeoBatch();
    b.box(0.34, 0.2, 0.14, 0, 0.1, 0);
    b.box(0.02, 0.28, 0.02, 0.12, 0.3, 0);
    this.radio = b.mesh(MAT.woodDark, { cast: true });
    this.radio.position.set(1.3, 1.35, 50);
    this.scene.add(this.radio);
    this.radioUsed = false;
  }

  // 章节切换时应用空掉感
  onChapterChanged(n) {
    // 椅子/餐盘：死亡数 = n-1（第 1 章前全员在）
    const deaths = Math.max(0, n - 1);
    const chairs = this.villa.refs?.chairs;
    const plates = this.villa.refs?.plates;
    const m = new THREE.Matrix4().makeScale(0, 0, 0);
    if (chairs) {
      for (let k = 0; k < 11; k++) chairs.setMatrixAt(HALL_CHAIR_BASE + k, k < 11 - deaths ? this._orig(chairs, HALL_CHAIR_BASE + k) : m);
      chairs.instanceMatrix.needsUpdate = true;
    }
    if (plates) {
      for (let k = 0; k < 11; k++) plates.setMatrixAt(k, k < 11 - deaths ? this._origP(plates, k) : m);
      plates.instanceMatrix.needsUpdate = true;
    }
    // 毛线：第 6 章后消失
    this.yarn.visible = n < 6;
  }

  // 缓存原始矩阵
  _orig(mesh, i) {
    if (!this._origM) {
      this._origM = [];
      const tmp = new THREE.Matrix4();
      for (let k = 0; k < 29; k++) { mesh.getMatrixAt(k, tmp); this._origM.push(tmp.clone()); }
    }
    return this._origM[i];
  }
  _origP(mesh, i) {
    if (!this._origPM) {
      this._origPM = [];
      const tmp = new THREE.Matrix4();
      for (let k = 0; k < 11; k++) { mesh.getMatrixAt(k, tmp); this._origPM.push(tmp.clone()); }
    }
    return this._origPM[i];
  }

  visibleChairs() {
    const chairs = this.villa.refs?.chairs;
    if (!chairs) return -1;
    const m = new THREE.Matrix4();
    let n = 0;
    for (let k = 0; k < 11; k++) {
      chairs.getMatrixAt(HALL_CHAIR_BASE + k, m);
      if (m.elements[0] !== 0) n++;
    }
    return n;
  }

  // E：旧收音机
  onE(px, py, pz) {
    const d = Math.hypot(px - this.radio.position.x, pz - this.radio.position.z);
    if (d > 2.5 || Math.abs(py - 1.25) > 2) return false;
    const hint = this.uiData.stormHint;
    this.ui.toast(`${hint.title} —— ${hint.text}`);
    this.radioUsed = true;
    window.AudioAPI?.play?.('gramophone_voice');
    return true;
  }
}
