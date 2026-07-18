#!/usr/bin/env python3
# 生成 11 张占位立绘 SVG (Art Deco 边框 + 剪影 + 名牌)
# 用法: python tools/make_portraits.py
import os

OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "portraits")
os.makedirs(OUT, exist_ok=True)

# (id, 中文名, 身份, 主色, 剪影类型 m/f/elderly_m/elderly_f/player)
CHARS = [
    ("wargrave",   "沃格雷夫",   "退休法官",   "#5a2e2e", "elderly_m"),
    ("vera",       "维拉",       "女教师",     "#3d5a4c", "f"),
    ("lombard",    "隆巴德",     "雇佣兵",     "#4a3b2a", "m"),
    ("armstrong",  "阿姆斯特朗", "医生",       "#2e4257", "m"),
    ("blore",      "布洛尔",     "前警探",     "#54452f", "m"),
    ("macarthur",  "麦克阿瑟",   "退役将军",   "#3f4a3a", "elderly_m"),
    ("brent",      "布伦特",     "老小姐",     "#4c3a4a", "elderly_f"),
    ("rogers",     "罗杰斯",     "管家",       "#37474f", "m"),
    ("mrs_rogers", "罗杰斯太太", "厨娘",       "#5d4a42", "f"),
    ("marston",    "马尔斯顿",   "花花公子",   "#6e5230", "m"),
    ("player",     "记录员",     "你",         "#2f2f38", "player"),
]

def silhouette(kind, color):
    head = {"m": 'cx="256" cy="230" rx="52" ry="60"', "f": 'cx="256" cy="228" rx="48" ry="56"',
            "elderly_m": 'cx="256" cy="232" rx="50" ry="58"', "elderly_f": 'cx="256" cy="230" rx="46" ry="54"',
            "player": 'cx="256" cy="230" rx="50" ry="58"'}[kind]
    body = f'<path d="M156 470 Q160 340 256 330 Q352 340 356 470 Z" fill="{color}" opacity="0.9"/>'
    head_el = f'<ellipse {head} fill="{color}"/>'
    extra = ""
    if kind == "f":
        extra = f'<path d="M208 220 Q200 300 214 320 L226 300 Q214 260 220 222 Z M304 220 Q312 300 298 320 L286 300 Q298 260 292 222 Z" fill="{color}"/>'
    elif kind == "elderly_f":
        extra = f'<circle cx="256" cy="176" r="20" fill="{color}"/>'
    elif kind == "elderly_m":
        extra = f'<path d="M206 210 Q256 150 306 210 L306 196 Q256 138 206 196 Z" fill="{color}" opacity="0.55"/>'
    elif kind == "player":
        extra = f'<rect x="216" y="330" width="80" height="100" rx="6" fill="#1c1c22" stroke="#c9a86a" stroke-width="3"/>'
    return body + head_el + extra

TEMPLATE = """<svg xmlns="http://www.w3.org/2000/svg" width="512" height="640" viewBox="0 0 512 640">
  <rect width="512" height="640" fill="#17171c"/>
  <rect x="18" y="18" width="476" height="604" fill="none" stroke="#c9a86a" stroke-width="3"/>
  <rect x="30" y="30" width="452" height="580" fill="none" stroke="#c9a86a" stroke-width="1" opacity="0.5"/>
  <path d="M30 90 L90 30 M482 90 L422 30 M30 550 L90 610 M482 550 L422 610" stroke="#c9a86a" stroke-width="1.5" opacity="0.7"/>
  <circle cx="256" cy="250" r="150" fill="{color}" opacity="0.14"/>
  {sil}
  <text x="256" y="545" text-anchor="middle" font-family="serif" font-size="44" fill="#e8e0cf">{name}</text>
  <text x="256" y="585" text-anchor="middle" font-family="serif" font-size="24" fill="#c9a86a">{role}</text>
  <text x="256" y="625" text-anchor="middle" font-family="serif" font-size="14" fill="#777">占位立绘 · 正式版见 docs/立绘与参考图提示词.md</text>
</svg>"""

for cid, name, role, color, kind in CHARS:
    svg = TEMPLATE.replace("{color}", color).replace("{sil}", silhouette(kind, color)) \
                  .replace("{name}", name).replace("{role}", role)
    open(os.path.join(OUT, f"{cid}.svg"), "w", encoding="utf-8").write(svg)
    print(f"{cid}.svg 生成")
print(f"共 {len(CHARS)} 张占位立绘 -> {os.path.abspath(OUT)}")
