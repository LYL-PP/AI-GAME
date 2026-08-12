# castle_clean.py —— castle.glb 系统性清理（连通域悬空碎块 + 底部切片 + 碎石簇），烘 castle_clean.glb
# 规则：
#   A. 三角级连通域：非最大分量且分量最低点离地 > 0.5m → 整分量删除
#   B. 底部切片：游戏质心 y<4 且在保护带（|x|<20.5 且 |z|<14，城门/内院段）之外 → 删除
#   C. 右前缘亮白碎石簇：游戏盒 x[18,30] y[-2,5] z[6,14] → 删除
# 用法: python tools/castle_clean.py          # 干跑报告
#       python tools/castle_clean.py --write  # 烘 assets/models/scene/castle_clean.glb
import json, struct, sys, math
import numpy as np

SRC = 'assets/models/scene/castle.glb'
DST = 'assets/models/scene/castle_clean.glb'
WRITE = '--write' in sys.argv

# ---------- GLB 读取（复用 hall_tri_stats 口径） ----------
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
    count = acc['count']
    stride = bv.get('byteStride')
    if stride and stride != n * np.dtype(comp).itemsize:
        raw = np.frombuffer(bin_, dtype=np.uint8, count=stride * count, offset=off).reshape(count, stride)
        arr = np.zeros((count, n), dtype=comp)
        isz = np.dtype(comp).itemsize
        for c in range(n):
            arr[:, c] = np.frombuffer(raw[:, c * isz:(c + 1) * isz].tobytes(), dtype=comp)
        return arr
    return np.frombuffer(bin_, dtype=comp, count=count * n, offset=off).reshape(count, n)

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

# ---------- island.js groundHeight 离线同款（含垫丘，2026-07 同步） ----------
def smoothstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)

PLATEAU_C = (-42.0, -42.0)
PATH = [(0, -14), (-14, -20), (-6, -30), (-24, -36), (-36, -43)]
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
    lens = []
    total = 0.0
    for i in range(len(pts) - 1):
        l = math.hypot(pts[i+1][0]-pts[i][0], pts[i+1][1]-pts[i][1])
        lens.append(l); total += l
    acc = 0.0
    for i in range(len(pts) - 1):
        ax, az = pts[i]; bx, bz = pts[i+1]
        abx, abz = bx - ax, bz - az
        l2 = lens[i] * lens[i]
        t = max(0.0, min(1.0, ((x - ax) * abx + (z - az) * abz) / l2))
        qx, qz = ax + abx * t, az + abz * t
        d = math.hypot(x - qx, z - qz)
        if d < best_d:
            best_d, best_t = d, (acc + t * lens[i]) / total
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
    pi_d, pi_t = pathInfo(x, z, PATH)
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
    if bm > 0:
        h = h * (1 - bm) + max(h, BERM_H) * bm
    return h

# 地形采样缓存
_gcache = {}
def ground(x, z):
    k = (round(x * 2), round(z * 2))   # 0.5m 栅格
    if k not in _gcache:
        _gcache[k] = groundHeight(k[0] / 2, k[1] / 2)
    return _gcache[k]

# ---------- 主流程 ----------
doc, bin_ = load_glb(SRC)
scene = doc['scenes'][doc.get('scene', 0)]

# 深度优先遍历，给"含 mesh 的节点"编 mi（与运行时 gltf.scene.traverse 同序）
order = []   # [(mi, nodeIndex, worldMat)]
def walk(ni, parent):
    n = doc['nodes'][ni]
    M = parent @ node_mat(n)
    if 'mesh' in n:
        order.append((len(order), ni, M))
    for c in n.get('children', []):
        walk(c, M)
for ni in scene['nodes']:
    walk(ni, np.eye(4))

KEEP = {6, 7}
# 游戏坐标变换（raw → game）：S=2, RY=-pi/2, POS=(3,-2.55,-3)
def to_game(v):
    gx = -2.0 * v[:, 2] + 3.0
    gy = 2.0 * v[:, 1] - 2.55
    gz = 2.0 * v[:, 0] - 3.0
    return np.stack([gx, gy, gz], axis=1)

