# 数据模式说明（M0 文案资产）

全部剧情文案数据，供引擎（M1+）读取。代码中不得写死任何文案。
所有文件为 UTF-8 JSON。校验：`python tools/validate_data.py`；人工审阅：浏览器打开 `tools/preview.html`。

## 命名规范

- 角色 id：`wargrave / vera / lombard / armstrong / blore / macarthur / brent / rogers / mrs_rogers / marston / player`
- 章节号：`0` = 序章，`1`–`10` = 第 1–10 章，`11` = 终章
- 线索 id：`clue_01`–`clue_13`（编号与大纲 4.5 一致）
- 人名以本目录数据为准（如：沃格雷夫、马尔斯顿），与各中译本不同的，属有意统一。

## 文件清单

| 文件 | 内容 | 关键字段 |
|---|---|---|
| `characters.json` | 11 角色档案 | id, name, role, appearance, personality, accusation, death, foreshadow, modelHint, portrait |
| `rhyme.json` | 童谣十句（大纲 4.4 原创译文） | lines[10]: { index, text, victimId, chapter, hint } |
| `accusation.json` | 留声机指控全文（11 条 + 播放稿） | script, charges[11]: { targetId, text } |
| `chapters.json` | 章节卡 | chapters[12]: { id, title, rhymeIndex, survivors, weather, ambience } |
| `deaths.json` | 死亡事件表 | deaths[10]: { chapter, victimId, method, scene, discoveredBy, clueIds, presentation } |
| `clues.json` | 13 线索 | clues[13]: { id, chapter, name, note, chain } |
| `confession.json` | 沃格雷夫自白信五段 | segments[5]: { id, title, text, echoId } |
| `endings.json` | 4 结局文案 | endings[4]: { id, title, condition, subtitles[] } |
| `ui.json` | 系统 UI 文案 | 分组 key→text |
| `dialogues/<npc>.json` | 对话树（见下） | npc, chapters |

## 对话树模式（dialogues/<npc>.json）

```json
{
  "npc": "armstrong",
  "chapters": {
    "0": {
      "nodes": [
        { "id": "arm_c0_0", "text": "……", "next": "arm_c0_1" },
        { "id": "arm_c0_1", "text": "……", "choices": [
          { "label": "（追问药箱的事）", "requireClue": "clue_03", "next": "arm_c0_2" },
          { "label": "（离开）", "next": null }
        ]},
        { "id": "arm_c0_2", "text": "……", "flag": "armstrong_confessed", "next": null }
      ]
    }
  }
}
```

规则：
- `next` 串接同章节点；`null` 结束对话。
- `choices[].requireClue`：玩家已收集该线索才显示此选项（线索追问段）。
- `flag`：读到该节点即写入存档标记，供推理板/结局判定使用。
- `type: "suspect_reaction"` 节点：玩家对本 NPC 打了"怀疑"标记后的反应台词，不进对话链主流程。
- `type: "echo"` 节点：真结局中该死者的闪回一句话。
- 每章每人 3–5 个主流程节点 + 至多 1 个线索追问节点 + 1 个 suspect_reaction 节点（第 3 章起）。
- 死者从死亡章节起不再有新对话（引擎按 deaths.json 移除 NPC）。
