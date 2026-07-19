// weather.js —— 12 套章节天气/灯光预设与切换（key = 章节号 0–11）
import * as THREE from './vendor/three.module.js';

// 字段：sky 天空色 / fog[near,far] / hemi[天,地,强度] / sun[色,强度,位置] /
// exposure 曝光 / rain 雨强 0..1 / wind 风 / sea 海面色 / wave 浪高 /
// indoor{ceiling,fire,candle} 室内灯联动系数 / lightning 闪电
export const PRESETS = [
  { // 0 序章：阴天渐起浪
    sky: 0x868e97, fog: [0x868e97, 55, 230], hemi: [0x9aa3ad, 0x3a453c, 1.15],
    sun: [0xcfd6dd, 0.7, [60, 90, 30]], exposure: 1.0, rain: 0, wind: 0.2,
    sea: 0x4c5a63, wave: 0.6, windowGlow: 0.55, indoor: { ceiling: 0.5, fire: 0.9, candle: 0.3 }, lightning: false,
  },
  { // 1 第1章：起风雨至
    sky: 0x6b747d, fog: [0x6b747d, 45, 180], hemi: [0x8b95a0, 0x333d35, 0.95],
    sun: [0xb9c2ca, 0.45, [40, 70, 20]], exposure: 0.95, rain: 0.25, wind: 0.7,
    sea: 0x45525b, wave: 1.1, windowGlow: 0.85, indoor: { ceiling: 0.6, fire: 0.9, candle: 0.4 }, lightning: false,
  },
  { // 2 第2章：暴雨
    sky: 0x535b63, fog: [0x555d65, 30, 120], hemi: [0x6e7780, 0x2c342d, 0.95],
    sun: [0x9aa4ac, 0.3, [30, 60, 10]], exposure: 0.95, rain: 0.7, wind: 0.8,
    sea: 0x3c4850, wave: 1.7, windowGlow: 1.0, indoor: { ceiling: 0.7, fire: 1.0, candle: 0.5 }, lightning: false,
  },
  { // 3 第3章：风暴封岛（最强雨浪 + 偶发闪电）
    sky: 0x31373d, fog: [0x343a41, 22, 85], hemi: [0x4a525a, 0x22282c, 0.75],
    sun: [0x7d8891, 0.18, [20, 50, 5]], exposure: 0.85, rain: 1.0, wind: 1.0,
    sea: 0x323c44, wave: 2.3, windowGlow: 1.0, indoor: { ceiling: 0.8, fire: 1.0, candle: 0.6 }, lightning: true,
  },
  { // 4 第4章：持续暴雨（更阴沉压抑）
    sky: 0x3d434a, fog: [0x3f454c, 26, 95], hemi: [0x565e66, 0x262b2e, 0.68],
    sun: [0x88919a, 0.2, [25, 55, 8]], exposure: 0.85, rain: 0.9, wind: 0.9,
    sea: 0x353f47, wave: 2.0, windowGlow: 0.95, indoor: { ceiling: 0.8, fire: 1.0, candle: 0.6 }, lightning: false,
  },
  { // 5 第5章：雨歇浓雾死寂（能见度 ~40m）
    sky: 0xb6babf, fog: [0xb2b6ba, 6, 40], hemi: [0xc4c8cc, 0x5a615c, 1.25],
    sun: [0xd8dbdd, 0.2, [50, 80, 30]], exposure: 1.0, rain: 0, wind: 0.1,
    sea: 0x6d767c, wave: 0.3, windowGlow: 0.75, indoor: { ceiling: 0.5, fire: 0.8, candle: 0.4 }, lightning: false,
  },
  { // 6 第6章：黑夜烛光（室外深蓝黑，室内烛光为主）
    sky: 0x0c1320, fog: [0x0c1320, 18, 110], hemi: [0x22304a, 0x0b0e13, 0.45],
    sun: [0x8fa3c4, 0.16, [-40, 70, -50]], exposure: 1.0, rain: 0, wind: 0.15,
    sea: 0x0f1822, wave: 0.4, windowGlow: 1.0, indoor: { ceiling: 0.12, fire: 1.0, candle: 1.0 }, lightning: false,
  },
  { // 7 第7章：浓雾深夜（能见度 ~25m）
    sky: 0x090e15, fog: [0x0d1218, 4, 25], hemi: [0x1a2433, 0x090b0f, 0.35],
    sun: [0x76879f, 0.1, [-40, 70, -50]], exposure: 0.95, rain: 0, wind: 0.1,
    sea: 0x0b1118, wave: 0.3, windowGlow: 1.0, indoor: { ceiling: 0.1, fire: 1.0, candle: 1.0 }, lightning: false,
  },
  { // 8 第8章：雾散惨白（清晨苍白平光，薄雾）
    sky: 0xced1d3, fog: [0xc7cacc, 25, 110], hemi: [0xd8dadb, 0x6a6f68, 1.15],
    sun: [0xe9e6dd, 0.8, [80, 22, -20]], exposure: 1.05, rain: 0, wind: 0.2,
    sea: 0x8b9397, wave: 0.4, windowGlow: 0.4, indoor: { ceiling: 0.4, fire: 0.6, candle: 0.3 }, lightning: false,
  },
  { // 9 第9章：诡异的晴（正午过曝白亮）
    sky: 0xe9edf1, fog: [0xe6eaee, 70, 380], hemi: [0xf2f4f6, 0x7a8078, 1.4],
    sun: [0xffffff, 1.7, [15, 100, 10]], exposure: 1.35, rain: 0, wind: 0.05,
    sea: 0x9fb3bd, wave: 0.2, windowGlow: 0.12, indoor: { ceiling: 0.2, fire: 0.3, candle: 0.2 }, lightning: false,
  },
  { // 10 第10章：死寂（灰蓝静止，极薄雾，无风）
    sky: 0x7c8894, fog: [0x7c8894, 55, 240], hemi: [0x8d99a5, 0x3c4442, 0.8],
    sun: [0xb6bfc7, 0.4, [40, 80, 30]], exposure: 0.92, rain: 0, wind: 0,
    sea: 0x5a666e, wave: 0.05, windowGlow: 0.5, indoor: { ceiling: 0.4, fire: 0.7, candle: 0.3 }, lightning: false,
  },
  { // 11 终章：风暴过后金色黄昏（金色低角度阳光，长影，海面金红）
    sky: 0xcf9a5e, fog: [0xd8a565, 70, 320], hemi: [0xe0b070, 0x4a3f33, 0.95],
    sun: [0xffb65c, 1.3, [-85, 16, 8]], exposure: 1.1, rain: 0, wind: 0.15,
    sea: 0xb4763f, wave: 0.3, windowGlow: 0.25, indoor: { ceiling: 0.5, fire: 0.9, candle: 0.7 }, lightning: false,
  },
];

