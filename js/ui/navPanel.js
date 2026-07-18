// navPanel.js —— 章节导航面板（F1 / 点击章节标题开合）
export class NavPanel {
  // o: { chapters (chapters.json), getChapter, onJump(n, carryClues), onGotoScene(n), onOpenBoard, ui }
  constructor(o) {
    Object.assign(this, o);
    this.open = false;
    this.carryClues = true;
    this.el = {
      root: document.getElementById('navPanel'),
      list: document.getElementById('navList'),
      carry: document.getElementById('navCarry'),
      sceneBtn: document.getElementById('navSceneBtn'),
      boardBtn: document.getElementById('navBoardBtn'),
    };
    this.el.carry.checked = true;
    this.el.carry.addEventListener('change', () => { this.carryClues = this.el.carry.checked; });
    this.el.sceneBtn.addEventListener('click', () => {
      const ch = this.getChapter();
      if (ch >= 1 && ch <= 10) { this.close_(); this.onGotoScene(ch); }
    });
    this.el.boardBtn.addEventListener('click', () => { this.close_(); this.onOpenBoard(); });
    // 点击空白关闭
    this.el.root.addEventListener('click', (e) => {
      if (e.target === this.el.root) this.close_();
    });
  }

  isOpen() { return this.open; }

  open_() {
    this.open = true;
    document.exitPointerLock?.();
    this.refresh();
    this.el.root.classList.add('show');
  }
  close_() {
    this.open = false;
    this.el.root.classList.remove('show');
    this.onClose?.();
  }
  toggle() { this.open ? this.close_() : this.open_(); }

  refresh() {
    const cur = this.getChapter();
    this.el.list.innerHTML = '';
    for (const ch of this.chapters) {
      const item = document.createElement('div');
      item.className = 'nav-item' + (ch.id === cur ? ' current' : '');
      item.innerHTML = `
        <span class="nav-no">${ch.id === 0 ? '序' : ch.id === 11 ? '终' : ch.id}</span>
        <span class="nav-main">
          <span class="nav-title">${ch.title}</span>
          <span class="nav-sub">${ch.subtitle}</span>
        </span>
        <span class="nav-amb">${ch.ambience}</span>`;
      item.addEventListener('click', () => {
        this.close_();
        this.onJump(ch.id, this.carryClues);
      });
      this.el.list.appendChild(item);
    }
    this.el.sceneBtn.style.display = cur >= 1 && cur <= 10 ? 'inline-block' : 'none';
    this.el.boardBtn.style.display = cur === 11 ? 'inline-block' : 'none';
  }
}
