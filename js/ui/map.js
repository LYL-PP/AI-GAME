// map.js —— 游戏内地图（M 开关）：岛图（室外）/ 楼层图（别墅内 F1-F3 页签）
// 绘制数据全部来自 data/map.json；Art Deco 风格：铅灰底、金线、serif 字；玩家位置+朝向箭头、剧情目标脉冲实时刷新。
const GOLD = '#d98e4a', INK = '#e8ddc9';

export class GameMap {
  // o: { player, chapterManager, prologue, ui, mapData, insideVilla }
  constructor(o) {
    Object.assign(this, o);
    this._open = false;
    this.floor = 1;
    this.t = 0;
    this._rd = 0;
    const root = document.getElementById('mapOverlay');
    root.innerHTML = `
      <div class="map-frame">
        <div class="map-title"></div>
        <div class="map-tabs">
          <button data-f="1">F1</button><button data-f="2">F2</button><button data-f="3">F3</button>
        </div>
        <canvas width="1440" height="1440"></canvas>
        <div class="map-hint"></div>
      </div>`;
    this.el = root;
    this.cv = root.querySelector('canvas');
    this.cx2d = this.cv.getContext('2d');
    this.titleEl = root.querySelector('.map-title');
    this.tabsEl = root.querySelector('.map-tabs');
    root.querySelector('.map-hint').textContent = 'M / Esc — 关闭地图';
    for (const b of this.tabsEl.querySelectorAll('button')) {
      b.addEventListener('click', () => { this.floor = Number(b.dataset.f); this._syncTabs(); this._draw(); });
    }
  }

  isOpen() { return this._open; }
  toggle() { this._open ? this.close_() : this.open_(); }

  open_() {
    this._open = true;
    document.exitPointerLock?.();
    const p = this.player.feet;
    if (this.insideVilla()) this.floor = p.y < 3.4 ? 1 : p.y < 6.6 ? 2 : 3;
    this.el.classList.add('show');
    this._syncTabs();
    this._draw();
  }

  close_() { this._open = false; this.el.classList.remove('show'); }

  update(dt) {
    this.t += dt;
    if (!this._open) return;
    this._rd += dt;
    if (this._rd >= 0.1) { this._rd = 0; this._draw(); }   // 10Hz 刷新玩家/目标
  }

  _syncTabs() {
    const inside = this.insideVilla();
    this.tabsEl.style.display = inside ? 'flex' : 'none';
    for (const b of this.tabsEl.querySelectorAll('button'))
      b.classList.toggle('on', Number(b.dataset.f) === this.floor);
  }

  _target() {
    if (this.prologue.state !== 'done') return this.mapData.targets.prologue;
    if (this.chapterManager.chapter >= 11) return this.mapData.targets.finale;
    const g = this.chapterManager.guideTarget;
    return g ? { x: g.x, z: g.z, label: g.text } : null;
  }

  // 世界 (x,z) → 画布像素（viewBox 等比适配）
  _proj(vb, W, H, pad) {
    const dx = vb[2] - vb[0], dz = vb[3] - vb[1];
    const s = Math.min((W - pad * 2) / dx, (H - pad * 2) / dz);
    const mx = (vb[0] + vb[2]) / 2, mz = (vb[1] + vb[3]) / 2;
    return (x, z) => [W / 2 + (x - mx) * s, H / 2 + (z - mz) * s];
  }

  _draw() {
    const c = this.cx2d, W = this.cv.width, H = this.cv.height;
    c.clearRect(0, 0, W, H);
    c.fillStyle = '#141a24';
    c.fillRect(0, 0, W, H);
    const inside = this.insideVilla();
    if (inside) this._drawFloor(c, W, H);
    else this._drawIsland(c, W, H);
    this._drawPlayer(c, W, H, inside);
    this._drawTarget(c, W, H, inside);
  }

  _decoFrame(c, W, H) {
    c.strokeStyle = GOLD; c.lineWidth = 3;
    c.strokeRect(18, 18, W - 36, H - 36);
    c.lineWidth = 1;
    c.strokeRect(30, 30, W - 60, H - 60);
  }

  _drawIsland(c, W, H) {
    const D = this.mapData.island;
    this.titleEl.textContent = '士兵岛 · 全岛';
    this._decoFrame(c, W, H);
    const P = this._proj(D.viewBox, W, H, 90);
    // 海岸线
    c.beginPath();
    D.outline.forEach(([x, z], i) => { const [px, py] = P(x, z); i ? c.lineTo(px, py) : c.moveTo(px, py); });
    c.closePath();
    c.fillStyle = 'rgba(217,142,74,0.07)'; c.fill();
    c.strokeStyle = GOLD; c.lineWidth = 2.5; c.stroke();
    // 栈道
    c.beginPath();
    c.setLineDash([10, 8]);
    const [jx0, jy0] = P(...D.jetty[0]), [jx1, jy1] = P(...D.jetty[1]);
    c.moveTo(jx0, jy0); c.lineTo(jx1, jy1);
    c.strokeStyle = 'rgba(217,142,74,0.7)'; c.lineWidth = 3; c.stroke();
    c.setLineDash([]);
    // POI
    c.font = '26px "Noto Serif SC", serif';
    for (const p of D.pois) {
      const [px, py] = P(p.x, p.z);
      c.fillStyle = GOLD;
      c.beginPath(); c.arc(px, py, 6, 0, Math.PI * 2); c.fill();
      c.fillStyle = INK;
      c.fillText(p.name, px + 12, py - 10);
    }
    this._islandP = P;
  }

