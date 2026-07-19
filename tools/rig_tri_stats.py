# rigged 模型诊断：面数 / 顶点合并度（是否未 weld=硬边）/ 法线一致性
import json, struct, sys, glob
import numpy as np

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

for path in sys.argv[1:]:
    doc, bin_ = load_glb(path)
    tv, tt, shared_ok, has_n = 0, 0, 0, 0
    for m in doc.get('meshes', []):
        for p in m['primitives']:
            v = read_accessor(doc, bin_, p['attributes']['POSITION'])
            idx = read_accessor(doc, bin_, p['indices']).reshape(-1) if 'indices' in p else np.arange(len(v))
            tv += len(v); tt += len(idx) // 3
            if 'NORMAL' in p['attributes']: has_n += 1
            # 顶点合并度：唯一位置数 / 顶点数（1.0=完全 weld；越小越多重复=硬边）
            key = np.round(v.astype(np.float64), 5)
            uniq = np.unique(key, axis=0).shape[0]
            shared_ok += uniq
    name = path.split('/')[-1][:60]
    print(f'{name}: tris={tt} verts={tv} uniqPos={shared_ok} weld率={shared_ok / tv:.2f} NORMAL meshes={has_n}')
