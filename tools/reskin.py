# reskin.py —— Kenney 人物贴图程序化重绘（PIL）
# 每件贴图 = 十字脸区 + 躯干/四肢色块。按规则重绘：
#  - 眼睛（近黑/眼白）保留；肤色块 → 角色肤色（保明度）；发/须 → 发色
#  - 其余全部（衣服+印花）按明度两档 → 服装主色/深色（印花被同色覆盖）
# 输出 assets/models/characters/tex/<npc>.png，不改源文件
import os
from PIL import Image

SRC = r'D:/AI游戏/游戏制作素材/人物3D/Models/GLB format/Textures'
if not os.path.isdir(SRC):
    SRC = r'D:/AI游戏/游戏制作素材/人物3D/方块状人物/Models/GLB format/Textures'
OUT = r'D:/AI游戏/game-正式版/assets/models/characters/tex'
os.makedirs(OUT, exist_ok=True)

def rgb(h):
    return ((h >> 16) & 255, (h >> 8) & 255, h & 255)

def lum(c):
    return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]

def hue_sat(c):
    r, g, b = [x / 255 for x in c]
    mx, mn = max(r, g, b), min(r, g, b)
    d = mx - mn
    if mx == 0:
        return 0, 0
    s = d / mx if mx else 0
    if d == 0:
        return 0, s
    if mx == r:
        h = ((g - b) / d) % 6
    elif mx == g:
        h = (b - r) / d + 2
    else:
        h = (r - g) / d + 4
    return h * 60, s

def scale(c, f):
    return tuple(min(255, max(0, round(x * f))) for x in c)

# 角色配置：源贴图 → { skin, hair, clothLight, clothDark, shirt }
ROLES = {
    'wargrave':   dict(src='texture-i.png', skin=0xd9b896, hair=0xd8d4cc, clothLight=0x23232a, clothDark=0x17171c, shirt=0xe8e4da),
    'vera':       dict(src='texture-e.png', skin=0xe8c39c, hair=0x6e4a2f, clothLight=0x5a6359, clothDark=0x3f4a41, shirt=0xd8d2c0),
    'vera2':      dict(src='texture-e.png', skin=0xe8c39c, hair=0x6e4a2f, clothLight=0x5a6359, clothDark=0x3f4a41, shirt=0xd8d2c0),
    'lombard':    dict(src='texture-m.png', skin=0xc89a6a, hair=0x2b2118, clothLight=0x4a3a2c, clothDark=0x33261c, shirt=0xcfc0a8),
    'armstrong':  dict(src='texture-b.png', skin=0xdcb491, hair=0x4a3a28, clothLight=0x555a61, clothDark=0x3a3d44, shirt=0xe8e4da),
    'blore':      dict(src='texture-k.png', skin=0xd9a07a, hair=0x5a5248, clothLight=0x5a4f45, clothDark=0x3f3a34, shirt=0xcfc6b4),
    'macarthur':  dict(src='texture-j.png', skin=0xd9b896, hair=0xe8e4da, clothLight=0x6a6c4c, clothDark=0x4a4c36, shirt=0xcfc6a0),
    'brent':      dict(src='texture-e.png', skin=0xd9b496, hair=0xb8b4ac, clothLight=0x453e4d, clothDark=0x2e2833, shirt=0xcfc6b4),
    'rogers':     dict(src='texture-q.png', skin=0xd9c0a8, hair=0x3a3028, clothLight=0x1e1e22, clothDark=0x141416, shirt=0xe8e4da),
    'mrs_rogers': dict(src='texture-e.png', skin=0xe0c0a8, hair=0x5a4a3a, clothLight=0x2e2a30, clothDark=0x1f1c22, shirt=0xcfc6b4),
    'marston':    dict(src='texture-q.png', skin=0xe0b490, hair=0x9a7a42, clothLight=0xd8cba8, clothDark=0xb09b7a, shirt=0xf2ead8),
}

BG_TOL = 14

def reskin(name, cfg):
    img = Image.open(os.path.join(SRC, cfg['src'])).convert('RGB')
    w, h = img.size
    px = img.load()
    # 背景色 = 全图最常见色
    from collections import Counter
    cnt = Counter(img.getdata())
    bg = cnt.most_common(1)[0][0]
    skin = rgb(cfg['skin'])
    hair = rgb(cfg['hair'])
    cl = rgb(cfg['clothLight'])
    cd = rgb(cfg['clothDark'])
    shirt = rgb(cfg['shirt'])
    out = Image.new('RGB', (w, h), bg)
    op = out.load()
    for y in range(h):
        for x in range(w):
            c = px[x, y]
            if abs(c[0] - bg[0]) < BG_TOL and abs(c[1] - bg[1]) < BG_TOL and abs(c[2] - bg[2]) < BG_TOL:
                op[x, y] = bg
                continue
            L = lum(c) / 255
            mx = max(c)
            mn = min(c)
            hu, sa = hue_sat(c)
            is_head = x < w * 0.5 and y < h * 0.52
            # 眼睛/眉毛（近黑）与眼白：仅脸区保留
            if is_head and (mx < 85 or (mn > 195 and sa < 0.12)):
                op[x, y] = c
                continue
            # 肤色（暖色相）
            if 8 <= hu <= 58 and sa > 0.10 and L > 0.28:
                op[x, y] = scale(skin, 0.62 + 0.55 * L)
                continue
            # 脸区其余 → 发色/袍色
            if is_head:
                op[x, y] = scale(hair, 0.55 + 0.6 * L)
                continue
            # 白衬衫/浅中性色 → 衬衫色（保明度）
            if sa < 0.14 and L > 0.72:
                op[x, y] = scale(shirt, 0.75 + 0.35 * L)
                continue
            # 其余（衣服/印花/配件）：明度两档 → 服装主色/深色
            op[x, y] = scale(cl, 0.6 + 0.65 * L) if L > 0.42 else scale(cd, 0.6 + 0.9 * L)
    out.save(os.path.join(OUT, name + '.png'))
    print('reskin:', name, '<-', cfg['src'])

if __name__ == '__main__':
    for name, cfg in ROLES.items():
        reskin(name, cfg)
    print('done ->', OUT)
