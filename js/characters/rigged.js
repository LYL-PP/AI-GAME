// rigged.js —— 骨骼动画基础设施（带 skin GLB 通用播放/切换/位移模块）
// 每个 GLB 自带 skin 与 clip（各文件独立骨架），切换 clip = 切换整模型（权重+透明度淡入淡出）
import * as THREE from '../vendor/three.module.js';
import { GLTFLoader } from '../vendor/GLTFLoader.js';

// 按位置聚合的平滑法线（Meshy 低模常每面独立顶点=硬折面"布袋折痕"；
// 只平均法线、不合并顶点，蒙皮权重/UV 缝不受影响，变形由蒙皮 shader 照常变换）
function smoothNormalsByPosition(geo) {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  if (!pos || !nor) return;
  const groups = new Map();
  for (let i = 0; i < pos.count; i++) {
    const k = `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
    (groups.get(k) || groups.set(k, []).get(k)).push(i);
  }
  const avg = new THREE.Vector3();
  for (const idxs of groups.values()) {
    if (idxs.length < 2) continue;
    avg.set(0, 0, 0);
    for (const i of idxs) { avg.x += nor.getX(i); avg.y += nor.getY(i); avg.z += nor.getZ(i); }
    avg.normalize();
    for (const i of idxs) nor.setXYZ(i, avg.x, avg.y, avg.z);
  }
  nor.needsUpdate = true;
}

export class RiggedActor {
  // files: { name: fileName }；tint：剪影材质色（黑袍 #1a1a20 系）
  static async load(dir, files, { tint = 0x1a1a20 } = {}) {
    const loader = new GLTFLoader();
    const a = new RiggedActor();
    a.group = new THREE.Group();
    a.items = {};
    a.current = null;
    a.currentName = null;
    a.faceOffset = 0;
    await Promise.all(Object.entries(files).map(async ([name, file]) => {
      const g = await loader.loadAsync(dir + file);
      const root = g.scene;
      const mat = new THREE.MeshLambertMaterial({ color: tint, emissive: 0x111116, transparent: true, opacity: 0 });
      root.traverse((o) => {
        if (o.isMesh) {
          smoothNormalsByPosition(o.geometry);
          o.material = mat;
          o.frustumCulled = false; // 蒙皮包围盒不可靠，直接关剔除
          o.castShadow = false;
          o.receiveShadow = false;
        }
      });
      const mixer = new THREE.AnimationMixer(root);
      const action = mixer.clipAction(g.animations[0]);
      root.visible = false;
      a.group.add(root);
      a.items[name] = { root, mat, mixer, action };
    }));
    return a;
  }

  has(name) { return !!this.items[name]; }

  // 追加独立模型实例 + 外来 clip（同骨架重定向借用；材质为占位，applyPortraitProjection 统一替换）
  addClipModel(name, root, clip, { tint = 0x1a1a20 } = {}) {
    const mat = new THREE.MeshLambertMaterial({ color: tint, emissive: 0x111116, transparent: true, opacity: 0 });
    root.traverse((o) => {
      if (o.isMesh) {
        smoothNormalsByPosition(o.geometry);
        o.material = mat;
        o.frustumCulled = false;
        o.castShadow = false;
        o.receiveShadow = false;
      }
    });
    const mixer = new THREE.AnimationMixer(root);
    const action = mixer.clipAction(clip);
    root.visible = false;
    this.group.add(root);
    this.items[name] = { root, mat, mixer, action };
  }

  // 正面平面投影贴图（绑定空间 XY 投影；正面油画质感，背面暗色罩染）
  // map: THREE.Texture；marginX: 横向内缩比例（立绘人物居中）
  applyPortraitProjection(map, { marginX = 0.1, backColor = 0x141418 } = {}) {
    // 全体模型绑定空间包围盒
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    for (const o of Object.values(this.items)) {
      o.root.traverse((m) => {
        if (!m.isMesh) return;
        m.geometry.computeBoundingBox();
        const bb = m.geometry.boundingBox;
        minX = Math.min(minX, bb.min.x); maxX = Math.max(maxX, bb.max.x);
        minY = Math.min(minY, bb.min.y); maxY = Math.max(maxY, bb.max.y);
      });
    }
    const sizeX = (maxX - minX) * (1 + marginX * 2);
    const cx = (minX + maxX) / 2;
    const u0 = cx - sizeX / 2;
    for (const o of Object.values(this.items)) {
      const mat = new THREE.MeshLambertMaterial({
        color: 0xffffff, transparent: true, opacity: 0,
      });
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.uProjMap = { value: map };
        sh.uniforms.uProjOrigin = { value: new THREE.Vector2(u0, minY) };
        sh.uniforms.uProjSize = { value: new THREE.Vector2(sizeX, maxY - minY) };
        sh.uniforms.uBackColor = { value: new THREE.Color(backColor) };
        sh.uniforms.uSitMix = { value: 0 };   // 0=站姿投影；1=坐姿（下半身投影渐隐入深色罩染，盖住绑定空间拉伸涂抹）
        sh.uniforms.uRimColor = { value: new THREE.Color(0xffc890) };
        sh.uniforms.uRimStrength = { value: 0.16 };   // 烛光色弱边缘光，轮廓从暗背景塑形
        mat.userData.shader = sh;
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec2 vProjUv;')
          .replace('#include <begin_vertex>', `#include <begin_vertex>
            vProjUv = vec2((position.x - uProjOrigin.x) / uProjSize.x,
                           1.0 - (position.y - uProjOrigin.y) / uProjSize.y);`);
        sh.vertexShader = 'uniform vec2 uProjOrigin;\nuniform vec2 uProjSize;\n' + sh.vertexShader;
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying vec2 vProjUv;\nuniform sampler2D uProjMap;\nuniform vec3 uBackColor;\nuniform float uSitMix;\nuniform vec3 uRimColor;\nuniform float uRimStrength;')
          .replace('#include <map_fragment>', `
            #ifdef GL_FRONT_FACING
            if (gl_FrontFacing) {
              diffuseColor *= texture2D(uProjMap, vProjUv);
            } else {
              diffuseColor.rgb = uBackColor;
            }
            #else
            diffuseColor *= texture2D(uProjMap, vProjUv);
            #endif
            // 坐姿：下半身（vProjUv.y 大=绑定位低处）投影渐混入罩染，遮坐姿弯折造成的纹理拉伸
            diffuseColor.rgb = mix(diffuseColor.rgb, uBackColor * 1.35,
                                   uSitMix * smoothstep(0.42, 0.82, vProjUv.y) * 0.72);`)
          .replace('#include <opaque_fragment>', `
            {
              float rim = pow(1.0 - abs(dot(normalize(normal), vec3(0.0, 0.0, 1.0))), 2.5);
              outgoingLight += uRimColor * rim * uRimStrength;
            }
            #include <opaque_fragment>`);
      };
      o.mat = mat;
      o.root.traverse((m) => { if (m.isMesh) m.material = mat; });
    }
  }

  // 播放/切换：crossfade（动作权重 + 材质透明度同步）
  play(name, { loop = true, fade = 0.25, timeScale = 1 } = {}) {
    const it = this.items[name];
    if (!it) return null;
    for (const o of Object.values(this.items)) {
      if (o !== it) o.action.fadeOut(fade);
    }
    it.root.visible = true;
    it.action.reset();
    it.action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    it.action.clampWhenFinished = !loop;
    it.action.timeScale = timeScale;
    it.action.fadeIn(fade).play();
    this.current = it;
    this.currentName = name;
    return it.action;
  }

  // 朝目标方向缓转（dx,dz 为期望前进方向）
  face(dx, dz, dt, rate = 7) {
    const target = Math.atan2(dx, dz) + this.faceOffset;
    let d = target - this.group.rotation.y;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.group.rotation.y += d * Math.min(1, rate * dt);
  }

  // 程序位移 + 地面贴合（groundFn(x,z)→y）
  move(dx, dz, groundFn) {
    const p = this.group.position;
    p.x += dx;
    p.z += dz;
    if (groundFn) p.y = groundFn(p.x, p.z);
  }

  setOpacity(v) {
    for (const o of Object.values(this.items)) o.mat.opacity = v;
  }

  // 坐姿罩染目标（0=站姿投影 / 1=坐姿下半身罩染），update 内缓动
  setSitMix(v) { this._sitMixTarget = v; }

  update(dt) {
    if (this._sitMix === undefined) { this._sitMix = 0; this._sitMixTarget = 0; }
    if (this._sitMix !== this._sitMixTarget) {
      const d = this._sitMixTarget - this._sitMix;
      this._sitMix += Math.sign(d) * Math.min(Math.abs(d), dt * 1.6);
      for (const o of Object.values(this.items)) {
        const sh = o.mat.userData.shader;
        if (sh?.uniforms.uSitMix) sh.uniforms.uSitMix.value = this._sitMix;
      }
    }
    for (const o of Object.values(this.items)) {
      if (o.action.isRunning() || o.action.getEffectiveWeight() > 0.001) o.mixer.update(dt);
      const w = o.action.getEffectiveWeight();
      o.mat.opacity = Math.min(1, w * 1.2);
      if (w < 0.001 && o !== this.current) o.root.visible = false;
    }
  }
}
