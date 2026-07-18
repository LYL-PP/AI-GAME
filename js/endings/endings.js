// endings.js —— 结局系统：判定 + 四结局演出 + 统计页 + 二周目批注钩子
import * as THREE from '../vendor/three.module.js';
import { GeoBatch, MAT } from '../world/props.js';
import { RiggedActor } from '../characters/rigged.js';

const F1 = 1.8;
// 隐藏结局玩家罪行闪回文案（据 accusation.json 玩家条目改写）
const PLAYER_SIN = [
  '那份送到你手上的证词，你看得出它是伪造的。',
  '你保持沉默，换你的前程。那个无辜的人，替你付了账。',
  '名单上有第十一个人。是你。',
];
// 隐藏结局二选一收束字幕（本项目原创）
const HIDDEN_CHOICES = {
  bottle: '你把自白折好，塞进了瓶子。第十一个人的名字，也终于进了大海的卷宗。',
  burn: '火苗舔上信纸。这一次，秘密只属于你一个人了——连同这座岛一起。',
};

export class EndingSystem {
  // o: { scene, camera, player, save, ui, weather, dialogueData, endings (endings.json), confession, annotations, deaths, uiData }
  constructor(o) {
    Object.assign(this, o);
    this.state = 'idle';   // idle/countdown/playing/stats
    this.endingId = null;
    this.hiddenOk = false;
    this.step = null;
    this.stepT = 0;
    this.queue = [];
    this.cam = null;
    this.props = [];
    this.countdown = 0;
    this.el = {
      overlay: document.getElementById('endingOverlay'),
      letter: document.getElementById('endLetter'),
      letterTitle: document.getElementById('endLetterTitle'),
      letterText: document.getElementById('endLetterText'),
      letterEcho: document.getElementById('endLetterEcho'),
      center: document.getElementById('endCenter'),
      title: document.getElementById('endTitle'),
      subtitles: document.getElementById('endSubtitles'),
      choices: document.getElementById('endChoices'),
      nbAnim: document.getElementById('endNotebookAnim'),
      study: document.getElementById('endStudyImg'),
      studyCap: document.getElementById('endStudyCap'),
      bottle: document.getElementById('endBottleImg'),
      bottleTitle: document.getElementById('endBottleTitle'),
      bottleCap: document.getElementById('endBottleCap'),
      flash: document.getElementById('flashWhite'),
      stats: document.getElementById('stats'),
    };
    this._typing = null;
    // 法官骨骼动画（踉跄走入黑夜段；dying_backwards 备用清单在册）
    this._judgeReady = RiggedActor.load('assets/models/characters/rigged/wargrave/', {
      walking: 'Meshy_AI_Portrait_of_a_Judge_biped_Animation_Walking_withSkin.glb',
      running: 'Meshy_AI_Portrait_of_a_Judge_biped_Animation_Running_withSkin.glb',
      injured: 'Meshy_AI_Portrait_of_a_Judge_biped_Animation_Injured_Walk_Backward_withSkin.glb',
      dying: 'Meshy_AI_Portrait_of_a_Judge_biped_Animation_dying_backwards_withSkin.glb',
    }, { tint: 0x1a1a20 }).then((a) => { this._judge = a; this.scene.add(a.group); return a; })
      .catch((e) => { console.warn('[judge] 骨骼模型加载失败，跳过夜奔段', e); this._judge = null; });
  }

  get active() { return this.state === 'playing'; }

  // 章节跳转时复位（隐藏全部覆盖层、清空道具、回到 idle）
  reset() {
    this.state = 'idle';
    this.endingId = null;
    this.queue = [];
    this.cam = null;
    this._clearProps();
    this.bottle = null;
    this.boat = null;
    this.el.overlay.classList.remove('show');
    this.el.center.classList.remove('show');
    this.el.letter.classList.remove('show');
    this.el.study.classList.remove('show');
    this.el.bottle.classList.remove('show');
    this.el.nbAnim.classList.remove('show');
    this.el.stats.classList.remove('show');
    this.el.choices.innerHTML = '';
    this._typing = null;
    this._subQueue = null;
    this.night = null;
    if (this._judge) this._judge.group.visible = false;
  }

