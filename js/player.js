// player.js —— 第一人称控制器：WASD + Shift 奔跑 + 鼠标环顾 + 重力 + 台阶步高
import * as THREE from './vendor/three.module.js';

const WALK = 2.9, RUN = 5.4, GRAVITY = 20;
const EYE = 1.62, RADIUS = 0.35, HEIGHT = 1.7, STEP = 0.35;
const PITCH_MAX = 85 * Math.PI / 180;

export class Player {
  constructor(camera, collision, dom) {
    this.camera = camera;
    this.col = collision;
    this.dom = dom;
    this.feet = new THREE.Vector3(0, 1.3, 100); // 脚底位置
    this.vy = 0;
    this.yaw = 0;       // 0 = 面向 -Z（北）
    this.pitch = 0;
    this.grounded = false;
    this.keys = Object.create(null);
    this.enabled = true;

    camera.rotation.order = 'YXZ';

    document.addEventListener('keydown', (e) => { this.keys[e.code] = true; });
    document.addEventListener('keyup',   (e) => { this.keys[e.code] = false; });
    window.addEventListener('blur', () => { this.keys = Object.create(null); });
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== this.dom || !this.enabled) return;
      this.yaw   -= e.movementX * 0.0023;
      this.pitch -= e.movementY * 0.0023;
      this.pitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, this.pitch));
    });
  }

  spawn(x, z, yaw = 0, y = null) {
    this.feet.set(x, y === null ? this.col.groundAt(x, z, 50) : y, z);
    this.yaw = yaw;
    this.pitch = 0;
    this.vy = 0;
  }

  // 目标点是否因地形原因不可进入（悬崖/海水/过高的坎）
  terrainBlocked(nx, nz) {
    const g = this.col.groundAt(nx, nz, this.feet.y);
    const dh = g - this.feet.y;
    if (dh > STEP + 0.01) return true;                       // 坎太高（>步高）
    const t = this.col.groundFn(nx, nz);
    const onTerrain = Math.abs(g - t) < 1e-6;                 // 地面是地形而非平台
    if (onTerrain) {
      if (t < 0.25) return true;                              // 海水（只允许走到浅水线）
      // 悬崖陡坡护栏：坡度大且上下都禁止
      const e = 0.6;
      const gx = (this.col.groundFn(nx + e, nz) - this.col.groundFn(nx - e, nz)) / (2 * e);
      const gz = (this.col.groundFn(nx, nz + e) - this.col.groundFn(nx, nz - e)) / (2 * e);
      if (Math.hypot(gx, gz) > 1.15 && Math.abs(dh) > 0.02) return true;
    }
    return false;
  }

  moveAxis(dx, dz) {
    const f = this.feet;
    let nx = f.x + dx, nz = f.z + dz;
    // 岛屿边界圆柱（码头等平台上豁免，可走到伸入海中的栈道）
    const r = Math.hypot(nx, nz);
    if (r > this.col.boundaryRadius && !this.col.hasPlatform(nx, nz, f.y)) return;
    if (this.terrainBlocked(nx, nz)) return;
    [nx, nz] = this.col.resolve(nx, nz, f.y, HEIGHT, RADIUS);
    if (this.terrainBlocked(nx, nz)) return;
    f.x = nx; f.z = nz;
  }

  update(dt) {
    if (!this.enabled) return;
    dt = Math.min(dt, 0.05);
    const k = this.keys;
    let ix = 0, iz = 0;
    if (k.KeyW || k.ArrowUp) iz += 1;
    if (k.KeyS || k.ArrowDown) iz -= 1;
    if (k.KeyA || k.ArrowLeft) ix -= 1;
    if (k.KeyD || k.ArrowRight) ix += 1;
    if (ix || iz) {
      const speed = (k.ShiftLeft || k.ShiftRight) ? RUN : WALK;
      const len = Math.hypot(ix, iz);
      ix /= len; iz /= len;
      const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
      // forward = (-s, -c)，right = (c, -s)
      const dx = (-s * iz + c * ix) * speed * dt;
      const dz = (-c * iz - s * ix) * speed * dt;
      // 分轴移动：被墙挡住时沿墙滑动
      this.moveAxis(dx, 0);
      this.moveAxis(0, dz);
    }
    // 垂直：重力 + 地面贴合（下台阶自动吸附）
    const f = this.feet;
    const g = this.col.groundAt(f.x, f.z, f.y);
    if (this.vy <= 0 && f.y - g <= 0.5) {
      f.y = g;
      this.vy = 0;
      this.grounded = true;
    } else {
      this.vy -= GRAVITY * dt;
      f.y += this.vy * dt;
      const g2 = this.col.groundAt(f.x, f.z, f.y + 0.5);
      if (f.y <= g2) { f.y = g2; this.vy = 0; this.grounded = true; }
      else this.grounded = false;
    }
    this.camera.position.set(f.x, f.y + EYE, f.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }
}