const RAIN_MAX = 4000;

// 高空云天气联动（refs.clouds）：[色, 不透明度, 高度]；不透明度 0 = 雾天隐藏
const CLOUD_PRESETS = [
  [0xb4bac2, 0.5, 62],   // 0 阴·白天
  [0x4a525c, 0.6, 58],   // 1 雨夜
  [0x565e66, 0.7, 56],   // 2 暴雨·晨
  [0x2e343a, 0.85, 54],  // 3 风暴夜（闪电，暗灰压顶）
  [0x363c43, 0.85, 54],  // 4 风暴晨
  [0, 0, 62],            // 5 雾·午后（隐）
  [0x1c232c, 0.7, 56],   // 6 暗夜
  [0, 0, 56],            // 7 极暗夜·浓雾（隐）
  [0xd6dadd, 0.45, 66],  // 8 亮晨
  [0xe6eaee, 0.35, 72],  // 9 晴（淡而高）
  [0xb4bac2, 0.5, 62],   // 10 阴
  [0xe8c9a0, 0.45, 68],  // 11 黄昏（暖）
];

export class Weather {
  // refs: { sun, hemi, seaMat, seaUniforms, indoor:{ceiling[],fire,candles[]}, flames[], candleFlames[] }
  constructor(scene, renderer, refs) {
    this.scene = scene;
    this.renderer = renderer;
    this.refs = refs;
    this.current = -1;
    this.t = 0;
    this.flash = 0;
    this.flashTimer = 4;

    scene.fog = new THREE.Fog(0x868e97, 55, 230);
    scene.background = new THREE.Color(0x868e97);

    // 闪电平行光（默认关闭）
    this.flashLight = new THREE.DirectionalLight(0xcfe0ff, 0);
    this.flashLight.position.set(50, 80, -60);
    scene.add(this.flashLight);

    // 雨粒子
    const pos = new Float32Array(RAIN_MAX * 3);
    this.rainSpeed = new Float32Array(RAIN_MAX);
    for (let i = 0; i < RAIN_MAX; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 44;
      pos[i * 3 + 1] = Math.random() * 26;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 44;
      this.rainSpeed[i] = 11 + Math.random() * 7;
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.Points(rg, new THREE.PointsMaterial({
      color: 0x9fb2c4, size: 0.055, transparent: true, opacity: 0.4, sizeAttenuation: true,
    }));
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    scene.add(this.rain);
    this.rainLevel = 0;
    this.wind = 0;
  }

  presets() { return PRESETS; }

  setChapter(n) {
    n = Math.max(0, Math.min(PRESETS.length - 1, n | 0));
    const p = PRESETS[n];
    this.current = n;
    const { scene, renderer, refs } = this;
    scene.background.setHex(p.sky);
    scene.fog.color.setHex(p.fog[0]);
    scene.fog.near = p.fog[1];
    scene.fog.far = p.fog[2];
    refs.hemi.color.setHex(p.hemi[0]);
    refs.hemi.groundColor.setHex(p.hemi[1]);
    refs.hemi.intensity = p.hemi[2];
    refs.sun.color.setHex(p.sun[0]);
    refs.sun.intensity = p.sun[1];
    refs.sun.position.set(...p.sun[2]);
    renderer.toneMappingExposure = p.exposure;
    this.rainLevel = p.rain;
    this.wind = p.wind;
    refs.seaMat.color.setHex(p.sea);
    refs.seaUniforms.uWaveH.value = p.wave;
    // 室内灯联动
    for (const L of refs.indoor.ceiling) L.intensity = L.userData.base * p.indoor.ceiling;
    // 城堡窗火联动（烛光橙，夜/雨/雾增强，白天减弱）
    if (refs.windowGlow && p.windowGlow !== undefined) {
      for (const m of refs.windowGlow.mats) m.opacity = p.windowGlow;
      for (const L of refs.windowGlow.lights) L.intensity = L.userData.base * p.windowGlow;
    }
    refs.indoor.fire.intensity = refs.indoor.fire.userData.base * p.indoor.fire;
    for (const L of refs.indoor.candles) L.intensity = L.userData.base * p.indoor.candle;
    // 高空云天气联动（调色/不透明度/高度；雾天隐藏）
    if (refs.clouds?.length) {
      const c = CLOUD_PRESETS[n];
      for (const cl of refs.clouds) {
        for (const m of cl.mats) { m.color.setHex(c[0]); m.opacity = c[1]; }
        cl.obj.visible = c[1] > 0.01;
        cl.obj.position.y = c[2];
      }
    }
    this.preset = p;
    return p;
  }

  getChapter() { return this.current; }

  // camInside: 玩家是否在别墅内（室内不显示雨）
  update(dt, camPos, camInside) {
    this.t += dt;
    const p = this.preset;
    if (!p) return;
    this.refs.seaUniforms.uTime.value = this.t;

    // 雨
    const show = this.rainLevel > 0.02 && !camInside;
    this.rain.visible = show;
    if (show) {
      const attr = this.rain.geometry.attributes.position;
      const a = attr.array;
      const n = Math.floor(RAIN_MAX * this.rainLevel);
      this.rain.geometry.setDrawRange(0, n);
      const windX = this.wind * 6;
      for (let i = 0; i < n; i++) {
        let y = a[i * 3 + 1] - this.rainSpeed[i] * dt;
        let x = a[i * 3] + windX * dt;
        if (y < -2) { y += 26; x = (Math.random() - 0.5) * 44; }
        if (x > 22) x -= 44;
        a[i * 3] = x;
        a[i * 3 + 1] = y;
      }
      attr.needsUpdate = true;
      this.rain.position.copy(camPos);
      this.rain.position.y = Math.max(0, camPos.y - 8);
    }

    // 火光/烛光闪烁
    const flick = 0.86 + 0.14 * Math.sin(this.t * 11.3) * Math.sin(this.t * 5.7 + 1.3);
    const fire = this.refs.indoor.fire;
    fire.intensity = fire.userData.base * p.indoor.fire * (0.8 + 0.2 * flick);
    for (const L of this.refs.indoor.candles)
      L.intensity = L.userData.base * p.indoor.candle * flick;
    this.refs.flames.forEach((f, i) => {
      f.scale.y = 0.8 + 0.35 * Math.sin(this.t * 13 + i * 2.1);
      f.scale.x = f.scale.z = 0.9 + 0.15 * Math.sin(this.t * 9 + i);
    });
    this.refs.candleFlames.forEach((f, i) => {
      f.scale.y = 0.85 + 0.3 * Math.sin(this.t * 15 + i * 3.7);
    });

    // 闪电（第 3 章）
    if (p.lightning) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) {
        this.flash = 2.5 + Math.random() * 2;
        this.flashTimer = 3 + Math.random() * 6;
        const a = Math.random() * Math.PI * 2;
        this.flashLight.position.set(Math.cos(a) * 80, 70, Math.sin(a) * 80);
      }
    }
    this.flash *= Math.exp(-7 * dt);
    this.flashLight.intensity = this.flash;

    // 高空云缓慢漂移（大尺度，出界回卷）
    if (this.refs.clouds?.length) {
      for (const cl of this.refs.clouds) {
        if (!cl.obj.visible) continue;
        cl.obj.position.x += cl.speed * dt;
        if (cl.obj.position.x > 130) cl.obj.position.x = -130;
      }
    }
  }
}
