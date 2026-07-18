import json, struct, glob

def probe(p):
    with open(p, 'rb') as f:
        magic, ver, ln = struct.unpack('<III', f.read(12))
        clen, ctype = struct.unpack('<II', f.read(8))
        j = json.loads(f.read(clen))
    tris = 0
    for m in j.get('meshes', []):
        for prim in m.get('primitives', []):
            if 'indices' in prim:
                tris += j['accessors'][prim['indices']]['count'] // 3
            else:
                tris += j['accessors'][prim['attributes']['POSITION']]['count'] // 3
    mn = [1e30]*3; mx = [-1e30]*3
    for m in j.get('meshes', []):
        for prim in m.get('primitives', []):
            a = j['accessors'][prim['attributes']['POSITION']]
            for k in range(3):
                mn[k] = min(mn[k], a['min'][k]); mx[k] = max(mx[k], a['max'][k])
    mats = [mt.get('name','?') for mt in j.get('materials', [])[:4]]
    basic = any('KHR_materials_unlit' in (mt.get('extensions') or {}) for mt in j.get('materials', []))
    name = p.replace('\\','/').split('/')[-1]
    print(f"{name}: tris={tris} meshes={len(j.get('meshes',[]))} mats={mats} unlit={basic}")
    print(f"   localSize={[round(mx[k]-mn[k],2) for k in range(3)]} min={[round(v,2) for v in mn]} max={[round(v,2) for v in mx]}")

for f in sorted(glob.glob('assets/models/scene/*.glb')):
    probe(f)