prims = []   # {docPrim, Vg (game), tris (local)}
V_all, T_all = [], []
vbase = 0
for mi, ni, M in order:
    if mi not in KEEP:
        continue
    n = doc['nodes'][ni]
    for p in doc['meshes'][n['mesh']]['primitives']:
        v = read_accessor(doc, bin_, p['attributes']['POSITION']).astype(np.float64)
        v = v @ M[:3, :3].T + M[:3, 3]
        idx = read_accessor(doc, bin_, p['indices']).reshape(-1) if 'indices' in p else np.arange(len(v), dtype=np.int64)
        T = idx.reshape(-1, 3).astype(np.int64)
        Vg = to_game(v)
        prims.append({'prim': p, 'V': Vg, 'T': T, 'vbase': vbase})
        V_all.append(Vg); T_all.append(T + vbase)
        vbase += len(v)

V = np.vstack(V_all)
T = np.vstack(T_all)
print(f'[load] 保留网格 6/7：verts={len(V)} tris={len(T)} prims={len(prims)}')

# ---------- 连通域（顶点按游戏坐标 5mm 焊接） ----------
key = np.floor(V * 200 + 0.5).astype(np.int64)
uk, inv = np.unique(key, axis=0, return_inverse=True)
parent = np.arange(len(uk), dtype=np.int64)
def find(x):
    while parent[x] != x:
        parent[x] = parent[parent[x]]
        x = parent[x]
    return x
Tw = inv[T]   # 焊接后的三角顶点
for t in Tw:
    r0 = find(t[0])
    for k in (1, 2):
        rk = find(t[k])
        if rk != r0:
            parent[rk] = r0
roots = np.array([find(t[0]) for t in Tw])
uniq, counts = np.unique(roots, return_counts=True)
comp_of = {u: i for i, u in enumerate(uniq)}
tri_comp = np.array([comp_of[r] for r in roots])
print(f'[连通域] 分量总数: {len(uniq)}')

