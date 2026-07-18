// deathScenes.js —— 10 个定格死亡现场（尸体姿态 + 道具 + 剪影化处理）
import * as THREE from '../vendor/three.module.js';
import { GeoBatch, MAT } from '../world/props.js';

const F1 = 1.8, F2 = 5.0, F3 = 8.2;

export class DeathScenes {
  // o: { scene, collision, mgr, schedule }
  constructor(o) {
    Object.assign(this, o);
    this.col = o.collision;
    this.groups = new Map();  // chapter → THREE.Group（现场道具，可清理）
    this.bees = null;
  }

  _grp(chapter) {
    const g = new THREE.Group();
    this.scene.add(g);
    this.groups.set(chapter, g);
    return g;
  }
  cleanup(chapter) {
    const g = this.groups.get(chapter);
    if (g) { this.scene.remove(g); this.groups.delete(chapter); }
    if (chapter === 5) this.bees = null;
  }
  cleanupAll() {
    for (const ch of [...this.groups.keys()]) this.cleanup(ch);
    this.bees = null;
  }
  // 导航用静态现场坐标（不搭建现场）
  navSpot(chapter) {
    const F1y = 1.8, F2y = 5.0, F3y = 8.2;
    const table = {
      1: { x: 9.0, y: F1y, z: 4.2 },
      2: { x: 9.6, y: F2y, z: -5.6 },
      3: { x: 0, y: this.col.groundAt(0, -76.2, 50), z: -76.2 },
      4: { x: -19.2, y: this.col.groundAt(-19.2, 3.2, 50), z: 3.2 },
      5: { x: -5.0, y: F1y, z: 5.6 },
      6: { x: 2.5, y: F3y, z: 3.8 },
      7: { x: -65, y: Math.max(0.05, this.col.groundAt(-65, -56, 50)), z: -56 },
      8: { x: 0.2, y: F1y, z: 9.0 },
      9: { x: 44.5, y: this.col.groundAt(44.5, 50, 50), z: 50 },
      10: { x: -6, y: F2y, z: 4.0 },
    };
    return table[chapter] || null;
  }

  _corpse(npcId, x, y, z, yaw, pose) {
    const npc = this.mgr.get(npcId);
    if (!npc) return null;
    npc.prologueLock = true;
    this.schedule.states.delete(npcId);
    npc.pos.set(x, y, z);
    npc.yaw = yaw;
    npc.group.position.set(x, y, z);
    npc.group.rotation.set(0, yaw, 0);
    npc.setDeadPose(pose);
    return npc;
  }

  // 返回 { spot:{x,y,z}, victimId }
  build(chapter, victimId) {
    switch (chapter) {
      case 1: return this._marston();
      case 2: return this._mrsRogers();
      case 3: return this._macarthur();
      case 4: return this._rogers();
      case 5: return this._brent();
      case 6: return this._wargrave();
      case 7: return this._armstrong();
      case 8: return this._blore();
      case 9: return this._lombardProps();
      case 10: return this._vera();
    }
  }

