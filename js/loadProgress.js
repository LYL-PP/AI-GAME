// loadProgress.js —— 分阶段加载进度跟踪（按项注册；字节+个数双进度）+ GLB 加载包装
// 各 loader 用 loadGLB(url, key) 替代 loadAsync；main.js 订阅快照驱动加载页。
import { GLTFLoader } from './vendor/GLTFLoader.js';

const _items = new Map();   // key → { label, est, loaded, total, done }
let _listener = null;
let _lastKey = null;

function emit() {
  if (!_listener) return;
  let loaded = 0, total = 0, done = 0;
  for (const it of _items.values()) {
    const t = it.total || it.est;
    total += t;
    loaded += Math.min(it.loaded, t || it.loaded);
    if (it.done) done++;
  }
  // 当前载入项：最后有进度且未完成的项
  let current = '';
  if (_lastKey && _items.has(_lastKey) && !_items.get(_lastKey).done) current = _items.get(_lastKey).label;
  if (!current) for (const [k, it] of _items) if (!it.done) { current = it.label; break; }
  _listener({ loaded, total, done, count: _items.size, current });
}

export const LoadTracker = {
  onUpdate(fn) { _listener = fn; },
  register(key, label, estBytes = 0) {
    _items.set(key, { label, est: estBytes, loaded: 0, total: 0, done: false });
    emit();
  },
  progress(key, loaded, total) {
    const it = _items.get(key);
    if (!it) return;
    it.loaded = loaded;
    if (total > 0) it.total = total;
    _lastKey = key;
    emit();
  },
  done(key) {
    const it = _items.get(key);
    if (!it) return;
    it.done = true;
    const t = it.total || it.est;
    if (t) it.loaded = t;
    emit();
  },
  reset() { _items.clear(); _lastKey = null; },
};

const _glbLoader = new GLTFLoader();
// key：直接挂跟踪项；onProgress：自定义进度回调（多文件聚合用），二者可空
export function loadGLB(url, key, onProgress = null) {
  return new Promise((resolve, reject) => {
    _glbLoader.load(
      url,
      (g) => { if (key) LoadTracker.done(key); resolve(g); },
      onProgress ? (ev) => onProgress(ev.loaded ?? 0, ev.total ?? 0)
        : key ? (ev) => LoadTracker.progress(key, ev.loaded ?? 0, ev.total ?? 0) : undefined,
      reject
    );
  });
}