# 分量统计
comp_info = []
for i, u in enumerate(uniq):
    sel = tri_comp == i
    tris = T[sel]
    vv = V[tris.reshape(-1)]
    clr = min(vv[k][1] - ground(vv[k][0], vv[k][2]) for k in range(0, len(vv), max(1, len(vv) // 3000)))
    comp_info.append({
        'id': i, 'tris': int(sel.sum()), 'minY': float(vv[:, 1].min()),
        'clearance': float(clr),
        'bbox': [[float(vv[:, j].min()), float(vv[:, j].max())] for j in range(3)],
    })
main_id = max(comp_info, key=lambda c: c['tris'])['id']
main_tris = max(c['tris'] for c in comp_info)
print(f'[连通域] 最大分量 #{main_id}: {main_tris} tris ({main_tris/len(T)*100:.1f}%)')

# 判定：非最大分量 且 最低点离地 > 0.5m → 删
del_comps = [c for c in comp_info if c['id'] != main_id and c['clearance'] > 0.5]
del_ids = {c['id'] for c in del_comps}
print(f'[连通域] 删除分量: {len(del_comps)} 个 / {sum(c["tris"] for c in del_comps)} tris')
print('  id  tris   minY   clear  bboxX         bboxZ')
for c in sorted(comp_info, key=lambda c: -c['tris'])[:25]:
    tag = 'MAIN' if c['id'] == main_id else ('DEL' if c['id'] in del_ids else 'keep')
    print(f"  #{c['id']:<3} {c['tris']:<6} {c['minY']:<6.2f} {c['clearance']:<6.2f} [{c['bbox'][0][0]:.1f},{c['bbox'][0][1]:.1f}] [{c['bbox'][2][0]:.1f},{c['bbox'][2][1]:.1f}] {tag}")

# ---------- 删除掩码 ----------
kill = np.isin(tri_comp, list(del_ids))
n_conn = int(kill.sum())

# C. 碎石簇盒
a = V[T[:, 0]]; b = V[T[:, 1]]; c = V[T[:, 2]]
cen = (a + b + c) / 3.0
rub = (cen[:, 0] > 18) & (cen[:, 0] < 30) & (cen[:, 1] > -2) & (cen[:, 1] < 5) & (cen[:, 2] > 6) & (cen[:, 2] < 14)
n_rub = int((rub & ~kill).sum())
kill |= rub

# D. 区域盒删除（游戏坐标质心；撕裂带/悬冠/北侧浮渣——与主体连通但整片无根，连通域规则够不着，按区域切）
#    与前期运行期 CUT 框组同口径，视觉已验证
BOX_DEL = [
    (12, 34, -2, 49, -53, -20.5),    # A 东北撕裂带全高
    (17.3, 23, 4.2, 9, -26, -13.5),  # B 东北内角浮块
    (1, 6, 3, 9, -37, -33),          # C 北侧浮块
    (-18, -14, 2, 9, -53, -48),      # D 北缘浮块
    (17, 19.5, 4, 9, -28, -3),       # E 东北内角浮块列
    (10, 17.5, 4.5, 20, -30, -14),   # F 北后废墟浮块
    (18, 31, 4, 24, -23, -7),        # G 东北后角废墟上冠（side45 肉眼悬浮；y0 对齐切片、y1 含框顶逃逸碎片、x/z 留边界余量）
    (24, 30, 4.5, 11, 4, 9.5),       # H 东翼前侧悬片（frag_ray 实证 x25.8-26.6/y5.0-9.4/z6.7 竖条，box G 的 z 域未覆盖）
]
n_box = 0
for (x0, x1, y0, y1, z0, z1) in BOX_DEL:
    m = (cen[:, 0] > x0) & (cen[:, 0] < x1) & (cen[:, 1] > y0) & (cen[:, 1] < y1) & (cen[:, 2] > z0) & (cen[:, 2] < z1)
    n_box += int((m & ~kill).sum())
    kill |= m

# E. 亮白撕裂尖刺（东南前角墙根 x[19,29] z[-2,14]：摄影测量 sliver 长三角，长宽比 > 12 删除）
_e1 = np.linalg.norm(b - a, axis=1); _e2 = np.linalg.norm(c - b, axis=1); _e3 = np.linalg.norm(c - a, axis=1)
_area = 0.5 * np.linalg.norm(np.cross(b - a, c - a), axis=1)
_longest = np.maximum(np.maximum(_e1, _e2), _e3)
_aspect = _longest / np.maximum(2 * _area / np.maximum(_longest, 1e-12), 1e-12)
_zone = (cen[:, 0] > 19) & (cen[:, 0] < 29) & (cen[:, 1] > 3) & (cen[:, 1] < 9) & (cen[:, 2] > -2) & (cen[:, 2] < 14)
sli = _zone & (_aspect > 12)
n_sli = int((sli & ~kill).sum())
kill |= sli

# B. 底部切片（保护带 |x|<20.5 且 |z|<14 之外，质心 y<4）
sl = (cen[:, 1] < 4.0) & ~((abs(cen[:, 0]) < 20.5) & (abs(cen[:, 2]) < 14))
n_slice = int((sl & ~kill).sum())
kill |= sl
print(f'[删除] 连通域悬空: {n_conn} | 碎石簇(增): {n_rub} | 区域盒(增): {n_box} | 尖刺sliver(增): {n_sli} | 底部切片(增): {n_slice} | 合计: {int(kill.sum())} / {len(T)} tris ({kill.mean()*100:.2f}%)')

if not WRITE:
    print('\n干跑完成（--write 烘 castle_clean.glb）')
    sys.exit(0)

# F. 亮白尖刺压暗（东南前角 x[16,28] y[2.5,10] z[-2,13.5]：顶点色压暗至 0.30，与墙根暗调一致；不切几何）
DARK_ZONE = (16, 28, 2.5, 10.0, -2, 13.5)
DARK_RGB = (0.30, 0.31, 0.33)
new_cols = []
for pr in prims:
    Vg = pr['V']
    col = np.ones((len(Vg), 3), dtype=np.float32)
    inz = (Vg[:, 0] > DARK_ZONE[0]) & (Vg[:, 0] < DARK_ZONE[1]) & (Vg[:, 1] > DARK_ZONE[2]) & (Vg[:, 1] < DARK_ZONE[3]) & (Vg[:, 2] > DARK_ZONE[4]) & (Vg[:, 2] < DARK_ZONE[5])
    col[inz] = DARK_RGB
    pr['prim']['attributes']['COLOR_0'] = -1   # 占位，追加 accessor 时回填
    new_cols.append(col.tobytes())
print(f'[压暗] COLOR_0 顶点色追加 ×{len(new_cols)} prim')

# ---------- 重建 GLB ----------
kill_by_prim = []
off = 0
for pr in prims:
    n = len(pr['T'])
    kill_by_prim.append(kill[off:off + n])
    off += n

# 每个 prim 的新索引数据（原索引为 uint16；逐 prim 顶点 <65536）
new_idx = []
for i, pr in enumerate(prims):
    keepT = pr['T'][~kill_by_prim[i]]
    assert keepT.max() < 65536, f'prim {i} 索引超 uint16'
    new_idx.append(keepT.reshape(-1).astype(np.uint16).tobytes())

# bufferView 引用计数（编辑过的 prim 的旧索引 bv 若被共享则保留）
edited_old_bv = {}
for pr in prims:
    acc = doc['accessors'][pr['prim']['indices']]
    edited_old_bv.setdefault(acc['bufferView'], 0)
for a in doc['accessors']:
    if a['bufferView'] in edited_old_bv:
        edited_old_bv[a['bufferView']] += 1
drop_bv = {bv for bv, n in edited_old_bv.items() if n == len([p for p in prims if doc['accessors'][p['prim']['indices']]['bufferView'] == bv])}
# 注：旧索引 bv 只被这些 prim 的 accessor 引用时才丢弃

new_bin = bytearray()
def align4(n):
    return (n + 3) & ~3
def push(data):
    pad = align4(len(new_bin)) - len(new_bin)
    if pad:
        new_bin.extend(b'\x00' * pad)
    off = len(new_bin)
    new_bin.extend(data)
    return off
bv_map = {}
new_bvs = []
for i, bv in enumerate(doc['bufferViews']):
    if i in drop_bv:
        continue
    start = bv.get('byteOffset', 0)
    data = bin_[start:start + bv['byteLength']]
    off4 = push(data)
    nbv = dict(bv); nbv['byteOffset'] = off4
    bv_map[i] = len(new_bvs); new_bvs.append(nbv)

new_accs = [dict(a) for a in doc['accessors']]
for a in new_accs:
    a['bufferView'] = bv_map[a['bufferView']]
for img in doc.get('images', []):
    if 'bufferView' in img:
        img['bufferView'] = bv_map[img['bufferView']]

# 追加新索引 bv + acc，回写 prim
for i, pr in enumerate(prims):
    data = new_idx[i]
    old_acc = doc['accessors'][pr['prim']['indices']]
    off4 = push(data)
    new_bvs.append({'buffer': 0, 'byteOffset': off4, 'byteLength': len(data), 'target': 34963})
    na = dict(old_acc)
    na['bufferView'] = len(new_bvs) - 1
    na['count'] = len(data) // 2
    na.pop('sparse', None)
    na.pop('byteOffset', None)
    if 'min' in na: na.pop('min')
    if 'max' in na: na.pop('max')
    new_accs.append(na)
    pr['prim']['indices'] = len(new_accs) - 1

# 追加 COLOR_0 顶点色 bv + acc
for i, pr in enumerate(prims):
    data = new_cols[i]
    off4 = push(data)
    new_bvs.append({'buffer': 0, 'byteOffset': off4, 'byteLength': len(data), 'target': 34962})
    new_accs.append({'bufferView': len(new_bvs) - 1, 'componentType': 5126, 'count': len(pr['V']), 'type': 'VEC3'})
    pr['prim']['attributes']['COLOR_0'] = len(new_accs) - 1

doc['bufferViews'] = new_bvs
doc['accessors'] = new_accs
doc['buffers'][0]['byteLength'] = len(new_bin)

j = json.dumps(doc, separators=(',', ':')).encode()
j += b' ' * (align4(len(j)) - len(j))
bin_out = bytes(new_bin) + b'\x00' * (align4(len(new_bin)) - len(new_bin))
total = 12 + 8 + len(j) + 8 + len(bin_out)
with open(DST, 'wb') as f:
    f.write(struct.pack('<III', 0x46546C67, 2, total))
    f.write(struct.pack('<II', len(j), 0x4E4F534A)); f.write(j)
    f.write(struct.pack('<II', len(bin_out), 0x004E4942)); f.write(bin_out)
import os
print(f'\n[烘制] {DST}: {os.path.getsize(DST)/1e6:.1f}MB（原 {os.path.getsize(SRC)/1e6:.1f}MB）')
print(f'[烘制] 保留 tris: {int((~kill).sum())} / {len(T)}')
