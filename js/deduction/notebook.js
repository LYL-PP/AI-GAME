// notebook.js —— 速记本 UI（Tab）：线索列表 / 推理板（连线+软指认+终局指认）/ 人物 / 童谣
export class Notebook {
  // o: { save, ui, data: { ui(ui.json), clues, characters, rhyme, dialogue }, getChapter, accusation, dialoguePlayer }
  constructor(o) {
    Object.assign(this, o);
    this.onClose = o.onClose || (() => {});
    this.open = false;
    this.tab = 'clues';
    this.accuseSel = { suspect: null, evidence: [] };
    this.el = {
      root: document.getElementById('notebook'),
      title: document.getElementById('nbTitle'),
      tabs: [...document.querySelectorAll('.nb-tab')],
      pages: {
        clues: document.getElementById('nbPageClues'),
        board: document.getElementById('nbPageBoard'),
        people: document.getElementById('nbPagePeople'),
        rhyme: document.getElementById('nbPageRhyme'),
      },
      clueCount: document.getElementById('nbClueCount'),
      clueList: document.getElementById('nbClueList'),
      boardHint: document.getElementById('nbBoardHint'),
      cluePool: document.getElementById('nbCluePool'),
      suspects: document.getElementById('nbSuspects'),
      lines: document.getElementById('nbLines'),
      accuse: document.getElementById('nbAccuse'),
      peopleList: document.getElementById('nbPeopleList'),
      rhyme: document.getElementById('nbRhyme'),
    };
    const nb = this.data.ui.notebook;
    this.el.title.textContent = nb.title;
    const tabNames = { clues: nb.tabClues, board: nb.tabBoard, people: nb.tabPeople, rhyme: nb.tabRhyme };
    for (const b of this.el.tabs) {
      b.textContent = tabNames[b.dataset.tab];
      b.addEventListener('click', () => this.showTab(b.dataset.tab));
    }
    document.getElementById('nbClose').addEventListener('click', () => this.close_());
    this.el.boardHint.textContent = nb.boardHint;
    this._drag = null;
    document.addEventListener('mousemove', (e) => this._dragMove(e));
    document.addEventListener('mouseup', (e) => this._dragUp(e));
  }

  isOpen() { return this.open; }

  open_() {
    this.open = true;
    this.el.root.classList.add('show');
    document.exitPointerLock?.();
    this.refresh();
  }
  close_() {
    this.open = false;
    this.el.root.classList.remove('show');
    this._cancelDrag();
    this.onClose?.();
  }
  toggle() { this.open ? this.close_() : this.open_(); }

  showTab(t) {
    this.tab = t;
    for (const b of this.el.tabs) b.classList.toggle('on', b.dataset.tab === t);
    for (const [k, p] of Object.entries(this.el.pages)) p.style.display = k === t ? 'block' : 'none';
    if (t === 'board') requestAnimationFrame(() => this._drawLines());
  }

  refresh() {
    this._renderClues();
    this._renderBoard();
    this._renderPeople();
    this._renderRhyme();
    this.showTab(this.tab);
  }

  // ---------- 分页一：线索 ----------
  _renderClues() {
    const nb = this.data.ui.notebook;
    const got = new Set(this.save.data.clues);
    this.el.clueCount.textContent = nb.clueCount.replace('{n}', got.size);
    if (!got.size) {
      this.el.clueList.innerHTML = `<div class="nb-empty">${nb.clueEmpty}</div>`;
      return;
    }
    this.el.clueList.innerHTML = this.data.clues.clues.map((c) => {
      if (!got.has(c.id)) return `<div class="nb-clue unknown">？</div>`;
      return `<div class="nb-clue"><div class="nb-clue-name">${c.name}</div><div class="nb-clue-note">${c.note}</div></div>`;
    }).join('');
  }