  // ---------- 终章入口 ----------
  enterFinale() {
    if (this.state !== 'idle') return;
    this.state = 'countdown';
    this.countdown = 600; // 静默 10 分钟
  }

  // ---------- 指认提交（DeductionAPI/accusation.js 调用） ----------
  onAccusation(r) {
    if (this.state === 'playing' || this.state === 'stats') return;
    const cluesAll = (this.save.data.clues || []).length >= 13;
    this.hiddenOk = r.result === 'true' && cluesAll && !this.save.data.flags.hidden_failed;
    if (r.result === 'true') this._start('ending_true');
    else this._start('ending_wrong', { accusation: r });
  }

  giveUp() { this._start('ending_silence'); }

  // ---------- 演出编排 ----------
  _start(endingId, extra = {}) {
    this.endingId = endingId;
    this.state = 'playing';
    this.player.enabled = false;
    document.exitPointerLock?.();
    this.el.overlay.classList.add('show');
    this.el.overlay.dataset.kind = endingId;
    this.queue = this[`_seq_${endingId}`](extra);
    this._next();
  }

  _endingDef(id) { return this.endings.endings.find((e) => e.id === id); }

  // ---------- 通用步骤原语 ----------
  _camTo(px, py, pz, lx, ly, lz, dur) {
    const c = this.camera;
    this.cam = {
      fp: c.position.clone(), tp: new THREE.Vector3(px, py, pz),
      fl: new THREE.Vector3(0, 0, -1).applyQuaternion(c.quaternion).add(c.position),
      tl: new THREE.Vector3(lx, ly, lz), t: 0, dur,
    };
  }
  _stepCam(dt) {
    if (!this.cam) return;
    const c = this.cam;
    c.t = Math.min(c.dur, c.t + dt);
    const k = c.t / c.dur, e = k * k * (3 - 2 * k);
    this.camera.position.lerpVectors(c.fp, c.tp, e);
    const look = new THREE.Vector3().lerpVectors(c.fl, c.tl, e);
    this.camera.lookAt(look);
    if (c.t >= c.dur) this.cam = null;
  }

