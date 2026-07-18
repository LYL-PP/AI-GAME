// collision.js —— 静态 AABB 碰撞 + 可行走平台 + 地形高度 + 岛屿边界
export class CollisionWorld {
  constructor() {
    this.boxes = [];        // 实心盒（墙/家具），玩家胶囊体水平推出
    this.platforms = [];    // 可行走水平面（地板/台阶/码头板）
    this.groundFn = () => 0; // 地形高度函数（island.js 注入）
    this.boundaryRadius = 95;
    this.stepHeight = 0.35;
  }

  addBox(x1, y1, z1, x2, y2, z2) {
    this.boxes.push({
      x1: Math.min(x1, x2), y1: Math.min(y1, y2), z1: Math.min(z1, z2),
      x2: Math.max(x1, x2), y2: Math.max(y1, y2), z2: Math.max(z1, z2),
    });
  }

  addPlatform(x1, z1, x2, z2, y) {
    this.platforms.push({
      x1: Math.min(x1, x2), z1: Math.min(z1, z2),
      x2: Math.max(x1, x2), z2: Math.max(z1, z2), y,
    });
  }

  setGroundFunction(fn) { this.groundFn = fn; }

  // (x,z) 处是否存在 feetY 可踏上的平台
  hasPlatform(x, z, feetY) {
    const lim = feetY + this.stepHeight;
    for (const p of this.platforms) {
      if (x >= p.x1 && x <= p.x2 && z >= p.z1 && z <= p.z2 && p.y <= lim) return true;
    }
    return false;
  }

  // 脚下地面高度 = max(地形, 所有可踏上的平台顶)
  groundAt(x, z, feetY) {
    let g = this.groundFn(x, z);
    const lim = feetY + this.stepHeight;
    for (const p of this.platforms) {
      if (x >= p.x1 && x <= p.x2 && z >= p.z1 && z <= p.z2 && p.y > g && p.y <= lim) g = p.y;
    }
    return g;
  }

  // 胶囊体（简化为 XZ 圆）对全部 AABB 的水平滑动推出
  resolve(px, pz, feetY, height, radius) {
    for (let it = 0; it < 2; it++) {
      for (const b of this.boxes) {
        if (feetY + this.stepHeight >= b.y2) continue; // 顶面可踏上，不当墙
        if (feetY + height <= b.y1) continue;          // 高过头顶
        const cx = px < b.x1 ? b.x1 : px > b.x2 ? b.x2 : px;
        const cz = pz < b.z1 ? b.z1 : pz > b.z2 ? b.z2 : pz;
        let dx = px - cx, dz = pz - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= radius * radius) continue;
        if (d2 > 1e-9) {
          const d = Math.sqrt(d2);
          const push = (radius - d) / d;
          px += dx * push;
          pz += dz * push;
        } else {
          // 圆心在盒内：沿最小穿透轴推出
          const pxl = px - b.x1, pxr = b.x2 - px;
          const pzl = pz - b.z1, pzr = b.z2 - pz;
          const m = Math.min(pxl, pxr, pzl, pzr);
          if (m === pxl) px = b.x1 - radius;
          else if (m === pxr) px = b.x2 + radius;
          else if (m === pzl) pz = b.z1 - radius;
          else pz = b.z2 + radius;
        }
      }
    }
    return [px, pz];
  }
}
