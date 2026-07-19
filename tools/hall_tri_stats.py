# hall.glb 三角质量统计：面积分布 / sliver 长宽比 / 连通域大小分布（定过滤阈值用）
import json, struct, sys
import numpy as np

PATH = sys.argv[1] if len(sys.argv) > 1 else 'assets/models/scene/hall.glb'

def load_glb(path):
    with open(path, 'rb') as f:
        magic, ver, total = struct.unpack('<III', f.read(12))
        chunks = {}
        while f.tell() < total:
            clen, ctype = struct.unpack('<II', f.read(8))
            chunks[ctype] = f.read(clen)
    doc = json.loads(chunks[0x4E4F534A])
    bin_ = chunks[0x004E4942]
    return doc, bin_

def read_accessor(doc, bin_, ai):
    acc = doc['accessors'][ai]
    bv = doc['bufferViews'][acc['bufferView']]
    comp = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}[acc['componentType']]
    n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[acc['type']]
    off = bv.get('byteOffset', 0) + acc.get('byteOffset', 0)
    count = acc['count']
    stride = bv.get('byteStride')
    if stride and stride != n * np.dtype(comp).itemsize:
        raw = np.frombuffer(bin_, dtype=np.uint8, count=stride * count, offset=off)
        raw = raw.reshape(count, stride)
        arr = np.zeros((count, n), dtype=comp)
        for c in range(n):
            arr[:, c] = np.frombuffer(raw[:, c * np.dtype(comp).itemsize:(c + 1) * np.dtype(comp).itemsize].tobytes(), dtype=comp)
        return arr
    return np.frombuffer(bin_, dtype=comp, count=count * n, offset=off).reshape(count, n)

doc, bin_ = load_glb(PATH)

# 节点世界变换（只需 4x4）
def node_mat(n):
    m = np.eye(4, dtype=np.float64)
    if 'matrix' in n:
        return np.array(n['matrix'], dtype=np.float64).reshape(4, 4).T
    t = n.get('translation', [0, 0, 0]); r = n.get('rotation', [0, 0, 0, 1]); s = n.get('scale', [1, 1, 1])
    x, y, z, w = r
    R = np.array([
        [1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)],
        [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)],
        [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]])
    M = np.eye(4); M[:3, :3] = R * np.array(s); M[:3, 3] = t
    return M

scene = doc['scenes'][doc.get('scene', 0)]
world = {}
def walk(ni, parent):
    n = doc['nodes'][ni]
    M = parent @ node_mat(n)
    world[ni] = M
    for c in n.get('children', []):
        walk(c, M)
for ni in scene['nodes']:
    walk(ni, np.eye(4))

all_tris, all_verts = [], []
vbase = 0
for ni, M in world.items():
    n = doc['nodes'][ni]
    if 'mesh' not in n:
        continue
    for p in doc['meshes'][n['mesh']]['primitives']:
        v = read_accessor(doc, bin_, p['attributes']['POSITION']).astype(np.float64)
        v = v @ M[:3, :3].T + M[:3, 3]
        idx = read_accessor(doc, bin_, p['indices']).reshape(-1) if 'indices' in p else np.arange(len(v))
        all_verts.append(v)
        all_tris.append(idx.reshape(-1, 3).astype(np.int64) + vbase)
        vbase += len(v)

V = np.vstack(all_verts)
T = np.vstack(all_tris)
print(f'verts={len(V)} tris={len(T)}')

# 面积 + sliver 比
a = V[T[:, 0]]; b = V[T[:, 1]]; c = V[T[:, 2]]
ab = b - a; ac = c - a; bc = c - b
area = 0.5 * np.linalg.norm(np.cross(ab, ac), axis=1)
la = np.linalg.norm(ab, axis=1); lb = np.linalg.norm(bc, axis=1); lc = np.linalg.norm(ac, axis=1)
longest = np.maximum(np.maximum(la, lb), lc)
# sliver: 最长边 / 对应高（高 = 2A/最长边）
h = 2 * area / np.maximum(longest, 1e-12)
aspect = longest / np.maximum(h, 1e-12)

print('\n== 面积 (m²) 分布 ==')
for q in [1, 5, 10, 25, 50, 90, 99]:
    print(f'  p{q}: {np.percentile(area, q):.6f}')
for th in [1e-5, 2e-5, 5e-5, 1e-4, 2e-4, 5e-4, 1e-3]:
    print(f'  area<{th}: {int((area < th).sum())} tris ({(area < th).mean() * 100:.2f}%)')

print('\n== sliver 长宽比分布 ==')
for q in [50, 90, 95, 99, 99.9]:
    print(f'  p{q}: {np.percentile(aspect, q):.1f}')
for th in [10, 15, 20, 30, 50]:
    print(f'  aspect>{th}: {int((aspect > th).sum())} tris ({(aspect > th).mean() * 100:.2f}%)')

# 组合候选：小面积 或 极端 sliver
for ath, rth in [(1e-4, 20), (2e-4, 20), (1e-4, 30), (5e-5, 15)]:
    kill = (area < ath) | (aspect > rth)
    print(f'  [area<{ath} | aspect>{rth}] → {int(kill.sum())} tris ({kill.mean() * 100:.2f}%)')

# 连通域（并查集，顶点共享即连通）
print('\n== 连通域 ==')
parent = np.arange(len(V), dtype=np.int64)
def find(x):
    while parent[x] != x:
        parent[x] = parent[parent[x]]
        x = parent[x]
    return x
for t in T:
    r0 = find(t[0])
    for k in (1, 2):
        rk = find(t[k])
        if rk != r0:
            parent[rk] = r0
roots = np.array([find(t[0]) for t in T])
uniq, counts = np.unique(roots, return_counts=True)
order = np.argsort(-counts)
print(f'  连通域总数: {len(uniq)}')
for i in order[:10]:
    print(f'    #{i}: {counts[i]} tris')
small = counts[order][counts[order] < 50].sum()
print(f'  <50 tris 的域合计: {small} tris, 域数: {(counts[order] < 50).sum()}')
small2 = counts[order][counts[order] < 200].sum()
print(f'  <200 tris 的域合计: {small2} tris, 域数: {(counts[order] < 200).sum()}')
