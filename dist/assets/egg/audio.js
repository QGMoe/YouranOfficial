/* 404 彩蛋音效（宿主侧）：所有游戏共用一个开关，默认静音，状态存 localStorage（youran-egg:audio）。
 * 全部用 Web Audio 实时合成，不加载任何音频文件。主输出：bus（静音/淡入淡出）→ 压缩器 → 软限幅（峰值 < 0 dBFS）→ 扬声器。
 * 静音或页面隐藏时不创建、不播放任何声音；AudioContext 在打开开关（用户手势）时才懒创建。接口约定见 tools/eggs/CONTRACT.md。 */
const KEY = 'youran-egg:audio';
let on = false, hidden = typeof document !== 'undefined' && !!document.hidden, ac = null, bus = null, noise = null, offTimer = 0;
try { on = localStorage.getItem(KEY) === '1'; } catch (e) {}
const subs = new Set();
let factory = () => new (window.AudioContext || window.webkitAudioContext)();
export function _setFactory(f) { factory = f; }           // 测试用：注入 OfflineAudioContext 或桩
const offline = () => ac && typeof ac.startRendering === 'function';

function graph() {
  if (ac) return ac;
  ac = factory();
  bus = ac.createGain(); bus.gain.value = 0;
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -10; comp.knee.value = 6; comp.ratio.value = 12; comp.attack.value = 0.003; comp.release.value = 0.15;
  const sh = ac.createWaveShaper(), c = new Float32Array(1025);
  for (let i = 0; i < 1025; i++) c[i] = 0.95 * Math.tanh((i / 512 - 1) * 1.6) / Math.tanh(1.6);   // 软限幅，输出绝对值 ≤ 0.95
  sh.curve = c;
  bus.connect(comp); comp.connect(sh); sh.connect(ac.destination);
  noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const d = noise.getChannelData(0); let s = 1;
  for (let i = 0; i < d.length; i++) { s = (s * 16807) % 2147483647; d[i] = s / 1073741823.5 - 1; }
  return ac;
}

export const isOn = () => on;
export const live = () => on && !hidden;
function apply() {
  const l = live();
  clearTimeout(offTimer);
  if (l) {
    graph();
    if (!offline() && ac.state !== 'running') ac.resume().catch(() => {});
    bus.gain.setTargetAtTime(1, ac.currentTime, 0.015);
  } else if (ac) {
    bus.gain.setTargetAtTime(0, ac.currentTime, 0.015);
    if (!offline()) offTimer = setTimeout(() => { if (!live()) ac.suspend().catch(() => {}); }, 120);
  }
  subs.forEach((cb) => { try { cb(l); } catch (e) {} });
}
export function setOn(v) {
  on = !!v;
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) {}
  apply();
}
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => { hidden = document.hidden; apply(); });
  // 刷新后开关仍为开时，AudioContext 要等到第一次用户手势才能 resume
  const kick = () => { if (live()) { graph(); if (!offline() && ac.state !== 'running') ac.resume().catch(() => {}); bus.gain.setTargetAtTime(1, ac.currentTime, 0.015); } };
  addEventListener('pointerdown', kick, true); addEventListener('keydown', kick, true);
}
export const _state = () => ({ on, hidden, created: !!ac, state: ac ? ac.state : null, ctx: ac });

/* 内置 8-bit 风格音效：[类型, 起始频率, 结束频率, 开始(s), 时长(s), 音量, 滤波起, 滤波止]；类型 n = 噪声（频率字段为带通/低通的滤波频率） */
const SFX = {
  click: [['square', 1800, 1100, 0, 0.03, 0.18]],
  place: [['square', 240, 120, 0, 0.06, 0.25], ['n', 0, 0, 0, 0.04, 0.2, 2500, 800]],
  ok: [['square', 660, 660, 0, 0.07, 0.2], ['square', 990, 990, 0.07, 0.1, 0.2]],
  fail: [['sawtooth', 320, 140, 0, 0.22, 0.22]],
  win: [['square', 523, 523, 0, 0.08, 0.2], ['square', 659, 659, 0.08, 0.08, 0.2], ['square', 784, 784, 0.16, 0.08, 0.2], ['square', 1047, 1047, 0.24, 0.22, 0.22]],
  boom: [['n', 0, 0, 0, 0.55, 0.9, 1400, 90], ['sine', 110, 38, 0, 0.45, 0.8]],
  pickup: [['square', 880, 1760, 0, 0.09, 0.18]],
  splash: [['n', 0, 0, 0, 0.32, 0.45, 2600, 500]],
  step: [['n', 0, 0, 0, 0.035, 0.3, 900, 500]],
  // 按地表区分的脚步声：草地（软沙沙）、沙子（细碎的嘶）、雪（两下压实的咯吱）、石头 / 下界岩（短促的磕碰）、灵魂沙（闷、低）、菌岩（偏低的沙沙）
  step_grass: [['n', 0, 0, 0, 0.05, 0.33, 1500, 700], ['n', 0, 0, 0.01, 0.03, 0.12, 3800, 2600]],
  step_sand: [['n', 0, 0, 0, 0.07, 0.24, 3200, 1800], ['n', 0, 0, 0, 0.03, 0.15, 900, 600]],
  step_snow: [['n', 0, 0, 0, 0.04, 0.24, 2600, 1500], ['n', 0, 0, 0.035, 0.05, 0.21, 2000, 1100]],
  step_stone: [['square', 150, 90, 0, 0.025, 0.15], ['n', 0, 0, 0, 0.03, 0.33, 2400, 1300]],
  step_soul: [['n', 0, 0, 0, 0.09, 0.39, 520, 240], ['sine', 95, 60, 0, 0.06, 0.15]],
  step_nylium: [['n', 0, 0, 0, 0.05, 0.3, 1100, 600], ['n', 0, 0, 0.008, 0.025, 0.12, 2600, 1800]],
  tick: [['square', 2400, 2400, 0, 0.015, 0.12]],
  hiss: [['n', 0, 0, 0, 0.07, 0.18, 6000, 5000]],
  hit: [['square', 180, 60, 0, 0.08, 0.3], ['n', 0, 0, 0, 0.05, 0.3, 1800, 600]],
  jump: [['square', 300, 620, 0, 0.11, 0.18]]
};
const LIMIT = { boom: 3, hiss: 2 }, MAXALL = 14;
const active = new Map();   // name -> 正在发声的个数
let total = 0;