  // 1 马尔斯顿：餐桌旁倒地 + 翻倒酒杯（尸体姿态由 chapterManager 事件后摆）
  _marston() {
    const g = this._grp(1);
    const b = new GeoBatch();
    b.add(new THREE.CylinderGeometry(0.035, 0.045, 0.09, 8), new THREE.Matrix4().makeRotationZ(Math.PI / 2).setPosition(9.6, F1 + 0.79, 3.1));
    b.add(new THREE.CylinderGeometry(0.14, 0.14, 0.008, 12), new THREE.Matrix4().setPosition(9.65, F1 + 0.755, 3.2));
    g.add(b.mesh(MAT.marble));
    const puddle = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.004, 12), new THREE.MeshBasicMaterial({ color: 0x4a1a1a }));
    puddle.position.set(9.65, F1 + 0.758, 3.2);
    g.add(puddle);
    return { spot: { x: 9.0, y: F1, z: 4.2 }, victimId: 'marston' };
  }

  // 2 罗杰斯太太：卧室床上"睡着" + 床头空药瓶
  _mrsRogers() {
    this._corpse('mrs_rogers', 9.1, F2 + 0.42, -6.6, Math.PI / 2, 'back');
    const g = this._grp(2);
    const b = new GeoBatch();
    b.add(new THREE.CylinderGeometry(0.03, 0.03, 0.09, 8), new THREE.Matrix4().setPosition(10.15, F2 + 0.62, -7.55));
    b.add(new THREE.CylinderGeometry(0.032, 0.032, 0.012, 8), new THREE.Matrix4().setPosition(10.15, F2 + 0.57, -7.55));
    g.add(b.mesh(MAT.marble));
    return { spot: { x: 9.6, y: F2, z: -5.6 }, victimId: 'mrs_rogers' };
  }

  // 3 麦克阿瑟：北岬角长椅坐姿 + 带血礁石
  _macarthur() {
    const gy = this.col.groundAt(0, -77.1, 50);
    this._corpse('macarthur', 0, gy + 0.42, -77.15, Math.PI, 'slump');
    const g = this._grp(3);
    const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35, 0), new THREE.MeshLambertMaterial({ color: 0x5d2a26 }));
    rock.position.set(0.85, this.col.groundAt(0.85, -77.4, 50) + 0.15, -77.4);
    rock.scale.y = 0.6;
    g.add(rock);
    return { spot: { x: 0, y: gy, z: -76.2 }, victimId: 'macarthur' };
  }

  // 4 罗杰斯：柴棚俯卧 + 散落柴木 + 门边斧
  _rogers() {
    const gy = this.col.groundAt(-19.2, 3.2, 50);
    this._corpse('rogers', -19.2, gy, 3.2, 0.5, 'prone');
    const g = this._grp(4);
    const logs = new GeoBatch();
    for (let i = 0; i < 5; i++) {
      const lg = new THREE.CylinderGeometry(0.08, 0.08, 0.8, 7);
      lg.rotateZ(Math.PI / 2);
      lg.rotateY(Math.random() * 3);
      lg.translate(-18.6 + Math.random() * 1.4, gy + 0.08, 2.4 + Math.random() * 1.6);
      logs.add(lg);
    }
    g.add(logs.mesh(MAT.wood, { cast: true }));
    const axe = new GeoBatch();
    axe.box(0.04, 0.7, 0.04, 0, 0.06, 0);
    axe.box(0.18, 0.1, 0.03, 0.1, 0.06, 0);
    const ax = axe.mesh(MAT.ironDark);
    ax.position.set(-18.2, gy + 0.02, 4.6);
    ax.rotation.set(Math.PI / 2, 0, 0.6);
    g.add(ax);
    return { spot: { x: -19.2, y: gy, z: 3.2 }, victimId: 'rogers' };
  }

  // 5 布伦特：大厅摇椅坐姿 + 窗外蜂群 + 注射器
  _brent() {
    this._corpse('brent', -5.5, F1, 6.3, 0.35, 'slump');
    const g = this._grp(5);
    const n = 26;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = -5.5 + (Math.random() - 0.5) * 1.6;
      pos[i * 3 + 1] = F1 + 1.3 + Math.random() * 0.9;
      pos[i * 3 + 2] = 8.6 + (Math.random() - 0.5) * 1.2;
    }
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.bees = new THREE.Points(bg, new THREE.PointsMaterial({ color: 0x2a2418, size: 0.05 }));
    g.add(this.bees);
    const syr = new GeoBatch();
    syr.box(0.02, 0.02, 0.16, 0, 0.01, 0);
    syr.box(0.006, 0.006, 0.06, 0, 0.01, 0.1);
    const s = syr.mesh(MAT.marble);
    s.position.set(-4.9, F1 + 0.01, 6.0);
    s.rotation.y = 0.8;
    g.add(s);
    return { spot: { x: -5.0, y: F1, z: 5.6 }, victimId: 'brent' };
  }

  // 6 沃格雷夫（假死）：书房扶手椅 + 红布法袍 + 灰毛线假发 + 额红点 + 蜡烛
  _wargrave() {
    this._corpse('wargrave', 2.5, F3, 5.0, -2.3, 'slump');
    const g = this._grp(6);
    const npc = this.mgr.get('wargrave');
    const robe = new GeoBatch();
    robe.box(0.5, 0.5, 0.26, 0, -0.05, 0.05);
    robe.box(0.56, 0.1, 0.3, 0, 0.24, 0.02);
    const robeM = robe.mesh(MAT.clothRed);
    robeM.position.set(2.5, F3 + 0.75, 5.05);
    robeM.rotation.y = -2.3;
    g.add(robeM);
    const wig = new THREE.Mesh(new THREE.SphereGeometry(0.115, 8, 6), MAT.paper);
    wig.scale.set(1, 0.55, 1);
    wig.position.set(2.5, F3 + 1.18, 5.0);
    g.add(wig);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 5), new THREE.MeshBasicMaterial({ color: 0x7a1f1f }));
    dot.position.set(2.47, F3 + 1.13, 5.08);
    g.add(dot);
    for (const dx of [-0.6, 0.6]) {
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.24, 8), MAT.porcelain);
      stick.position.set(2.5 + dx, F3 + 0.12, 4.6);
      const fl = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.1, 6), MAT.fireGlow);
      fl.position.set(2.5 + dx, F3 + 0.3, 4.6);
      g.add(stick, fl);
    }
    return { spot: { x: 2.5, y: F3, z: 3.8 }, victimId: 'wargrave' };
  }

  // 7 阿姆斯特朗：崖下礁石滩俯卧（潮水中，经崖后石坡可达）
  _armstrong() {
    const gx = -65, gz = -56;
    const gy = Math.max(0.05, this.col.groundAt(gx, gz, 50));
    this._corpse('armstrong', gx, gy + 0.15, gz, 0.9, 'prone');
    const g = this._grp(7);
    const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1, 0), MAT.trim);
    rock.scale.set(1.4, 0.25, 1);
    rock.position.set(gx, gy - 0.1, gz);
    g.add(rock);
    return { spot: { x: gx, y: gy, z: gz }, victimId: 'armstrong' };
  }

  // 8 布洛尔：门廊俯卧 + 碎裂熊钟残块
  _blore() {
    this._corpse('blore', 0.4, F1, 9.7, 0.2, 'prone');
    const g = this._grp(8);
    const fr = new GeoBatch();
    for (let i = 0; i < 6; i++) {
      fr.box(0.05 + Math.random() * 0.06, 0.04, 0.05, -0.2 + Math.random() * 0.8, F1 + 0.03, 9.0 + Math.random() * 0.8, 0xe8e6e0);
    }
    fr.add(new THREE.SphereGeometry(0.07, 7, 5), new THREE.Matrix4().setPosition(0.6, F1 + 0.06, 9.3));
    g.add(fr.mesh(MAT.marble));
    return { spot: { x: 0.2, y: F1, z: 9.0 }, victimId: 'blore' };
  }

  // 9 隆巴德：海滩（远观对峙事件，尸体姿态由 chapterManager 摆）；此处仅左轮道具
  _lombardProps() {
    const gy = this.col.groundAt(44, 50, 50);
    const g = this._grp(9);
    const gun = new GeoBatch();
    gun.box(0.03, 0.05, 0.16, 0, 0, 0);
    gun.box(0.025, 0.08, 0.03, 0, -0.05, -0.05);
    const gm = gun.mesh(MAT.ironDark);
    gm.position.set(44.6, gy + 0.03, 49.4);
    gm.rotation.x = Math.PI / 2;
    g.add(gm);
    return { spot: { x: 44.5, y: gy, z: 50 }, victimId: 'lombard' };
  }

  // 10 维拉：房间悬吊剪影 + 翻倒椅子
  _vera() {
    this._corpse('vera', -6, F2 + 0.1, 4.75, 0, 'hang');
    const g = this._grp(10);
    // 绳（从天花板到颈）
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.15, 6), MAT.wood);
    rope.position.set(-6, F2 + 2.35, 4.75);
    g.add(rope);
    // 翻倒的椅子
    const cb = new GeoBatch();
    cb.box(0.44, 0.05, 0.44, 0, 0.02, 0);
    cb.box(0.44, 0.55, 0.05, 0, 0.3, -0.2);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) cb.box(0.05, 0.46, 0.05, sx * 0.18, 0.25, sz * 0.18);
    const chair = cb.mesh(MAT.redWood);
    chair.position.set(-5.2, F2 + 0.05, 5.3);
    chair.rotation.set(Math.PI / 2, 0, 0.5);
    g.add(chair);
    return { spot: { x: -6, y: F2, z: 4.0 }, victimId: 'vera' };
  }

  update(dt, t) {
    if (this.bees) {
      const a = this.bees.geometry.attributes.position.array;
      for (let i = 0; i < a.length / 3; i++) {
        a[i * 3] += Math.sin(t * 3 + i * 1.7) * 0.12 * dt;
        a[i * 3 + 1] += Math.cos(t * 2.3 + i) * 0.1 * dt;
        a[i * 3 + 2] += Math.cos(t * 2.7 + i * 2.1) * 0.08 * dt;
      }
      this.bees.geometry.attributes.position.needsUpdate = true;
    }
  }
}
