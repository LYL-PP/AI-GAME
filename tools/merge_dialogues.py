#!/usr/bin/env python3
# 合并 data/dialogues/part*/ 分片 -> data/dialogues/<npc>.json
# 用法: python tools/merge_dialogues.py
import json, glob, os, sys

ROOT = os.path.join(os.path.dirname(__file__), "..", "data", "dialogues")

merged = {}
for part in sorted(glob.glob(os.path.join(ROOT, "part*"))):
    if not os.path.isdir(part):
        continue
    for f in sorted(glob.glob(os.path.join(part, "*.json"))):
        d = json.load(open(f, encoding="utf-8"))
        npc = d["npc"]
        out = merged.setdefault(npc, {"npc": npc, "chapters": {}})
        for ch, body in d["chapters"].items():
            if ch in out["chapters"]:
                sys.exit(f"冲突: {npc} 第 {ch} 章在多个分片中重复")
            out["chapters"][ch] = body

count_nodes = 0
for npc, d in sorted(merged.items()):
    name = "echoes.json" if npc == "_echoes" else f"{npc}.json"
    d["chapters"] = dict(sorted(d["chapters"].items(), key=lambda kv: int(kv[0])))
    path = os.path.join(ROOT, name)
    json.dump(d, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    n = sum(len(c["nodes"]) for c in d["chapters"].values())
    count_nodes += n
    print(f"{name}: 章节 {list(d['chapters'].keys())} 节点 {n}")

for part in sorted(glob.glob(os.path.join(ROOT, "part*"))):
    if os.path.isdir(part):
        for f in glob.glob(os.path.join(part, "*.json")):
            os.remove(f)
        os.rmdir(part)
print(f"合并完成: {len(merged)} 个文件, 共 {count_nodes} 个节点; 分片目录已清理")
