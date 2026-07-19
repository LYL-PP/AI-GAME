// audio.js —— Web Audio 程序合成音频引擎（无外部音频文件）
// 十声部递减配乐 + 全套合成 SFX + 风暴环境声 + 海浪
export class AudioEngine {
  constructor(audioCfg) {
    this.cfg = audioCfg?.music || audioCfg || { stems: [], removalOrder: {} };
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.stormGain = null;
    this.muted = false;
    this.activeStems = new Set(this.cfg.stems || []);
    this.chapter = 0;
    this.stormLevel = 0;
    this._seq = null;
    this._nextNoteTime = 0;
    this._step = 0;
    this._waves = null;
    this._storm = null;
    this._ritual = false;
    // 首次用户手势启动 AudioContext（自动播放策略）
    const start = () => {
      this._init();
      document.removeEventListener('pointerdown', start);
      document.removeEventListener('keydown', start);
    };
    document.addEventListener('pointerdown', start);
    document.addEventListener('keydown', start);
    document.addEventListener('keydown', (e) => {
      if (e.code === 'KeyN') this.toggleMute();
    });
  }

  _init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) { return; }
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.5;
    this.musicGain.connect(this.master);
    this.stormGain = this.ctx.createGain();
    this.stormGain.gain.value = 0;
    this.stormGain.connect(this.master);
    this._startWaves();
    this._startMusic();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.8;
    return this.muted;
  }

  get ready() { return !!this.ctx; }
  get stemCount() { return this.activeStems.size; }

  // ---------- 章节 ----------
  chapterChanged(n) {
    this.chapter = n;
    // 第 N 章结算后（进入第 N+1 章时）撤一件：进入第 1 章时满编 10 件
    const cut = Math.max(0, Math.min(10, n - 1));
    const removed = Object.values(this.cfg.removalOrder || {}).filter((_, i) => i < cut);
    this.activeStems = new Set((this.cfg.stems || []).filter((s) => !removed.includes(s)));
    // 终章全静默
    if (n >= 11 && this.musicGain) this.musicGain.gain.setTargetAtTime(0, this.ctx.currentTime, 1.5);
    else if (this.musicGain && !this._ritual) this.musicGain.gain.setTargetAtTime(0.5, this.ctx.currentTime, 1.0);
    // 风暴环境声分级
    const stormMap = { 0: 1, 1: 2, 2: 4, 3: 5, 4: 5, 5: 1, 6: 0, 7: 1, 8: 1, 9: 0, 10: 0, 11: 0 };
    this.setStorm(stormMap[n] ?? 1);
    document.getElementById('audioHud')?.replaceChildren(...this._hudBars());
  }

  _hudBars() {
    const bars = [];
    const total = (this.cfg.stems || []).length || 10;
    for (let i = 0; i < total; i++) {
      const b = document.createElement('span');
      b.className = 'au-bar' + (i < this.stemCount ? ' on' : '');
      bars.push(b);
    }
    return bars;
  }

  // ---------- 配乐（小调 i–VI–III–VII，D 小调） ----------
  // 音高表：D2=73.42 E2=82.41 F2=87.31 G2=98 A2=110 Bb2=116.54 C3=130.81 D3=146.83
  _n(semi) { return 73.42 * Math.pow(2, semi / 12); } // semi 相对 D2

  _startMusic() {
    if (this._seq) return;
    // 每和弦 2 小节，每小节 4 拍，拍长 1s；step = 8 分音符
    this._chords = [
      { root: 0, tones: [0, 3, 7], scale: [0, 3, 5, 7, 10] },   // Dm
      { root: -2, tones: [-2, 2, 5], scale: [-2, 2, 3, 5, 8] }, // Bb
      { root: 3, tones: [3, 7, 10], scale: [3, 5, 7, 10, 12] }, // F
      { root: -1, tones: [-1, 2, 5], scale: [-1, 2, 5, 7, 10] },// C → 用 VII (C) 替代
    ];
    this._nextNoteTime = this.ctx.currentTime + 0.1;
    this._step = 0;
    this._seq = setInterval(() => this._schedule(), 200);
  }

  _schedule() {
    if (!this.ctx || this._ritual) return;
    const STEP = 0.5; // 8 分音符
    while (this._nextNoteTime < this.ctx.currentTime + 0.6) {
      const t = this._nextNoteTime;
      const stepInChord = this._step % 16;          // 2 小节 = 16 个 8 分
      const chordIdx = Math.floor(this._step / 16) % this._chords.length;
      const chord = this._chords[chordIdx];
      const S = this.activeStems;
      if (S.size > 0) {
        if (S.has('doublebass') && stepInChord % 8 === 0)
          this._tone('sine', this._n(chord.root - 12), t, 3.6, 0.16);
        if (S.has('cello') && stepInChord % 4 === 0)
          this._tone('sine', this._n(chord.root - 12 + (stepInChord % 8 === 4 ? 7 : 0)), t, 1.6, 0.1);
        if (S.has('bassoon') && stepInChord % 8 === 6)
          this._tone('sawtooth', this._n(chord.root - 12), t, 0.4, 0.05, 700);
        if (S.has('horn') && stepInChord === 0)
          this._tone('triangle', this._n(chord.root), t, 6.5, 0.1);
        if (S.has('viola') && stepInChord === 0)
          for (const s of chord.tones) this._tone('triangle', this._n(s), t, 7.5, 0.045);
        if (S.has('piano') && stepInChord % 2 === 0) {
          const arp = chord.tones[(stepInChord / 2) % 3] + 12;
          this._pluck('triangle', this._n(arp), t, 0.4, 0.09);
        }
        if (S.has('harp') && stepInChord % 4 === 2) {
          const arp = chord.tones[(stepInChord / 4 | 0) % 3] + 24;
          this._pluck('triangle', this._n(arp), t, 0.6, 0.05);
        }
        if (S.has('clarinet') && stepInChord % 8 === 0) {
          const m = chord.scale[(stepInChord / 8 | 0) % chord.scale.length] + 12;
          this._tone('triangle', this._n(m), t, 3.4, 0.06, 1500, 0.1);
        }
        if (S.has('violin2') && stepInChord % 4 === 2) {
          const m = chord.scale[(stepInChord / 4 | 0) % chord.scale.length] + 9;
          this._tone('sawtooth', this._n(m), t, 1.5, 0.05, 1300, 0.08);
        }
        if (S.has('violin1')) {
          const motif = [0, 2, 4, 3, 2, 4, 5, 4, 3, 2, 1, 2, 0, 2, 4, 2];
          const m = chord.scale[motif[stepInChord] % chord.scale.length] + 12;
          if (stepInChord % 2 === 0) this._tone('sawtooth', this._n(m), t, 0.85, 0.07, 1800, 0.06);
        }
      }
      this._nextNoteTime += STEP;
      this._step++;
    }
  }

  _tone(type, freq, t, dur, vol, lp = 2400, attack = 0.02) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = lp;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.setTargetAtTime(0, t + dur * 0.7, dur * 0.15);
    o.connect(f).connect(g).connect(this.musicGain);
    o.start(t);
    o.stop(t + dur + 0.3);
  }

  _pluck(type, freq, t, dur, vol) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.musicGain);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // ---------- 结算仪式 ----------
  settlementRitual() {
    if (!this.ctx) return;
    this._ritual = true;
    // 音乐全停
    this.musicGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
    this.play('figurine_break');
    // 3 秒静默 → 新编制淡入
    setTimeout(() => {
      this._ritual = false;
      if (this.chapter < 11) this.musicGain.gain.setTargetAtTime(0.5, this.ctx.currentTime, 1.5);
    }, 3000);
  }

  // ---------- 环境声 ----------
  _noiseBuffer(seconds = 2, brown = false) {
    const sr = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, sr * seconds, sr);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
      else d[i] = w;
    }
    return buf;
  }

  _startWaves() {
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer(3, true);
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 320;
    const g = this.ctx.createGain();
    g.gain.value = 0.05;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.13;
    const lg = this.ctx.createGain();
    lg.gain.value = 0.025;
    lfo.connect(lg).connect(g.gain);
    src.connect(f).connect(g).connect(this.master);
    src.start();
    lfo.start();
    this._waves = g;
    // 风暴层
    const s2 = this.ctx.createBufferSource();
    s2.buffer = this._noiseBuffer(2.3, true);
    s2.loop = true;
    const f2 = this.ctx.createBiquadFilter();
    f2.type = 'bandpass';
    f2.frequency.value = 500;
    f2.Q.value = 0.6;
    s2.connect(f2).connect(this.stormGain);
    s2.start();
  }

  setStorm(level) {
    this.stormLevel = level;
    if (this.stormGain && this.ctx) {
      this.stormGain.gain.setTargetAtTime(level * 0.035, this.ctx.currentTime, 1.2);
    }
  }

  // ---------- SFX ----------
  play(name) {
    if (!this.ctx) return;
    const fn = this[`_sfx_${name}`];
    if (fn) fn.call(this);
  }

  _burst(dur, vol, lpFreq = 6000, type = 'highpass') {
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer(dur);
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = lpFreq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur);
  }

  _sfx_figurine_break() {
    this._burst(0.5, 0.5, 2500);
    // 高频碎片
    const t = this.ctx.currentTime;
    for (let i = 0; i < 5; i++) {
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = 2400 + Math.random() * 2400;
      const g = this.ctx.createGain();
      const st = t + 0.03 + i * 0.045;
      g.gain.setValueAtTime(0.12, st);
      g.gain.exponentialRampToValueAtTime(0.001, st + 0.25);
      o.connect(g).connect(this.master);
      o.start(st);
      o.stop(st + 0.3);
    }
  }
  _sfx_clue_pickup() { this._chime([880, 1320], 0.12, 0.1); }
  _sfx_accuse_bass() {
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 1.6);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.35, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.8);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + 1.9);
  }
  _sfx_gunshot_beach() { this._burst(0.35, 0.7, 1200, 'lowpass'); }
  _sfx_gunshot_final() { this._burst(0.3, 0.7, 1500, 'lowpass'); }
  _sfx_waves() {
    if (this._waves && this.ctx) {
      const t = this.ctx.currentTime;
      this._waves.gain.cancelScheduledValues(t);
      this._waves.gain.setValueAtTime(0.16, t);
      this._waves.gain.setTargetAtTime(0.05, t + 1.5, 1.5);
    }
  }
  _sfx_bee_hum() {
    const t = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 180 + i * 22;
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 9 + i * 3;
      const lg = this.ctx.createGain();
      lg.gain.value = 12;
      lfo.connect(lg).connect(o.frequency);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.05, t);
      g.gain.setTargetAtTime(0, t + 3.5, 0.5);
      o.connect(g).connect(this.master);
      o.start(t); o.stop(t + 4.5);
      lfo.start(t); lfo.stop(t + 4.5);
    }
  }
  _sfx_choking() {
    const t = this.ctx.currentTime;
    for (let i = 0; i < 4; i++) {
      const st = t + i * 0.22;
      this._blip(st, 300 - i * 40, 0.09, 'square');
    }
  }
  _sfx_morning_bell_silence() { this._chime([440], 2.5, 0.08); }
  _sfx_distant_shout() { this._blip(this.ctx.currentTime, 500, 0.25, 'sawtooth', 900); }
  _sfx_axe_drop_echo() { this._burst(0.25, 0.3, 900, 'lowpass'); }
  _sfx_vera_scream() {
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(700, t);
    o.frequency.linearRampToValueAtTime(1100, t + 0.3);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.1, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + 0.75);
  }
  _sfx_door_lock_night() { this._blip(this.ctx.currentTime, 180, 0.12, 'square'); this._blip(this.ctx.currentTime + 0.18, 140, 0.14, 'square'); }
  _sfx_marble_crash() { this._burst(0.45, 0.5, 2000); }
  _sfx_chair_topple() { this._burst(0.2, 0.3, 700, 'lowpass'); }
  _sfx_paper() { this._burst(0.12, 0.12, 4500); }
  _sfx_type_tick() { this._blip(this.ctx.currentTime, 2200 + Math.random() * 600, 0.015, 'square', 4000, 0.03); }
  _sfx_npc_blip() { this._blip(this.ctx.currentTime, 240 + Math.random() * 120, 0.07, 'triangle', 1200, 0.06); }
  _sfx_clock_tick() { this._blip(this.ctx.currentTime, 1800, 0.02, 'square', 3000, 0.025); }
  _sfx_gramophone_voice() {
    // 机械蜂鸣节奏（TTS 由 speak() 承担）
    const t = this.ctx.currentTime;
    for (let i = 0; i < 7; i++) {
      this._blip(t + i * 0.14, 140 + (i % 2) * 30, 0.09, 'square', 700, 0.05);
    }
  }
  _sfx_step() { this._blip(this.ctx.currentTime, 90 + Math.random() * 30, 0.06, 'sine', 300, 0.05); }

  _blip(t, freq, dur, type = 'sine', lp = 2400, vol = 0.08) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = lp;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur + 0.05);
    o.connect(f).connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.1);
  }

  _chime(freqs, dur, vol) {
    const t = this.ctx.currentTime;
    for (const fq of freqs) {
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = fq;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
      o.connect(g).connect(this.master);
      o.start(t); o.stop(t + dur + 0.1);
    }
  }

  // 留声机 TTS（失败退回蜂鸣）
  speak(text) {
    this.play('gramophone_voice');
    try {
      if (!window.speechSynthesis) return;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-CN';
      u.rate = 0.8;
      u.pitch = 0.4;
      u.volume = 0.85;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch (e) { /* 退回蜂鸣，已在上面播放 */ }
  }

  // 脚步（主循环调用；ch6+ 带回声）
  step(chapter) {
    if (!this.ctx) return;
    this._sfx_step();
    if (chapter >= 6) {
      const t = this.ctx.currentTime;
      this._blip(t + 0.16, 70, 0.09, 'sine', 220, 0.03);
      this._blip(t + 0.34, 55, 0.12, 'sine', 180, 0.018);
    }
  }
}