/* 给每个游戏的 ctx.audio。signal abort（unmount）时解除回调、停止本游戏发出的全部声音 */
export function forGame(signal) {
  const mine = new Set(), cbs = new Set();
  const api = {
    enabled: live,
    onChange(cb) { if (typeof cb === 'function') { cbs.add(cb); subs.add(cb); } },
    context: () => (live() ? graph() : null),
    out: () => (live() ? (graph(), bus) : null),
    sfx(name, o = {}) {
      const rec = SFX[name];
      if (!rec || !live() || signal.aborted) return;
      if (globalThis.__eggAudioLog) globalThis.__eggAudioLog.push(name);   // 测试用
      const n = active.get(name) || 0;
      if (n >= (LIMIT[name] || 4) || total >= MAXALL) return;
      graph();
      const t0 = ac.currentTime + 0.005, p = o.pitch > 0 ? o.pitch : 1, v = Math.max(0, Math.min(2, o.vol == null ? 1 : o.vol));
      const g = ac.createGain(); g.gain.value = v;
      let tail = g;
      if (o.pan && ac.createStereoPanner) { const pn = ac.createStereoPanner(); pn.pan.value = Math.max(-1, Math.min(1, o.pan)); g.connect(pn); tail = pn; }
      tail.connect(bus);
      let left = rec.length, end = 0;
      active.set(name, n + 1); total++;
      const srcs = [];
      const done = () => {
        if (--left) return;
        srcs.forEach((s) => { mine.delete(s); try { s.disconnect(); } catch (e) {} });
        try { g.disconnect(); tail.disconnect(); } catch (e) {}
        active.set(name, (active.get(name) || 1) - 1); total--;
      };
      for (const [type, f0, f1, at, dur, vol, q0, q1] of rec) {
        const s = t0 + at, e = s + dur, eg = ac.createGain();
        let src;
        if (type === 'n') {
          src = ac.createBufferSource(); src.buffer = noise; src.loop = true;
          const fl = ac.createBiquadFilter(); fl.type = 'bandpass'; fl.Q.value = 0.8;
          fl.frequency.setValueAtTime(q0 * p, s); fl.frequency.exponentialRampToValueAtTime(Math.max(20, q1 * p), e);
          src.connect(fl); fl.connect(eg); srcs.push(fl);
        } else {
          src = ac.createOscillator(); src.type = type;
          src.frequency.setValueAtTime(f0 * p, s); src.frequency.exponentialRampToValueAtTime(Math.max(20, f1 * p), e);
          src.connect(eg);
        }
        eg.gain.setValueAtTime(0.0001, s); eg.gain.exponentialRampToValueAtTime(vol, s + 0.004); eg.gain.exponentialRampToValueAtTime(0.0001, e);
        eg.connect(g);
        src.onended = done;
        src.start(s); src.stop(e + 0.02);
        srcs.push(src, eg); mine.add(src);
        end = Math.max(end, e);
      }
    },
    _active: () => mine.size
  };
  signal.addEventListener('abort', () => {
    cbs.forEach((cb) => subs.delete(cb)); cbs.clear();
    mine.forEach((s) => { try { s.onended = null; s.stop(); s.disconnect(); } catch (e) {} });
    if (mine.size) { active.clear(); total = 0; }
    mine.clear();
  }, { once: true });
  return api;
}

/* 标题旁的开关按钮（真正的 <button>，aria-pressed = 是否有声音）；labels = { label, on, off } 可覆盖默认文字 */
const ICON_ON = '<svg viewBox="0 0 16 16" width="20" height="20" aria-hidden="true" fill="currentColor"><path d="M1 6h3l4-3v10l-4-3H1z"/><path d="M10 5h1v6h-1zM12 3h1v10h-1z"/></svg>';
const ICON_OFF = '<svg viewBox="0 0 16 16" width="20" height="20" aria-hidden="true" fill="currentColor"><path d="M1 6h3l4-3v10l-4-3H1z"/><path d="M10 5h2v2h-2zM12 7h2v2h-2zM14 5h1v2h-1zM10 9h2v2h-2zM14 9h1v2h-1z"/></svg>';
export function toggleButton(signal, labels) {
  const L = Object.assign({ label: '游戏音效', on: '音效：开', off: '音效：关' }, labels);   // 文字由宿主从 texts/common.js 的 audio 节传入
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'egg-audio';
  const paint = () => { b.innerHTML = on ? ICON_ON : ICON_OFF; b.setAttribute('aria-pressed', String(on)); b.setAttribute('aria-label', L.label); b.title = on ? L.on : L.off; };
  b.addEventListener('click', () => { setOn(!on); paint(); }, signal ? { signal } : undefined);
  paint();
  return b;
}
