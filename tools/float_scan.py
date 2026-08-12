# float_scan.py —— 对 castle_clean.glb 做"肉眼悬空"扫描：质心离地 >2m 且正下方无支撑三角的簇
# 用法: python tools/float_scan.py [glb路径，默认 assets/models/scene/castle_clean.glb]
import json, struct, sys, math
import numpy as np

PATH = sys.argv[1] if len(sys.argv) > 1 else 'assets/models/scene/castle_clean.glb'
KEEP = {6, 7}

def load_glb(path):
    with open(path, 'rb') as f:
        magic, ver, total = struct.unpack('<III', f.read(12))
        chunks = {}
        while f.tell() < total:
            clen, ctype = struct.unpack('<II', f.read(8))
            chunks[ctype] = f.read(clen)
    return json.loads(chunks[0x4E4F534A]), chunks[0x004E4942]

def read_accessor(doc, bin_, ai):
    acc = doc['accessors'][ai]
    bv = doc['bufferViews'][acc['bufferView']]
    comp = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}[acc['componentType']]
    n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[acc['type']]
    off = bv.get('byteOffset', 0) + acc.get('byteOffset', 0)
    return np.frombuffer(bin_, dtype=comp, count=acc['count'] * n, offset=off).reshape(acc['count'], n)

def node_mat(n):
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

def smoothstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)
PLATEAU_C = (-42.0, -42.0)
PATH_ = [(0, -14), (-14, -20), (-6, -30), (-24, -36), (-36, -43)]
PATH2 = [(-50, -38), (-58, -46), (-65, -56)]
VILLA_PAD = (-16, -12, 16, 18)
_bl = math.hypot(0.65, 0.76)
BEACH_DIR = (0.65 / _bl, 0.76 / _bl)
BERM_H = 2.95
BERM_LINES = [
    [(-21, -17), (-22.5, -8), (-24.5, 0), (-26, 4), (-23.5, 9)],
    [(24.5, -24), (24.5, -18), (24, -12), (24, -8), (25, 0), (27, 4), (26, 9), (23, 12), (21.5, 11.5)],
]
def pathInfo(x, z, pts):
    best_d, best_t = 1e18, 0.0
    lens = []; total = 0.0
    for i in range(len(pts) - 1):
        l = math.hypot(pts[i+1][0]-pts[i][0], pts[i+1][1]-pts[i][1]); lens.append(l); total += l
    acc = 0.0
    for i in range(len(pts) - 1):
        ax, az = pts[i]; bx, bz = pts[i+1]
        abx, abz = bx - ax, bz - az
        l2 = lens[i] * lens[i]
        t = max(0.0, min(1.0, ((x - ax) * abx + (z - az) * abz) / l2))
        d = math.hypot(x - (ax + abx * t), z - (az + abz * t))
        if d < best_d: best_d, best_t = d, (acc + t * lens[i]) / total
        acc += lens[i]
    return best_d, best_t
def bermDist(x, z):
    best = 1e18
    for line in BERM_LINES:
        for i in range(len(line) - 1):
            ax, az = line[i]; bx, bz = line[i + 1]
            abx, abz = bx - ax, bz - az
            l2 = abx * abx + abz * abz
            t = max(0.0, min(1.0, ((x - ax) * abx + (z - az) * abz) / l2))
            d = math.hypot(x - (ax + abx * t), z - (az + abz * t))
            if d < best: best = d
    return best
def groundHeight(x, z):
    r = math.hypot(x, z)
    h = 1.6 - smoothstep(70, 96, r) * 3.4
    dp = math.hypot(x - PLATEAU_C[0], z - PLATEAU_C[1])
    pm = smoothstep(34, 16, dp)
    h += pm * 9.2
    rl = max(r, 1e-4)
    nw = smoothstep(0.8, 0.95, (x / rl) * -0.707 + (z / rl) * -0.707)
    h -= smoothstep(64, 72, r) * 12 * nw * (1 - pm * 0.999)
    bs = smoothstep(0.72, 0.9, (x / rl) * BEACH_DIR[0] + (z / rl) * BEACH_DIR[1])
    beachH = 1.3 - max(0, r - 56) * 0.055
    h = h * (1 - bs) + min(h, beachH) * bs
    pi_d, pi_t = pathInfo(x, z, PATH_)
    rampH = 1.5 + 8.8 * smoothstep(0, 1, pi_t)
    w = smoothstep(6.5, 2.2, pi_d)
    h = h * (1 - w) + rampH * w
    pi2_d, pi2_t = pathInfo(x, z, PATH2)
    rampH2 = 10.4 - 9.85 * smoothstep(0, 1, pi2_t)
    w2 = smoothstep(4.5, 1.6, pi2_d)
    h = h * (1 - w2) + rampH2 * w2
    dshelf = math.hypot(x + 65, z + 56)
    sh = smoothstep(5.5, 2.5, dshelf)
    h = h * (1 - sh) + 0.6 * sh
    cove = (x / 10) ** 2 + ((z - 56) / 26) ** 2
    cw = smoothstep(1.05, 0.5, cove)
    h = h * (1 - cw) + min(h, -1.3) * cw
    dx = max(VILLA_PAD[0] - x, 0, x - VILLA_PAD[2])
    dz = max(VILLA_PAD[1] - z, 0, z - VILLA_PAD[3])
    dpv = math.hypot(dx, dz)
    h = h * smoothstep(1.5, 5, dpv) + 1.5 * (1 - smoothstep(1.5, 5, dpv))
    bm = smoothstep(5.5, 1.5, bermDist(x, z))
    if bm > 0: h = h * (1 - bm) + max(h, BERM_H) * bm
    return h
