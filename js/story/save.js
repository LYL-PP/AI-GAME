// save.js —— 存档：localStorage key "attwn_save"
// 存 chapter / flags / clues / suspectReactions / softMarks / prologueDone
const KEY = 'attwn_save';

export class Save {
  constructor() {
    this.data = {
      chapter: 0,
      flags: {},
      clues: [],
      suspectReactions: {},
      softMarks: {},
      prologueDone: false,
      deadIds: [],
      figurines: 10,
      boardLinks: [],
      accusation: null,
      firstLaunch: null,
      ngPlus: false,
      completedEndings: [],
    };
    this.load();
  }
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) Object.assign(this.data, JSON.parse(raw));
    } catch (e) { /* 存档损坏则重来 */ }
    if (!this.data.firstLaunch) {
      this.data.firstLaunch = Date.now();
      this.write();
    }
  }
  write() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) {}
  }
  setFlag(k, v = true) { this.data.flags[k] = v; this.write(); }
  getFlag(k) { return !!this.data.flags[k]; }
  addClue(id) {
    if (!this.data.clues.includes(id)) { this.data.clues.push(id); this.write(); }
  }
  hasClue(id) { return this.data.clues.includes(id); }
  addSuspectReaction(npcId, nodeId, text) {
    (this.data.suspectReactions[npcId] ||= []).push({ nodeId, text });
    this.write();
  }
  setSoftMark(npcId, v) { this.data.softMarks[npcId] = v; this.write(); }
  setChapter(n) { this.data.chapter = n; this.write(); }
  setPrologueDone() { this.data.prologueDone = true; this.write(); }
}
