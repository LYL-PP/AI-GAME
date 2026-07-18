#!/usr/bin/env python3
# M0 数据校验: python tools/validate_data.py
import json, os, sys, glob

ROOT = os.path.join(os.path.dirname(__file__), "..", "data")
errors, warnings = [], []

def load(rel):
    path = os.path.join(ROOT, rel)
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        errors.append(f"{rel}: JSON 解析失败 {e}")
        return None

characters = load("characters.json") or {}
rhyme = load("rhyme.json") or {}
accusation = load("accusation.json") or {}
chapters = load("chapters.json") or {}
deaths = load("deaths.json") or {}
clues = load("clues.json") or {}
confession = load("confession.json") or {}
endings = load("endings.json") or {}
ui = load("ui.json") or {}
dialogues = {}
for f in sorted(glob.glob(os.path.join(ROOT, "dialogues", "*.json"))):
    d = None
    try:
        d = json.load(open(f, encoding="utf-8"))
    except Exception as e:
        errors.append(f"dialogues/{os.path.basename(f)}: JSON 解析失败 {e}")
        continue
    dialogues[d["npc"]] = d

if errors:
    for e in errors: print("ERR ", e)
    sys.exit(1)

char_ids = {c["id"] for c in characters["characters"]}
npc_ids = char_ids - {"player"}
clue_ids = {c["id"] for c in clues["clues"]}
chapter_ids = {c["id"] for c in chapters["chapters"]}
death_by_victim = {d["victimId"]: d for d in deaths["deaths"]}

# 1. 数量
if len(characters["characters"]) != 11: errors.append("characters 应为 11 人")
if len(rhyme["rhyme"]["lines"]) != 10: errors.append("童谣应为 10 句")
if len(accusation["accusation"]["charges"]) != 11: errors.append("指控应为 11 条")
if len(chapters["chapters"]) != 12: errors.append("章节应为 12")
if len(deaths["deaths"]) != 10: errors.append("死亡应为 10")
if len(clues["clues"]) != 13: errors.append("线索应为 13")
if len(confession["confession"]["segments"]) != 5: errors.append("自白信应为 5 段")
if len(endings["endings"]) != 4: errors.append("结局应为 4")

# 2. 童谣/指控/死亡的受害者引用
for line in rhyme["rhyme"]["lines"]:
    if line["victimId"] not in npc_ids: errors.append(f"童谣第{line['index']}句 victimId 无效: {line['victimId']}")
for ch in accusation["accusation"]["charges"]:
    if ch["targetId"] not in char_ids: errors.append(f"指控 targetId 无效: {ch['targetId']}")
for d in deaths["deaths"]:
    if d["victimId"] not in npc_ids: errors.append(f"死亡 victimId 无效: {d['victimId']}")
    if d["chapter"] not in chapter_ids: errors.append(f"死亡章节无效: {d['chapter']}")
    for cid in d["clueIds"]:
        if cid not in clue_ids: errors.append(f"{d['victimId']} 引用了不存在的线索 {cid}")

# 3. 死亡顺序 = 童谣顺序 = 章节顺序
seq = [(d["chapter"], d["victimId"]) for d in sorted(deaths["deaths"], key=lambda x: x["chapter"])]
rhyme_seq = [l["victimId"] for l in sorted(rhyme["rhyme"]["lines"], key=lambda x: x["index"])]
if [v for _, v in seq] != rhyme_seq: errors.append(f"死亡顺序与童谣不符: {seq} vs {rhyme_seq}")

# 4. 链 A 线索
chain_a = set(clues["chains"]["A"]["clueIds"])
if chain_a != {"clue_08", "clue_09", "clue_10"}: errors.append(f"链 A 线索集异常: {chain_a}")

# 5. 对话树: id 唯一、next 闭合、requireClue 存在、章节不越死亡章
all_ids = set()
for npc, d in dialogues.items():
    if npc == "_echoes": continue
    if npc not in npc_ids:
        errors.append(f"对话文件 npc 无效: {npc}"); continue
    death_ch = death_by_victim.get(npc, {}).get("chapter")
    for ch, body in d["chapters"].items():
        if int(ch) not in chapter_ids: errors.append(f"{npc} 对话章节无效: {ch}")
        if death_ch is not None and int(ch) > death_ch:
            errors.append(f"{npc} 死于第 {death_ch} 章, 却有第 {ch} 章对话")
        if death_ch is not None and int(ch) == death_ch and npc != "vera":
            warnings.append(f"{npc} 在死亡章({ch})仍有对话(仅维拉允许独白)")
        ids = {n["id"] for n in body["nodes"]}
        for n in body["nodes"]:
            if n["id"] in all_ids: errors.append(f"节点 id 重复: {n['id']}")
            all_ids.add(n["id"])
            refs = []
            if "next" in n and n["next"]: refs.append(n["next"])
            for c in n.get("choices", []):
                if c.get("next"): refs.append(c["next"])
                if "requireClue" in c and c["requireClue"] not in clue_ids:
                    errors.append(f"{n['id']} requireClue 无效: {c['requireClue']}")
            for r in refs:
                if r not in ids: errors.append(f"{n['id']} 的 next 指向不存在节点: {r}")

# 6. 自白信 echo 引用
echo_ids = {n["id"] for n in dialogues.get("_echoes", {}).get("chapters", {}).get("11", {}).get("nodes", [])}
for s in confession["confession"]["segments"]:
    if s["echoId"] not in echo_ids: errors.append(f"自白信 {s['id']} echoId 无效: {s['echoId']}")

# 7. 每人对话覆盖: 存活章都有对话(第9/10章仅维拉)
for npc in sorted(npc_ids):
    death_ch = death_by_victim[npc]["chapter"]
    have = set(map(int, dialogues.get(npc, {}).get("chapters", {}).keys()))
    expect = set(range(0, min(death_ch + 1, 11))) if npc == "vera" else set(range(0, death_ch))
    missing = expect - have
    if npc in ("vera", "lombard"): expect = expect & set(range(0, 11))
    if missing: warnings.append(f"{npc} 缺章节对话: {sorted(missing)}")

total_nodes = sum(len(c["nodes"]) for d in dialogues.values() for c in d["chapters"].values())
print(f"对话节点总数: {total_nodes} (目标 250-350)")
if not (250 <= total_nodes <= 350): warnings.append("节点数不在 250-350 区间")

for w in warnings: print("WARN", w)
if errors:
    for e in errors: print("ERR ", e)
    sys.exit(1)
print("全部校验通过 [OK]")
