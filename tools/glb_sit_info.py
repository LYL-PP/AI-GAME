import json, struct, glob, sys

def probe(p):
    with open(p, 'rb') as f:
        magic, ver, ln = struct.unpack('<III', f.read(12))
        clen, ctype = struct.unpack('<II', f.read(8))
        j = json.loads(f.read(clen))
    anims = [a.get('name', '?') for a in j.get('animations', [])]
    skins = len(j.get('skins', []))
    bones = len(j['skins'][0]['joints']) if skins else 0
    tris = 0
    for m in j.get('meshes', []):
        for prim in m.get('primitives', []):
            if 'indices' in prim:
                tris += j['accessors'][prim['indices']]['count'] // 3
    # 根节点缩放
    scales = []
    for n in j.get('nodes', []):
        if 'scale' in n:
            scales.append((n.get('name', '?'), [round(s, 4) for s in n['scale']]))
    name = p.replace('\\', '/').split('/')[-1]
    print(name)
    print('  tris:', tris, '| anims:', anims, '| skins:', skins, '| bones:', bones, '| scaledNodes:', scales[:4])

for d in ['vera', 'lombard', 'marston']:
    print('====', d)
    for f in sorted(glob.glob(f'assets/models/characters/rigged/{d}/*.glb')):
        probe(f)
