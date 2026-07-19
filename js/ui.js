// ui.js —— HUD：章节卡（读 chapters.json）、点位名牌提示、操作提示（读 ui.json）
export class UI {
  // data = { places, chapters, ui }；opts = { playMode }
  constructor(data, opts = {}) {
    this.data = data;
    this.playMode = !!opts.playMode;
    this.el = {
      overlay: document.getElementById('startOverlay'),
      overlayTitle: document.getElementById('ovTitle'),
      overlayWarn: document.getElementById('ovWarn'),
      overlayControls: document.getElementById('ovControls'),
      overlayStart: document.getElementById('ovStart'),
      overlayLoading: document.getElementById('ovLoading'),
      fetchError: document.getElementById('fetchError'),
      chapterCard: document.getElementById('chapterCard'),
      chTitle: document.getElementById('chTitle'),
      chAmbience: document.getElementById('chAmbience'),
      poi: document.getElementById('poiPrompt'),
      poiName: document.getElementById('poiName'),
      poiHint: document.getElementById('poiHint'),
      toast: document.getElementById('toast'),
      controlsHint: document.getElementById('controlsHint'),
    };
    this.poiId = null;
    this.toastTimer = null;

    // 操作提示（全部来自 ui.json）
    const c = data.ui.controls;
    const lines = [c.move, c.look, c.interact, c.map, c.notebook, c.nav, c.mute, c.pause].filter(Boolean);
    this.el.controlsHint.innerHTML = lines.map((t) => `<div>${t}</div>`).join('');
    this.el.overlayControls.innerHTML = lines.map((t) => `<div>${t}</div>`).join('');
    this.el.overlayTitle.textContent = data.ui.system.gameTitle;
    this.el.overlayWarn.textContent = data.ui.system.warning;
    this.el.overlayStart.textContent = data.ui.system.start;
    this.el.poiHint.textContent = c.interact;
    if (this.playMode) this.el.overlay.style.display = 'none';
  }

  showFetchError() {
    this.el.overlay.style.display = 'none';
    this.el.fetchError.style.display = 'flex';
  }

  hideLoading() {
    this.el.overlayLoading.style.display = 'none';
    this.el.overlayStart.style.display = 'block';
  }

  // 章节卡：标题 + 氛围 + 日期（chapters.json）
  showChapter(n) {
    const ch = this.data.chapters.find((q) => q.id === n);
    if (!ch) return;
    this.el.chTitle.textContent = `${ch.title} · ${ch.day}`;
    this.el.chAmbience.textContent = ch.ambience;
    const card = this.el.chapterCard;
    card.classList.remove('flash');
    void card.offsetWidth; // 重启动画
    card.classList.add('flash');
  }

  // 点位/房间名牌提示；poi = {nameplate, sub, note} 或 null
  setPoi(poi) {
    const id = poi ? (poi.id || poi.nameplate) : null;
    if (id === this.poiId) return;
    this.poiId = id;
    if (!poi) {
      this.el.poi.classList.remove('show');
      return;
    }
    this.el.poiName.textContent = poi.sub ? `${poi.nameplate} · ${poi.sub}` : poi.nameplate;
    this.el.poi.classList.add('show');
  }

  // E 键点位提示
  toast(text) {
    const t = this.el.toast;
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  // pointer lock 状态联动覆盖层
  bindLock(dom) {
    const start = () => {
      if (!this.playMode) dom.requestPointerLock();
    };
    this.el.overlay.addEventListener('click', start);
    document.addEventListener('pointerlockchange', () => {
      if (this.playMode) return;
      const locked = document.pointerLockElement === dom;
      this.el.overlay.style.display = locked ? 'none' : 'flex';
    });
  }
}
