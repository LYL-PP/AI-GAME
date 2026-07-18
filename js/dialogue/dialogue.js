// dialogue.js —— 对话树播放器：data/dialogue.json (node/choices)
// 支持 requireClue（window.ClueAPI?.has）、flag 写入存档、suspect_reaction 暂存
export class DialoguePlayer {
  // opts: { data, save, getChapter, portraits: {id→file}, onClose }
  constructor(opts) {
    this.data = opts.data;         // dialogue.json 内容
    this.save = opts.save;
    this.getChapter = opts.getChapter;
    this.portraits = opts.portraits || {};
    this.onClose = opts.onClose || (() => {});
    this.el = {
      box: document.getElementById('dlgBox'),
      portrait: document.getElementById('dlgPortrait'),
      name: document.getElementById('dlgName'),
      text: document.getElementById('dlgText'),
      choices: document.getElementById('dlgChoices'),
      hint: document.getElementById('dlgHint'),
    };
    this.open = false;
    this.npcId = null;
    this.node = null;
    this.nodeMap = new Map();
    this.typing = null; // {full, shown, speed}
    this._choiceKeyHandler = (e) => {
      if (!this.open || !this._choices) return;
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= this._choices.length) this.choose(n - 1);
    };
    document.addEventListener('keydown', this._choiceKeyHandler);
    this.el.choices.addEventListener('click', (e) => {
      const b = e.target.closest('[data-idx]');
      if (b) this.choose(+b.dataset.idx);
    });
    this.el.box.addEventListener('click', (e) => {
      if (e.target.closest('[data-idx]')) return;
      this.advance();
    });
  }

  nodesFor(npcId, chapter) {
    const npc = this.data.npcs[npcId];
    if (!npc) return null;
    for (let c = chapter; c >= 0; c--) {
      const ch = npc.chapters[String(c)];
      if (ch) return ch.nodes;
    }
    return null;
  }

  start(npcId) {
    window.AudioAPI?.play?.('npc_blip');
    // 软指认：被标记"怀疑"的 NPC，优先播放其 suspect_reaction 节点
    if (this.save.data.softMarks?.[npcId]) {
      const rn = this._reactionNode(npcId);
      if (rn) {
        this.npcId = npcId;
        this.nodeMap = new Map([[rn.id, rn]]);
        this._openUi(npcId);
        this.save.addSuspectReaction(npcId, rn.id, rn.text);
        this.goto(rn.id);
        return true;
      }
    }
    const nodes = this.nodesFor(npcId, this.getChapter());
    if (!nodes || !nodes.length) return false;
    this.npcId = npcId;
    this.nodeMap = new Map(nodes.map((n) => [n.id, n]));
    this._openUi(npcId);
    this.goto(nodes[0].id);
    return true;
  }

  _reactionNode(npcId) {
    const npc = this.data.npcs[npcId];
    if (!npc) return null;
    for (let c = this.getChapter(); c >= 0; c--) {
      const hit = npc.chapters[String(c)]?.nodes?.find((n) => n.type === 'suspect_reaction');
      if (hit) return hit;
    }
    return null;
  }

  _openUi(npcId) {
    this.open = true;
    this.el.box.classList.add('show');
    // 立绘（加载失败退回色块+姓名）
    const file = this.portraits[npcId];
    this.el.portrait.innerHTML = '';
    if (file) {
      const img = new Image();
      img.src = file;
      img.onerror = () => { this.el.portrait.innerHTML = `<div class="dlg-fallback">${npcId}</div>`; };
      this.el.portrait.appendChild(img);
    } else {
      this.el.portrait.innerHTML = `<div class="dlg-fallback">${npcId}</div>`;
    }
    document.exitPointerLock?.();
  }

  goto(id) {
    const node = this.nodeMap.get(id);
    if (!node) { this.close(); return; }
    this.node = node;
    if (node.flag) this.save.setFlag(node.flag);
    if (node.type === 'suspect_reaction') {
      this.save.addSuspectReaction(this.npcId, node.id, node.text);
    }
    this._choices = null;
    this.el.choices.innerHTML = '';
    this.el.hint.style.visibility = 'hidden';
    this.typing = { full: node.text, shown: 0, speed: 30 };
    this.el.text.textContent = '';
  }

  finishTyping() {
    if (!this.typing) return;
    this.el.text.textContent = this.typing.full;
    this.typing = null;
    this.afterText();
  }

  afterText() {
    const node = this.node;
    if (node.choices && node.choices.length) {
      this._choices = node.choices.filter((c) => {
        if (!c.requireClue) return true;
        return window.ClueAPI?.has(c.requireClue) ?? this.save.hasClue(c.requireClue);
      });
      this.el.choices.innerHTML = this._choices
        .map((c, i) => `<button class="dlg-choice" data-idx="${i}">${i + 1}. ${c.label}</button>`)
        .join('');
      if (!this._choices.length) { // 线索不足：无可选项时自动离开
        const exit = node.choices.find((c) => !c.requireClue);
        if (exit) this.goto(exit.next); else this.close();
      }
    } else {
      this.el.hint.style.visibility = 'visible';
    }
  }

  advance() {
    if (!this.open) return;
    if (this.typing) { this.finishTyping(); return; }
    if (this._choices) return; // 等待选择
    if (this.node.next) this.goto(this.node.next);
    else this.close();
  }

  choose(i) {
    if (!this._choices) return;
    const c = this._choices[i];
    if (!c) return;
    if (c.next) this.goto(c.next);
    else this.close();
  }

  close() {
    this.open = false;
    this.node = null;
    this.typing = null;
    this.el.box.classList.remove('show');
    this.onClose();
  }

  update(dt) {
    if (!this.open || !this.typing) return;
    const t = this.typing;
    t.shown = Math.min(t.full.length, t.shown + t.speed * dt);
    if ((t.shown | 0) % 3 === 0) window.AudioAPI?.play?.('type_tick');
    this.el.text.textContent = t.full.slice(0, Math.floor(t.shown));
    if (t.shown >= t.full.length) {
      this.typing = null;
      this.afterText();
    }
  }

  isOpen() { return this.open; }
}
