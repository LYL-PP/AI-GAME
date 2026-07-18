// sceneProps.js —— 录制动线道具通用加载（合并减面 / 预载缓存 / 失败回退）
// 用法：main.js 先 await preloadSceneProps({name: url,...})，各系统同步 getParts(name) 取件组装；
// 取不到（null）时回退现有程序化占位。
import * as THREE from '../vendor/three.module.js';
import { GLTFLoader } from '../vendor/GLTFLoader.js';

const _parts = new Map();   // name → [{geometry, material}] | null

// 把 GLB scene 按材质合并成 [{geometry, material}]（节点变换烘进几何）
function bakeParts(scene) {
  scene.updateMatrixWorld(true);
  const byMat = new Map();
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const m = mats[0];
    const geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
    if (!byMat.has(m)) byMat.set(m, []);
    byMat.get(m).push(geo);
  });
  const out = [];
  for (const [mat, geos] of byMat) out.push({ geometry: geos.length > 1 ? mergeGeoms(geos) : geos[0], material: mat });
  return out;
}

// 属性展开（InterleavedBufferAttribute 需逐顶点拆解，否则 .array 是整块交错缓冲）
function attrArray(attr, comps) {
  if (!attr) return null;
  if (!attr.isInterleavedBufferAttribute) return attr.array;
  const out = new Float32Array(attr.count * comps);
  for (let i = 0; i < attr.count; i++) {
    out[i * comps] = attr.getX(i);
    if (comps > 1) out[i * comps + 1] = attr.getY(i);
    if (comps > 2) out[i * comps + 2] = attr.getZ(i);
  }
  return out;
}

function mergeGeoms(list) {
  // 各属性独立累计（position/normal/uv 计数可能不一致，混用会越界）
  const cnt = { position: 0, normal: 0, uv: 0, index: 0 };
  for (const g of list) {
    cnt.position += g.attributes.position?.count ?? 0;
    cnt.normal += g.attributes.normal?.count ?? 0;
    cnt.uv += g.attributes.uv?.count ?? 0;
    cnt.index += g.index ? g.index.count : g.attributes.position.count;
  }
  const pos = new Float32Array(cnt.position * 3);
  const nor = new Float32Array(cnt.normal * 3);
  const uv = new Float32Array(cnt.uv * 2);
  const idx = cnt.position > 65000 ? new Uint32Array(cnt.index) : new Uint16Array(cnt.index);
  let vo = 0, no = 0, uo = 0, io = 0;
  for (const g of list) {
    const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
    if (p) pos.set(attrArray(p, 3), vo * 3);
    if (n) nor.set(attrArray(n, 3), no * 3);
    if (u) uv.set(attrArray(u, 2), uo * 2);
    if (g.index) { const ia = g.index.array; for (let i = 0; i < ia.length; i++) idx[io + i] = ia[i] + vo; io += ia.length; }
    else { for (let i = 0; i < p.count; i++) idx[io + i] = vo + i; io += p.count; }
    vo += p?.count ?? 0; no += n?.count ?? 0; uo += u?.count ?? 0;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

// 每 n 取 1 的步进减面（摄影测量件过采样，粗略但小尺寸下不可见）
export function decimate(geometry, n = 2) {
  if (n <= 1) return geometry;
  const idx = geometry.index ? geometry.index.array : null;
  if (!idx) return geometry;
  const keep = [];
  for (let i = 0; i < idx.length; i += 3) {
    if (((i / 3) | 0) % n === 0) keep.push(idx[i], idx[i + 1], idx[i + 2]);
  }
  geometry.setIndex(keep);
  return geometry;
}

// 三角心框选保留（草地等大场景切小块用）
export function cutGeometryBox(geometry, box) {
  const pos = geometry.attributes.position;
  const idx = geometry.index ? geometry.index.array : null;
  if (!idx) return geometry;
  const vv = new THREE.Vector3();
  const keep = [];
  for (let i = 0; i < idx.length; i += 3) {
    let cx = 0, cy = 0, cz = 0;
    for (let k = 0; k < 3; k++) {
      vv.fromBufferAttribute(pos, idx[i + k]);
      cx += vv.x / 3; cy += vv.y / 3; cz += vv.z / 3;
    }
    if (cx > box.x0 && cx < box.x1 && cy > box.y0 && cy < box.y1 && cz > box.z0 && cz < box.z1) keep.push(idx[i], idx[i + 1], idx[i + 2]);
  }
  geometry.setIndex(keep);
  return geometry;
}

export async function preloadSceneProps(defs) {
  const loader = new GLTFLoader();
  await Promise.all(Object.entries(defs).map(async ([name, url]) => {
    try {
      const g = await loader.loadAsync(url);
      _parts.set(name, bakeParts(g.scene));
    } catch (e) {
      console.warn(`[sceneProps] ${name} 加载失败，回退占位：`, e);
      _parts.set(name, null);
    }
  }));
}

export function getParts(name) { return _parts.get(name) ?? null; }

// 组装成 Group（可选减面/调色/投影设置）；material 克隆一次避免跨件串色
export function buildProp(parts, { decimateN = 1, tint = null, castShadow = false, receiveShadow = true } = {}) {
  const g = new THREE.Group();
  for (const p of parts) {
    const geo = decimateN > 1 ? decimate(p.geometry, decimateN) : p.geometry;
    let mat = p.material;
    if (tint) {
      mat = mat.clone();
      if (mat.color) mat.color.setRGB(tint[0], tint[1], tint[2], THREE.SRGBColorSpace);
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    g.add(mesh);
  }
  return g;
}
