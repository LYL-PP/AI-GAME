# glb_tex.py —— GLB 内嵌贴图缩放（PIL；绕开 sharp 的 colourspace 报错）
# 用法: python tools/glb_tex.py in.glb out.glb <宽> <高>
import json, struct, sys, io
from PIL import Image

def align4(n):
    return (n + 3) & ~3

def main():
    src, dst, W, H = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
    with open(src, 'rb') as f:
        magic, ver, total = struct.unpack('<III', f.read(12))
        chunks = {}
        while f.tell() < total:
            clen, ctype = struct.unpack('<II', f.read(8))
            chunks[ctype] = f.read(clen)
    doc = json.loads(chunks[0x4E4F534A])
    bin_ = chunks[0x004E4942]

    # 各 image 的 bufferView → 缩放后字节
    replaced = {}   # bvIndex -> bytes
    for img in doc.get('images', []):
        if 'bufferView' not in img:
            print('  跳过 URI 贴图', img.get('uri', '')); continue
        bvi = img['bufferView']
        bv = doc['bufferViews'][bvi]
        off = bv.get('byteOffset', 0)
        data = bin_[off:off + bv['byteLength']]
        im = Image.open(io.BytesIO(data))
        orig = im.size
        im = im.resize((W, H), Image.LANCZOS)
        buf = io.BytesIO()
        has_alpha = im.mode in ('RGBA', 'LA', 'PA')
        im.save(buf, 'PNG')   # 保 alpha；统一 PNG（mimeType 不变）
        replaced[bvi] = buf.getvalue()
        print(f'  贴图 {orig[0]}x{orig[1]} → {W}x{H}: {len(data)/1048576:.1f}MB → {len(replaced[bvi])/1048576:.2f}MB')
        img['mimeType'] = 'image/png'

    # 重打包（替换 bv 数据，重映射）
    new_bin = bytearray()
    def push(data):
        pad = align4(len(new_bin)) - len(new_bin)
        if pad: new_bin.extend(b'\x00' * pad)
        off = len(new_bin)
        new_bin.extend(data)
        return off
    bv_map = {}
    new_bvs = []
    for i, bv in enumerate(doc['bufferViews']):
        start = bv.get('byteOffset', 0)
        data = replaced.get(i, None)
        if data is None:
            data = bin_[start:start + bv['byteLength']]
        off4 = push(data)
        nbv = dict(bv); nbv['byteOffset'] = off4; nbv['byteLength'] = len(data)
        bv_map[i] = len(new_bvs); new_bvs.append(nbv)
    for acc in doc['accessors']:
        acc['bufferView'] = bv_map[acc['bufferView']]
    for img in doc.get('images', []):
        if 'bufferView' in img:
            img['bufferView'] = bv_map[img['bufferView']]
    doc['bufferViews'] = new_bvs
    doc['buffers'][0]['byteLength'] = len(new_bin)

    j = json.dumps(doc, separators=(',', ':')).encode()
    j += b' ' * (align4(len(j)) - len(j))
    bin_out = bytes(new_bin) + b'\x00' * (align4(len(new_bin)) - len(new_bin))
    total = 12 + 8 + len(j) + 8 + len(bin_out)
    with open(dst, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, total))
        f.write(struct.pack('<II', len(j), 0x4E4F534A)); f.write(j)
        f.write(struct.pack('<II', len(bin_out), 0x004E4942)); f.write(bin_out)
    import os
    print(f'{os.path.basename(dst)}: {os.path.getsize(src)/1048576:.1f}MB → {os.path.getsize(dst)/1048576:.2f}MB')

main()