_gcache = {}
def ground(x, z):
    k = (round(x * 2), round(z * 2))
    if k not in _gcache: _gcache[k] = groundHeight(k[0] / 2, k[1] / 2)
    return _gcache[k]

doc, bin_ = load_glb(PATH)
scene = doc['scenes'][doc.get('scene', 0)]
order = []
def walk(ni, parent):
    n = doc['nodes'][ni]
    M = parent @ node_mat(n)
    if 'mesh' in n: order.append((len(order), ni, M))
    for c in n.get('children', []): walk(c, M)
for ni in scene['nodes']: walk(ni, np.eye(4))

def to_game(v):
    return np.stack([-2.0 * v[:, 2] + 3.0, 2.0 * v[:, 1] - 2.55, 2.0 * v[:, 0] - 3.0], axis=1)

V_all, T_all = [], []
vbase = 0
for mi, ni, M in order:
    if mi not in KEEP: continue
    n = doc['nodes'][ni]
    for p in doc['meshes'][n['mesh']]['primitives']:
        v = read_accessor(doc, bin_, p['attributes']['POSITION']).astype(np.float64)
        v = v @ M[:3, :3].T + M[:3, 3]
        idx = read_accessor(doc, bin_, p['indices']).reshape(-1)
        V_all.append(to_game(v)); T_all.append(idx.reshape(-1, 3).astype(np.int64) + vbase)
        vbase += len(v)
V = np.vstack(V_all); T = np.vstack(T_all)
cen = (V[T[:, 0]] + V[T[:, 1]] + V[T[:, 2]]) / 3.0
print(f'tris={len(T)}')

# 支撑栅格：(ix,iz) -> 该柱位三角质心 y 列表
from collections import defaultdict
grid = defaultdict(list)
gy = np.array([ground(x, z) for x, z in cen[:, [0, 2]]])
for i in range(len(cen)):
    grid[(int(cen[i, 0]), int(cen[i, 2]))].append(cen[i, 1])

# 悬空判定：离地 >2m 且 3×3 邻域无 y' < y-1.5 的支撑
float_mask = np.zeros(len(cen), dtype=bool)
for i in range(len(cen)):
    x, y, z = cen[i]
    if y - gy[i] <= 2.0: continue
    sup = False
    for dx in (-1, 0, 1):
        for dz in (-1, 0, 1):
            for yy in grid.get((int(x) + dx, int(z) + dz), []):
                if yy < y - 1.5: sup = True; break
            if sup: break
        if sup: break
    if not sup: float_mask[i] = True
print(f'悬空三角: {int(float_mask.sum())}')

# 聚类（栅格邻接，1.5m）
fi = np.where(float_mask)[0]
cell = {}
for i in fi:
    k = (int(cen[i, 0] / 1.5), int(cen[i, 2] / 1.5), int(cen[i, 1] / 1.5))
    cell.setdefault(k, []).append(i)
seen = set()
clusters = []
for i in fi:
    if i in seen: continue
    stack = [i]; seen.add(i); comp = []
    while stack:
        j = stack.pop(); comp.append(j)
        k = (int(cen[j, 0] / 1.5), int(cen[j, 2] / 1.5), int(cen[j, 1] / 1.5))
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for dz in (-1, 0, 1):
                    for m in cell.get((k[0]+dx, k[1]+dz, k[2]+dy), []):
                        if m not in seen: seen.add(m); stack.append(m)
    clusters.append(comp)
clusters.sort(key=lambda c: -len(c))
print(f'悬空簇: {len(clusters)}')
print('  tris   bboxX          bboxY        bboxZ          最低离地')
for c in clusters[:20]:
    if len(c) < 8: break
    vv = cen[c]
    clr = min(vv[k][1] - ground(vv[k][0], vv[k][2]) for k in range(len(vv)))
    print(f'  {len(c):<6} [{vv[:,0].min():.1f},{vv[:,0].max():.1f}]  [{vv[:,1].min():.1f},{vv[:,1].max():.1f}]  [{vv[:,2].min():.1f},{vv[:,2].max():.1f}]  {clr:.2f}')
