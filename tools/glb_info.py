import json, struct, sys
def glb_info(path):
    with open(path, 'rb') as f:
        magic, ver, total = struct.unpack('<III', f.read(12))
        clen, ctype = struct.unpack('<II', f.read(8))
        doc = json.loads(f.read(clen))
    imgs = doc.get('images', [])
    name = path.replace('\\', '/').split('/')[-1]
    total_img = 0
    for i in imgs:
        bv = doc['bufferViews'][i['bufferView']]
        total_img += bv['byteLength']
    anims = [a.get('name', '') for a in doc.get('animations', [])]
    print(name)
    print('  images:', len(imgs), [i.get('mimeType') for i in imgs], 'bytes:', round(total_img / 1048576, 1), 'MB')
    print('  anims:', anims, '| skins:', len(doc.get('skins', [])), '| meshes:', len(doc.get('meshes', [])))
for p in sys.argv[1:]:
    glb_info(p)
