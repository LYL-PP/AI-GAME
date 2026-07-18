import json, struct, sys
from collections import Counter

def probe(p):
    with open(p, 'rb') as f:
        magic, ver, ln = struct.unpack('<III', f.read(12))
        clen, ctype = struct.unpack('<II', f.read(8))
        j = json.loads(f.read(clen))
    meshes = j.get('meshes', [])
    prims = sum(len(m.get('primitives', [])) for m in meshes)
    mats = j.get('materials', [])
    texs = j.get('textures', [])
    imgs = j.get('images', [])
    tris = 0
    for m in meshes:
        for prim in m.get('primitives', []):
            if 'indices' in prim:
                tris += j['accessors'][prim['indices']]['count'] // 3
            else:
                tris += j['accessors'][prim['attributes']['POSITION']]['count'] // 3
    # 包围盒：遍历 POSITION accessor min/max，应用节点变换（简化：只取 accessor min/max 的并集，忽略变换）
    mn = [1e30]*3; mx = [-1e30]*3
    for m in meshes:
        for prim in m.get('primitives', []):
            a = j['accessors'][prim['attributes']['POSITION']]
            for k in range(3):
                mn[k] = min(mn[k], a['min'][k]); mx[k] = max(mx[k], a['max'][k])
    print('==', p.split('/')[-1])
    print('  meshes:', len(meshes), '| prims:', prims, '| materials:', len(mats), '| textures:', len(texs), '| images:', len(imgs))
    print('  tris:', tris)
    print('  bbox min:', [round(v,2) for v in mn], 'max:', [round(v,2) for v in mx])
    print('  size:', [round(mx[k]-mn[k],2) for k in range(3)])
    # 材质名
    names = [m.get('name','?') for m in mats[:12]]
    print('  mat names:', names)
    # 节点树顶层
    scenes = j.get('scenes', [{}])
    roots = scenes[0].get('nodes', [])
    print('  root nodes:', len(roots), [j['nodes'][r].get('name','?') for r in roots[:8]])
    # 节点变换统计（是否有非均匀缩放/大平移）
    tcount = sum(1 for n in j.get('nodes', []) if 'matrix' in n or 'translation' in n or 'scale' in n)
    print('  nodes with transform:', tcount, '/', len(j.get('nodes', [])))

probe('assets/models/scene/castle.glb')
probe('assets/models/scene/hall.glb')