  _makeBottle() {
    const g = new THREE.Group();
    const glass = new THREE.MeshLambertMaterial({ color: 0x9fc4ae, transparent: true, opacity: 0.55 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.3, 10), glass);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.045, 0.14, 8), glass);
    neck.position.y = 0.21;
    const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.05, 8), MAT.wood);
    cork.position.y = 0.3;
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xd98e4a, transparent: true, opacity: 0.5 }));
    glow.scale.set(0.6, 0.6, 1);
    g.add(body, neck, cork, glow);
    g.position.set(-6, 0.1, 112);
    this.scene.add(g);
    this.props.push(g);
    return g;
  }

  _makeBoat() {
    const g = new THREE.Group();
    const b = new GeoBatch();
    b.box(4.5, 0.9, 1.4, 0, 0.45, 0);
    b.box(1.6, 0.9, 1.1, -0.4, 1.3, 0);
    b.box(0.25, 0.9, 0.25, 0.9, 1.2, 0);
    const hull = b.mesh(new THREE.MeshLambertMaterial({ color: 0x1c2126 }));
    g.add(hull);
    g.position.set(60, 0.2, 150);
    this.scene.add(g);
    this.props.push(g);
    return g;
  }

  _clearProps() {
    for (const p of this.props) this.scene.remove(p);
    this.props = [];
  }

  _showCenter(title, subtitleLines, then, hold = 999) {
    this.el.center.classList.add('show');
    this.el.title.textContent = title;
    this._subQueue = [...subtitleLines];
    this.el.subtitles.innerHTML = '';
    this._subTimer = 0.6;
    this._centerThen = then;
    this.hold = hold;
  }

  _letterShow(title, text, echo) {
    this.el.letter.classList.add('show');
    this.el.letterTitle.textContent = title;
    this._typing = { el: this.el.letterText, full: text, shown: 0, speed: 26 };
    this.el.letterText.textContent = '';
    this.el.letterEcho.textContent = echo ? `——${echo}` : '';
  }

  _echoText(echoId) {
    const nodes = this.dialogueData.npcs._echoes?.chapters?.['11']?.nodes || [];
    return nodes.find((n) => n.id === echoId)?.text || '';
  }

  // ---------- 各结局步骤队列 ----------
  _seq_ending_true() {
    const S = [];
    const E = this._endingDef('ending_true');
    // 1 空岛空镜（金色黄昏空镜三处）
    S.push({ run: () => { this._camTo(0, 2.2, 92, 0, 3, 20, 4.5); this.hold = 5.0; } });
    S.push({ run: () => { this._camTo(28, 2.5, 48, 0, 3, 6, 4.5); this.hold = 5.0; } });
    S.push({ run: () => { this._camTo(0, 2.0, 17, 0, 2.2, 8.4, 4.5); this.hold = 5.0; } });
    // 2 笔记本合拢
    S.push({ run: () => { this.el.nbAnim.classList.add('show'); this.hold = 2.2; } });
    S.push({ run: () => { this.el.nbAnim.classList.remove('show'); this.hold = 0.4; } });
    // 3 瓶子漂来
    S.push({ run: () => {
      this._camTo(2, 1.6, 88, -5, 0.4, 108, 3.5);
      this.bottle = this._makeBottle();
      this.hold = 6.0;
    } });
    // 4 自白信五段
    for (const seg of this.confession.confession.segments) {
      S.push({
        letter: true,
        run: () => {
          this._letterShow(`${this.confession.confession.title}｜${seg.title}`, seg.text, this._echoText(seg.echoId));
          this.hold = 999; // 等 E 推进
        },
      });
    }
    S.push({ run: () => { this.el.letter.classList.remove('show'); this.hold = 0.5; } });
    // 4.5 法官踉跄走入黑夜（骨骼动画段；模型未就绪则自动跳过）
    S.push({ run: () => this._nightStart(), night: true });
    // 5 书房终局图（自杀机关现场）+ 开枪白闪黑屏
    S.push({ run: () => {
      this.el.studyCap.textContent = E.subtitles[0] + '　' + E.subtitles[E.subtitles.length - 1];
      this.el.study.classList.add('show');
      this.hold = 3.6;
    } });
    S.push({ run: () => {
      this.el.flash.classList.add('show');
      window.AudioAPI?.play?.('gunshot_final');
      setTimeout(() => this.el.flash.classList.remove('show'), 150);
      this.hold = 1.8;
    } });
    S.push({ run: () => { this.el.study.classList.remove('show'); this.hold = 0.4; } });
    // 6 瓶中信终帧（THE END + 结局标题）
    S.push({ run: () => {
      this.el.bottleTitle.textContent = E.title;
      this.el.bottleCap.textContent = E.subtitles[1] + '　' + E.subtitles[2];
      this.el.bottle.classList.add('show');
      this.hold = 5.0;
    } });
    S.push({ run: () => { this.el.bottle.classList.remove('show'); this.hold = 0.4; } });
    // 7 隐藏结局追加
    if (this.hiddenOk) {
      S.push({ run: () => this._showCenter('隐藏结局 · 第十一人', PLAYER_SIN, null), centerHold: true });
      S.push({ run: () => this._showChoices(), centerHold: true });
    }
    S.push({ run: () => this._credits(), centerHold: true });
    S.push({ run: () => this._stats(), centerHold: true });
    return S;
  }

  _seq_ending_wrong({ accusation }) {
    const S = [];
    const E = this._endingDef('ending_wrong');
    // 1 矛盾文案
    const lines = this._contradictions(accusation);
    S.push({
      letter: true,
      run: () => this._letterShow('复核：时间线矛盾', lines.join('\n'), ''),
      centerHold: true,
    });
    S.push({ run: () => { this.el.letter.classList.remove('show'); this.hold = 0.5; } });
    // 2 救援船
    S.push({ run: () => {
      this._camTo(0, 2.4, 90, 20, 1.5, 130, 5);
      this.boat = this._makeBoat();
      this.hold = 6.5;
    } });
    // 3 档案封存 + 字幕
    S.push({ run: () => this._showCenter(E.title, E.subtitles, null), centerHold: true });
    S.push({ run: () => this._stats(), centerHold: true });
    return S;
  }

  _seq_ending_silence() {
    const S = [];
    const E = this._endingDef('ending_silence');
    // 1 救援船
    S.push({ run: () => {
      this._camTo(0, 2.4, 90, 20, 1.5, 130, 5);
      this.boat = this._makeBoat();
      this.hold = 6.5;
    } });
    // 2 官方结论
    S.push({ run: () => this._showCenter(E.title, E.subtitles.slice(0, 2), null), centerHold: true });
    // 3 壁炉台定格
    S.push({ run: () => {
      this._camTo(-5, F1 + 1.7, 0.6, -5, F1 + 1.9, -1.6, 2.5);
      this.hold = 4.0;
    } });
    S.push({ run: () => this._showCenter('', E.subtitles.slice(2), null), centerHold: true });
    S.push({ run: () => this._stats(), centerHold: true });
    return S;
  }

  // 时间线矛盾生成（deaths.json 死亡章 vs clueSpots 线索章）
  _contradictions(acc) {
    const out = [];
    const deadChapter = {};
    for (const d of this.deaths) deadChapter[d.victimId] = d.chapter;
    const clueChapter = {};
    for (const s of (this.clueSpots?.spots || [])) clueChapter[s.clueId] = s.chapterAvailable;
    const dc = deadChapter[acc.accusedId];
    for (const cid of acc.evidenceIds.slice(0, 3)) {
      const cc = clueChapter[cid];
      if (dc && cc && cc > dc) {
        out.push(`· 被告死于第 ${dc} 章，而「${cid}」的物证第 ${cc} 章才出现——死人无法在未来作案。`);
      } else if (dc && cc && cc < dc) {
        out.push(`· 「${cid}」早于第 ${dc} 章的死亡即已存在，无法证明其与被告的关联。`);
      } else {
        out.push(`· 「${cid}」与被告之间无法闭合证据链。`);
      }
    }
    if (!out.length) out.push('· 证据链无法闭合：指控无法在时间线上成立。');
    return out.slice(0, 3);
  }

  // ---------- 法官踉跄走入黑夜 ----------
  _nightStart() {
    if (!this._judge) { this._next(); return; }   // 兜底：模型缺失跳过本段
    this.night = { t: 0, phase: 'injured' };
    this._savedPreset = this.weather.getChapter();
    // 门灯临时加强（背光剪影用），段末随预设恢复
    for (const L of this.weather.refs.windowGlow?.lights || []) L.userData.base *= 3;
    this.weather.setChapter(7);                    // 浓雾深夜（仅氛围，不动日程）
    // 机位：门廊外近距离，正对正门灯笼光晕（法官背光剪影）
    this._camTo(0, 2.2, 14.5, 0, 1.8, 9.8, 2.6);
    const a = this._judge;
    a.group.position.set(0, 1.8, 9.7);
    a.group.rotation.y = Math.PI;                  // 面向正门（北）
    a.faceOffset = 0;
    a.play('injured', { loop: true, timeScale: 1.0 });
    // 字幕（ui.json judgeNight）
    const cs = document.getElementById('cineSub');
    document.getElementById('cineSpeaker').textContent = '';
    document.getElementById('cineText').textContent = this.uiData.judgeNight?.text || '';
    cs.classList.add('show');
    window.AudioAPI?.play?.('step');
  }

  _nightUpdate(dt) {
    const n = this.night;
    const a = this._judge;
    n.t += dt;
    const ground = (x, z) => this.collision.groundAt(x, z, a.group.position.y);
    if (n.phase === 'injured') {
      // 踉跄退行（背向黑夜，面向门灯），慢速南移
      a.move(0, 0.85 * dt, ground);
      if (n.t > 2.6) { n.phase = 'turn'; n.t = 0; }
    } else if (n.phase === 'turn') {
      a.face(0, 1, dt, 6);
      if (n.t > 0.7) {
        n.phase = 'run'; n.t = 0;
        a.play('running', { fade: 0.15, timeScale: 1.05 });
        window.AudioAPI?.play?.('step');
      }
    } else if (n.phase === 'run') {
      // 跑向夜雾深处（渐被雾吞没）
      a.move(0, 3.9 * dt, ground);
      if (a.group.position.z > 33 || n.t > 6) {
        n.phase = 'fadeout'; n.t = 0;
        const fl = document.getElementById('flashWhite');
        fl.style.background = '#000';
        fl.classList.add('show');
        setTimeout(() => { fl.classList.remove('show'); fl.style.background = ''; }, 900);
      }
    } else if (n.phase === 'fadeout') {
      if (n.t > 1.0) {
        document.getElementById('cineSub').classList.remove('show');
        a.group.visible = false;
        this.weather.setChapter(this._savedPreset ?? 11);
        this.night = null;
        this._next();
      }
    }
    a.update(dt);
  }

  _showChoices() {
    this.el.center.classList.add('show');
    this.el.title.textContent = '第十一个人的名字';
    this.el.subtitles.innerHTML = `<div class="end-choice-hint">隐藏结局 · 第十一人</div>`;
    this.el.choices.innerHTML = '';
    for (const [key, label] of [['bottle', '把自己的自白写进瓶中'], ['burn', '将信烧掉']]) {
      const b = document.createElement('button');
      b.className = 'end-choice';
      b.textContent = label;
      b.addEventListener('click', () => {
        this.save.data.flags.hidden_choice = key;
        this.save.write();
        window.AudioAPI?.play?.('waves');
        this.el.choices.innerHTML = '';
        this._showCenter(HIDDEN_CHOICES[key], [], null, 3.2);
        this._choicePicked = true;
      });
      this.el.choices.appendChild(b);
    }
    this.hold = 999; // 等待选择
  }

  _credits() {
    this.el.center.classList.add('show');
    this.el.title.textContent = '';
    this.el.subtitles.innerHTML = `
      <div class="end-credits">
        <div class="end-credits-title">无人生还：士兵岛</div>
        <div>改编自 阿加莎·克里斯蒂《无人生还》</div>
        <div>Three.js r160 · 程序化低模 · 无外部模型</div>
        <div>素材与参考：Kenney CC0 · 占位立绘自制</div>
        <div>And Then There Were None</div>
      </div>`;
    this.hold = 4.5;
  }

  // ---------- 统计页 ----------
  _stats() {
    const id = this.endingId;
    if (!this.save.data.completedEndings.includes(id)) {
      this.save.data.completedEndings.push(id);
      this.save.write();
    }
    this.el.overlay.classList.remove('show');
    this._clearProps();
    const st = this.uiData.stats;
    const E = this._endingDef(id);
    const d = this.save.data;
    const used = Math.max(0, Math.floor((Date.now() - (d.firstLaunch || Date.now())) / 1000));
    const mm = String(Math.floor(used / 60)).padStart(2, '0'), ss = String(used % 60).padStart(2, '0');
    const softList = Object.entries(d.softMarks || {}).filter(([, v]) => v)
      .map(([k]) => `${k}${k === 'wargrave' ? ' ✓' : ' ✗'}`).join('、') || '—';
    document.getElementById('stRows').innerHTML = `
      <div class="st-row"><span>${st.ending}</span><b>${E.title}</b></div>
      <div class="st-row"><span>${st.time}</span><b>${mm}:${ss}</b></div>
      <div class="st-row"><span>${st.clues}</span><b>${(d.clues || []).length} / 13</b></div>
      <div class="st-row"><span>${st.softMarks}</span><b>${softList}</b></div>`;
    document.getElementById('stTitle').textContent = st.title;
    const ng = document.getElementById('stNG');
    ng.innerHTML = `<label><input type="checkbox" id="stNgPlus" ${d.ngPlus ? 'checked' : ''}> ${st.ngPlus}</label>`;
    ng.querySelector('#stNgPlus').addEventListener('change', (e) => {
      this.save.data.ngPlus = e.target.checked;
      this.save.write();
    });
    document.getElementById('stRestart').textContent = this.uiData.system.start;
    document.getElementById('stRestart').onclick = () => {
      localStorage.removeItem('attwn_save');
      location.reload();
    };
    this.el.stats.classList.add('show');
    this.state = 'stats';
    this.step = null;
  }

  // ---------- 推进 ----------
  onE() {
    if (this.state !== 'playing') return false;
    if (this.night) {
      const a = this._judge;
      document.getElementById('cineSub').classList.remove('show');
      if (a) a.group.visible = false;
      this.weather.setChapter(this._savedPreset ?? 11);
      this.night = null;
      this._next();
      return true;
    }
    if (this.cam) { this.cam.t = this.cam.dur; return true; }
    if (this._typing) { this._typing.shown = this._typing.full.length; return true; }
    if (this.hold === 999 && this.el.choices.children.length) return true; // 等待选择中
    this.hold = 0;
    return true;
  }

  _next() {
    this.step = this.queue.shift();
    if (!this.step) return;
    this.hold = 0;
    this.step.run();
  }

  update(dt) {
    if (this.state === 'countdown') {
      this.countdown -= dt;
      if (this.countdown <= 0) this._start('ending_silence');
      return;
    }
    if (this.state !== 'playing') return;
    this._stepCam(dt);
    if (this.night) { this._nightUpdate(dt); return; }
    // 道具动画
    if (this.bottle) {
      this.bottle.position.z -= dt * 1.1;
      this.bottle.position.y = 0.12 + Math.sin(performance.now() / 600) * 0.12;
      this.bottle.rotation.z = Math.sin(performance.now() / 900) * 0.25;
    }
    if (this.boat) {
      this.boat.position.x -= dt * 2.2;
      this.boat.position.z -= dt * 2.6;
      this.boat.position.y = 0.2 + Math.sin(performance.now() / 800) * 0.1;
    }
    // 字幕逐条
    if (this._subQueue && this._subQueue.length) {
      this._subTimer -= dt;
      if (this._subTimer <= 0) {
        const line = this._subQueue.shift();
        const div = document.createElement('div');
        div.className = 'end-sub-line';
        div.textContent = line;
        this.el.subtitles.appendChild(div);
        this._subTimer = 1.4;
      }
    } else if (this.hold === 999 && !this.el.choices.children.length) {
      // 字幕播完自动进入收尾（E 可提前）
      this.hold = 1.8;
    }
    // 打字机
    if (this._typing) {
      const t = this._typing;
      t.shown = Math.min(t.full.length, t.shown + t.speed * dt);
      t.el.textContent = t.full.slice(0, Math.floor(t.shown));
      if (t.shown >= t.full.length) this._typing = null;
      return;
    }
    // 步骤推进
    if (!this.cam && this.hold < 900) {
      this.hold -= dt;
      if (this.hold <= 0) this._next();
    }
  }
}
