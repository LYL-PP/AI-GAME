import json, struct, glob

def probe(p):
    with open(p, 'rb') as f:
        magic, ver, ln = struct.unpack('<III', f.read(12))
        clen, ctype = struct.unpack('<II', f.read(8))
        j = json.loads(f.read(clen))
    anims = [a.get('name', '?') for a in j.get('animations', [])]
    skins = len(j.get('skins', []))
    bones = len(j['skins'][0]['joints']) if skins else 0
    imgs = len(j.get('images', []))
    tris = 0
    for m in j.get('meshes', []):
        for prim in m.get('primitives', []):
            if 'indices' in prim:
                tris += j['accessors'][prim['indices']]['count'] // 3
    print(p.replace('\\', '/').split('/')[-1])
    print('  tris:', tris, '| anims:', anims, '| skins:', skins, '| bones:', bones, '| images:', imgs)

base = '游戏制作素材/人物3D/沃格雷夫法官/'
probe(base + 'Meshy_AI_Portrait_of_a_Judge_0718084613_generate.glb')
for f in sorted(glob.glob(base + 'Meshy_AI_Portrait_of_a_Judge_biped/*/*.glb')):
    probe(f)
