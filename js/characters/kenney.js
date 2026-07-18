// kenney.js —— Kenney 方块人物库（CC0）：加载、归一化、整体调色、辨识配件
// 数据驱动：characters.json modelHint.kenney 指定文件，modelHint.tint 指定整体调色
import * as THREE from '../vendor/three.module.js';
import { GLTFLoader } from '../vendor/GLTFLoader.js';

const BASE = 'assets/models/characters/';
const PART_NAMES = {
  'leg-left': 'legL', 'leg-right': 'legR',
  'arm-left': 'armL', 'arm-right': 'armR',
  'head': 'head', 'torso': 'body',
};

export class KenneyLib {
  static async load(ids) {
    const loader = new GLTFLoader();
    const lib = new KenneyLib();
    lib.models = {};
    await Promise.all([...new Set(ids)].map(async (id) => {
      try {
        lib.models[id] = await loader.loadAsync(BASE + id + '.glb');
      } catch (e) {
        console.warn('[kenney] 加载失败（退回程序化模型）:', id, e?.message || e);
      }
    }));
    return lib;
  }

  has(id) { return !!this.models[id]; }

  // 构建 NPC：返回 { group, inner, parts, rawH }
  // tex：re-skin 贴图路径（优先）；tint：整体乘色（兜底，无 tex 时）
  build(id, { tex = null, tint = null, height = 1.7, accessories = [] } = {}) {
    const root = this.models[id].scene.clone(true);
    let texObj = null;
    if (tex) {
      texObj = new THREE.TextureLoader().load(tex);
      texObj.flipY = false;                 // GLTF 约定
      texObj.colorSpace = THREE.SRGBColorSpace;
      texObj.magFilter = THREE.NearestFilter; // 色块贴图保持硬边
      texObj.minFilter = THREE.NearestFilter;
    }
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.material = o.material.clone();
      if (texObj) {
        o.material.map = texObj;
        o.material.color.setHex(0xffffff);
      } else if (tint) {
        const c = Array.isArray(tint) ? new THREE.Color(tint[0], tint[1], tint[2]) : new THREE.Color(tint);
        o.material.color.multiply(c);
      }
      o.castShadow = false;
      o.receiveShadow = true;
    });
    // 归一化：脚底 y=0，总高 = height
    const bb = new THREE.Box3().setFromObject(root);
    const rawH = bb.max.y - bb.min.y;
    const s = height / rawH;
    const inner = new THREE.Group();
    root.scale.setScalar(s);
    root.position.y = -bb.min.y * s;
    inner.add(root);
    const group = new THREE.Group();
    group.add(inner);
    const parts = {};
    root.traverse((o) => {
      if (PART_NAMES[o.name]) parts[PART_NAMES[o.name]] = o;
    });
    // 辨识配件（眼镜/枪套/托盘/毛线团/白发），尺寸按人物高度比例
    const k = height / 1.75;
    for (const acc of accessories) {
      const m = this._accessory(acc, parts, k);
      if (m) group.add(m);
    }
    return { group, inner, parts, rawH };
  }

  _accessory(kind, parts, k) {
    const g = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: 0x22262c });
    const add = (w, h, d, x, y, z, m = mat) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z);
      g.add(mesh);
    };
    switch (kind) {
      case 'glasses': { // 眼镜（法官/医生）
        add(0.06 * k, 0.05 * k, 0.015 * k, -0.07 * k, 0, 0.13 * k);
        add(0.06 * k, 0.05 * k, 0.015 * k, 0.07 * k, 0, 0.13 * k);
        add(0.04 * k, 0.012 * k, 0.015 * k, 0, 0, 0.13 * k);
        if (parts.head) g.position.y = 0;
        parts.head?.add(g);
        return g;
      }
      case 'holster': { // 枪套（隆巴德）
        const m2 = new THREE.MeshLambertMaterial({ color: 0x4a3320 });
        add(0.07 * k, 0.16 * k, 0.05 * k, 0.22 * k, 0, 0.06 * k, m2);
        add(0.04 * k, 0.07 * k, 0.04 * k, 0.22 * k, 0.09 * k, 0.08 * k, mat);
        parts.body ? g.position.set(0, -0.35 * k, 0) : g.position.set(0.15 * k, 0.75 * k, 0);
        parts.body?.add(g);
        return g;
      }
      case 'tray': { // 托盘（管家）
        const tray = new THREE.Mesh(
          new THREE.CylinderGeometry(0.16 * k, 0.16 * k, 0.02 * k, 12),
          new THREE.MeshLambertMaterial({ color: 0xb8b4ac })
        );
        g.add(tray);
        const cup = new THREE.Mesh(
          new THREE.CylinderGeometry(0.04 * k, 0.045 * k, 0.07 * k, 8),
          new THREE.MeshLambertMaterial({ color: 0xe8e4da })
        );
        cup.position.set(-0.04 * k, 0.05 * k, 0.03 * k);
        g.add(cup);
        if (parts.armR) g.position.set(0, -0.55 * k, 0.14 * k);
        parts.armR?.add(g);
        return g;
      }
      case 'yarn': { // 毛线团+针（布伦特）
        const ball = new THREE.Mesh(
          new THREE.SphereGeometry(0.07 * k, 8, 6),
          new THREE.MeshLambertMaterial({ color: 0xb8b4ac })
        );
        g.add(ball);
        add(0.008 * k, 0.22 * k, 0.008 * k, 0.05 * k, 0.1 * k, 0.02 * k, new THREE.MeshLambertMaterial({ color: 0x8a8578 }));
        add(0.008 * k, 0.22 * k, 0.008 * k, -0.05 * k, 0.1 * k, 0.02 * k, new THREE.MeshLambertMaterial({ color: 0x8a8578 }));
        g.position.set(0, 0.55 * k, 0.25 * k);
        return g;
      }
      case 'whitehair': { // 白发（将军）
        const m2 = new THREE.MeshLambertMaterial({ color: 0xe8e4da });
        add(0.1 * k, 0.08 * k, 0.04 * k, -0.1 * k, 0.02 * k, 0, m2);
        add(0.1 * k, 0.08 * k, 0.04 * k, 0.1 * k, 0.02 * k, 0, m2);
        add(0.22 * k, 0.03 * k, 0.06 * k, 0, 0.1 * k, -0.04 * k, m2);
        parts.head?.add(g);
        return g;
      }
    }
    return null;
  }
}