  // ---------- 分页二：推理板 ----------
  _renderBoard() {
    const ch = this.getChapter();
    const nb = this.data.ui.notebook;
    const dead = new Set(this.save.data.deadIds || []);
    const soft = this.save.data.softMarks || {};
    // 嫌疑人卡（11 张，含玩家"记录员"）
    this.el.suspects.innerHTML = '';
    for (const c of this.data.characters) {
      const card = document.createElement('div');
      card.className = 'nb-suspect' + (dead.has(c.id) ? ' dead' : '');
      card.dataset.npc = c.id;
      const marked = soft[c.id] ? `<span class="nb-flag">⚑</span>` : '';
      card.innerHTML = `
        <img src="${c.portrait?.file || ''}" onerror="this.style.display='none'">
        <div class="nb-sname">${c.name}${marked}</div>
        <div class="nb-srole">${c.role}</div>
        ${dead.has(c.id) ? `<div class="nb-dead">${nb.suspectDead}</div>` : ''}
        ${ch >= 3 ? `<button class="nb-mark" data-npc="${c.id}">${nb.suspectMark}</button>` : ''}
        <div class="nb-linked" data-linked="${c.id}"></div>`;
      this.el.suspects.appendChild(card);
    }
    // 标记按钮
    this.el.suspects.querySelectorAll('.nb-mark').forEach((b) => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleSoftMark(b.dataset.npc);
      });
    });
    // 终局指认：点卡入槽
    if (ch >= 11) {
      this.el.suspects.querySelectorAll('.nb-suspect').forEach((card) => {
        card.addEventListener('click', () => {
          this.accuseSel.suspect = card.dataset.npc;
          this._renderAccuse();
        });
      });
    }
    // 线索池
    const got = new Set(this.save.data.clues);
    this.el.cluePool.innerHTML = '';
    for (const c of this.data.clues.clues) {
      if (!got.has(c.id)) continue;
      const chip = document.createElement('div');
      chip.className = 'nb-chip';
      chip.dataset.clue = c.id;
      chip.textContent = c.name;
      chip.addEventListener('mousedown', (e) => this._dragStart(e, c.id, c.name));
      if (ch >= 11) chip.addEventListener('click', () => this._toggleEvidence(c.id));
      this.el.cluePool.appendChild(chip);
    }
    this._renderLinkedChips();
    this._renderAccuse();
  }

  _renderLinkedChips() {
    const links = this.save.data.boardLinks || [];
    const nameOf = {};
    for (const c of this.data.clues.clues) nameOf[c.id] = c.name;
    for (const holder of this.el.suspects.querySelectorAll('.nb-linked')) {
      const npc = holder.dataset.linked;
      holder.innerHTML = links.filter((l) => l.npcId === npc)
        .map((l) => `<span class="nb-lchip" data-clue="${l.clueId}" data-npc="${npc}">${nameOf[l.clueId] || l.clueId}×</span>`)
        .join('');
      holder.querySelectorAll('.nb-lchip').forEach((chip) => {
        chip.addEventListener('click', () => {
          this.save.data.boardLinks = (this.save.data.boardLinks || []).filter(
            (l) => !(l.clueId === chip.dataset.clue && l.npcId === chip.dataset.npc));
          this.save.write();
          this._renderLinkedChips();
          this._drawLines();
        });
      });
    }
  }

  _renderAccuse() {
    const ch = this.getChapter();
    const nb = this.data.ui.notebook;
    const ad = this.data.ui.accusation;
    if (ch < 11) { this.el.accuse.innerHTML = ''; return; }
    const nameOf = {};
    for (const c of this.data.characters) nameOf[c.id] = c.name;
    const clueName = {};
    for (const c of this.data.clues.clues) clueName[c.id] = c.name;
    const ev = this.accuseSel.evidence;
    this.el.accuse.innerHTML = `
      <div class="nb-accuse-title">${nb.accuseSlot}</div>
      <div class="nb-accuse-prompt">${ad.prompt}</div>
      <div class="nb-accuse-row">
        <div class="nb-slot ${this.accuseSel.suspect ? 'filled' : ''}">${this.accuseSel.suspect ? nameOf[this.accuseSel.suspect] : '—'}</div>
        ${[0, 1, 2].map((i) => `<div class="nb-slot ev ${ev[i] ? 'filled' : ''}" data-evi="${i}">${ev[i] ? clueName[ev[i]] : '—'}</div>`).join('')}
        <button id="nbAccuseGo" class="nb-go" ${this.accuseSel.suspect ? '' : 'disabled'}>${ad.confirm}</button>
        <button id="nbGiveUp" class="nb-go nb-giveup">${ad.giveUp}</button>
      </div>`;
    this.el.accuse.querySelectorAll('.nb-slot.ev').forEach((s) => {
      s.addEventListener('click', () => {
        const i = +s.dataset.evi;
        if (ev[i]) { ev.splice(i, 1); this._renderAccuse(); }
      });
    });
    this.el.accuse.querySelector('#nbAccuseGo').addEventListener('click', () => this._submit());
    this.el.accuse.querySelector('#nbGiveUp').addEventListener('click', () => {
      this.close_();
      window.EndingAPI?.giveUp?.();
    });
  }

  _toggleEvidence(clueId) {
    if (this.getChapter() < 11) return;
    const ev = this.accuseSel.evidence;
    const i = ev.indexOf(clueId);
    if (i >= 0) ev.splice(i, 1);
    else if (ev.length < 3) ev.push(clueId);
    this._renderAccuse();
  }

  _submit() {
    if (!this.accuseSel.suspect) return;
    this.close_();
    const r = this.accusation.submit(this.accuseSel.suspect, this.accuseSel.evidence);
    this._renderAccuse();
    return r;
  }

  toggleSoftMark(npcId) {
    const cur = !!this.save.data.softMarks[npcId];
    this.save.setSoftMark(npcId, !cur);
    this._renderBoard();
  }

  // ---------- 连线 ----------
  link(clueId, npcId) {
    const links = this.save.data.boardLinks || (this.save.data.boardLinks = []);
    if (!links.some((l) => l.clueId === clueId && l.npcId === npcId)) {
      links.push({ clueId, npcId });
      this.save.write();
    }
    this._renderLinkedChips();
    this._drawLines();
  }

  _drawLines() {
    const svg = this.el.lines;
    const wrap = svg.parentElement.getBoundingClientRect();
    const links = this.save.data.boardLinks || [];
    let html = '';
    for (const l of links) {
      const a = this.el.cluePool.querySelector(`[data-clue="${l.clueId}"]`);
      const b = this.el.suspects.querySelector(`[data-npc="${l.npcId}"]`);
      if (!a || !b) continue;
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      const x1 = ra.right - wrap.left, y1 = ra.top + ra.height / 2 - wrap.top;
      const x2 = rb.left + rb.width / 2 - wrap.left, y2 = rb.top - wrap.top;
      html += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#d98e4a" stroke-width="1.5" opacity="0.75"/>`;
    }
    svg.innerHTML = html;
    svg.setAttribute('width', wrap.width);
    svg.setAttribute('height', wrap.height);
  }

  // ---------- 拖拽 ----------
  _dragStart(e, clueId, name) {
    if (this.getChapter() >= 11) return; // 终章用点选
    e.preventDefault();
    const ghost = document.createElement('div');
    ghost.className = 'nb-ghost';
    ghost.textContent = name;
    document.body.appendChild(ghost);
    this._drag = { clueId, ghost };
    this._dragMove(e);
  }
  _dragMove(e) {
    if (!this._drag) return;
    this._drag.ghost.style.left = e.clientX + 10 + 'px';
    this._drag.ghost.style.top = e.clientY - 10 + 'px';
  }
  _dragUp(e) {
    if (!this._drag) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const card = el?.closest?.('.nb-suspect');
    if (card) this.link(this._drag.clueId, card.dataset.npc);
    this._cancelDrag();
  }
  _cancelDrag() {
    if (this._drag) { this._drag.ghost.remove(); this._drag = null; }
  }

  // ---------- 分页三：人物 ----------
  _renderPeople() {
    const dead = new Set(this.save.data.deadIds || []);
    this.el.peopleList.innerHTML = this.data.characters.map((c) => `
      <div class="nb-person ${dead.has(c.id) ? 'dead' : ''}">
        <img src="${c.portrait?.file || ''}" onerror="this.style.display='none'">
        <div><div class="nb-pname">${c.fullName}</div><div class="nb-prole">${c.role}</div></div>
      </div>`).join('');
  }

  // ---------- 分页四：童谣 ----------
  _renderRhyme() {
    const r = this.data.rhyme.rhyme;
    this.el.rhyme.innerHTML = `<div class="nb-rhyme-title">${r.title}</div>` +
      r.lines.map((l) => `<div class="nb-rhyme-line">${l.text}</div>`).join('');
  }
}
