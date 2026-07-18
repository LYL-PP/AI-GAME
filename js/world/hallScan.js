// hallScan.js —— 扫描级大厅内部（hall.glb 摄影测量件）
// 变换：rotation.y=+90°（扫描件 -x 门墙面 → +Z 南、+x 壁炉面 → -Z 北对齐游戏壁炉位）；
// 缩放非均匀（raw x→游戏 z ×0.86、raw y ×0.70、raw z→游戏 x ×1.19），嵌入一层大厅区（-8..8, -2..8）。
// 加载失败时 preload 返回 false，villa 按原样构建（程序化大厅兜底）。
import * as THREE from '../vendor/three.module.js';
import { GLTFLoader } from '../vendor/GLTFLoader.js';

const URL = 'assets/models/scene/hall.glb';
const SCALE = { x: 0.86, y: 0.70, z: 1.19 };
const POS = { x: -10.35, y: 2.7, z: 2.55 }; // 对齐后截图校准

let _gltf = null;

export async function preloadHallScan() {
  try {
    _gltf = await new GLTFLoader().loadAsync(URL);
    return true;
  } catch (e) {
    console.warn('[hallScan] 加载失败，保留程序化大厅：', e);
    _gltf = null;
    return false;
  }
}

export function buildHallScan(scene) {
  if (!_gltf) return false;
  const model = _gltf.scene;
  model.updateMatrixWorld(true);
  // 几何手术：切除碎裂吊灯簇三角（摄影测量吊灯碎渣，炸满大厅中北部；raw 框内三角心剔除）
  // 附带切除扫描件中央长桌（与游戏圆桌重叠）。raw 框：y -1..2.4（地板 -1.3 以下不动）
  const CUT = { x0: -4.0, x1: 2.4, y0: -1.0, y1: 2.4, z0: 6.2, z1: 10.6 };
  const vv = new THREE.Vector3();
  let cutTris = 0;
  model.traverse((o) => {
    if (!o.isMesh || !o.geometry.index) return;
    const pos = o.geometry.attributes.position;
    const idx = o.geometry.index.array;
    const keep = [];
    for (let i = 0; i < idx.length; i += 3) {
      let cx = 0, cy = 0, cz = 0;
      for (let k = 0; k < 3; k++) {
        vv.fromBufferAttribute(pos, idx[i + k]).applyMatrix4(o.matrixWorld);
        cx += vv.x / 3; cy += vv.y / 3; cz += vv.z / 3;
      }
      const inBox = cx > CUT.x0 && cx < CUT.x1 && cy > CUT.y0 && cy < CUT.y1 && cz > CUT.z0 && cz < CUT.z1;
      if (inBox) { cutTris++; continue; }
      keep.push(idx[i], idx[i + 1], idx[i + 2]);
    }
    if (keep.length !== idx.length) o.geometry.setIndex(keep);
  });
  console.log('[hallScan] 碎吊灯/中央桌切除：', cutTris, 'tris');
  const mats = new Set();
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = false;
    o.receiveShadow = true;
    mats.add(o.material);
  });
  // 整体压暗 0.62 灰蓝调（摄影测量偏亮，烛光/壁炉照明接管）
  for (const m of mats) {
    if (m.color) m.color.setRGB(0.62, 0.65, 0.71);
  }
  model.scale.set(SCALE.x, SCALE.y, SCALE.z);
  model.rotation.y = Math.PI / 2;
  const group = new THREE.Group();
  group.name = 'hallScan';
  group.position.set(POS.x, POS.y, POS.z);
  group.add(model);
  scene.add(group);
  console.log('[hallScan] 扫描大厅就位（~236k tris）');
  return group;
}
