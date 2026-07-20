// figurines.js —— 壁炉台 10 瓷人士兵 + 童谣瓷牌 + 章节结算演出
import * as THREE from '../vendor/three.module.js';
import { GeoBatch, MAT, textPanel } from '../world/props.js';
import { getParts, buildProp } from '../world/sceneProps.js';

const F1 = 1.8;
const MANTEL = { x: -5.0, y: F1 + 1.955, z: -0.5 };   // 前挑：扫描北墙面 z≈-0.92（实测）

export class Figurines {
  // o: { scene, camera, player, save, ui, rhyme (rhyme.json), uiData (ui.json), weather }
  constructor(o) {
    Object.assign(this, o);
    this.soldiers = [];
    this._count = 10;
    this.step = null;
    this.hold = 0;
    this.cam = null;
    this.particles = null;
    this.shake = 0;
    this.el = {
      overlay: document.getElementById('settleOverlay'),
      rhyme: document.getElementById('settleRhyme'),
      card: document.getElementById('settleCard'),
      cardText: document.getElementById('settleCardText'),
      breakCap: document.getElementById('settleBreak'),
    };
    this.build();
  }

  build() {
    // 瓷人士兵 ×10（figurine.glb 士兵雕像，11.3k 面细节保留；失败回退程序化小兵）
    const figParts = getParts('figurine');
    let figProto = null;
    if (figParts) {
      figProto = buildProp(figParts, { tint: [0.96, 0.96, 1.0], castShadow: true });   // 白瓷微冷调（防炉火镀金）
      figProto.scale.setScalar(0.1065);   // 新士兵雕像（实测 scale 后高 0.15 → ×1.467 → ~0.22m）
    }
    for (let i = 0; i < 10; i++) {
      let m;
      if (figProto) {
        m = figProto.clone();
        m.position.set(MANTEL.x - 1.44 + i * 0.32, MANTEL.y + 0.1, MANTEL.z + 0.2); // 台面前沿，底面贴合（新模 scale 修正后底 -0.10）
        m.rotation.y = Math.PI;   // 面向大厅
      } else {
        const b = new GeoBatch();
        b.add(new THREE.CylinderGeometry(0.032, 0.042, 0.1, 8), new THREE.Matrix4().setPosition(0, 0.06, 0));
        b.add(new THREE.SphereGeometry(0.032, 8, 6), new THREE.Matrix4().setPosition(0, 0.135, 0));
        b.add(new THREE.ConeGeometry(0.03, 0.05, 8), new THREE.Matrix4().setPosition(0, 0.185, 0));   // 军帽
        b.add(new THREE.BoxGeometry(0.014, 0.05, 0.014), new THREE.Matrix4().setPosition(-0.045, 0.075, 0)); // 手臂
        b.add(new THREE.BoxGeometry(0.014, 0.05, 0.014), new THREE.Matrix4().setPosition(0.045, 0.075, 0));
        m = b.mesh(MAT.porcelain, { cast: true });
        m.position.set(MANTEL.x - 1.44 + i * 0.32, MANTEL.y + 0.03, MANTEL.z);
      }
      this.scene.add(m);
      this.soldiers.push(m);
    }
    // 童谣瓷牌（壁炉上方，rhyme.json 全文）
    const lines = this.rhyme.rhyme.lines.map((l) => l.text);
    const plaque = textPanel([this.rhyme.rhyme.title], {
      w: 2.6, h: 1.3, bg: '#221c16', fg: '#e8ddc9', border: '#d98e4a', fontMain: 54,
    });
    // 全文另起一牌（字号小）
    const cv = document.createElement('canvas');
    cv.width = 1024; cv.height = 560;
    const c = cv.getContext('2d');
    c.fillStyle = '#221c16'; c.fillRect(0, 0, 1024, 560);
    c.strokeStyle = '#d98e4a'; c.lineWidth = 5; c.strokeRect(12, 12, 1000, 536);
    c.fillStyle = '#d98e4a'; c.textAlign = 'center'; c.font = '44px "Noto Serif SC","SimSun",serif';
    c.fillText(this.rhyme.rhyme.title, 512, 70);
    c.fillStyle = '#e8ddc9'; c.font = '30px "Noto Serif SC","SimSun",serif';
    lines.forEach((t, i) => c.fillText(t, 512, 125 + i * 42));
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 1.42),
      new THREE.MeshBasicMaterial({ map: tex })
    );
    board.position.set(MANTEL.x, F1 + 3.15, -0.88);   // 童谣牌贴扫描北墙面（实测面深 z≈-0.92）
    this.scene.add(board);
  }

  count() { return this._count; }
  setCount(n) {
    this._count = n;
    this.soldiers.forEach((s, i) => { s.visible = i < n; });
  }

  // 结算演出：deathChapter 为刚发生的死亡章号（1–10）
  settle(deathChapter, onDone) {
    this.onDone = onDone;
    this.player.enabled = false;
    const line = this.rhyme.rhyme.lines[deathChapter - 1];
    this.deathChapter = deathChapter;
    this.line = line;
    this.el.overlay.classList.add('show');
    this.el.rhyme.textContent = '';
    // 镜头推向壁炉台
    const c = this.camera;
    this.cam = {
      fp: c.position.clone(), tp: new THREE.Vector3(MANTEL.x, F1 + 1.75, 0.7),
      fl: new THREE.Vector3(0, 0, -1).applyQuaternion(c.quaternion).add(c.position),
      tl: new THREE.Vector3(MANTEL.x, MANTEL.y + 0.1, MANTEL.z), t: 0, dur: 1.2,
    };
    this.step = 'cam';
    this.hold = 1.3;
    this.typing = null;
  }

  skip() {
    if (!this.step) return;
    if (this.cam) { this.cam.t = this.cam.dur; return; }
    if (this.typing) { this.typing.shown = this.typing.full.length; return; }
    this.hold = 0;
  }

  get active() { return this.step !== null; }

  _shatter() {
    const idx = this.deathChapter - 1;
    const s = this.soldiers[idx];
    if (s) s.visible = false;
    this._count = Math.max(0, 10 - this.deathChapter);
    this.save.data.figurines = this._count;
    this.save.write();
    // 碎片粒子
    const n = 42;
    const pos = new Float32Array(n * 3);
    this.pv = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = s.position.x; pos[i * 3 + 1] = s.position.y + 0.1; pos[i * 3 + 2] = s.position.z;
      this.pv[i * 3] = (Math.random() - 0.5) * 1.6;
      this.pv[i * 3 + 1] = Math.random() * 1.8 + 0.4;
      this.pv[i * 3 + 2] = (Math.random() - 0.5) * 1.6;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.particles = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xf2efe8, size: 0.035 }));
    this.scene.add(this.particles);
    this.pt = 0;
    this.shake = 0.5;
    this.el.breakCap.textContent = this.uiData.chapterCard.figurineBreak;
    this.el.breakCap.classList.add('show');
    // 结算卡仪式：音乐全停 → 碎裂声 → 3 秒静默 → 新编制淡入
    if (window.AudioAPI?.settlementRitual) window.AudioAPI.settlementRitual();
    else window.AudioAPI?.play?.('figurine_break');
  }

  _card() {
    const left = this._count;
    this.el.cardText.textContent = this.uiData.chapterCard.survivors.replace('{n}', left);
    // 二周目批注（凶手视角小字）
    const anno = document.getElementById('settleAnno');
    if (anno) {
      const line = this.save.data.ngPlus ? this.annotations?.ngAnnotations?.lines?.[String(this.deathChapter)] : null;
      anno.textContent = line || '';
      anno.style.display = line ? 'block' : 'none';
    }
    this.el.card.classList.add('show');
  }

  update(dt) {
    if (!this.step) return;
    // 相机
    if (this.cam) {
      const c = this.cam;
      c.t = Math.min(c.dur, c.t + dt);
      const k = c.t / c.dur, e = k * k * (3 - 2 * k);
      this.camera.position.lerpVectors(c.fp, c.tp, e);
      const look = new THREE.Vector3().lerpVectors(c.fl, c.tl, e);
      this.camera.lookAt(look);
      if (c.t >= c.dur) {
        this.cam = null;
        this.holdCam = { pos: c.tp, look: c.tl };
      }
    } else if (this.holdCam) {
      // 演出期间保持壁炉台特写
      this.camera.position.copy(this.holdCam.pos);
      this.camera.lookAt(this.holdCam.look);
    }
    // 震屏
    if (this.shake > 0) {
      this.shake -= dt;
      this.camera.position.x += (Math.random() - 0.5) * 0.04;
      this.camera.position.y += (Math.random() - 0.5) * 0.04;
    }
    // 碎片
    if (this.particles) {
      this.pt += dt;
      const a = this.particles.geometry.attributes.position.array;
      for (let i = 0; i < a.length / 3; i++) {
        a[i * 3] += this.pv[i * 3] * dt;
        a[i * 3 + 1] += (this.pv[i * 3 + 1] -= 6 * dt) * dt;
        a[i * 3 + 2] += this.pv[i * 3 + 2] * dt;
      }
      this.particles.geometry.attributes.position.needsUpdate = true;
      if (this.pt > 1.4) {
        this.scene.remove(this.particles);
        this.particles = null;
        this.el.breakCap.classList.remove('show');
      }
    }
    // 状态机
    switch (this.step) {
      case 'cam':
        this.hold -= dt;
        if (this.hold <= 0 && !this.cam) {
          this.step = 'rhyme';
          this.typing = { full: this.line.text, shown: 0, speed: 22 };
        }
        break;
      case 'rhyme': {
        const t = this.typing;
        t.shown = Math.min(t.full.length, t.shown + t.speed * dt);
        this.el.rhyme.textContent = t.full.slice(0, Math.floor(t.shown));
        if (t.shown >= t.full.length) { this.step = 'rhymeHold'; this.hold = 1.1; }
        break;
      }
      case 'rhymeHold':
        this.hold -= dt;
        if (this.hold <= 0) { this.step = 'shatter'; this._shatter(); this.hold = 1.5; }
        break;
      case 'shatter':
        this.hold -= dt;
        if (this.hold <= 0) { this.step = 'card'; this._card(); this.hold = 1.9; }
        break;
      case 'card':
        this.hold -= dt;
        if (this.hold <= 0) this._finish();
        break;
    }
  }

  _finish() {
    const anno = document.getElementById('settleAnno');
    if (anno) anno.style.display = 'none';
    this.el.overlay.classList.remove('show');
    this.el.card.classList.remove('show');
    this.el.breakCap.classList.remove('show');
    this.el.rhyme.textContent = '';
    this.step = null;
    this.holdCam = null;
    this.player.enabled = true;
    this.onDone?.();
  }
}
