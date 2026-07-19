// dockCutscene.js —— 终章码头可选过场：瓶中信 Ken Burns 推近 → 叠化 → 书房终局横移
// DOM+CSS 覆盖层；文案全部来自 data/endings.json 的 dockCutscene 字段（id/poi/lines）。
// 触发：chapter==11 且结局演出非激活时，码头栈道尽头 (0,56.5) 4m 内显示 poi，按 E 播放，可重复。
// 注意：码头内移后栈道可行走范围为 z 33.2–58.5（详见 island.js / walk_test.mjs）
const T = {
  fadeIn: 1.2, seg1: 8.0, xfade: 1.2, seg2: 8.0, fadeOut: 1.2,
};
const DOCK = { x: 0, z: 56.5, r: 4.0 };

export class DockCutscene {
  // o: { player, ui, audio, getChapter, getEndingsActive, data }
  constructor(o) {
    Object.assign(this, o);
    this.playing = false;
    this.poiRef = { id: '__dock_view', nameplate: this.data.poi.nameplate, sub: this.data.poi.sub };
    // 覆盖层（动态创建，播完移除）
    this.el = null;
    this._raf = 0;
    this._t = 0;
    this._skipHandler = (e) => { if (e.code === 'KeyE' && this.playing) this._skip(); };
  }

  get total() { return T.fadeIn + T.seg1 + T.xfade + T.seg2 + T.fadeOut; }

  // main.js updatePoi 钩子：返回 true 表示已接管 poi 显示
  tryPoi(x, z) {
    if (this.playing || this.getChapter() !== 11 || this.getEndingsActive()) return false;
    if (Math.hypot(x - DOCK.x, z - DOCK.z) > DOCK.r) return false;
    this.ui.setPoi(this.poiRef);
    return true;
  }

  nearDock(x, z) { return Math.hypot(x - DOCK.x, z - DOCK.z) <= DOCK.r; }

  // main.js E 链钩子：播放中=跳过；触发点内=开始播放
  onE() {
    if (this.playing) { this._skip(); return true; }
    if (this.getChapter() !== 11 || this.getEndingsActive()) return false;
    return false; // 触发由 main.js 的 poi 路径调 play()
  }

  play() {
    if (this.playing) return false;
    this.playing = true;
    this.player.enabled = false;
    this.ui.setPoi(null);
    this.audio?.play?.('waves');
    this._build();
    document.addEventListener('keydown', this._skipHandler);
    this._t = 0;
    let last = performance.now();
    const step = (now) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      this._t += dt;
      this._apply(this._t);
      if (this._t >= this.total) { this._cleanup(); return; }
      this._raf = requestAnimationFrame(step);
    };
    this._raf = requestAnimationFrame(step);
    return true;
  }

  _build() {
    const el = document.createElement('div');
    el.id = 'dockCut';
    el.innerHTML = `
      <div class="dc-stage">
        <img class="dc-img dc-a" src="assets/ui/end_bottle.jpg" alt="">
        <img class="dc-img dc-b" src="assets/ui/end_study.jpg" alt="">
      </div>
      <div class="dc-sub"><div class="dc-line"></div><div class="dc-line"></div></div>
      <div class="dc-skip">E — 跳过</div>`;
    document.body.appendChild(el);
    this.el = el;
    this._imgA = el.querySelector('.dc-a');
    this._imgB = el.querySelector('.dc-b');
    this._lines = el.querySelectorAll('.dc-line');
  }

  _setLine(slot, text) {
    const el = this._lines[slot];
    if (el.textContent !== text) {
      el.classList.remove('show');
      void el.offsetWidth;
      el.textContent = text;
      if (text) el.classList.add('show');
    }
  }

  // 缓动：段内平滑起停
  static ease(k) { return k * k * (3 - 2 * k); }

  _apply(t) {
    const { fadeIn, seg1, xfade, seg2, fadeOut } = T;
    const t1 = fadeIn, t2 = t1 + seg1, t3 = t2 + xfade, t4 = t3 + seg2;
    const el = this.el;
    // 容器：淡入 → 全程 → 淡出
    if (t < t1) el.style.opacity = t / t1;
    else if (t < t4) el.style.opacity = 1;
    else el.style.opacity = Math.max(0, 1 - (t - t4) / fadeOut);
    // 段 1：瓶中信 Ken Burns（全景 → 推近瓶身）
    const L = this.data.lines;
    if (t < t2) {
      const k = DockCutscene.ease(Math.max(0, (t - t1) / seg1));
      this._imgA.style.opacity = 1;
      this._imgA.style.transform = `scale(${1.02 + 0.36 * k}) translate(${-1.5 * k}%, ${2 - 6 * k}%)`;
      this._imgB.style.opacity = 0;
      if (t > t1 + 0.8) this._setLine(0, L.bottle[0] || '');
      if (t > t1 + seg1 * 0.55) this._setLine(0, L.bottle[1] || L.bottle[0] || '');
      this._setLine(1, '');
      return;
    }
    // 叠化
    if (t < t3) {
      const k = (t - t2) / xfade;
      this._imgA.style.opacity = 1 - k;
      this._imgB.style.opacity = k;
      this._imgB.style.transform = 'scale(1.18) translateX(7%)';
      this._setLine(0, ''); this._setLine(1, '');
      return;
    }
    // 段 2：书房终局横移（左轮 → 门把）
    const k = DockCutscene.ease((t - t3) / seg2);
    this._imgA.style.opacity = 0;
    this._imgB.style.opacity = 1;
    this._imgB.style.transform = `scale(1.18) translateX(${7 - 14 * k}%)`;
    if (t > t3 + 0.6) this._setLine(0, L.study[0] || '');
    if (t > t3 + seg2 * 0.55) this._setLine(0, L.study[1] || L.study[0] || '');
  }

  _skip() {
    // 直接进黑场淡出段
    this._t = Math.max(this._t, this.total - T.fadeOut);
  }

  _cleanup() {
    cancelAnimationFrame(this._raf);
    document.removeEventListener('keydown', this._skipHandler);
    this.el?.remove();
    this.el = null;
    this.playing = false;
    this.player.enabled = true;
  }
}
