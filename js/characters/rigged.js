// rigged.js —— 骨骼动画基础设施（带 skin GLB 通用播放/切换/位移模块）
// 每个 GLB 自带 skin 与 clip（各文件独立骨架），切换 clip = 切换整模型（权重+透明度淡入淡出）
import * as THREE from '../vendor/three.module.js';
import { GLTFLoader } from '../vendor/GLTFLoader.js';

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
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec2 vProjUv;')
          .replace('#include <begin_vertex>', `#include <begin_vertex>
            vProjUv = vec2((position.x - uProjOrigin.x) / uProjSize.x,
                           1.0 - (position.y - uProjOrigin.y) / uProjSize.y);`);
        sh.vertexShader = 'uniform vec2 uProjOrigin;\nuniform vec2 uProjSize;\n' + sh.vertexShader;
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying vec2 vProjUv;\nuniform sampler2D uProjMap;\nuniform vec3 uBackColor;')
          .replace('#include <map_fragment>', `
            #ifdef GL_FRONT_FACING
            if (gl_FrontFacing) {
              diffuseColor *= texture2D(uProjMap, vProjUv);
            } else {
              diffuseColor.rgb = uBackColor;
            }
            #else
            diffuseColor *= texture2D(uProjMap, vProjUv);
            #endif`);
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

  update(dt) {
    for (const o of Object.values(this.items)) {
      if (o.action.isRunning() || o.action.getEffectiveWeight() > 0.001) o.mixer.update(dt);
      const w = o.action.getEffectiveWeight();
      o.mat.opacity = Math.min(1, w * 1.2);
      if (w < 0.001 && o !== this.current) o.root.visible = false;
    }
  }
}