  _drawFloor(c, W, H) {
    const V = this.mapData.villa;
    const F = V.floors[String(this.floor)];
    this.titleEl.textContent = `士兵岛别墅 · ${F.label}`;
    this._decoFrame(c, W, H);
    const P = this._proj(V.viewBox, W, H, 110);
    // 外墙
    c.beginPath();
    V.outline.forEach(([x, z], i) => { const [px, py] = P(x, z); i ? c.lineTo(px, py) : c.moveTo(px, py); });
    c.closePath();
    c.strokeStyle = GOLD; c.lineWidth = 3; c.stroke();
    // 房间
    for (const r of F.rooms) {
      const [x0, y0] = P(r.rect[0], r.rect[1]), [x1, y1] = P(r.rect[2], r.rect[3]);
      c.fillStyle = 'rgba(217,142,74,0.06)';
      c.fillRect(x0, y0, x1 - x0, y1 - y0);
      c.strokeStyle = 'rgba(217,142,74,0.75)'; c.lineWidth = 1.5;
      c.strokeRect(x0, y0, x1 - x0, y1 - y0);
      const small = Math.min(x1 - x0, y1 - y0) < 90;
      c.font = `${small ? 20 : 26}px "Noto Serif SC", serif`;
      c.fillStyle = INK;
      c.textAlign = 'center';
      c.fillText(r.name, (x0 + x1) / 2, (y0 + y1) / 2 + (small ? 7 : 9));
      c.textAlign = 'left';
    }
    // 楼梯标记
    for (const [sx, sz] of F.stairs) {
      const [px, py] = P(sx, sz);
      c.strokeStyle = GOLD; c.lineWidth = 1.5;
      c.strokeRect(px - 16, py - 16, 32, 32);
      c.fillStyle = GOLD;
      c.font = '22px "Noto Serif SC", serif';
      c.textAlign = 'center';
      c.fillText('梯', px, py + 8);
      c.textAlign = 'left';
    }
    this._floorP = P;
  }

  _drawPlayer(c, W, H, inside) {
    const p = this.player.feet;
    const P = inside ? this._floorP : this._islandP;
    if (inside !== !!P) return;
    const [px, py] = P(p.x, p.z);
    const yaw = this.player.yaw;
    // 朝向 = -(sin yaw, cos yaw)；画布 y 向下与 z 同向，直接取角
    const ang = Math.atan2(-Math.cos(yaw), -Math.sin(yaw));
    c.save();
    c.translate(px, py);
    c.rotate(ang + Math.PI / 2);   // 箭头默认朝上
    c.fillStyle = '#ffffff';
    c.strokeStyle = GOLD; c.lineWidth = 2;
    c.beginPath();
    c.moveTo(0, -14); c.lineTo(9, 10); c.lineTo(0, 5); c.lineTo(-9, 10);
    c.closePath(); c.fill(); c.stroke();
    c.restore();
    c.strokeStyle = 'rgba(255,255,255,0.5)';
    c.beginPath(); c.arc(px, py, 18, 0, Math.PI * 2); c.stroke();
  }

  _drawTarget(c, W, H, inside) {
    const t = this._target();
    if (!t) return;
    const P = inside ? this._floorP : this._islandP;
    if (!P) return;
    // 楼层图：只标别墅内目标（或 targets 自带 floor 且等于当前页）
    if (inside) {
      const inVilla = t.floor ? t.floor === this.floor : (Math.abs(t.x) < 13.5 && Math.abs(t.z) < 9.5);
      if (!inVilla) return;
    }
    const [px, py] = P(t.x, t.z);
    const k = 0.5 + 0.5 * Math.sin(this.t * 4);
    c.strokeStyle = GOLD;
    c.lineWidth = 3;
    c.globalAlpha = 0.5 + 0.5 * k;
    c.beginPath(); c.arc(px, py, 14 + 10 * k, 0, Math.PI * 2); c.stroke();
    c.globalAlpha = 1;
    c.fillStyle = GOLD;
    c.beginPath(); c.arc(px, py, 5, 0, Math.PI * 2); c.fill();
    if (t.label) {
      c.font = '24px "Noto Serif SC", serif';
      c.fillStyle = GOLD;
      c.fillText(t.label, px + 20, py - 18);
    }
  }
}
