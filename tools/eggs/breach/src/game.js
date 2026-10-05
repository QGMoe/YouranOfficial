/* ---------- Worker（同一模块里用 Blob URL 创建；源码来自 fluidEngine / breachCore / workerMain 的 toString） ----------
 * 主 → Worker  {cmd:'prerun', seed, d, neg, slow, fp}   开局预跑选图与破口（同步、按刻计数，与设备快慢无关）→ {t:'prerun', k, regen, ticks, fp}
 *              {cmd:'init', X,Y,Z, seed, params, mat, q, st, sources}
 *              {cmd:'open', cells}  挖开破口      {cmd:'run', until}  推进到第 until 刻（主线程按游戏时间 × TPS 给出，暂停即停）
 * Worker → 主  {t:'diff', tick, idx:Int32Array, mat:Uint8Array, q:Uint8Array, ev:Int32Array}（Transferable）
 *              线性下标 i=(y*Z+z)*X+x；ev 每 4 个一组 [类型, a, b, n]：1 瞬移(源,目标,层) 2 混合成石 3 火把被毁 4 落水成石 5 水被覆盖 */
function workerMain(self, E, Cf) {
  var w = null, until = 0, busy = false;
  self.onmessage = function (e) {
    var m = e.data;
    if (m.cmd === 'prerun') {
      var C = Cf(E), PC = C.pacing(m.d, m.neg);
      var hook = m.slow ? function (t) { if (t % 25 === 0) { var t0 = Date.now(); while (Date.now() - t0 < m.slow); } } : null;
      var r = C.chooseMap(m.seed, m.d, m.neg, PC, hook);
      self.postMessage({ t: 'prerun', k: r.k, regen: r.regen, ticks: r.ticks, rT: r.rT, risky: r.risky, fp: m.fp ? C.fingerprint(r.M, PC) : 0 });
    } else if (m.cmd === 'init') { w = E.create(m.X, m.Y, m.Z, m.seed, m.params); w.load(m.mat, m.q, m.st, m.sources); w.takeDirty(); until = 0; }
    else if (m.cmd === 'open') { for (var k = 0; k < m.cells.length; k++) w.open(m.cells[k]); flush(); }
    else if (m.cmd === 'run') { until = m.until; if (!busy) loop(); }
  };
  function loop() {
    busy = true; var t0 = Date.now();
    while (w.S.tick < until && Date.now() - t0 < 8) { w.tick(); if (w.S.tick % 2 === 0) flush(); }
    flush();
    if (w.S.tick < until) setTimeout(loop, 0); else { busy = false; self.postMessage({ t: 'tick', tick: w.S.tick }); }   // 跑完一批：报告当前刻（没有变化时也报，主线程据此算流体落后多少）
  }
  function flush() { var p = packDiff(w); if (p) self.postMessage(p, [p.idx.buffer, p.mat.buffer, p.q.buffer, p.ev.buffer]); }
  function packDiff(w2) {
    var d = w2.takeDirty(), evs = w2.takeEvents();
    if (!d.length && !evs.length) return null;
    var idx = new Int32Array(d), mat = new Uint8Array(d.length), q = new Uint8Array(d.length), k;
    for (k = 0; k < d.length; k++) { mat[k] = w2.mat[d[k]]; q[k] = w2.q[d[k]]; }
    var ev = new Int32Array(evs.length * 4), T = { tp: 1, mix: 2, torch: 3, gstone: 4, wash: 5 };
    for (k = 0; k < evs.length; k++) { var x = evs[k]; ev[k * 4] = T[x.t]; ev[k * 4 + 1] = x.i; ev[k * 4 + 2] = x.j == null ? -1 : x.j; ev[k * 4 + 3] = x.n || 0; }
    return { t: 'diff', tick: w2.S.tick, idx: idx, mat: mat, q: q, ev: ev };
  }
  self.packDiff = packDiff;
}
function makeWorker() {
  try {
    var src = 'var fluidEngine=' + fluidEngine.toString() + ';var breachCore=' + breachCore.toString() + ';(' + workerMain.toString() + ')(self,fluidEngine(),breachCore);';
    var url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' })), wk = new Worker(url);
    URL.revokeObjectURL(url);
    return wk;
  } catch (e) { return null; }
}
// 模拟后端：Worker 或同步（同一份引擎、同一条打包/应用差量的路径）
function makeBackend(wk, sc, onDiff) {
  var I = sc.init, params = Object.assign({ tpEvents: true }, I.params || {});
  var msg = { cmd: 'init', X: sc.X, Y: sc.Y, Z: sc.Z, seed: I.seed, params: params, mat: I.mat, q: I.q, st: I.st, sources: I.sources };
  if (wk) {
    var sent = -1;
    wk.onmessage = function (e) { if (e.data.t === 'diff') onDiff(e.data); else if (e.data.t === 'tick') sc.tick = Math.max(sc.tick, e.data.tick); };
    wk.postMessage(msg);
    return { kind: 'worker', open: function (c) { wk.postMessage({ cmd: 'open', cells: c }); }, run: function (t) { if (t > sent) { sent = t; wk.postMessage({ cmd: 'run', until: t }); } } };
  }
  var E = fluidEngine(), w = E.create(sc.X, sc.Y, sc.Z, I.seed, params), fake = {};
  w.load(I.mat, I.q, I.st, I.sources); w.takeDirty(); workerMain(fake, E, breachCore);
  var flush = function () { var p = fake.packDiff(w); if (p) onDiff(p); };
  return { kind: 'sync', world: w, open: function (c) { for (var k = 0; k < c.length; k++) w.open(c[k]); flush(); },
    run: function (t) { var t0 = performance.now(); while (w.S.tick < t && performance.now() - t0 < 6) w.tick(); flush(); sc.tick = Math.max(sc.tick, w.S.tick); } };
}

/* ---------- 主题 ---------- */
var THEME3 = {
  light: { bg: [0.80, 0.76, 0.70], shc: [0.36, 0.32, 0.29], amb: [0.5, 0.48, 0.5], cap: [1.55, 1.45, 1.3], amb2d: 0.34, dark2d: [58, 50, 44], hud: 'rgba(255,253,248,.86)', ink: '#2a2620', veil: 'rgba(250,247,240,.62)' },
  dark: { bg: [0.035, 0.04, 0.055], shc: [0.03, 0.03, 0.045], amb: [0.1, 0.1, 0.12], cap: [0.36, 0.36, 0.4], amb2d: 0.12, dark2d: [6, 6, 10], hud: 'rgba(17,19,21,.8)', ink: '#e7e9ec', veil: 'rgba(10,11,14,.62)' }
};
// 摇杆的像素画（SVG，crispEdges）：28×28 格的环形底座 + 11×11 的拇指头（拇指头单独一组，跟着手指平移）
var JOY_SVG = (function () {
  var r = '', k = '', x, y;
  for (y = 0; y < 28; y++) for (x = 0; x < 28; x++) { var d = Math.hypot(x - 13.5, y - 13.5); if (d < 13.6 && d >= 11.6) r += '<rect x="' + x + '" y="' + y + '" width="1" height="1"/>'; else if (d < 11.6) r += '<rect x="' + x + '" y="' + y + '" width="1" height="1" opacity=".22"/>'; }
  for (y = 0; y < 11; y++) for (x = 0; x < 11; x++) { var e = Math.hypot(x - 5, y - 5); if (e <= 5.4) k += '<rect class="' + (e > 4.3 ? 'jk-o' : x + y < 8 ? 'jk-h' : 'jk-f') + '" x="' + (x + 8.5) + '" y="' + (y + 8.5) + '" width="1" height="1"/>'; }
  return '<svg viewBox="0 0 28 28" aria-hidden="true"><g class="jb" fill="currentColor">' + r + '</g><g class="jk" style="fill:var(--surface-2,#f2f0ee)">' + k + '</g>' +
    '<style>.jk-o{fill:currentColor}.jk-h{fill:#fff;opacity:.9}</style></svg>';
})();
var CSS = '.egg-breach-wrap{max-width:min(720px,max(320px,calc((100svh - 170px) * 4 / 3)));margin:0 auto}' +
  '.egg-breach-stage{position:relative;width:100%;aspect-ratio:4/3;border-radius:var(--radius,10px);overflow:hidden;border:1px solid var(--border,#e5e2de);background:#111;touch-action:none}' +
  '.egg-breach-stage canvas{position:absolute;left:0;top:0;width:100%;height:100%;display:block;image-rendering:pixelated;image-rendering:crisp-edges;outline:none}' +
  '.egg-breach-hud{pointer-events:none}' +
  '.egg-breach-stage:focus-within{outline:3px solid var(--accent,#2a7247);outline-offset:2px}' +
  '.egg-breach-bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px 16px;margin-top:12px}' +
  '.egg-breach-info{font-family:var(--mono,monospace);font-variant-numeric:tabular-nums;color:var(--muted,#5d6570);margin-right:auto}' +
  // 触屏操作区：摇杆 / 方向键 + 两个小开关（操作方式、操作区左右）。默认摇杆、在左边（data-side=right 时整体左右对调）
  '.egg-breach-pad{display:none;align-items:center;justify-content:space-between;gap:12px;margin-top:10px;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}' +
  '.egg-breach-wrap[data-side=right] .egg-breach-pad{flex-direction:row-reverse}' +
  '.egg-breach-dpad{display:grid;grid-template-columns:repeat(3,58px);grid-template-rows:repeat(2,50px);gap:6px}' +
  '.egg-breach-dpad button{font:inherit;font-size:20px;border-radius:10px;border:1px solid var(--border,#ccc);background:var(--surface-2,#f2f0ee);color:var(--text,#1f2328);touch-action:none}' +
  '.egg-breach-dpad button.on{background:var(--accent-soft,#cfe3d6)}' +
  // 摇杆（像素风圆盘，半透明）：底座固定，拇指头跟着手指，最多到底座边缘
  '.egg-breach-joy{position:relative;width:112px;height:112px;flex:none;touch-action:none;color:var(--text,#1f2328)}' +
  '.egg-breach-joy svg{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;shape-rendering:crispEdges}' +
  '.egg-breach-joy .jb{opacity:.42}.egg-breach-joy .jk{transition:none}.egg-breach-joy.on .jk-f{fill:var(--accent-soft,#cfe3d6)}' +
  '.egg-breach-pad[data-mode=joy] .egg-breach-dpad,.egg-breach-pad[data-mode=pad] .egg-breach-joy{display:none}' +
  '.egg-breach-ctls{display:flex;flex-direction:column;gap:6px}' +
  '.egg-breach-ctls button{width:34px;height:30px;padding:3px;border-radius:6px;border:1px solid var(--border,#ccc);background:var(--surface-2,#f2f0ee);color:var(--text,#1f2328);font:700 13px/1 system-ui,sans-serif;touch-action:manipulation}' +
  '.egg-breach-ctl svg{display:block;margin:auto;fill:currentColor}.egg-breach-pad[data-mode=joy] .egg-breach-ctl .i-pad,.egg-breach-pad[data-mode=pad] .egg-breach-ctl .i-joy{display:none}' +
  '@media (pointer:coarse),(max-width:760px){.egg-breach-pad{display:flex}}' +
  '.egg-breach-btn[hidden]{display:none}' +
  // 触屏动作按钮（用火把取暖 / 爬起来）：放在不管移动的那只手旁边——竖屏在操作区里与摇杆相对的一侧，横屏在画面另一侧的下角，横屏全屏在另一侧的边距里（位置由 placeAct 按实际布局算）
  '.egg-breach-wrap{position:relative}.egg-breach-act{position:absolute;z-index:3;width:68px;height:68px;padding:4px 2px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;border-radius:12px;' +
  'border:2px solid #0f0d0b;box-shadow:inset 0 0 0 2px #8a6a3a;background:rgba(36,28,20,.9);color:#ffe9b0;font:700 11px/1.15 system-ui,sans-serif;touch-action:manipulation;user-select:none;-webkit-user-select:none}' +
  '.egg-breach-act.busy{opacity:.78;box-shadow:inset 0 0 0 2px #ffb03a}.egg-breach-act svg{width:18px;height:22px;shape-rendering:crispEdges}.egg-breach-act[hidden]{display:none}.egg-breach-act:active{background:rgba(90,62,30,.95)}' +
  // 结算面板（像素风）：窄屏放在画面下方；容器 ≥ 560px 时叠在画面下部（不挡上方的城区远景）
  '.egg-breach-wrap{display:grid;grid-template-columns:minmax(0,1fr);container-type:inline-size}.egg-breach-stage{grid-area:1/1}' +
  '.egg-breach-end{grid-row:2;margin-top:10px;position:relative;padding:12px 14px 12px;font:14px/1.4 system-ui,sans-serif;color:#f2ede4;background:rgba(24,21,18,.93);' +
  'border:3px solid #0f0d0b;box-shadow:inset 0 0 0 2px #6b5f52,inset 0 0 0 4px #2e2822;image-rendering:pixelated;opacity:0;transform:translateY(10px);transition:opacity .35s,transform .35s}' +
  '.egg-breach-end[data-t=light]{color:#2a241d;background:rgba(250,246,236,.95);border-color:#3b3128;box-shadow:inset 0 0 0 2px #fffaf0,inset 0 0 0 4px #c9b89a}' +
  '.egg-breach-end.on{opacity:1;transform:none}.egg-breach-end.rm{transition:none}.egg-breach-end[hidden]{display:none}' +
  '.egg-breach-eh{display:flex;align-items:center;gap:8px;padding-bottom:6px;margin-bottom:6px;border-bottom:2px solid rgba(127,127,127,.35)}' +
  '.egg-breach-ei{width:14px;height:14px;flex:none;box-shadow:0 0 0 2px #0f0d0b}.egg-breach-et{font-weight:800;font-size:16px;letter-spacing:.04em}' +
  '.egg-breach-ec{font-size:12px;opacity:.75;margin-left:auto;text-align:right}' +
  '.egg-breach-tm{display:flex;align-items:baseline;flex-wrap:wrap;gap:4px 12px}.egg-breach-big{font:800 30px/1.1 ui-monospace,Menlo,Consolas,monospace;font-variant-numeric:tabular-nums}' +
  '.egg-breach-best{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px;opacity:.85}' +
  '.egg-breach-nr{position:relative;display:inline-block;padding:1px 6px;font-weight:800;font-size:12px;color:#2a1a00;background:#ffd34d;box-shadow:0 0 0 2px #7a5200}' +
  '.egg-breach-nr i{position:absolute;width:3px;height:3px;background:#fff6c4;animation:egg-breach-tw 1.1s steps(2) infinite}.egg-breach-end.rm .egg-breach-nr i{animation:none}' +
  '@keyframes egg-breach-tw{50%{opacity:0}}' +
  '.egg-breach-st{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:2px 14px;margin:8px 0 6px;font-size:13px}.egg-breach-st span{opacity:.72}.egg-breach-st b{font-variant-numeric:tabular-nums;float:right}' +
  '.egg-breach-ev{display:flex;flex-wrap:wrap;gap:2px 14px;align-items:baseline;font:11px ui-monospace,Menlo,Consolas,monospace}.egg-breach-ev>span:last-child{opacity:.6}' +
  // 计分明细与评级
  '.egg-breach-grade{display:inline-block;min-width:26px;text-align:center;font:900 20px/1.2 ui-monospace,Menlo,Consolas,monospace;padding:0 5px;color:#1b1406;background:#ffd34d;box-shadow:0 0 0 2px #7a5200}' +
  '.egg-breach-grade[data-g=A]{background:#9fe07a;box-shadow:0 0 0 2px #2f6b1d}.egg-breach-grade[data-g=B]{background:#8fc8f0;box-shadow:0 0 0 2px #24597e}.egg-breach-grade[data-g=C]{background:#c9c2b8;box-shadow:0 0 0 2px #5d554b}' +
  '.egg-breach-br{margin:6px 0 4px;font-size:13px}.egg-breach-bri{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:8px;align-items:baseline;padding:1px 0;transition:opacity .2s}' +
  '.egg-breach-bri span{opacity:.75;white-space:nowrap}.egg-breach-bri em{font-style:normal;font-size:12px;opacity:.6;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.egg-breach-bri b{font-family:ui-monospace,Menlo,Consolas,monospace;font-variant-numeric:tabular-nums}' +
  '.egg-breach-end .wait{opacity:0}.egg-breach-end.anim .egg-breach-stamp:not(.wait){animation:egg-breach-stamp .28s steps(4)}.egg-breach-end.done .egg-breach-grade{animation:egg-breach-pop .3s steps(3)}.egg-breach-end.rm .egg-breach-grade{animation:none}' +
  '@keyframes egg-breach-stamp{0%{transform:scale(1.6);opacity:.2}100%{transform:none;opacity:1}}@keyframes egg-breach-pop{0%{transform:scale(1.5)}100%{transform:none}}' +
  '.egg-breach-lag{font-size:12px;opacity:.85}' +
  '.egg-breach-share{flex:0 1 auto!important;min-width:72px}.egg-breach-toast{position:absolute;left:50%;bottom:calc(100% + 6px);transform:translateX(-50%);padding:4px 10px;font-size:12px;white-space:nowrap;background:#111;color:#fff;box-shadow:0 0 0 2px #6b5f52}.egg-breach-toast[hidden]{display:none}' +
  '.egg-breach-eb{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.egg-breach-eb .button{min-height:40px;flex:1 1 auto}.egg-breach-eb [hidden]{display:none}' +
  '@container (min-width:560px){.egg-breach-end{grid-area:1/1;align-self:end;justify-self:center;width:min(500px,76%);margin:0 0 14px;padding:10px 14px}.egg-breach-br{display:grid;grid-template-columns:1fr 1fr;column-gap:18px}.egg-breach-big{font-size:26px}.egg-breach-eb .button{min-height:36px}}' +
  // 触屏横屏（手机横放）：方向键放到画面右侧，画面按视口高度缩小，整块一屏可见
  '@media (pointer:coarse) and (orientation:landscape){.egg-breach-wrap{display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:14px;align-items:center;' +
  'max-width:min(900px,calc((100svh - 150px) * 4 / 3 + 200px))}.egg-breach-pad{grid-column:2;grid-row:1;margin:0;flex-direction:column!important;gap:10px}.egg-breach-ctls{flex-direction:row}.egg-breach-bar{grid-column:1}' +
  '.egg-breach-wrap[data-side=left]{grid-template-columns:auto minmax(0,1fr)}.egg-breach-wrap[data-side=left]>*{grid-column:2}.egg-breach-wrap[data-side=left]>.egg-breach-pad{grid-column:1}' +
  '.egg-breach-wrap[data-side=left] .egg-breach-end{grid-column:2}}' +
  /* 横屏全屏（宿主在游戏根元素上加 .egg-fs，root 铺满屏幕、flex 纵向、底色是站点 --bg，随主题变化）：
   * 本游戏铺满 root 的高度（容器查询单位按 root 实际可用高度算），画面 4:3 按高度缩放、居中，四周留一点边让绿色描边完整可见；
   * 底部的"用时"行隐藏（HUD 里已有），开始 / 继续按钮浮在画面下沿；操作区放在左 / 右边距里（按操作区设置）；
   * 宿主的"退出全屏"和音效按钮竖排在右上角（约 110×96 px）——画面两侧至少留 136 px，操作区在右边时贴底放，避开那块区域；
   * 背景透明（露出宿主的 --bg），摇杆 / 方向键 / 开关仍用主题色变量，深浅主题对比都够 */
  '.egg-fs .egg-breach-wrap{max-width:none;width:100%;flex:0 0 100%;height:100%;min-height:0;box-sizing:border-box;container-type:size;display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);grid-template-rows:minmax(0,1fr);' +
  'align-items:center;justify-items:center;column-gap:8px;padding:8px;background:transparent}' +
  '.egg-fs .egg-breach-stage{grid-column:2;grid-row:1;width:min(calc((100cqh - 16px) * 4 / 3),calc(100cqw - 288px));height:auto;align-self:center}' +
  '.egg-fs .egg-breach-bar{grid-column:2;grid-row:1;align-self:end;margin:0 0 18px;z-index:2;width:auto}.egg-fs .egg-breach-info{display:none}' +
  '.egg-fs .egg-breach-pad{grid-column:1;grid-row:1;margin:0;flex-direction:column!important;gap:12px}.egg-fs .egg-breach-ctls{flex-direction:row}' +
  '.egg-fs .egg-breach-wrap[data-side=right] .egg-breach-pad{grid-column:3;align-self:end;margin-bottom:10px}' +
  '.egg-fs .egg-breach-dpad{grid-template-columns:repeat(3,50px);grid-template-rows:repeat(2,46px);gap:5px}' +
  '.egg-fs .egg-breach-end{grid-column:2;grid-row:1;align-self:center;justify-self:center;width:min(500px,calc(100cqw - 288px));max-height:calc(100cqh - 8px);overflow:auto;margin:0}';

function mount(root, host) {
  var signal = host.signal, qs = location.search, TEST = /[?&]egg-test\b/.test(qs);
  var C = breachCore(fluidEngine());
  var style = document.createElement('style'); style.textContent = CSS; root.appendChild(style);
  var wrap = document.createElement('div'); wrap.className = 'egg-breach-wrap';
  wrap.innerHTML = '<div class="egg-breach-stage"><canvas class="egg-breach-main" tabindex="0" role="img"></canvas><canvas class="egg-breach-hud" width="640" height="480" aria-hidden="true"></canvas></div>' +
    '<div class="egg-breach-end" role="dialog" aria-labelledby="egg-breach-et" hidden></div>' +
    '<button type="button" class="egg-breach-act" hidden><svg viewBox="0 0 6 12" aria-hidden="true"><rect x="2" y="5" width="2" height="7" fill="#7a5230"/><rect x="1" y="2" width="4" height="3" fill="#ffb03a"/><rect x="2" y="0" width="2" height="3" fill="#fff0a6"/></svg><span></span></button>' +
    '<div class="egg-breach-bar"><span class="egg-breach-info" aria-live="polite"></span><button type="button" class="button primary egg-breach-btn"></button></div>' +
    '<div class="egg-breach-pad" data-mode="joy"><div class="egg-breach-dpad"><span></span><button type="button" data-d="u">▲</button><span></span>' +
    '<button type="button" data-d="l">◀</button><button type="button" data-d="d">▼</button><button type="button" data-d="r">▶</button></div>' +
    '<div class="egg-breach-joy" role="application">' + JOY_SVG + '</div>' +
    '<div class="egg-breach-ctls"><button type="button" class="egg-breach-ctl"><svg viewBox="0 0 12 12" width="22" height="22" shape-rendering="crispEdges" aria-hidden="true">' +
    '<g class="i-joy"><rect x="4" y="1" width="4" height="1"/><rect x="2" y="2" width="2" height="1"/><rect x="8" y="2" width="2" height="1"/><rect x="1" y="4" width="1" height="4"/><rect x="10" y="4" width="1" height="4"/><rect x="2" y="9" width="2" height="1"/><rect x="8" y="9" width="2" height="1"/><rect x="4" y="10" width="4" height="1"/><rect x="5" y="4" width="3" height="3"/></g>' +
    '<g class="i-pad"><rect x="4" y="1" width="4" height="10"/><rect x="1" y="4" width="10" height="4"/></g></svg></button>' +
    '<button type="button" class="egg-breach-side"></button></div></div>';
  root.appendChild(wrap);
  var stage = wrap.querySelector('.egg-breach-stage'), canvas = wrap.querySelector('.egg-breach-main'), hud = wrap.querySelector('.egg-breach-hud'), hg = hud.getContext('2d');
  var actBtn = wrap.querySelector('.egg-breach-act'), btn = wrap.querySelector('.egg-breach-btn'), info = wrap.querySelector('.egg-breach-info'), endEl = wrap.querySelector('.egg-breach-end');
  hg.setTransform(2, 0, 0, 2, 0, 0); hg.imageSmoothingEnabled = false;   // 初始值；resize() 按实际尺寸重设
  // 文案（tools/eggs/CONTRACT.md「文案」）：一律从 ctx.t 取（宿主加载 texts/breach.js，失败时用模块内置的同一份 TEXTS）；没有 ctx.t 时（旧调试页）用内置文案自己填占位符
  function tx(key, params) {
    if (typeof host.t === 'function') return host.t(key, params);
    var v = key.split('.').reduce(function (o, k) { return o && typeof o === 'object' ? o[k] : undefined; }, typeof TEXTS === 'object' ? TEXTS : null);
    return String(typeof v === 'string' ? v : key).replace(/\{(\w+)\}/g, function (m, k) { return params && params[k] != null ? String(params[k]) : m; });
  }
  function gameName() { var n = host.texts && typeof host.texts.name === 'string' ? host.texts.name : tx('name'); return n && n !== 'name' ? n : GAME_TITLE; }   // 游戏名：宿主给的文案优先，模块 title 只作兜底
  canvas.setAttribute('aria-label', tx('canvas_label'));
  // 触屏操作区的读屏名称与提示（文案里取，HTML 里先留空）
  [['[data-d=u]', 'pad.up'], ['[data-d=d]', 'pad.down'], ['[data-d=l]', 'pad.left'], ['[data-d=r]', 'pad.right'], ['.egg-breach-joy', 'pad.joystick'], ['.egg-breach-ctl', 'pad.mode_label'], ['.egg-breach-side', 'pad.side_label']].forEach(function (q) { wrap.querySelector(q[0]).setAttribute('aria-label', tx(q[1])); });
  var rm = !!host.reducedMotion, themeName = host.theme() === 'dark' ? 'dark' : 'light', theme = THEME3[themeName];
  var ideal = { T: 1, pits: 0 }, forceScore = false, DBG = TEST || /[?&]egg-(slow|sync)\b/.test(qs);   // 调试 / 测试局不计分（测试可用 scoring(true) 强制计分）
  var seed = host.seed >>> 0, d = typeof host.cycleMod === 'function' ? host.cycleMod(C.P_D) : C.diffOf(host.cycle), neg = !!host.negative, PC = C.pacing(d, neg);
  var TT = C.tier(d), TENV = C.thermoEnv(d, neg), TH = C.TH, thermoOn = true;   // 体温（设计 §32）：档位参数、环境；thermoOn 只给测试关掉
  var bestKey = 'best:' + seed + ':' + host.cycle; var scoreKey = 'score:' + seed + ':' + host.cycle;
  // 渲染器：WebGL2 体素为主；不支持（或 ?egg-2d）时用 2D 兜底
  var R = /[?&]egg-2d\b/.test(qs) ? null : make3D(canvas, signal);
  if (!R) { canvas.width = VW; canvas.height = VH; R = make2D(canvas); }
  var is3D = R.kind === '3d';
  var M = C.genMaze(seed, d, neg), sc = null, lv = null, be = null, wk = /[?&]egg-sync\b/.test(qs) ? null : makeWorker();
  var state = 'prep', gameTime = 0, acc = 0, raf = 0, lastTs = 0, frameLog = null, autopilot = null;
  var joy = { on: false, x: 0, z: 0 }, lastIn = [0, 0, 0, 0];   // lastIn：本步实际用到的方向（测试用）
  var P = null, keys = { u: 0, d: 0, l: 0, r: 0 }, cam = { x: 0, y: 0, z: 0 }, fade = { a: 0, to: 0, then: null }, fieldT = 0, prep = null;
  var STEP = 1 / 120, MAXP = 360, pp = new Float32Array(MAXP * 8), ps = new Float32Array(MAXP * 8), np = 0, nps = 0, prng = fluidEngine().mulberry(seed ^ 0x51ed);
  var beatT = 0, warn = [], god = false, SND = makeAudio(host.audio || null), snd = { mode: 'ready', lava: !neg, time: 0, near: 99, nearPan: 0, flow: 0, flowPan: 0, wind: 0, windPan: 0, warn: 0, warnPan: 0, under: false, shaft: 99, buff: 0, torch: 9 }, sndT = 0, lastStep = 0, lastRung = 0, lastHp = 20, lastAir = 10, hurtT = 0, surgeT = 0;

  /* ---------- 开局预跑（Worker 中；没有 Worker 时同步） ---------- */
  function prerun() {
    var t0 = performance.now();
    var done = function (k, regen, ticks, rT, risky) {
      if (regen !== M.regen) M = C.genMaze(seed, d, neg, regen);   // 原图所有破口都不公平时预跑换了图（尺寸只由难度决定，不变）
      C.selectBreach(M, k); M.rT = rT || 1; M.risky = !!risky;   // 险图（不显示）：计分的理想时间放宽倍数
      prep = { k: k, regen: regen, ticks: ticks, rT: M.rT, ms: Math.round(performance.now() - t0), via: wk ? 'worker' : 'sync' };
      newGame(); state = 'ready'; ui(); draw(0);
    };
    if (wk) { wk.onmessage = function (e) { if (e.data.t === 'prerun') done(e.data.k, e.data.regen, e.data.ticks, e.data.rT, e.data.risky); }; wk.postMessage({ cmd: 'prerun', seed: seed, d: d, neg: neg, slow: +((/[?&]egg-slow=(\d+)/.exec(qs) || [])[1] || 0) }); }
    else setTimeout(function () { var r = C.chooseMap(seed, d, neg, PC); done(r.k, r.regen, r.ticks, r.rT, r.risky); }, 0);
  }
  function newGame() {
    sc = new Scene(C, M, { headAbove: PC.headAbove, lakeW: PC.lakeW, params: PC.params });
    lv = M.levels[0]; sc.level = 0; ideal = C.idealStats(M); ideal.T *= M.rT || 1;   // 险图：计分用放宽后的理想时间 T_eff（显示与计分一致，不另外标出）
    be = makeBackend(wk, sc, function (p) { sc.apply(p.idx, p.mat, p.q, p.ev, p.tick); });
    var s = lv.start, b = C.levelBase(0);
    P = { x: s % M.W + 0.5, z: ((s / M.W) | 0) + 0.5, y: b + 1, vx: 0, vz: 0, hp: 20, air: 10, pit: -1, hold: 0, lad: 0, climb: 0, rot: 0, buff: 0, anim: null, walk: 0, won: false, ph: 0, sw: 0, reach: 0, occ: 0, grip: -1, gripMax: 0, drops: 0, buffMax: 6, aura: false, minHp: 20, pits: 0, view: is3D ? '3D' : '2D', lagMax: 0, dbg: false, stones: 0, minedM: {}, mineT: 0, mineAt: -1, mineH: 0, pick: 0, swing: 0, hyaw: 0, hpitch: 0, pops: [], drown: -1, drownHp: 0, qte: -1, qteMax: 1, seen: {}, wetT: 0, near: 99, nearT: 0, cause: '', newRec: false,
      th: C.thermoNew(), dT: 0, trend: 0, stage: 0, torch: true, use: null, relight: null, relit: 0, down: null, die: null, slide: false, warm: 0, rad: 0, radT: 0, headWas: false, stuck: false, depth: 0 };
    var bx = M.lake.bx; P.rot = Math.atan2(4 - P.z, bx + 0.5 - P.x);   // 面朝破口
    cam.x = P.x; cam.y = P.y + 1; cam.z = P.z; gameTime = 0; acc = 0; fieldT = 0; np = 0; sc.field = null; fade.a = 0; fade.to = 0; fade.then = null;
    if (R.reset) R.reset();
    filt = ''; canvas.style.filter = '';
  }
  function startPlay() {
    if (state === 'prep' || state === 'run' || state === 'climb') return;
    if (state === 'pause') { state = P.climb > 0 && P.mode === 'climb' ? 'climb' : 'run'; }
    else { if (state === 'over') newGame(); be.open(sc.init.breach); state = 'run'; P.mode = 'top'; }
    ui(); startLoop();
    try { canvas.focus({ preventScroll: true }); } catch (e) { canvas.focus(); }
  }
  /* ---------- 玩家 ---------- */
  var W = M.W;
  function hasWeirdNow() { return M.levels.some(function (l) { return l.weirdList && l.weirdList.length; }); }
  function base() { return C.levelBase(sc.level); }
  function solidTile(tx, tz) {
    if (tx < 0 || tz < 0 || tx >= W || tz >= M.H) return true;
    var t = lv.t[tz * W + tx]; if ((t === 0 && !(lv.weird && lv.weird[tz * W + tx] === 3 && minedBits(tz * W + tx) === 3)) || lv.chest[tz * W + tx]) return true;   // 岩石（挖穿的薄墙除外）、箱子
    var b = base(); return isSolidM(sc.mat[sc.idx(tx, b + 1, tz)]) || isSolidM(sc.mat[sc.idx(tx, b + 2, tz)]);
  }
  var skipT = -1;   // 允许“走出”的那一格（脚下刚变成石头时）
  function st2(tx, tz) { return tz * W + tx !== skipT && solidTile(tx, tz); }
  function blockedAt(x, z) { var r = 0.3; return st2(Math.floor(x - r), Math.floor(z - r)) || st2(Math.floor(x + r), Math.floor(z - r)) || st2(Math.floor(x - r), Math.floor(z + r)) || st2(Math.floor(x + r), Math.floor(z + r)); }
  function body(x, z, y) {   // 身体两格（脚、头）里的本场景流体层数；以及是否踩在积水里
    var a = sc.idx(x, Math.floor(y + 0.01), z), h = a + sc.XZ, f = sc.fluid;
    return { lo: sc.mat[a] === f ? sc.q[a] : 0, hi: sc.mat[h] === f ? sc.q[h] : 0, puddle: !neg && sc.mat[sc.idx(x, base() + 1, z)] === M_WATER };
  }
  function dmgRate(D, hi) { if (D <= 0) return 0; if (hi >= 3) return 20; if (D <= 2) return 1; if (D <= 4) return 2; if (D <= 8) return 4; return 8; }
  function animTo(x, y, z, dur, then) { P.anim = { x0: P.x, y0: P.y, z0: P.z, x1: x, y1: y, z1: z, t: 0, d: dur, then: then }; P.vx = P.vz = 0; }
  function gripTime() { var need = M.D.climb * 2; return need + 1.4 - 0.8 * Math.min(1, d / (C.P_D - 1)); }
  // 掉进深坑：先是极短的快速反应（QTE）——桌面按空格、触屏点一下画面，成功才扒住坑沿进入抓握阶段；超时直接掉到下一层
  function enterPit(i) { P.pits++;
   if (lv.pit[i] === 2) { if (P.grip < 0 && P.qte < 0) { P.qte = P.qteMax = M.D.qte; SND.qte(); } } else { P.grip = -1; P.qte = -1; } }
  function qteHit() { if (state !== 'run' || !(P.qte > 0) || P.drown >= 0) return false; P.qte = -1; P.grip = P.gripMax = gripTime(); SND.grab(); return true; }
  // 深坑抓握条用完：短暂下坠，淡出淡入换到下一层同一格（下层世界一直在模拟），落地少量伤害（不致死）
  function dropDown() {
    var tx = Math.floor(P.x), tz = Math.floor(P.z), b0 = base(); P.grip = -1; P.hold = 0; SND.drop();
    animTo(tx + 0.5, b0 - 1.6, tz + 0.5, 0.28, function () {
      beginFade(function () {
        sc.level--; lv = M.levels[sc.level]; var b1 = base();
        P.x = tx + 0.5; P.z = tz + 0.5; P.y = b1 + 1; P.vx = P.vz = 0; P.pit = -1; P.anim = null; P.mode = 'top'; P.drops++;
        P.hp = Math.max(Math.min(P.hp, 1), P.hp - 3); hurtT = 0;
        var fl = sc.mat[sc.idx(tx, b1 + 1, tz)]; SND.land(fl === M_LAVA ? 'lava' : fl === M_WATER ? 'water' : '');
        cam.x = P.x; cam.y = P.y + 1; cam.z = P.z; sc.field = null; np = 0; nps = 0; ui();
      });
    });
  }
  /* ---------- 体温（设计 §32）：两室模型在 core（breachCore）里，这里接游戏状态 ----------
   * 阶段 P.stage：0 正常；−1/−2/−3 轻度 / 中度 / 重度失温；1/2/3 轻度 / 中度过热 / 中暑。中度：走路 × slow2、爬坑长按 × climb2（封顶多 1 s）。
   * 手里火把：中度失温时 Shift / 按钮取暖，引导 2.5 s，按脚下格的水层数：≤ 3 升温、4–5 只止住降温、> 5 被浇灭；
   * 不论哪种结果火都灭了，手里留着没点着的木棍（没有随身的光），在墙上点着的火把旁可以重新点着（relightStep，次数不限）；碰到深水也会灭（douse）。重度：倒下（跪下 → 顺着巷道侧倒），能爬一会儿；急救见 downUpdate。 */
  var TREND_ON = 0.02, TREND_OFF = 0.008;   // ℃/s：超过 0.02 显示箭头，降到 0.008 以下才收起
  var USE_T = 2.5, KNEEL_T = 0.45, FALL_T = 0.55, STAND_T = 0.7, DIE_T = 3.5, LIE_L = 1.75, CRAWL_V = 4.3 * 0.3;
  function slowK() { return Math.abs(P.stage) === 2 ? TT.slow2 : 1; }
  function climbK(need) { return Math.abs(P.stage) === 2 ? Math.min(TT.climb2, 1 + 1 / Math.max(0.01, need)) : 1; }
  function matAt(x, y, z) { return x < 0 || z < 0 || x >= W || z >= M.H || y < 0 || y >= sc.Y ? M_STONE : sc.mat[sc.idx(x, y, z)]; }
  function watQ(x, y, z) { var c = x < 0 || z < 0 || x >= W || z >= M.H ? -1 : sc.idx(x, y, z); return c >= 0 && sc.mat[c] === M_WATER ? sc.q[c] : 0; }
  function lavaGet(x, y, z) { var c = x < 0 || z < 0 || x >= W || z >= M.H ? -1 : sc.idx(x, y, z); return c >= 0 && sc.mat[c] === M_LAVA ? sc.q[c] : 0; }
  function lying() { return !!(P.down && P.down.ph !== 'kneel' && P.down.ph !== 'stand'); }
  // 身体各部位所在的格：躺着时脚在 P、头在 P + 1.6·朝向（都在脚这一层的高度）；蜷在坑底 / 靠墙坐着时都在本格（靠墙坐时头在上一格）
  function bodyCell() {
    var y0 = Math.floor(P.y + 0.01), x = Math.floor(P.x), z = Math.floor(P.z), D = P.down;
    if (lying() && D.kind === 'lie') { var a = D.ang; return { x: Math.floor(P.x + Math.cos(a) * 0.9), z: Math.floor(P.z + Math.sin(a) * 0.9), y: y0, fx: x, fz: z, hx: Math.floor(P.x + Math.cos(a) * 1.55), hz: Math.floor(P.z + Math.sin(a) * 1.55), hy: y0, prone: true }; }
    if (lying()) return { x: x, z: z, y: y0, fx: x, fz: z, hx: x, hz: z, hy: D.kind === 'slump' ? y0 + 1 : y0, prone: D.kind === 'curl' };
    return { x: x, z: z, y: y0, fx: x, fz: z, hx: x, hz: z, hy: y0 + 1, prone: false };
  }
  function bodyWater(bc) { return Math.max(watQ(bc.x, bc.y, bc.z), watQ(bc.fx, bc.y, bc.fz), watQ(bc.hx, bc.y, bc.hz)); }
  // 躺着时口鼻贴近地面：头所在格水深 ≥ 3 层就憋气；站着照旧（头格 ≥ 5 层）
  function lyingAir() { var bc = bodyCell(), f = sc.fluid; if (P.mode === 'climb') { var fd = body(Math.floor(P.x), Math.floor(P.z), P.y); return fd.hi >= 5; }
    var c = sc.idx(bc.hx, bc.hy, bc.hz); return lying() ? sc.mat[c] === f && sc.q[c] >= 3 : sc.mat[c] === f && sc.q[c] >= 5; }
  // 墙上的火把（水图、岩浆图相同）：身边 3×3 格内、同一层、不隔着岩石 → 慢慢加热（越接近 / 高于正常越慢，冷时快得多，见 core 的 thermoStep）；水位规则同手里火把
  function wallTorch(bc) {
    var b = base();
    for (var dz = -1; dz <= 1; dz++) for (var dx = -1; dx <= 1; dx++) { var x = bc.x + dx, z = bc.z + dz;
      if (matAt(x, b + 1, z) !== M_TORCH) continue;
      if (dx && dz && lv.t[bc.z * W + x] === 0 && lv.t[z * W + bc.x] === 0) continue;   // 斜对角：两条边都是岩石 = 隔着墙
      return true; }
    return false;
  }
  function thermoUpdate(dt) {
    if (!thermoOn) return;
    var bc = bodyCell(), b = base(), wl, wh, climbV = P.mode === 'climb';
    if (climbV) { var yy = Math.floor(P.y + 0.01); wl = watQ(lv.ladder.x, yy, lv.ladder.z); wh = watQ(lv.ladder.x, yy + 1, lv.ladder.z); }
    else if (bc.prone) { wl = bodyWater(bc); wh = 0; }
    else { wl = watQ(bc.x, bc.y, bc.z); wh = watQ(bc.x, bc.y + 1, bc.z); }
    P.depth = bc.prone ? wl / 8 * 0.3 : wl / 8 + (wl >= 8 ? wh / 8 : 0);
    var e = { f: C.immersionOf(wl, wh, bc.prone), prone: bc.prone, contact: !!P.inLava, rad: 0, torch: 0 };
    if (!neg) { P.radT -= dt; if (P.radT <= 0) { P.radT = 0.1; P.rad = climbV ? 0 : C.radiant(lavaGet, P.x, P.z, b, TENV.heatR); } e.rad = P.rad; }
    P.warm = 0;
    // 手里点着的火把碰到水就灭（与取暖的水位规则一致）：站着 / 走 / 爬梯 / 扒坑沿时脚格 > 5 层或头格有水；躺着时身上任何水。灭了冒一小股蒸汽
    if (P.torch && !P.use && (bc.prone || (P.down && P.down.kind === 'lie' && P.down.ph !== 'kneel') ? wl > 0 : wl > 5 || wh > 0)) douse(bc, climbV);
    if (P.use) {   // 手里火把：急救时（躺着）身上碰到任何水都会被浇灭；站着按脚下格的层数
      if (P.use.rescue ? wl > 0 : wl > 5) { torchEnd('out'); }
      else { e.torch = !P.use.rescue && wl >= 4 ? 2 : 1; P.use.mode = e.torch; P.warm = e.torch === 1 ? 2 : 0; }
    } else if (!climbV && wl <= 5 && wallTorch(bc)) {   // 墙上的火把：两种地图都加热（≤ 3 层水）；4–5 层只止住降温；> 5 层没用
      if (wl >= 4) e.torch = 2; else { e.wall = 1; P.warm = 1; }
    }
    var T0 = P.th.Tc, st = C.thermoStep(P.th, e, dt, TENV); P.stage = st;
    // 体温变化趋势（HUD 的 ↑ / ↓）：dTc/dt 平滑（τ ≈ 1 s），带死区与回差，不闪
    var rate = (P.th.Tc - T0) / dt; P.dT += (rate - P.dT) * (1 - Math.exp(-dt / 1));
    if (P.trend === 0) { if (P.dT > TREND_ON) P.trend = 1; else if (P.dT < -TREND_ON) P.trend = -1; }
    else if (P.trend * P.dT < TREND_OFF) P.trend = 0;
    if (P.use) { P.use.t += dt; if (P.use.rescue ? P.th.Tc >= TH.WARM_TO || P.use.t > 8 : P.use.t >= USE_T) torchEnd('done'); }
    if (Math.abs(st) >= 3 && !P.down && !P.die && P.drown < 0 && P.hp > 0) tryCollapse();
  }
  // 头所在的那一格因为流体凝固（岩浆 + 水 → 圆石 / 黑曜石 / 石头）变成实心：立即窒息；只有身体那格变实心（趴着）= 卡住爬不动
  function fluidStone(m) { return m === M_GSTONE || m === M_COBBLE || m === M_OBSID; }
  function headCheck() {
    if (P.mode === 'climb') { P.headWas = false; P.stuck = false; return; }
    var bc = bodyCell(), now = fluidStone(matAt(bc.hx, bc.hy, bc.hz));
    if (now && !P.headWas && !P.die && P.hp > 0) startDie('suff');
    P.headWas = now;
    P.stuck = lying() && P.down.kind === 'lie' && (fluidStone(matAt(bc.x, bc.y, bc.z)) || fluidStone(matAt(bc.fx, bc.y, bc.fz)));
  }
  function startDie(kind) {
    if (P.die) return; P.die = { kind: kind, t: 0, hp0: Math.max(P.hp, 0.5) };
    if (P.use) torchEnd('out'); P.vx = P.vz = 0; P.hold = 0; beatT = 0;
    if (kind === 'suff') SND.drown(); else SND.faint(kind === 'heat');
  }
  /* ---------- 手里火把 ---------- */
  function canTorch() {
    if (!P || !P.torch || P.use || state !== 'run' || P.die || P.drown >= 0 || P.anim || fade.then || P.qte > 0 || P.grip >= 0 || P.mode !== 'top') return false;
    if (P.down) return P.down.ph === 'lie' && !P.down.ready && P.stage <= -3 && bodyWater(bodyCell()) === 0;   // 急救：躺着、身上没有一点水
    return P.stage === -2;
  }
  function canStand() { return !!(P && P.down && P.down.ph === 'lie' && P.down.ready && state === 'run' && !P.die && P.drown < 0 && !P.use); }
  function actNow() { return canStand() ? 'stand' : canTorch() ? 'torch' : ''; }
  function actPress() {
    var a = actNow(); if (!a) return false;
    if (a === 'stand') { P.down.ph = 'stand'; P.down.t = 0; SND.climbOut(); }
    else { P.use = { t: 0, rescue: !!P.down, mode: 1 }; P.vx = P.vz = 0; SND.torchOn(); }
    return true;
  }
  // 火把烧完 / 被浇灭 / 中断：火灭了，手里留着一根没点着的木棍（没有随身的光、不能取暖），可以在墙上点着的火把上重新点着（relightStep）
  function torchEnd(why) {
    if (!P.use) return; P.use = null; P.torch = false;
    if (why === 'out') SND.poof(0, 0.9); else SND.poof(0, 0.45);
  }
  function douse(bc, climbV) {
    P.torch = false; P.relight = null; SND.poof(0, 0.9);
    var hx = climbV ? lv.ladder.x : bc.x, hz = climbV ? lv.ladder.z : bc.z, hy = Math.min(sc.Y - 1, Math.floor(P.y + 0.01) + 1);
    if (sc.mix.length < 32) sc.mix.push({ i: sc.idx(hx, hy, hz), t: 0 });
  }
  /* 重新点火（服主）：与挖奇怪的矿石同样的操作——面朝一支点着的墙上火把、按住朝它的方向键（触屏：摇杆 / 方向键），够得着（约半格内）、不隔岩石，
   * 约 1.5 s 点着，人物脚下出现进度条。松开 / 走开 / 转向 → 进度清零；那支墙上火把在这期间被水浇灭、或自己脚下这格水 > 5 层 → 点不着。
   * 取火不消耗墙上的火把，次数不限。 */
  var RELIGHT_T = 1.5;
  function wallTorchPos(x, z) { return [x + 0.5 + (((x + z) & 1) ? 0.22 : -0.22), z + 0.5]; }   // 与 3D 渲染器里墙上火把的位置一致
  function relightStep(dt, sx, sz, tx, tz, b) {
    var R0 = P.relight, ok = !P.torch && ((sx && !sz) || (sz && !sx)) && P.drown < 0 && !P.die && !P.down && !P.use, tgt = -1, tp = null;
    if (ok) for (var k = 0; k < 2 && tgt < 0; k++) { var cx = tx + (k ? sx : 0), cz = tz + (k ? sz : 0);
      if (cx < 0 || cz < 0 || cx >= W || cz >= M.H || lv.t[cz * W + cx] === 0 || sc.mat[sc.idx(cx, b + 1, cz)] !== M_TORCH) continue;
      var p0 = wallTorchPos(cx, cz), vx = p0[0] - P.x, vz = p0[1] - P.z, dd = Math.hypot(vx, vz);
      if (dd > 0.62) continue; if (dd > 0.2 && (vx * sx + vz * sz) / dd < 0.55) continue;   // 够得着，且大致朝着它
      tgt = cz * W + cx; tp = p0; }
    if (tgt >= 0 && watQ(tx, b + 1, tz) > 5) tgt = -1;   // 自己泡在深水里：点不着
    if (tgt < 0) { P.relight = null; return; }
    if (!R0 || R0.i !== tgt) R0 = P.relight = { i: tgt, t: 0 };
    P.rot = Math.atan2(tp[1] - P.z, tp[0] - P.x); P.vx = P.vz = 0;
    R0.t += dt;
    if (R0.t >= RELIGHT_T) { P.relight = null; P.torch = true; P.relit++; SND.torchOn(); }
  }
  /* ---------- 重度：倒下 → 爬 → 急救 / 结束 ---------- */
  function tryCollapse() {
    if (state === 'climb') { P.slide = true; if (P.use) torchEnd('out'); return; }   // 先滑到梯子底
    if (fade.then || P.anim || state !== 'run') return;
    if (P.qte > 0 || P.grip >= 0) { P.qte = -1; dropDown(); return; }   // 扒着深坑沿：手一松掉下去，落地后再倒下
    if (P.use) torchEnd('out');
    startDown();
  }
  function leaveLadder() {   // 在梯子上倒下：滑到底后回到本层梯子格，再倒下
    var L = lv.ladder; state = 'run'; P.mode = 'top'; P.slide = false; P.climb = 0; P.x = L.x + 0.5; P.z = L.z + 0.5; P.y = base() + 1; P.vx = P.vz = 0;
    cam.x = P.x; cam.y = P.y + 1; cam.z = P.z; sc.field = null; np = 0; ui();
    if (Math.abs(P.stage) >= 3) startDown();
  }
  // 躺得下：身体经过的格都要是能走的平地（不是岩石 / 箱子 / 实心方块 / 矿坑 / 梯子 / 竖井口）
  function lieOk(tx, tz) { if (tx < 0 || tz < 0 || tx >= W || tz >= M.H) return false; var i = tz * W + tx, t = lv.t[i]; return !solidTile(tx, tz) && !lv.pit[i] && t !== 3 && t !== 4; }
  function lieFits(fx, fz, a) {
    var cx = Math.cos(a), cz = Math.sin(a);
    for (var s2 = -0.12; s2 <= LIE_L + 0.12; s2 += 0.12) for (var l = -0.24; l <= 0.24; l += 0.24) if (!lieOk(Math.floor(fx + cx * s2 - cz * l), Math.floor(fz + cz * s2 + cx * l))) return false;
    return true;
  }
  function startDown() {
    var tx = Math.floor(P.x), tz = Math.floor(P.z), D = { ph: 'kneel', t: 0, kind: 'lie', ang: P.rot, x0: P.x, z0: P.z, x1: P.x, z1: P.z, win: TT.crawl, winMax: TT.crawl, ready: false, pr: 0, rot0: P.rot };
    if (P.pit >= 0) { D.kind = 'curl'; D.x1 = tx + 0.5; D.z1 = tz + 0.5; }
    else {
      var best = null;
      for (var k = 0; k < 4; k++) { var a = k * Math.PI / 2, ux = Math.round(Math.cos(a)), uz = Math.round(Math.sin(a));
        for (var si = 0; si < 6; si++) { var s2 = [0, -0.25, -0.5, -0.75, -1, -1.25][si], fx = tx + 0.5 + ux * s2, fz = tz + 0.5 + uz * s2;
          if (!lieFits(fx, fz, a)) continue;
          var score = Math.cos(a - P.rot) - si * 0.3; if (!best || score > best.s) best = { s: score, a: a, x: fx, z: fz }; break; } }
      if (best) { D.ang = best.a; D.x1 = best.x; D.z1 = best.z; }
      else {   // 哪个方向都躺不下：背靠墙坐倒（面朝开阔的一侧）
        D.kind = 'slump'; var wx = 0, wz = 0;
        for (k = 0; k < 4; k++) { var ax = [1, -1, 0, 0][k], az = [0, 0, 1, -1][k]; if (solidTile(tx + ax, tz + az)) { wx += ax; wz += az; } }
        if (!wx && !wz) wx = -Math.cos(P.rot);
        D.ang = Math.atan2(-wz, -wx); D.x1 = tx + 0.5 + Math.sign(wx) * 0.12; D.z1 = tz + 0.5 + Math.sign(wz) * 0.12;
      }
    }
    P.down = D; P.vx = P.vz = 0; P.hold = 0; P.mineT = 0; P.mineAt = -1; SND.kneel();
  }
  function downUpdate(dt, dx, dz) {
    var D = P.down; D.t += dt;
    if (D.ph === 'kneel') { var u0 = Math.min(1, D.t / KNEEL_T); P.x = D.x0 + (D.x1 - D.x0) * u0 * (D.kind === 'lie' ? 0 : 1); P.z = D.z0 + (D.z1 - D.z0) * u0 * (D.kind === 'lie' ? 0 : 1);
      if (D.t >= KNEEL_T) { D.ph = D.kind === 'lie' ? 'fall' : 'lie'; D.t = 0; if (D.kind !== 'lie') SND.thud(); } return; }
    if (D.ph === 'fall') { var u = Math.min(1, D.t / FALL_T), e = u * u * (3 - 2 * u); P.x = D.x0 + (D.x1 - D.x0) * e; P.z = D.z0 + (D.z1 - D.z0) * e; if (u >= 1) { D.ph = 'lie'; D.t = 0; SND.thud(); } return; }
    if (D.ph === 'stand') { if (D.t >= STAND_T) { P.down = null; P.rot = D.kind === 'lie' ? D.ang : D.kind === 'slump' ? D.ang : P.rot; } return; }
    // 躺着：回到轻度（或更好）就能爬起来；还在重度时爬的时间窗倒计时——正在急救（手里火把 / 墙上火把 / 岩浆图躺在水里降温）时暂停
    var sev = Math.abs(P.stage) >= 3;
    if (!D.ready && Math.abs(P.stage) <= 1) { D.ready = true; SND.ready(); }
    if (D.ready && sev) D.ready = false;
    var rescuing = !!P.use || (P.warm > 0 && P.stage < 0) || (!neg && P.stage > 0 && bodyWater(bodyCell()) > 0);
    D.rescue = rescuing;
    if (sev && !rescuing) { D.win -= dt; if (D.win <= 0) { D.win = 0; startDie(P.stage < 0 ? 'cold' : 'heat'); return; } }
    if ((dx || dz) && D.kind !== 'curl' && !P.use && !P.stuck) {   // 爬：约走路的 30%，不能进矿坑 / 上梯子
      var m = Math.hypot(dx, dz), a = Math.atan2(dz, dx), sp = CRAWL_V * Math.min(1, m);
      if (D.kind === 'slump') { if (!lieFits(P.x, P.z, a)) return; D.kind = 'lie'; D.ang = a; }
      var da = Math.atan2(Math.sin(a - D.ang), Math.cos(a - D.ang));
      if (Math.abs(da) > 0.05) { var na = D.ang + Math.max(-dt * 7, Math.min(dt * 7, da)); if (lieFits(P.x, P.z, na)) D.ang = na; else if (Math.abs(da) > 1.2) return; }
      var nx = P.x + Math.cos(a) * sp * dt, nz = P.z + Math.sin(a) * sp * dt;
      if (lieFits(nx, nz, D.ang)) { P.x = nx; P.z = nz; } else if (lieFits(nx, P.z, D.ang)) P.x = nx; else if (lieFits(P.x, nz, D.ang)) P.z = nz;
      D.pr = Math.min(1, D.pr + dt / 0.25); P.walk += sp * dt; D.crawl = (D.crawl || 0) + dt;
    }
  }
  /* ---------- 奇怪的矿石：挖矿 ---------- */
  // 已挖掉的高度（按位：1 = 脚、2 = 头），按"层:格"记在本局里（再来一次时清空）
  function minedBits(i) { return P ? P.minedM[sc.level + ':' + i] || 0 : 0; }
  function oreLeft(i) { return lv.weird ? lv.weird[i] & ~minedBits(i) : 0; }
  var MINE_T = 0.8;
  // 面朝 奇怪的矿石 并一直按住朝它的方向键（触屏：方向按钮）就挖：先挖头部高度。松开 / 转向就重来；身上碰到岩浆不能挖；
  // 地下水淹过上半身后越淹越慢，完全淹没（气泡在掉）时不能挖
  function mineStep(dt, sx, sz, tx, tz, b) {
    var ok = (sx && !sz) || (sz && !sx), fi = ok ? (tz + sz) * W + tx + sx : -1, left = ok ? oreLeft(fi) : 0;
    var near = ok && (sx > 0 ? P.x - tx > 0.62 : sx < 0 ? P.x - tx < 0.38 : sz > 0 ? P.z - tz > 0.62 : P.z - tz < 0.38);
    var fd = body(tx, tz, P.y), lava = !neg && fd.lo + fd.hi > 0, rate = neg ? (fd.hi >= 5 ? 0 : 1 - fd.hi / 5) : 1;
    if (!left || !near || lava || rate <= 0 || P.drown >= 0) { P.mineT = 0; P.mineAt = -1; return; }
    var h = left & 2 ? 2 : 1;
    if (P.mineAt !== fi || P.mineH !== h) { P.mineAt = fi; P.mineH = h; P.mineT = 0; }
    P.rot = Math.atan2(sz, sx); P.vx = P.vz = 0;
    var before = P.mineT; P.mineT += dt * rate; P.swing += dt * rate * 11;
    if (Math.floor(before / 0.27) !== Math.floor(P.mineT / 0.27)) SND.pick();
    if (P.mineT >= MINE_T) mineCell(fi, h, b);
  }
  function mineCell(i, h, b) {
    var x = i % W, z = (i / W) | 0, ci = sc.idx(x, b + h, z);
    P.minedM[sc.level + ':' + i] = minedBits(i) | h; P.stones++;
    sc.mat[ci] = M_AIR; sc.dm[ci] = M_AIR; sc.q[ci] = 0; sc.solidVer++;   // 主线程副本立即变空气（碰撞 / 渲染）
    be.open([ci]);                                                       // 模拟世界（Worker / 同步）同样挖开，流体下一刻起就能流进来
    P.pops.push({ x: x + 0.5, z: z + 0.5, t: 0 }); SND.stone();
    P.mineT = 0; P.mineAt = -1;
  }
  function mineView() {   // 给渲染器：正在挖的那一面与裂纹阶段
    if (!P || P.mineAt < 0) return null;
    var x = P.mineAt % W, z = (P.mineAt / W) | 0, fx = Math.floor(P.x) - x, fz = Math.floor(P.z) - z;
    return { x: x, z: z, y: base() + P.mineH, fx: fx, fz: fz, stage: Math.min(4, 1 + Math.floor(P.mineT / MINE_T * 4)) };
  }
  // 转头看向附近（5 格内、视线不被岩石挡住）最近的未挖 奇怪的矿石；身体照常朝移动方向，头与身体的夹角最多 ±90°，再大就转回正前方
  function trackHead(dt) {
    var ty = 0, tp = 0;
    if (P.mode === 'top' && lv.weird && P.drown < 0 && !P.down && !P.die) {
      var px = Math.floor(P.x), pz = Math.floor(P.z), best = 1e9, bi = -1;
      for (var k = 0; k < lv.weirdList.length; k++) { var o = lv.weirdList[k]; if (!oreLeft(o.i)) continue;
        var fx = o.from % W + 0.5, fz = ((o.from / W) | 0) + 0.5, d = Math.hypot(fx - P.x, fz - P.z); if (d > 5.5 || d >= best) continue;
        if (!seeOre(o, P.x, P.z)) continue; best = d; bi = k; }
      if (bi >= 0) { var ob = lv.weirdList[bi], ox = ob.i % W + 0.5, oz = ((ob.i / W) | 0) + 0.5, want = Math.atan2(oz - P.z, ox - P.x), off = Math.atan2(Math.sin(want - P.rot), Math.cos(want - P.rot));
        if (Math.abs(off) <= Math.PI / 2) { ty = off; tp = (oreLeft(ob.i) & 2 ? -0.05 : 0.32) * Math.min(1, 2.5 / Math.max(0.8, best)); } }
      P.headOre = bi >= 0 ? lv.weirdList[bi].i : -1;
    } else P.headOre = -1;
    var mx = dt * 10, dy = ty - P.hyaw, dp = tp - P.hpitch;
    P.hyaw += Math.max(-mx, Math.min(mx, dy)); P.hpitch += Math.max(-mx * 0.5, Math.min(mx * 0.5, dp));
    P.headT = ty;
  }
  // 视线：从人物到矿石所在墙面前那一格，途经的格都要可走（不能隔着岩石）
  function seeOre(o, x0, z0) {
    var fx = o.from % W + 0.5, fz = ((o.from / W) | 0) + 0.5, n = Math.ceil(Math.hypot(fx - x0, fz - z0) * 4) + 1;
    for (var k = 1; k <= n; k++) { var x = x0 + (fx - x0) * k / n, z = z0 + (fz - z0) * k / n, i = Math.floor(z) * W + Math.floor(x); if (lv.t[i] === 0 || lv.chest[i]) return false; }
    return true;
  }
  function canPit(tx, tz) { var i = tz * W + tx; return lv.pit[i] && !isSolidM(sc.mat[sc.idx(tx, base(), tz)]); }
  // 浅坑坑底的碰撞：碰撞盒四角都要落在可下去的坑格里（坑外的地面、岩石对坑底的人来说都是墙）
  function pitBlocked(x, z) { var r = 0.3; return !pitOk(Math.floor(x - r), Math.floor(z - r)) || !pitOk(Math.floor(x + r), Math.floor(z - r)) || !pitOk(Math.floor(x - r), Math.floor(z + r)) || !pitOk(Math.floor(x + r), Math.floor(z + r)); }
  function pitOk(tx, tz) { return tx >= 0 && tz >= 0 && tx < W && tz < M.H && lv.pit[tz * W + tx] === 1 && canPit(tx, tz); }
  /* 走路 / 爬梯姿态（模拟时间驱动，暂停即冻结）：ph 摆动相位，sw 摆幅 0..1（停下时约 0.15 s 平滑回到站立），
   * reach 双臂上举（爬出矿坑）。爬梯时手脚交替。reducedMotion 时摆幅减小（仍保留作为操作反馈）。 */
  function pose(dt, moving) {
    var tgt = 0, rate = 0, spd = Math.sqrt(P.vx * P.vx + P.vz * P.vz);
    if (P.drown >= 0) { tgt = rm ? 0 : 0.75; rate = rm ? 0 : 9 - 6 * Math.min(1, P.drown / DROWN_T); }   // 溺水：手脚慢慢乱扑腾（减少动态时不动）
    else if (P.die || P.use) { tgt = 0; rate = 0; }
    else if (P.down) { tgt = moving && P.down.ph === 'lie' ? 1 : 0; rate = moving && P.down.ph === 'lie' ? 5 : 0; }   // 爬：手脚交替往前够
    else if (P.mode === 'climb') { tgt = moving ? 1 : 0.35; rate = moving ? 6.5 : 0; }
    else if (P.anim) { tgt = 0; rate = 0; }
    else if (P.pit < 0 || lv.pit[P.pit] !== 2) { tgt = Math.min(1.15, spd / 4.3); rate = spd * 2.3; }   // 平地与浅坑坑底都按走路摆臂
    P.ph += rate * dt * (Math.abs(P.stage) === 2 ? 0.75 : 1);   // 中度阶段：动作变迟缓
    var k = 1 - Math.exp(-dt / 0.06); P.sw += (tgt * (rm ? 0.45 : 1) - P.sw) * k;
    var rt = P.anim && P.anim.y1 > P.anim.y0 ? 1 : P.qte > 0 ? 1 : P.grip >= 0 ? 0.9 : P.pit >= 0 && P.hold > 0 ? 0.6 : 0; P.reach += (rt - P.reach) * k;
    // 撑出坑沿：往上爬出（上升动画）或在浅坑里长按准备爬出时，双手按在坑沿上往下撑；扒深坑沿 / 接 QTE 时仍是向上抓
    var pt = (P.anim && P.anim.y1 > P.anim.y0) || (P.pit >= 0 && P.hold > 0 && P.grip < 0 && !(P.qte > 0)) ? 1 : 0; P.press = (P.press || 0) + (pt - (P.press || 0)) * k;
  }
  /* 整个人的姿态（给渲染器）：tl = [侧翻, 俯仰, 上下]，arms / legs 覆盖四肢角度，rot 覆盖朝向。
   * 侧倒：身体轴线 = 头的方向 ang，人物朝向与它垂直（rot = atan2(−cos ang, sin ang)），侧翻 90°；爬：趴着（俯仰 −90°），朝向 = ang */
  function bodyPose() {
    var D = P.down, o = { tl: null, arms: null, legs: null, rot: P.rot };
    if (P.use && !D) { o.arms = [-1.25, -0.95]; return o; }   // 用火把取暖：双手把火把凑到胸前
    if (!D) return o;
    var sideRot = Math.atan2(-Math.cos(D.ang), Math.sin(D.ang)), sw = Math.sin(P.ph) * P.sw;
    var poseOf = function (ph, u) {
      if (D.kind === 'curl') return { r: 0, p: -0.75 * u, y: -0.38 * u, l: 1.15 * u, a: -0.9 * u, rot: D.rot0 };
      if (D.kind === 'slump') return { r: 0, p: 0.28 * u, y: -0.6 * u, l: -1.45 * u, a: 0.25 * u, rot: aLerp(D.rot0, D.ang, u) };
      if (ph === 'kneel') return { r: 0, p: -0.15 * u, y: -0.32 * u, l: 1.1 * u, a: 0.2 * u, rot: aLerp(D.rot0, sideRot, u) };
      if (ph === 'fall') { var e = u * u * (3 - 2 * u); return { r: e * Math.PI / 2, p: -0.15 * (1 - e), y: -0.32 + 0.72 * e, l: 1.1 - 0.8 * e, a: 0.2 - 0.9 * e, rot: sideRot }; }
      var pr = D.pr || 0;   // 躺着：侧躺（pr = 0）↔ 趴着爬（pr = 1）
      return { r: (1 - pr) * Math.PI / 2, p: -pr * Math.PI / 2, y: 0.4 * (1 - pr) + 0.16 * pr, l: 0.3 * (1 - pr), a: -0.7 * (1 - pr) - 2.6 * pr, rot: aLerp(sideRot, D.ang, pr), crawl: pr };
    };
    var q;
    if (D.ph === 'stand') { var f = D.from || (D.from = poseOf('lie', 1)), u2 = Math.min(1, D.t / STAND_T), e2 = u2 * u2 * (3 - 2 * u2);
      q = { r: f.r * (1 - e2), p: f.p * (1 - e2), y: f.y * (1 - e2), l: f.l * (1 - e2), a: f.a * (1 - e2), rot: aLerp(f.rot, D.kind === 'curl' ? f.rot : D.ang, e2) }; }
    else q = poseOf(D.ph, D.ph === 'kneel' ? Math.min(1, D.t / KNEEL_T) : D.ph === 'fall' ? Math.min(1, D.t / FALL_T) : 1);
    o.tl = [q.r, q.p, q.y]; o.rot = q.rot;
    var cw = q.crawl ? sw * 0.6 * q.crawl : 0;
    o.arms = [q.a + cw, q.a - cw]; o.legs = [q.l - cw * 0.5, q.l + cw * 0.5];
    if (P.use) o.arms[0] = -1.6;   // 躺着急救：火把凑在脸前
    return o;
  }
  function aLerp(a, b, u) { return a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * u; }
  function update(dt) {
    gameTime += dt;
    var dx = (keys.r ? 1 : 0) - (keys.l ? 1 : 0), dz = (keys.d ? 1 : 0) - (keys.u ? 1 : 0), analog = false;
    // 摇杆：模拟量方向（与方向键同样按屏幕方向：往上推 = ArrowUp）。死区 15%，15%–45% 速度线性增大，再往外全速
    if (!dx && !dz && joy.on) { var jm = Math.hypot(joy.x, joy.z), jf = jm < 0.15 ? 0 : jm < 0.45 ? (jm - 0.15) / 0.3 : 1; if (jf > 0) { dx = joy.x / jm * jf; dz = joy.z / jm * jf; analog = true; } }
    if (autopilot) { var ap = autopilot(); dx = ap[0]; dz = ap[1]; analog = false; }
    if (P.drown >= 0 || P.die) { dx = dz = 0; }   // 溺水 / 失温 / 中暑 / 窒息的结束过程：失去控制
    if (P.use && (dx || dz) && !P.down) torchEnd('cancel');   // 用火把取暖时一动就中断（火把照样用掉）
    if (P.use) { dx = dz = 0; }
    // 需要"一个格子方向"的地方（爬出矿坑、深坑里换格、挖矿）：摇杆取主轴方向（与该方向夹角 ±45° 以内都算朝它按）
    var kx = dx, kz = dz; if (analog) { if (Math.abs(dx) >= Math.abs(dz)) { kx = Math.sign(dx); kz = 0; } else { kx = 0; kz = Math.sign(dz); } }
    lastIn[0] = dx; lastIn[1] = dz; lastIn[2] = kx; lastIn[3] = kz;
    if (is3D && R.failed) P.view = '2D';   // 中途 WebGL 失效、没能恢复（之后只能看 2D 兜底 / 黑屏）：本局记为 2D   // 地下水里气泡用完：失去控制，任何输入都不再生效
    if (fade.then) return;
    var b = base(), tx = Math.floor(P.x), tz = Math.floor(P.z);
    if (state === 'climb') {
      var top = sc.level + 1 < M.levels.length ? C.levelBase(sc.level + 1) + 1 : b + 7;
      if (P.slide) { P.climb = Math.max(0, P.climb - dt / 0.7); if (P.climb <= 0 && !fade.then) beginFade(leaveLadder); }   // 在梯子上倒下：先滑到梯子底
      else if (dx || dz) P.climb = Math.min(1, P.climb + dt / C.climbTime(top - b - 1));
      P.y = b + 1 + P.climb * (top - b - 1);
      if (P.climb >= 1 && !P.slide) { if (sc.level + 1 < M.levels.length) beginFade(finishClimb); else finishClimb(); }   // 出地面不再黑屏转场：直接接草原，镜头从井口拉远
    } else if (P.down) {
      downUpdate(dt, dx, dz);
    } else if (P.anim) {
      var a = P.anim; a.t += dt; var u = Math.min(1, a.t / a.d), e = u * u * (3 - 2 * u);
      P.x = a.x0 + (a.x1 - a.x0) * e; P.z = a.z0 + (a.z1 - a.z0) * e; P.y = a.y0 + (a.y1 - a.y0) * e + (a.y1 > a.y0 ? Math.sin(u * Math.PI) * 0.25 : 0);
      if (u >= 1) { P.anim = null; if (a.then) a.then(); }
    } else if (P.pit >= 0 && lv.pit[P.pit] !== 2) {   // 浅坑（相邻的浅坑在坑底连成一片）：坑底照常走路；朝坑外能走的格长按才能爬出
      var sx = kx, sz = kz;
      if (dx && dz && !analog) { dx *= 0.7071; dz *= 0.7071; }
      var fp = body(tx, tz, P.y), spp = 4.3 * (P.buff > 0 ? 1.3 : 1) * slowK() * Math.max(0.35, 1 - 0.05 * (fp.lo + fp.hi)), kp = 1 - Math.exp(-dt * ((dx || dz) ? 14 : 18));
      P.vx += (dx * spp - P.vx) * kp; P.vz += (dz * spp - P.vz) * kp;
      var px2 = P.x + P.vx * dt; if (!pitBlocked(px2, P.z)) P.x = px2; else P.vx = 0;
      var pz2 = P.z + P.vz * dt; if (!pitBlocked(P.x, pz2)) P.z = pz2; else P.vz = 0;
      var spdp = Math.sqrt(P.vx * P.vx + P.vz * P.vz);
      if (spdp > 0.4) { var trp = Math.atan2(P.vz, P.vx), drp = Math.atan2(Math.sin(trp - P.rot), Math.cos(trp - P.rot)); P.rot += drp * Math.min(1, dt * 14); P.walk += spdp * dt; }
      tx = Math.floor(P.x); tz = Math.floor(P.z); if (lv.pit[tz * W + tx]) P.pit = tz * W + tx;
      var ox = tx + sx, oz = tz + (sx ? 0 : sz), oi = oz * W + ox;
      if ((sx || sz) && !solidTile(ox, oz) && !canPit(ox, oz)) {
        P.rot = Math.atan2(oz - tz, ox - tx);   // 爬的时候面朝要爬上去的坑沿
        P.hold += dt; if (P.hold >= M.D.climb * climbK(M.D.climb)) { P.hold = 0; SND.climbOut(); animTo(ox + 0.5, b + 1, oz + 0.5, 0.3, function () { P.pit = -1; }); }
      } else P.hold = Math.max(0, P.hold - dt * 2);
    } else if (P.pit >= 0 && P.qte > 0) {   // 深坑 QTE 进行中：不能动，倒计时到了就掉下去
      P.qte -= dt; if (P.qte <= 0) { P.qte = -1; dropDown(); }
    } else if (P.pit >= 0) {           // 深坑：朝能走的方向长按才能爬出（抓握条用完就掉到下一层）
      var nx = tx + kx, nz = tz + (kx ? 0 : kz), need = M.D.climb * (lv.pit[P.pit] === 2 ? 2 : 1), ni = nz * W + nx; need *= climbK(need);
      if (dx || dz) P.rot = Math.atan2(nz - tz, nx - tx);
      if ((dx || dz) && !solidTile(nx, nz) && canPit(nx, nz)) { P.hold = 0; animTo(nx + 0.5, b, nz + 0.5, 0.32, function () { P.pit = ni; enterPit(ni); }); }
      else if ((dx || dz) && !solidTile(nx, nz) && !lv.pit[ni]) { P.hold += dt; if (P.hold >= need) { P.hold = 0; P.grip = -1; SND.climbOut(); animTo(nx + 0.5, b + 1, nz + 0.5, 0.3, function () { P.pit = -1; }); } }
      else P.hold = Math.max(0, P.hold - dt * 2);
      if (P.grip >= 0 && !P.anim) { P.grip -= dt; if (P.grip <= 0) dropDown(); }
    } else {
      var rdx = kx, rdz = kz;
      if (P.relight) { dx = dz = 0; }   // 正在点火：站住（方向键只用来判断是否还朝着墙上的火把）
      if (dx && dz && !analog) { dx *= 0.7071; dz *= 0.7071; }
      var f0 = body(tx, tz, P.y);
      var sp = 4.3 * (P.buff > 0 ? 1.3 : 1) * slowK() * (f0.puddle ? 0.55 : 1) * Math.max(0.35, 1 - 0.05 * (f0.lo + f0.hi));
      var k = 1 - Math.exp(-dt * ((dx || dz) ? 14 : 18));
      P.vx += (dx * sp - P.vx) * k; P.vz += (dz * sp - P.vz) * k;
      var stuck = blockedAt(P.x, P.z);   // 脚下刚变成石头：只忽略这一格，允许走出来，其他实心格照常阻挡
      if (stuck) skipT = Math.floor(P.z) * W + Math.floor(P.x);
      var nx2 = P.x + P.vx * dt; if (!blockedAt(nx2, P.z)) P.x = nx2; else P.vx = 0;
      var nz2 = P.z + P.vz * dt; if (!blockedAt(P.x, nz2)) P.z = nz2; else P.vz = 0;
      skipT = -1;
      if (!stuck && blockedAt(P.x, P.z)) P.viol = (P.viol || 0) + 1;   // 碰撞一致性自检：从空处走进实心格 = 穿模
      var spd = Math.sqrt(P.vx * P.vx + P.vz * P.vz);
      if (spd > 0.4) { var tr = Math.atan2(P.vz, P.vx), dr = Math.atan2(Math.sin(tr - P.rot), Math.cos(tr - P.rot)); P.rot += dr * Math.min(1, dt * 14); P.walk += spd * dt; }
      tx = Math.floor(P.x); tz = Math.floor(P.z);
      var ti = tz * W + tx;
      if (canPit(tx, tz) && Math.abs(P.x - tx - 0.5) < 0.3 && Math.abs(P.z - tz - 0.5) < 0.3) { P.hold = 0; SND.fall(); animTo(tx + 0.5, b, tz + 0.5, 0.18, null); P.pit = ti; enterPit(ti); }
      if (lv.t[ti] === 3 && (dx || dz)) { P.lad += dt; if (P.lad > C.LAD_HOLD) { P.lad = 0; beginFade(startClimb); } } else P.lad = 0;
      mineStep(dt, rdx, rdz, tx, tz, b);
      relightStep(dt, rdx, rdz, tx, tz, b);
    }
    if (P.pit >= 0 || P.anim || P.mode !== 'top' || P.down || P.use) { P.mineT = 0; P.mineAt = -1; P.relight = null; }
    P.pick = Math.max(0, P.pick - dt * 3); if (P.mineAt >= 0) P.pick = 1;
    pose(dt, dx || dz);
    trackHead(dt);
    for (var pk3 = P.pops.length - 1; pk3 >= 0; pk3--) { P.pops[pk3].t += dt; if (P.pops[pk3].t > 1.2) P.pops.splice(pk3, 1); }
    // 碰撞一致性自检：玩家碰撞盒“走进”实心格（不含世界在玩家脚下变成石头的情况）就计数
    // 伤害 / 气泡（按身体所在两格的层数）
    var fd = body(Math.floor(P.x), Math.floor(P.z), P.y);
    P.inLava = !neg && fd.lo + fd.hi > 0;
    if (!neg) P.hp -= dmgRate(fd.lo + fd.hi, fd.hi) * dt;
    else if (P.drown < 0) { if (lyingAir()) P.air -= dt / 1.5; else P.air = Math.min(10, P.air + dt * 5); if (P.air <= 0) { P.air = 0; P.drown = 0; P.drownHp = P.hp; P.vx = P.vz = 0; P.hold = 0; SND.drown(); } }
    else {   // 溺水：不论还剩多少生命，约 DROWN_T 秒内加速扣完（矿难的绝望感；画面四周暗下来，见 HUD）
      P.drown += dt; var du = Math.min(1, P.drown / DROWN_T); P.hp = du >= 1 ? 0 : P.drownHp * (1 - du * du);
    }
    if (state === 'run' || state === 'climb') { thermoUpdate(dt); headCheck(); }
    if (P.die) { P.die.t += dt; var dv2 = Math.min(1, P.die.t / DIE_T); P.hp = Math.min(P.hp, dv2 >= 1 ? 0 : P.die.hp0 * (1 - dv2 * dv2)); }   // 失温 / 中暑 / 窒息：与溺水一样约 3.5 s 内扣完
    // 信标光环：在信标厅内（以信标为中心、切比雪夫距离 ≤ r）时效果持续刷新；离开后按该信标的时长倒计时（5×5 为 6 s、7×7 为 12 s）
    var inA = null;
    if (state === 'run' && P.mode === 'top') for (var bk = 0; bk < lv.beacons.length; bk++) { var bc = lv.beacons[bk]; if (Math.max(Math.abs(P.x - bc.x - 0.5), Math.abs(P.z - bc.z - 0.5)) <= bc.r) { inA = bc; break; } }
    if (inA) { P.seen[sc.level + ':' + inA.i] = 1; if (!P.aura) SND.beacon(); P.buffMax = P.buff = inA.dur; P.aura = true; }
    else { P.aura = false; if (P.buff > 0) P.buff = Math.max(0, P.buff - dt); }
    if (P.buff > 0 && P.drown < 0 && !P.die) P.hp = Math.min(20, P.hp + dt);
    if (god) { P.hp = Math.max(P.hp, god === 2 ? 6 : 20); P.air = Math.max(P.air, 1); }
    // 统计（结算面板用）：最低生命、浸在流体里的秒数、流体离人物最近的距离（每 0.25 s 扫一次身边）
    if (state === 'run' || state === 'climb') {
      if (fd.lo + fd.hi > 0) P.wetT += dt;
      P.nearT -= dt; if (P.nearT <= 0) { P.nearT = 0.25; var px3 = Math.floor(P.x), pz3 = Math.floor(P.z), b3 = base();
        for (var z3 = Math.max(0, pz3 - 6); z3 <= Math.min(M.H - 1, pz3 + 6); z3++) for (var x3 = Math.max(0, px3 - 6); x3 <= Math.min(W - 1, px3 + 6); x3++) {
          if (!lv.t[z3 * W + x3]) continue; var c3 = sc.idx(x3, b3 + 1, z3);
          if (sc.mat[c3] === sc.fluid || sc.mat[c3 - sc.XZ] === sc.fluid) { var d3 = Math.max(0, Math.hypot(x3 + 0.5 - P.x, z3 + 0.5 - P.z) - 0.5); if (d3 < P.near) P.near = d3; } } }
    }
    P.minHp = Math.min(P.minHp, Math.max(0, P.hp));
    if (P.hp <= 0) { P.hp = 0; P.minHp = 0; state = 'over'; latchKeys(); P.won = false; P.cause = P.die && P.die.kind === 'suff' ? 'suffocate' : P.drown >= 0 ? 'drown' : P.die ? P.die.kind : neg ? (P.air <= 0 ? 'drown' : 'water') : 'lava';
      P.layer = P.cause === 'drown' && (P.stage <= -3 || (P.die && P.die.kind === 'cold')) ? 'cold' : '';   // 趴着溺水又失温：两种结束效果叠加
      if (P.use) { P.use = null; } SND.die(); ui(); }
  }
  var DROWN_T = 3.5;
  function beginFade(then) { fade.to = 1; fade.then = then; }
  function startClimb() { state = 'climb'; P.mode = 'climb'; P.climb = 0; var L = lv.ladder; P.x = L.x + 0.5; P.z = L.z + 0.5; P.rot = lv.t[L.i + 1] === 0 ? 0 : Math.PI; P.anim = null; np = 0; ui(); }
  function finishClimb() {
    if (sc.level + 1 < M.levels.length) {
      sc.level++; lv = M.levels[sc.level];
      var e = lv.entrance; P.x = e % W + 0.5; P.z = ((e / W) | 0) + 0.5; P.y = base() + 1; P.vx = P.vz = 0; P.climb = 0; P.pit = -1; P.mode = 'top';
      cam.x = P.x; cam.y = P.y + 1; cam.z = P.z; sc.field = null; np = 0; state = 'run';
    } else {
      state = 'over'; latchKeys(); P.won = true; P.mode = 'end'; fade.a = 0; fade.to = 0; endT = 0; SND.win();
      var best = host.storage.get(bestKey);
      P.newRec = best == null || gameTime < best; P.prevBest = best;
      if (P.newRec) host.storage.set(bestKey, Math.round(gameTime * 10) / 10);
      P.score = null; P.scoreNew = false;
      if (forceScore || !(DBG || P.dbg || autopilot)) {   // 计分（调试 / 自动驾驶 / 测试局不计分不保存）；最佳分另存在 score: 键下，与最佳用时分开
        P.score = C.scoreOf({ d: d, t: gameTime, T: ideal.T, minHp: P.minHp, pits: P.pits, idealPits: ideal.pits, drops: P.drops, stones: P.stones });
        var rec = { s: P.score.S, t: Math.round(gameTime * 10) / 10, hp: Math.round(P.minHp * 10) / 10, stones: P.stones, lag: Math.round(Math.max(0, P.lagMax) * 1000) / 1000, view: P.view }, prev = host.storage.get(scoreKey);
        P.prevScore = prev; if (C.betterScore(rec, prev)) { host.storage.set(scoreKey, rec); P.scoreNew = true; }
      }
    }
    ui();
  }
  /* ---------- 粒子：气流（岩浆：火星/灰烬；水：水汽）、滴水、混合蒸汽 ---------- */
  function updateField(dt) { fieldT -= dt; if (fieldT > 0) return; fieldT = 0.25; sc.field = airField(sc, lv, sc.field, 0.25); }
  // 口鼻的位置与朝向（白气从这里出来）：站着在头前；躺着在头那一端
  function headPos() {
    var D = P.down, a = D && D.kind === 'lie' && D.ph !== 'kneel' ? D.ang : P.rot;
    if (D && D.kind === 'lie' && (D.ph === 'lie' || D.ph === 'fall')) return [P.x + Math.cos(a) * 1.75, P.y + 0.3, P.z + Math.sin(a) * 1.75, Math.cos(a), Math.sin(a)];
    return [P.x + Math.cos(a) * 0.2, P.y + (D ? 1.0 : 1.5), P.z + Math.sin(a) * 0.2, Math.cos(a), Math.sin(a)];
  }
  // 身体信号（不看 HUD 也读得出体温）：冷 → 呼出白气（越冷越频繁、越大）；湿 → 身上滴水（随湿度）；热 → 出汗
  function bodySig(k) {
    if (!P || P.mode === 'climb' || state !== 'run' || !thermoOn) return false;
    if (k === 'breath') return P.th.Tc < 36.6 && !(P.die && P.die.t > 2);
    if (k === 'drip') return P.th.wet > 0.05 && P.depth < 0.3;
    return P.stage >= 1 || (P.die && P.die.kind === 'heat');
  }
  var breathT = 0;
  function bodyParticles(dt) {
    var hd = headPos(), o;
    if (bodySig('breath')) { breathT -= dt; var cold = Math.min(1, (36.6 - P.th.Tc) / 8);
      if (breathT <= 0) { breathT = 2.2 - 1.3 * cold; for (var k = 0; k < 3 + Math.round(cold * 4) && nps < MAXP - 2; k++) { o = nps * 8; ps[o] = hd[0] + hd[3] * 0.15; ps[o + 1] = hd[1] + (prng() - 0.5) * 0.06; ps[o + 2] = hd[2] + hd[4] * 0.15; ps[o + 3] = 0.8 + cold * 0.7 + prng() * 0.3; ps[o + 4] = 3; ps[o + 5] = 0;
        var sp = 0.35 + prng() * 0.3; ps[o + 6] = hd[3] * sp + (prng() - 0.5) * 0.2; ps[o + 7] = hd[4] * sp + (prng() - 0.5) * 0.2; nps++; } } }
    if (bodySig('drip') && nps < MAXP - 2 && prng() < dt * 9 * P.th.wet) { var a = prng() * Math.PI * 2; o = nps * 8; ps[o] = P.x + Math.cos(a) * 0.28; ps[o + 1] = P.y + 0.3 + prng() * (lying() ? 0.2 : 1.1); ps[o + 2] = P.z + Math.sin(a) * 0.28; ps[o + 3] = 1.2; ps[o + 4] = 4; ps[o + 5] = 0; nps++; }
    if (bodySig('sweat') && nps < MAXP - 2 && prng() < dt * 3 * Math.max(1, P.stage)) { o = nps * 8; ps[o] = hd[0] + (prng() - 0.5) * 0.3; ps[o + 1] = hd[1] + 0.2; ps[o + 2] = hd[2] + (prng() - 0.5) * 0.3; ps[o + 3] = 1; ps[o + 4] = 5; ps[o + 5] = -0.5; nps++; }
  }
  function particles(dt) {
    var F = sc.field, b = base(), lava = sc.fluid === M_LAVA, k, o, n = 0;
    if (rm) {   // reducedMotion：静态箭头（每两格一个 “>”，指向出口）
      if (F && F.max > 0) for (var z = Math.max(0, Math.floor(cam.z) - 9); z < Math.min(M.H, Math.floor(cam.z) + 10); z++) for (var x = Math.max(0, Math.floor(cam.x) - 12); x < Math.min(W, Math.floor(cam.x) + 13); x++) {
        var i = z * W + x, dd = F.dir[i]; if (dd < 0 || Math.sqrt(F.wind[i] / F.max) < 0.3 || (x + z) % 4 || n > MAXP - 6) continue;
        var ux = dd === 0 ? 1 : dd === 1 ? -1 : 0, uz = dd === 2 ? 1 : dd === 3 ? -1 : 0;
        for (var s = -2; s <= 2; s++) { o = n * 8; pp[o] = x + 0.5 + ux * (0.1 - Math.abs(s) * 0.08) - uz * s * 0.08; pp[o + 1] = b + 2.92; pp[o + 2] = z + 0.5 + uz * (0.1 - Math.abs(s) * 0.08) + ux * s * 0.08;
          pp[o + 3] = 1.2; pp[o + 4] = lava ? 0.9 : 0.8; pp[o + 5] = lava ? 0.78 : 0.88; pp[o + 6] = lava ? 0.6 : 0.95; pp[o + 7] = 0.4; n++; }
      }
      // 身体信号的静态版本：口前一团静止的白气（冷）、身上一滴水（湿）、额头一滴汗（热）
      var hd = headPos();
      if (bodySig('breath') && n < MAXP - 3) for (var bq = 0; bq < 3; bq++) { o = n * 8; pp[o] = hd[0] + hd[3] * (0.25 + bq * 0.12); pp[o + 1] = hd[1] + bq * 0.05; pp[o + 2] = hd[2] + hd[4] * (0.25 + bq * 0.12); pp[o + 3] = 2.4; pp[o + 4] = pp[o + 5] = 0.92; pp[o + 6] = 0.97; pp[o + 7] = 0.5; n++; }
      if (bodySig('drip') && n < MAXP - 1) { o = n * 8; pp[o] = P.x + 0.25; pp[o + 1] = P.y + 0.6; pp[o + 2] = P.z; pp[o + 3] = 1.6; pp[o + 4] = 0.6; pp[o + 5] = 0.8; pp[o + 6] = 1; pp[o + 7] = 0.9; n++; }
      if (bodySig('sweat') && n < MAXP - 1) { o = n * 8; pp[o] = hd[0]; pp[o + 1] = hd[1] + 0.15; pp[o + 2] = hd[2]; pp[o + 3] = 1.6; pp[o + 4] = 0.85; pp[o + 5] = 0.95; pp[o + 6] = 1; pp[o + 7] = 0.95; n++; }
      np = n; return;
    }
    // 推进现有粒子：ps = [x,y,z,life,type,vy,_,_]
    for (k = 0; k < nps; k++) {
      o = k * 8; ps[o + 3] -= dt;
      var ty = ps[o + 4];
      if (ty === 0 && F) {
        var ti = Math.floor(ps[o + 2]) * W + Math.floor(ps[o]), d0 = F.dir[ti];
        if (d0 < 0) ps[o + 3] = 0;
        else {
          var tgx = Math.floor(ps[o]) + 0.5 + (d0 === 0 ? 1 : d0 === 1 ? -1 : 0), tgz = Math.floor(ps[o + 2]) + 0.5 + (d0 === 2 ? 1 : d0 === 3 ? -1 : 0);
          var sp = 0.8 + 3 * Math.sqrt(F.wind[ti] / F.max), ddx = tgx - ps[o], ddz = tgz - ps[o + 2], L = Math.sqrt(ddx * ddx + ddz * ddz) || 1;
          ps[o] += ddx / L * sp * dt; ps[o + 2] += ddz / L * sp * dt; ps[o + 1] += (lava ? 0.25 : 0.05) * dt * Math.sin(gameTime * 3 + k);
        }
      } else if (ty === 3) { ps[o] += ps[o + 6] * dt; ps[o + 2] += ps[o + 7] * dt; ps[o + 1] += 0.25 * dt; }   // 呼出的白气：顺着口鼻方向飘出、慢慢上升散开
      else { ps[o + 5] += (ty === 1 || ty === 4 ? -9 : ty === 5 ? -4 : 0.5) * dt; ps[o + 1] += ps[o + 5] * dt; if ((ty === 1 || ty === 4 || ty === 5) && ps[o + 1] < (ty === 1 ? b + 1 : Math.floor(P.y + 0.01))) ps[o + 3] = 0; }   // 滴水 / 身上的水滴 / 汗：落到地面消失
      if (ps[o + 3] <= 0) { nps--; if (k !== nps) ps.copyWithin(o, nps * 8, nps * 8 + 8); k--; }
    }
    // 生成
    var tries = 4, nAir = 0;
    for (k = 0; k < nps; k++) if (ps[k * 8 + 4] === 0) nAir++;
    while (F && F.max > 0 && nps < MAXP - 40 && nAir < 60 && tries--) {
      var x2 = Math.floor(cam.x) - 11 + Math.floor(prng() * 23), z2 = Math.floor(cam.z) - 8 + Math.floor(prng() * 17), j = z2 * W + x2;
      if (x2 < 0 || z2 < 0 || x2 >= W || z2 >= M.H || F.dir[j] < 0) continue; var wj = Math.sqrt(F.wind[j] / F.max); if (wj < 0.22 || prng() > wj * wj) continue;
      o = nps * 8; ps[o] = x2 + prng(); ps[o + 1] = b + 1.1 + prng() * 1.6; ps[o + 2] = z2 + prng(); ps[o + 3] = 0.8 + prng() * 1.4; ps[o + 4] = 0; ps[o + 5] = 0; ps[o + 6] = prng(); nps++; nAir++;
    }
    if (!lava && nps < MAXP - 4 && prng() < dt * 3) {   // 滴水
      var x3 = Math.floor(cam.x) - 8 + Math.floor(prng() * 17), z3 = Math.floor(cam.z) - 6 + Math.floor(prng() * 13);
      if (x3 > 0 && z3 > 0 && x3 < W && z3 < M.H && lv.t[z3 * W + x3]) { o = nps * 8; ps[o] = x3 + 0.2 + prng() * 0.6; ps[o + 1] = b + 2.95; ps[o + 2] = z3 + 0.2 + prng() * 0.6; ps[o + 3] = 1.5; ps[o + 4] = 1; ps[o + 5] = 0; nps++; }
    }
    bodyParticles(dt);
    for (k = 0; k < sc.mix.length; k++) if (sc.mix[k].t < 0.02 && nps < MAXP - 6) for (var q2 = 0; q2 < 5; q2++) {
      var mi = sc.mix[k].i; o = nps * 8; ps[o] = mi % sc.X + prng(); ps[o + 1] = Math.floor(mi / sc.XZ) + 0.8; ps[o + 2] = ((mi / sc.X) | 0) % sc.Z + prng(); ps[o + 3] = 0.9; ps[o + 4] = 2; ps[o + 5] = 0.6 + prng(); nps++;
    }
    for (k = 0; k < nps; k++) {   // 输出 [x,y,z,size,r,g,b,a]
      o = k * 8; var t2 = ps[o + 4], lf = Math.min(1, ps[o + 3] * 2);
      pp[o] = ps[o]; pp[o + 1] = ps[o + 1]; pp[o + 2] = ps[o + 2];
      if (t2 === 0 && lava) { var em = ps[o + 6] > 0.75; pp[o + 3] = em ? 1.4 : 1.2; pp[o + 4] = em ? 0.95 : 0.66; pp[o + 5] = em ? 0.72 + ps[o + 6] * 0.15 : 0.62; pp[o + 6] = em ? 0.45 : 0.58; pp[o + 7] = lf * (em ? 0.5 : 0.28); }
      else if (t2 === 0) { pp[o + 3] = 1.3; pp[o + 4] = 0.84; pp[o + 5] = 0.89; pp[o + 6] = 0.95; pp[o + 7] = lf * 0.26; }
      else if (t2 === 1) { pp[o + 3] = 1.5; pp[o + 4] = 0.6; pp[o + 5] = 0.8; pp[o + 6] = 1; pp[o + 7] = 0.85; }
      else if (t2 === 3) { pp[o + 3] = 2.2 + 1.6 * (1 - Math.min(1, ps[o + 3])); pp[o + 4] = 0.93; pp[o + 5] = 0.95; pp[o + 6] = 0.98; pp[o + 7] = 0.55 * Math.min(1, ps[o + 3] * 1.5); }
      else if (t2 === 4) { pp[o + 3] = 1.4; pp[o + 4] = 0.55; pp[o + 5] = 0.78; pp[o + 6] = 1; pp[o + 7] = 0.85; }
      else if (t2 === 5) { pp[o + 3] = 1.4; pp[o + 4] = 0.88; pp[o + 5] = 0.96; pp[o + 6] = 1; pp[o + 7] = 0.9; }
      else { pp[o + 3] = 3; pp[o + 4] = pp[o + 5] = pp[o + 6] = 0.92; pp[o + 7] = lf * 0.6; }
    }
    np = nps;
  }
  // 深坑 / 竖井口的预警：下方流体上涨程度
  function warnings() {
    warn.length = 0; var b = base(), G = C.LEVEL_G, x0 = Math.floor(cam.x) - 14, x1 = Math.floor(cam.x) + 14, z0 = Math.floor(cam.z) - 11, z1 = Math.floor(cam.z) + 11;
    for (var z = Math.max(0, z0); z <= Math.min(M.H - 1, z1); z++) for (var x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) {
      var i = z * W + x, kind = lv.pit[i] === 2 ? 2 : lv.t[i] === 4 ? 3 : 0; if (!kind) continue;
      var c = kind === 2 ? sc.column(x, z, b - G + 2, b - 1) : sc.column(x, z, Math.max(1, b - G + 1), b);
      if (c.p > 0) warn.push({ x: x, z: z, p: c.p, f: c.f });
    }
  }
  /* ---------- 绘制 ---------- */
  var st3 = { sc: null, lv: null, P: null, cam: cam, time: 0, rm: rm, theme: theme, mode: 'top', beacon: null, parts: pp, np: 0, warn: warn, cutY: 0, heat: false };
  var plView = { x: 0, z: 0, r: 3.6 }, lights2 = [], lastCp = [0, 0]; var deepWin = { x: 0, z: 0, on: 0 }; var qPos = [160, 120];
  function draw(dt) {
    if (!sc) { drawPrep(); return; }
    if (state === 'over' && P.won && fade.a <= 0.01 && P.mode === 'end') { drawEnding(dt); return; }
    var climb = P.mode === 'climb', b = base();
    var kc = dt ? 1 - Math.exp(-dt * 7) : 1;
    if (climb) { cam.x = lv.ladder.x + 0.5; cam.z = lv.ladder.z + 0.5; cam.y += (P.y + 1 - cam.y) * (dt ? 1 - Math.exp(-dt * 10) : 1); }
    else { cam.x += (P.x - cam.x) * kc; cam.z += (P.z - cam.z) * kc; cam.y = b + 2; }
    if (climb) sc.ease(lv.ladder.x - 1, lv.ladder.x + 1, Math.floor(P.y) - 8, Math.floor(P.y) + 8, lv.ladder.z - 6, lv.ladder.z + 6, dt || 1);
    else sc.ease(Math.floor(cam.x) - 14, Math.floor(cam.x) + 14, b - 4, b + 2, Math.floor(cam.z) - 11, Math.floor(cam.z) + 11, dt || 1);
    if (state === 'run' && !climb) { updateField(dt || 0); particles(dt || 0); } else if (climb) np = 0;
    warnings();
    var bob = !rm && !P.anim && P.pit < 0 && !climb ? Math.abs(Math.sin(P.walk * 4)) * 0.05 : 0;
    if (dt) { var oc = climb ? 0 : occluded(b); P.occ += (oc - P.occ) * (1 - Math.exp(-dt / 0.06)); }
    if (is3D) {
      var bp = bodyPose(), jit = shiverJit();
      st3.sc = sc; st3.lv = lv; st3.P = { x: P.x + jit[0] * 0.025, y: P.y, z: P.z + jit[1] * 0.025, rot: bp.rot, bob: P.down ? 0 : bob, inLava: P.inLava, ph: P.ph, sw: P.sw, reach: P.reach, press: P.press || 0, climb: climb, occ: P.occ, pick: P.pick, swing: P.swing, hyaw: P.hyaw, hpitch: P.hpitch,
        tl: bp.tl, arms: bp.arms, legs: bp.legs, torch: P.torch, ptint: bodyTint() };
      st3.shim = rm ? 0 : P.stage >= 2 || (P.die && P.die.kind === 'heat') ? 0.8 : P.stage === 1 ? 0.3 : 0; st3.mine = mineView(); st3.time = gameTime; st3.theme = theme; st3.mode = climb ? 'climb' : 'top';
      st3.beacons = lv.beacons; st3.aura = P.aura; st3.np = np; st3.cutY = b + 1.02; st3.heat = sc.fluid === M_LAVA && !rm;
      // 深坑观察窗：人物附近（切比雪夫距离 ≤ 3）有深坑时，渲染器把坑口前方的地面与坑壁渐隐，能往下看到下层和坑里的流体
      if (!climb) { var dpk = -1, dbest = 99, ptx = Math.floor(P.x), ptz = Math.floor(P.z);
        for (var dzz = -3; dzz <= 3; dzz++) for (var dxx = -3; dxx <= 3; dxx++) { var qx2 = ptx + dxx, qz2 = ptz + dzz; if (qx2 < 0 || qz2 < 0 || qx2 >= W || qz2 >= M.H || lv.pit[qz2 * W + qx2] !== 2) continue; var dd2 = Math.hypot(qx2 + 0.5 - P.x, qz2 + 0.5 - P.z); if (dd2 < dbest) { dbest = dd2; dpk = qz2 * W + qx2; } }
        if (dpk >= 0) { deepWin.x = dpk % W; deepWin.z = (dpk / W) | 0; }
        var dto = dpk >= 0 ? 1 : 0; deepWin.on = rm || !dt ? dto : deepWin.on + (dto - deepWin.on) * (1 - Math.exp(-dt / 0.15)); }
      else deepWin.on = 0;
      st3.deep = deepWin;
      st3.sky = climb && sc.level + 1 >= M.levels.length ? skyFor : null;
      R.draw(st3);
      if (R.pl) { qPos[0] = 160 + R.pl[0] / canvas.width * 320; qPos[1] = 120 - R.pl[1] / canvas.height * 240; }   // 人物在 HUD 坐标里的位置（QTE 提示跟着人物）
      if (frameLog && dt) frameLog.push([dt * 1000, R.cam[0], R.cam[1], R.cam[0] + R.pl[0], R.cam[1] + R.pl[1], fade.a > 0.01 || P.mode === 'climb' ? 1 : 0, 0, R.ppu * (canvas.clientWidth / canvas.width), R.camF[0], R.camF[1]]);
    } else {
      var g = R.g;
      if (climb) { R.climb(sc, lv, P, theme, gameTime, rm); }
      else {
        var cpx = Math.round(Math.max(0, Math.min(W * TS - VW, cam.x * TS - VW / 2))), cpz = Math.round(Math.max(0, Math.min(M.H * TS - VH, cam.z * TS - VH / 2)));
        var ppx = Math.round(P.x * TS) - cpx, ppz = Math.round(P.z * TS) - cpz;
        qPos[0] = ppx; qPos[1] = ppz; lastCp[0] = cpx; lastCp[1] = cpz;
        plView.x = P.x; plView.z = P.z; plView.r = P.torch ? 3.6 : 1.3; lights2.length = 0; for (var bl = 0; bl < lv.beacons.length; bl++) lights2.push({ x: lv.beacons[bl].x, z: lv.beacons[bl].z, v: 1, beacon: lv.beacons[bl] });
        R.view(sc, lv, cpx, cpz, gameTime, rm, theme, { player: plView, lights: lights2, minedBits: minedBits, beforeLight: function (gg) {
          for (var bl2 = 0; bl2 < lv.beacons.length; bl2++) { var bcn = lv.beacons[bl2], bx = bcn.x * TS - cpx, bz = bcn.z * TS - cpz;   // 信标：黑曜石底座 + 玻璃 + 青色核心
            gg.fillStyle = 'rgba(0,0,0,.4)'; gg.fillRect(bx + 1, bz + 3, 15, 13); gg.fillStyle = '#1c1426'; gg.fillRect(bx, bz, TS, TS - 2);
            gg.fillStyle = '#bfe8ee'; gg.fillRect(bx + 2, bz + 2, 12, 10); gg.fillStyle = '#5fd8e0'; gg.fillRect(bx + 4, bz + 4, 8, 6); gg.fillStyle = '#e8ffff'; gg.fillRect(bx + 6, bz + 5, 4, 3); }
          // 信标光柱：俯视画面里也朝屏幕上方射出（半透明发光，轻微脉动；reducedMotion 静止）
          for (var bl3 = 0; bl3 < lv.beacons.length; bl3++) { var bc3 = lv.beacons[bl3], ux = bc3.x * TS - cpx + 8, uz = bc3.z * TS - cpz + 6, pul = rm ? 0 : Math.sin(gameTime * 3 + bl3) * 0.06;
            gg.fillStyle = 'rgba(127,240,240,' + (0.16 + pul).toFixed(3) + ')'; gg.fillRect(ux - 4, 0, 8, Math.max(0, uz)); gg.fillStyle = 'rgba(220,255,255,' + (0.42 + pul).toFixed(3) + ')'; gg.fillRect(ux - 1, 0, 2, Math.max(0, uz)); }
          var inPit = P.y < b + 0.9, lift = Math.round((P.y - b - 1) * 6);
          if (inPit) { gg.save(); gg.beginPath(); gg.rect(ppx - 8, ppz - 8, 16, 16); gg.clip(); }
          sprite2d(gg, ppx, ppz - (inPit ? lift : 0) + (inPit ? 0 : 0), P.rot);
          if (inPit) gg.restore();
          for (var k = 0; k < np; k++) { var o = k * 8, psz = pp[o + 3] >= 2 ? 2 : 1; gg.fillStyle = 'rgba(' + ((pp[o + 4] * 255) | 0) + ',' + ((pp[o + 5] * 255) | 0) + ',' + ((pp[o + 6] * 255) | 0) + ',' + pp[o + 7].toFixed(2) + ')'; gg.fillRect(Math.round(pp[o] * TS) - cpx, Math.round(pp[o + 2] * TS) - cpz - Math.round((pp[o + 1] - b - 1) * 4), psz, psz); }   // 粒子（含身体信号）画在人物之上
        } });
        if (!rm && (P.stage >= 2 || (P.die && P.die.kind === 'heat'))) {   // 过热：人物附近的画面一行行左右轻微错动（热浪）
          var amp = P.die ? 2 : 1; for (var ry = Math.max(0, ppz - 44); ry < Math.min(VH, ppz + 30); ry += 2) { var off = Math.round(Math.sin(ry * 0.35 + gameTime * 9) * amp); if (off) g.drawImage(canvas, 0, ry, VW, 2, off, ry, VW, 2); } }
        if (frameLog && dt) frameLog.push([dt * 1000, cpx, cpz, ppx, ppz, fade.a > 0.01 ? 1 : 0, 0, TS, cam.x * TS, cam.z * TS]);
      }
    }
    drawHud(dt);
  }
  // 镜头方向（与 3D 渲染器一致：yaw 0.5、俯角 0.86）上，人物脚、身、头三处到镜头之间是否有本层的墙
  var OCC_D = [Math.sin(0.5) * Math.cos(0.86), Math.sin(0.86), Math.cos(0.5) * Math.cos(0.86)];
  function occluded(b) {
    for (var h = 0.3; h <= 1.7; h += 0.7) for (var t = 0.35; t < 5; t += 0.25) {
      var y = Math.floor(P.y + h + OCC_D[1] * t); if (y > b + 2) break;
      if (y >= b + 1 && isSolidM(sc.mat[sc.idx(Math.floor(P.x + OCC_D[0] * t), y, Math.floor(P.z + OCC_D[2] * t))])) return 1;
    }
    return 0;
  }
  // 发抖：轻度失温有寒战时人物小幅抖动（减少动态时不抖）
  function shiverJit() { if (rm || !P || !(P.th.shiv > 0) || P.down || P.die) return [0, 0]; var a = Math.min(1, P.th.shiv / C.TH.SHIV); return [Math.sin(gameTime * 71) * a, Math.cos(gameTime * 53) * a]; }
  // 人物身上的色调：被火烤着 = 暖橙光（微微脉动）；中度以上失温 = 淡淡的霜色；过热 = 发红
  function bodyTint() {
    if (!P) return null;
    if (P.warm) { var pu = rm ? 0.5 : 0.5 + 0.5 * Math.sin(gameTime * 5); return [1, 0.62, 0.28, 0.14 + 0.1 * pu]; }
    if (P.stage <= -3 || (P.die && P.die.kind === 'cold')) return [0.8, 0.92, 1, 0.34];
    if (P.stage === -2) return [0.8, 0.92, 1, 0.2];
    if (P.stage >= 2) return [1, 0.42, 0.32, 0.16];
    return null;
  }
  // 俯视：倒下 / 爬 / 蜷 / 坐的小人。躺着时身体从脚（px, py）沿头的方向伸出约 1.75 格
  function sprite2dDown(g, px, py) {
    var D = P.down, ph = D.ph, u = ph === 'kneel' ? Math.min(1, D.t / KNEEL_T) : ph === 'fall' ? Math.min(1, D.t / FALL_T) : ph === 'stand' ? 1 - Math.min(1, D.t / STAND_T) : 1;
    if (D.kind !== 'lie' || ph === 'kneel' || (ph === 'stand' && u < 0.5)) {   // 跪着 / 蜷着 / 坐着：缩小的身子 + 阴影
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(px - 6, py - 4, 13, 10);
      g.fillStyle = '#141210'; g.fillRect(px - 5, py - 4, 10, 8); g.fillStyle = '#2fb5b0'; g.fillRect(px - 4, py - 3, 8, 6);
      g.fillStyle = '#4a2f1b'; g.fillRect(px - 3, py - 3 + (D.kind === 'curl' ? 1 : 0), 6, 5); g.fillStyle = '#2e3c90'; g.fillRect(px - 4, py + 2, 8, 2);
      g.fillStyle = '#6b4a2b'; g.fillRect(px + 4, py - 2, 2, 3); g.fillStyle = P.torch ? '#ffd25a' : '#2b211b'; g.fillRect(px + 4, py - 4, 2, 2);   // 手里的火把（灭了 = 烧黑的木棍头）
      return;
    }
    var a = D.ang, L = Math.round(28 * (ph === 'fall' ? u : ph === 'stand' ? (u - 0.5) * 2 : 1)), cx = Math.cos(a), cz = Math.sin(a), nx = -cz, nz = cx;
    var seg = function (s0, s1, w, col) { g.fillStyle = col; for (var t = s0; t <= s1; t++) for (var l = -w; l <= w; l++) g.fillRect(Math.round(px + cx * t + nx * l) - 0, Math.round(py + cz * t + nz * l), 1, 1); };
    g.fillStyle = 'rgba(0,0,0,.3)'; seg(0, L, 4, 'rgba(0,0,0,.3)');
    var k = L / 28, cw = D.pr > 0.5 && !rm ? Math.round(Math.sin(P.ph) * P.sw * 2) : 0;
    seg(0, Math.round(10 * k), 2, '#2e3c90'); seg(Math.round(10 * k), Math.round(20 * k), 3, '#2fb5b0'); seg(Math.round(20 * k), L, 3, '#4a2f1b');
    if (D.pr < 0.5) seg(Math.round(21 * k), Math.round(25 * k), 1, '#d9a27a');   // 侧躺：露出侧脸
    // 爬：两只手伸在头前，交替
    if (D.pr > 0.3) { g.fillStyle = '#d9a27a'; g.fillRect(Math.round(px + cx * (L + 2 + cw) + nx * 3), Math.round(py + cz * (L + 2 + cw) + nz * 3), 2, 2); g.fillRect(Math.round(px + cx * (L + 2 - cw) - nx * 3), Math.round(py + cz * (L + 2 - cw) - nz * 3), 2, 2); }
    if (P.torch && P.use) { g.fillStyle = '#6b4a2b'; g.fillRect(Math.round(px + cx * (L + 3) + nx * 4), Math.round(py + cz * (L + 3) + nz * 4), 2, 3); g.fillStyle = (rm || ((gameTime * 9) % 2) < 1) ? '#ffd25a' : '#ffb03a'; g.fillRect(Math.round(px + cx * (L + 3) + nx * 4), Math.round(py + cz * (L + 3) + nz * 4) - 2, 2, 2); }
  }
  function sprite2d(g, px, py, rot) {   // 俯视小人：棕发头顶 + 朝向一侧露脸（脸跟着头转，看向奇怪的矿石），青色肩膀，左手火把，挖矿时右手钻石镐
    if (P.down) { sprite2dDown(g, px, py); return; }
    var jt = shiverJit(); px += Math.round(jt[0]); py += Math.round(jt[1]);
    var hr = rot + (P.hyaw || 0), fx = Math.round(Math.cos(hr) * 2), fz = Math.round(Math.sin(hr) * 2);
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(px - 5, py - 3, 11, 8);
    var stp = Math.round(Math.sin(P.ph) * 2.4 * P.sw), sx2 = Math.round(Math.sin(rot) * 2), sz2 = -Math.round(Math.cos(rot) * 2), cx2 = Math.cos(rot), cz2 = Math.sin(rot);
    if (P.sw > 0.08) { g.fillStyle = '#2e3c90';   // 两只脚（裤腿）露在身体前后，左右脚反相
      g.fillRect(px - 1 - sx2 + Math.round(cx2 * (3 + stp)), py - 1 - sz2 + Math.round(cz2 * (3 + stp)), 2, 2);
      g.fillRect(px - 1 + sx2 + Math.round(cx2 * (3 - stp)), py - 1 + sz2 + Math.round(cz2 * (3 - stp)), 2, 2); }
    g.fillStyle = '#141210'; g.fillRect(px - 6, py - 5, 12, 9);
    g.fillStyle = '#2fb5b0'; g.fillRect(px - 5, py - 4, 10, 7);
    g.fillStyle = '#d9a27a'; g.fillRect(px - 5 + (fz < 0 ? 0 : 0), py - 4, 2, 2); g.fillRect(px + 3, py - 4, 2, 2);
    g.fillStyle = '#d9a27a'; g.fillRect(px - 3 + fx, py - 4 + fz, 6, 6);
    g.fillStyle = '#4a2f1b'; g.fillRect(px - 3 - fx / 2, py - 4 - fz / 2, 6, 6);
    var lx = px + Math.round(Math.sin(rot) * 6), lz = py - Math.round(Math.cos(rot) * 6);
    if (P.use) { lx = px + Math.round(Math.cos(rot) * 7); lz = py + Math.round(Math.sin(rot) * 7); }   // 用火把取暖：火把凑到身前
    g.fillStyle = '#6b4a2b'; g.fillRect(lx - 1, lz - 1, 2, 3); g.fillStyle = !P.torch ? '#2b211b' : (rm || ((gameTime * 9) % 2) < 1) ? '#ffd25a' : '#ffb03a'; g.fillRect(lx - 1, lz - 3, 2, 2);   // 火把（灭了只剩烧黑的木棍头）
    if (P.stage <= -2) { g.fillStyle = 'rgba(225,242,255,.75)'; g.fillRect(px - 3 - fx / 2, py - 4 - fz / 2, 2, 1); g.fillRect(px + 2, py - 3, 1, 1); g.fillRect(px - 5, py + 1, 1, 1); if (P.stage <= -3) { g.fillRect(px + 3 - fx / 2, py - 1, 2, 1); g.fillRect(px - 1, py + 2, 1, 1); } }   // 霜
    if (P.pick > 0.05) {   // 钻石镐：从右手朝前伸出，挖矿时前后挥动
      var rx = px - Math.round(Math.sin(rot) * 5), rz = py + Math.round(Math.cos(rot) * 5), sa = rot + (rm ? 0 : Math.sin(P.swing) * 0.5), ca = Math.cos(sa), sn = Math.sin(sa);
      g.fillStyle = '#7a5230'; for (var hk = 0; hk < 5; hk++) g.fillRect(Math.round(rx + ca * hk), Math.round(rz + sn * hk), 1, 1);
      g.fillStyle = '#5fe6dc'; for (var tk = -2; tk <= 2; tk++) g.fillRect(Math.round(rx + ca * 5 - sn * tk), Math.round(rz + sn * 5 + ca * tk), 1, 1);
      g.fillStyle = '#2a8c88'; g.fillRect(Math.round(rx + ca * 5 - sn * 2), Math.round(rz + sn * 5 + ca * 2), 1, 1); g.fillRect(Math.round(rx + ca * 5 + sn * 2), Math.round(rz + sn * 5 - ca * 2), 1, 1);
    }
  }
  if (R.ex) R.ex.player = function (g, px, py) { side(g, px, py); };
  if (R.ex) R.ex.sky = function (g, surfY) {   // 2D 竖井出口：地面以上画结局同一张远景，地平线对齐地表
    if (endBgKey !== themeName) { endBg = endBackground(themeName === 'dark'); endBgKey = themeName; }
    g.save(); g.beginPath(); g.rect(0, 0, 320, surfY); g.clip(); g.fillStyle = themeName === 'dark' ? '#121731' : '#7fbde8'; g.fillRect(0, 0, 320, surfY); g.drawImage(endBg, 0, Math.round(surfY - 148)); g.restore(); };
  // 侧视的矿工（结局用）：12×18 像素
  // 侧视小人（竖井 / 结局）：8×18 像素，面朝右，自动加 1px 深色描边
  var SIDE = [' HHHHHH ', 'HHHHHHHH', 'HHHHHHss', 'HHHsssss', 'HHssswes', 'HHssssss', 'Hsssmmss', ' ssssss ', ' cccccc ', ' cccccc ', ' cAAccc ', ' cAAccc ', ' cssccc ', ' bbbbbb ', ' bbbbbb ', ' bBbbbb ', ' bBbbbb ', ' gggggg '];
  var SPAL = { H: '#4a2f1b', s: '#d9a27a', w: '#ffffff', e: '#3b4fa8', m: '#8a5a3c', c: '#2fb5b0', A: '#238a87', b: '#3d4fb8', B: '#2e3c90', g: '#7d7d7d' };
  function side(g, x, y) {
    var r, c, h = SIDE.length; g.fillStyle = '#141210';
    var fr = P && P.mode === 'climb' && P.sw > 0.4 ? (Math.floor(P.ph / Math.PI) & 1) : -1;   // 爬梯：两帧交替（-1 = 站立）
    var flip = P && P.mode === 'top' && Math.cos(P.rot) < -0.3;   // 俯视时朝左就镜像（精灵本身朝右）
    if (flip) { g.save(); g.translate(2 * x + 8, 0); g.scale(-1, 1); }
    for (r = 0; r < h; r++) for (c = 0; c < 8; c++) if (SIDE[r][c] !== ' ') g.fillRect(x + c - 1, y - h + r - 1, 3, 3);
    for (r = 0; r < h; r++) for (c = 0; c < 8; c++) { var ch = SIDE[r][c]; if (ch !== ' ') { g.fillStyle = SPAL[ch]; g.fillRect(x + c, y - h + r, 1, 1); } }
    if (fr < 0 && P && P.mode !== 'climb' && P.mode !== 'end' && P.reach > 0.3) {   // 爬出矿坑 / 扒坑沿：手臂朝面向的一侧（精灵朝右）伸出；撑出坑沿时向前下方按住坑沿，扒深坑沿时向前上方抓
      g.fillStyle = SPAL.c; g.fillRect(x + 2, y - h + 10, 2, 3);   // 垂着的手臂抹掉
      if ((P.press || 0) > 0.5) {
        g.fillStyle = '#141210'; g.fillRect(x + 7, y - h + 7, 5, 6);
        g.fillStyle = SPAL.A; g.fillRect(x + 7, y - h + 8, 2, 1); g.fillRect(x + 9, y - h + 9, 1, 1); g.fillRect(x + 9, y - h + 10, 2, 1);
        g.fillStyle = SPAL.s; g.fillRect(x + 10, y - h + 11, 1, 1);
      } else {
        g.fillStyle = '#141210'; g.fillRect(x + 8, y - h + 3, 4, 7);
        g.fillStyle = SPAL.A; g.fillRect(x + 7, y - h + 8, 2, 1); g.fillRect(x + 9, y - h + 7, 1, 1); g.fillRect(x + 9, y - h + 6, 2, 1);
        g.fillStyle = SPAL.s; g.fillRect(x + 10, y - h + 4, 1, 2);
      }
    }
    if (fr >= 0) {   // 一只手举到头侧、另一条腿抬起，下一帧换边
      g.fillStyle = SPAL.s; g.fillRect(x + (fr ? 6 : 1), y - h + 6, 1, 2); g.fillStyle = SPAL.A; g.fillRect(x + (fr ? 6 : 1), y - h + 8, 1, 2);
      g.fillStyle = '#141210'; g.fillRect(x + (fr ? 1 : 4), y - 2, 3, 2); g.fillStyle = SPAL.B; g.fillRect(x + (fr ? 1 : 4), y - 4, 3, 2);
    }
    if (flip) g.restore();
  }
  function drawPrep() {
    if (is3D) { var gl = R.gl; gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.clearColor(theme.bg[0], theme.bg[1], theme.bg[2], 1); gl.clear(gl.COLOR_BUFFER_BIT); }
    else { R.g.fillStyle = themeName === 'dark' ? '#0d0f13' : '#cfc6b8'; R.g.fillRect(0, 0, VW, VH); }
    hg.clearRect(0, 0, 320, 240);
    for (var k = 0; k < 3; k++) { hg.fillStyle = theme.ink; hg.globalAlpha = rm ? 0.6 : 0.25 + 0.75 * ((Math.floor(performance.now() / 250) % 3) === k ? 1 : 0); hg.fillRect(150 + k * 8, 118, 4, 4); }
    hg.globalAlpha = 1;
  }
  function heart(x, y, full, half) { hg.fillStyle = 'rgba(0,0,0,.5)'; hg.fillRect(x - 1, y - 1, 7, 6); hg.fillStyle = full ? '#e8413c' : half ? '#a33' : '#3a2a2a'; hg.fillRect(x, y, 2, 2); hg.fillRect(x + 3, y, 2, 2); hg.fillRect(x, y + 1, 5, 2); hg.fillRect(x + 1, y + 3, 3, 1); }
  /* 奇怪的石头（物品）图标：原创 11×11 像素四角星。星形按 |dx|^0.6 + |dy|^0.6 ≤ R^0.6 收腰，颜色沿对角线 粉 → 白 → 天蓝，
   * 左上半面亮、右下半面暗出棱面，外圈深紫描边。不取自任何现成图标。 */
  var STONE_PX = (function () {
    var out = [], R = 5.2, P6 = 0.6, lim = Math.pow(R, P6);
    var col = function (t, lit) { var a = t < 0.5 ? [[247, 150, 200], [255, 246, 252]] : [[255, 246, 252], [92, 196, 250]], u = t < 0.5 ? t * 2 : t * 2 - 1, c = [0, 1, 2].map(function (k) { return Math.round(a[0][k] + (a[1][k] - a[0][k]) * u); }); if (!lit) c = c.map(function (v) { return Math.round(v * 0.82); }); return 'rgb(' + c.join(',') + ')'; };
    for (var y = 0; y < 11; y++) for (var x = 0; x < 11; x++) {
      var dx = Math.abs(x - 5), dy = Math.abs(y - 5), v = Math.pow(dx, P6) + Math.pow(dy, P6);
      if (v > lim + 0.35) continue;
      if (v > lim - 0.45) { out.push([x, y, '#4a2a5e']); continue; }
      out.push([x, y, col((x + y) / 20, x - 5 + (y - 5) < 0 || (x === 5 && y === 5))]);
    }
    out.push([4, 3, '#ffffff'], [3, 4, '#ffffff']);
    return out;
  })();
  function stoneIcon(g, x, y, a) { if (a != null) g.globalAlpha = a; for (var k = 0; k < STONE_PX.length; k++) { g.fillStyle = STONE_PX[k][2]; g.fillRect(x + STONE_PX[k][0], y + STONE_PX[k][1], 1, 1); } g.globalAlpha = 1; }
  function drawHud(dt) {
    hg.clearRect(0, 0, 320, 240);
    if (fade.to || fade.a > 0) {   // 过渡：0.3 s 淡出 → 切换 → 0.3 s 淡入
      fade.a += (fade.to ? 1 : -1) * (dt || 0) / C.FADE_T; fade.a = Math.max(0, Math.min(1, fade.a));
      if (fade.to && fade.a >= 1) { var f = fade.then; fade.then = null; fade.to = 0; if (f) f(); }
    }
    hg.font = '9px ui-monospace, Menlo, Consolas, monospace'; hg.textBaseline = 'top'; hg.textAlign = 'left';
    hg.fillStyle = theme.hud; hg.fillRect(2, 2, M.levels.length > 1 ? 66 : 44, 12);
    hg.fillStyle = theme.ink; hg.fillText(tx('hud.time', { time: gameTime.toFixed(1) }), 5, 4);
    if (M.levels.length > 1) hg.fillText(tx('hud.level', { level: sc.level + 1, total: M.levels.length }), 48, 4);
    if (hasWeirdNow()) {   // 奇怪的石头 计数
      var sx0 = M.levels.length > 1 ? 70 : 48; hg.fillStyle = theme.hud; hg.fillRect(sx0, 2, 34, 12); stoneIcon(hg, sx0 + 1, 2); hg.fillStyle = theme.ink; hg.fillText(tx('hud.stones', { n: P.stones }), sx0 + 14, 4);
    }
    for (var pk2 = 0; pk2 < P.pops.length; pk2++) {   // 挖到时人物旁边冒出 "+1" 和图标，往上飘并淡出（减少动态时不飘）
      var pq = P.pops[pk2], pa = 1 - Math.max(0, pq.t - 0.7) / 0.5, rise = rm ? 0 : Math.round(pq.t * 16), hx = Math.round(qPos[0] + 8), hy2 = Math.round(qPos[1] - 26 - rise);
      hg.globalAlpha = Math.max(0, pa); hg.fillStyle = 'rgba(0,0,0,.45)'; hg.fillRect(hx - 1, hy2 - 1, 29, 13); hg.globalAlpha = 1;
      stoneIcon(hg, hx, hy2, Math.max(0, pa)); hg.globalAlpha = Math.max(0, pa); hg.fillStyle = '#fff3fb'; hg.font = 'bold 10px system-ui, sans-serif'; hg.fillText(tx('hud.stone_pop'), hx + 13, hy2 + 1); hg.globalAlpha = 1;
      hg.font = '9px ui-monospace, Menlo, Consolas, monospace';
    }
    for (var k = 0; k < 10; k++) heart(320 - 9 - k * 7, 5, P.hp >= (10 - k) * 2 - 0.01, P.hp > (9 - k) * 2 && P.hp < (10 - k) * 2 - 0.01);
    if (neg && P.air < 10) for (k = 0; k < Math.ceil(P.air); k++) { var bx = 320 - 11 - k * 7; hg.fillStyle = '#bfe4ff'; hg.fillRect(bx, 228, 5, 5); hg.fillStyle = '#5a9bd8'; hg.fillRect(bx + 1, 229, 3, 3); }
    if (thermoOn) tempHud();
    if (P.buff > 0) {   // 信标效果：图标 + 剩余时间（在光环内显示“持续”的满条，离开后倒计时）
      hg.fillStyle = theme.hud; hg.fillRect(2, 16, 66, 12);
      hg.fillStyle = '#1a2a30'; hg.fillRect(4, 18, 8, 8); hg.fillStyle = '#7ff0f0'; hg.fillRect(5, 19, 6, 6); hg.fillStyle = '#e8ffff'; hg.fillRect(7, 20, 2, 4);
      var bq = P.aura ? 1 : P.buff / P.buffMax; hg.fillStyle = 'rgba(0,0,0,.25)'; hg.fillRect(15, 21, 26, 3);
      hg.fillStyle = P.aura && !rm && ((gameTime * 3) | 0) % 2 ? '#c8fbff' : '#5fd8e0'; hg.fillRect(15, 21, Math.round(26 * bq), 3);
      hg.fillStyle = theme.ink; hg.textAlign = 'left'; hg.fillText(P.aura ? tx('hud.buff_inf') : tx('hud.buff_left', { n: Math.ceil(P.buff) }), 45, 18);
    }
    if (P.qte > 0 && P.pit >= 0) {   // 深坑 QTE 提示：人物周围收缩的方框 + 下方快速见底的条与"空格 / 点击"（减少动态时只有见底的条）
      var qq = Math.max(0, P.qte / P.qteMax), qx = Math.round(Math.max(32, Math.min(288, qPos[0]))), qy = Math.round(Math.max(30, Math.min(196, qPos[1] + 8))), qtxt = tx(COARSE ? 'prompt.qte_tap' : 'prompt.qte_key');
      if (!rm) { var rr = Math.round(10 + 18 * qq), sh2 = qq < 0.35 ? ((gameTime * 30) | 0) % 2 : 0; hg.fillStyle = qq < 0.35 ? '#f05a3c' : '#ffd25a'; hg.fillRect(qx - rr + sh2, qy - rr - 12, rr * 2, 2); hg.fillRect(qx - rr + sh2, qy + rr - 14, rr * 2, 2); hg.fillRect(qx - rr + sh2, qy - rr - 12, 2, rr * 2); hg.fillRect(qx + rr - 2 + sh2, qy - rr - 12, 2, rr * 2); }
      hg.fillStyle = 'rgba(0,0,0,.6)'; hg.fillRect(qx - 30, qy + 20, 60, 20); hg.fillStyle = 'rgba(255,255,255,.18)'; hg.fillRect(qx - 27, qy + 34, 54, 3);
      hg.fillStyle = qq < 0.35 ? '#f05a3c' : '#ffd25a'; hg.fillRect(qx - 27, qy + 34, Math.round(54 * qq), 3);
      hg.fillStyle = '#fff'; hg.textAlign = 'center'; hg.font = 'bold 9px system-ui, sans-serif'; hg.textBaseline = 'alphabetic'; hg.fillText(qtxt, qx, qy + 31);
    }
    if (P.grip >= 0 && P.pit >= 0) {
      var gq = Math.max(0, P.grip / P.gripMax), need2 = M.D.climb * 2, sh = !rm && gq < 0.3 ? ((gameTime * 20) | 0) % 2 : 0, gx = 120 + sh, gy = 214;
      hg.fillStyle = 'rgba(0,0,0,.62)'; hg.fillRect(gx, gy, 80, 20); hg.fillStyle = 'rgba(255,255,255,.18)'; hg.fillRect(gx, gy, 80, 1);
      hg.fillStyle = '#d9a27a'; hg.fillRect(gx + 3, gy + 4, 5, 4); hg.fillRect(gx + 3, gy + 3, 1, 1); hg.fillRect(gx + 5, gy + 3, 1, 1); hg.fillRect(gx + 7, gy + 3, 1, 1);   // 手
      hg.fillStyle = 'rgba(255,255,255,.15)'; hg.fillRect(gx + 11, gy + 3, 66, 5);
      hg.fillStyle = gq < 0.3 ? '#f05a3c' : gq < 0.6 ? '#f0b440' : '#e8e2d0'; hg.fillRect(gx + 11, gy + 3, Math.round(66 * gq), 5);
      hg.fillStyle = '#ffd25a'; hg.fillRect(gx + 5, gy + 11, 1, 6); hg.fillRect(gx + 4, gy + 12, 3, 1); hg.fillRect(gx + 3, gy + 13, 5, 1);   // 向上箭头
      hg.fillStyle = 'rgba(255,255,255,.15)'; hg.fillRect(gx + 11, gy + 12, 66, 4);
      hg.fillStyle = '#ffd25a'; hg.fillRect(gx + 11, gy + 12, Math.round(66 * Math.min(1, P.hold / need2)), 4);
    } else if (P.pit >= 0 && P.hold > 0) { var need = M.D.climb * (lv.pit[P.pit] === 2 ? 2 : 1); hg.fillStyle = 'rgba(0,0,0,.5)'; hg.fillRect(140, 226, 40, 4); hg.fillStyle = '#ffd25a'; hg.fillRect(140, 226, Math.round(40 * Math.min(1, P.hold / need)), 4); }
    if (P.mode === 'climb') { hg.fillStyle = 'rgba(0,0,0,.45)'; hg.fillRect(312, 40, 4, 160); hg.fillStyle = '#ffd25a'; hg.fillRect(312, 200 - Math.round(160 * P.climb), 4, Math.round(160 * P.climb)); }
    if (fade.a > 0) { hg.fillStyle = 'rgba(0,0,0,' + fade.a.toFixed(3) + ')'; hg.fillRect(0, 0, 320, 240); }
    if (state === 'ready' || state === 'pause') {   // 提示只在开始 / 暂停时出现（失败与通关由结算面板显示）
      hg.fillStyle = theme.veil; hg.fillRect(0, 96, 320, 50);
      hg.fillStyle = theme.ink; hg.textAlign = 'center'; hg.font = '11px system-ui, sans-serif'; hg.fillText(tx('canvas_label'), 160, 114);
    }
    if (P.drown >= 0) {   // 溺水：黑暗从四周往中间收拢（减少动态时同样变暗）
      var dv = Math.min(1, P.drown / DROWN_T), vr1 = 230 - 170 * dv, vg = hg.createRadialGradient(160, 120, vr1 * 0.3, 160, 120, vr1);
      vg.addColorStop(0, 'rgba(2,6,14,0)'); vg.addColorStop(1, 'rgba(2,6,14,' + (0.75 + 0.23 * dv).toFixed(3) + ')'); hg.fillStyle = vg; hg.fillRect(0, 0, 320, 240);
      hg.fillStyle = 'rgba(2,6,14,' + (0.75 + 0.23 * dv).toFixed(3) + ')'; if (vr1 < 160) { hg.fillRect(0, 0, 160 - vr1, 240); hg.fillRect(160 + vr1, 0, 160 - vr1, 240); }
    }
    if (P.die && P.die.kind === 'suff') { var sv = Math.min(1, P.die.t / DIE_T), sr = 230 - 170 * sv, sg2 = hg.createRadialGradient(160, 120, sr * 0.3, 160, 120, sr);   // 窒息：与溺水相同的黑暗收拢
      sg2.addColorStop(0, 'rgba(4,4,6,0)'); sg2.addColorStop(1, 'rgba(4,4,6,' + (0.75 + 0.23 * sv).toFixed(3) + ')'); hg.fillStyle = sg2; hg.fillRect(0, 0, 320, 240);
      hg.fillStyle = 'rgba(4,4,6,' + (0.75 + 0.23 * sv).toFixed(3) + ')'; if (sr < 160) { hg.fillRect(0, 0, 160 - sr, 240); hg.fillRect(160 + sr, 0, 160 - sr, 240); } }
    thermoVeil();
    if (state === 'over' && !P.won) { hg.fillStyle = 'rgba(40,0,0,.28)'; hg.fillRect(0, 0, 320, 240); }   // 失败：画面压一层暗红
  }
  /* ---------- 体温 HUD（设计 §32）：心形左边一个彩色圆点（黄 = 正常 → 蓝 = 冷 / 红 = 热，渐变），圆点左边是核心温度；
   * 轻度起再加图标（雪花 / 火焰）与阶段名，不只靠颜色。最左边是手里火把（用掉后变成灰色的木棍）；被火烤着时温度旁边有个小的向上箭头 ---------- */
  var torchTip = -1, hudText = [];   // hudText：本帧 HUD 上的提示文字（测试用）
  var STAGE_KEY = { '-1': 'stage.cold_1', '-2': 'stage.cold_2', '-3': 'stage.cold_3', 1: 'stage.hot_1', 2: 'stage.hot_2', 3: 'stage.hot_3' };
  function tempColor(Tc) {
    var Y = [242, 201, 76], B = [61, 143, 224], Rr = [232, 65, 60], c = Tc < 37 ? Math.min(1, (37 - Tc) / 9) : Math.min(1, (Tc - 37) / 3.5), t = Tc < 37 ? B : Rr;
    return 'rgb(' + [0, 1, 2].map(function (k) { return Math.round(Y[k] + (t[k] - Y[k]) * c); }).join(',') + ')';
  }
  function snowflake(x, y, col) { hg.fillStyle = col; hg.fillRect(x + 3, y, 1, 7); hg.fillRect(x, y + 3, 7, 1); hg.fillRect(x + 1, y + 1, 1, 1); hg.fillRect(x + 5, y + 1, 1, 1); hg.fillRect(x + 1, y + 5, 1, 1); hg.fillRect(x + 5, y + 5, 1, 1); hg.fillRect(x + 2, y + 2, 3, 3); hg.fillStyle = '#ffffff'; hg.fillRect(x + 3, y + 3, 1, 1); }
  function flame(x, y) { hg.fillStyle = '#e8413c'; hg.fillRect(x + 1, y + 2, 5, 5); hg.fillRect(x + 2, y + 1, 2, 1); hg.fillRect(x + 4, y, 1, 2); hg.fillStyle = '#ffb03a'; hg.fillRect(x + 2, y + 3, 3, 3); hg.fillStyle = '#fff3c0'; hg.fillRect(x + 3, y + 4, 1, 2); }
  function torchIcon(x, y, lit) { hg.globalAlpha = lit ? 1 : 0.45; hg.fillStyle = lit ? '#7a5230' : '#55504a'; hg.fillRect(x + 1, y + 4, 2, 7); hg.fillStyle = lit ? '#2b1a0e' : '#2a2724'; hg.fillRect(x + 1, y + 3, 2, 1);
    if (lit) { hg.fillStyle = '#ffb03a'; hg.fillRect(x, y + 1, 4, 2); hg.fillStyle = '#fff0a6'; hg.fillRect(x + 1, y, 2, 2); } else { hg.fillStyle = '#9a948c'; hg.fillRect(x - 1, y + 1, 1, 1); hg.fillRect(x + 4, y + 2, 1, 1); } hg.globalAlpha = 1; }
  function tempHud() {
    var Tc = P.th.Tc, txt = tx('hud.temp', { temp: Tc.toFixed(1) }), st = P.stage, col = tempColor(Tc);
    hg.font = '9px ui-monospace, Menlo, Consolas, monospace'; hg.textBaseline = 'top'; hg.textAlign = 'right';
    var tw = Math.ceil(hg.measureText(txt).width), x1 = 245, xt = 234, x0 = xt - tw - (P.trend ? 7 : 0) - 9;
    hg.fillStyle = theme.hud; hg.fillRect(x0 - 2, 2, x1 - x0 + 3, 13);
    hg.fillStyle = '#141210'; hg.fillRect(236, 4, 9, 9); hg.fillStyle = col; hg.fillRect(237, 5, 7, 7); hg.fillStyle = 'rgba(255,255,255,.55)'; hg.fillRect(238, 6, 2, 2);   // 圆点（像素圆：去掉四角）
    hg.fillStyle = theme.hud; hg.fillRect(236, 4, 1, 1); hg.fillRect(244, 4, 1, 1); hg.fillRect(236, 12, 1, 1); hg.fillRect(244, 12, 1, 1);
    hg.fillStyle = st ? col : theme.ink; if (st && themeName === 'light') hg.fillStyle = st < 0 ? '#1f5fa8' : '#b5261f';
    hg.fillText(txt, xt, 4);
    if (P.trend) { var ax = xt - tw - 6, ay = 5, up = P.trend > 0; hg.fillStyle = up ? '#e0703a' : '#4a90d8';   // 体温在升（↑，暖色）/ 在降（↓，冷色）；稳定时不画
      if (up) { hg.fillRect(ax + 2, ay, 1, 1); hg.fillRect(ax + 1, ay + 1, 3, 1); hg.fillRect(ax, ay + 2, 5, 1); hg.fillRect(ax + 2, ay + 3, 1, 4); }
      else { hg.fillRect(ax + 2, ay, 1, 4); hg.fillRect(ax, ay + 4, 5, 1); hg.fillRect(ax + 1, ay + 5, 3, 1); hg.fillRect(ax + 2, ay + 6, 1, 1); } }
    torchIcon(x0, 3, P.torch);
    if (st) {   // 第二行：图标 + 阶段名
      hg.font = 'bold 9px system-ui, sans-serif'; var nm = tx(STAGE_KEY[st]), nw = Math.ceil(hg.measureText(nm).width), bx = 318 - nw - 11;
      hg.fillStyle = theme.hud; hg.fillRect(bx - 2, 16, nw + 15, 12);
      if (st < 0) snowflake(bx, 18, col); else flame(bx, 18);
      hg.fillStyle = themeName === 'light' ? (st < 0 ? '#1f5fa8' : '#b5261f') : col; hg.fillText(nm, 317, 18);
      hg.font = '9px ui-monospace, Menlo, Consolas, monospace';
    }
    hg.textAlign = 'left';
    // 被火烤着：人物身边一圈暖光（3D / 2D 都画在 HUD 层上）
    if (P.warm && P.mode === 'top') { var gx = qPos[0], gy = qPos[1] - (lying() ? 0 : 8), gr = hg.createRadialGradient(gx, gy, 2, gx, gy, 22); gr.addColorStop(0, 'rgba(255,170,80,.28)'); gr.addColorStop(1, 'rgba(255,140,40,0)'); hg.fillStyle = gr; hg.fillRect(gx - 22, gy - 22, 44, 44); }
    // 提示与进度：取暖引导条、倒下后能爬的时间、可以按 Shift 的动作
    var a = actNow(), y0 = 206;
    if (P.use) { var uq = P.use.rescue ? Math.min(1, (P.th.Tc - 26) / (TH.WARM_TO - 26)) : Math.min(1, P.use.t / USE_T); hg.fillStyle = 'rgba(0,0,0,.6)'; hg.fillRect(120, y0, 80, 10); torchIcon(123, y0 - 1, true); hg.fillStyle = 'rgba(255,255,255,.18)'; hg.fillRect(130, y0 + 3, 66, 4); hg.fillStyle = P.use.mode === 2 ? '#c9c2b8' : '#ffb03a'; hg.fillRect(130, y0 + 3, Math.round(66 * uq), 4); }
    if (P.down && P.down.ph === 'lie' && Math.abs(st) >= 3 && !P.die) { var wq = P.down.win / P.down.winMax; hg.fillStyle = 'rgba(0,0,0,.6)'; hg.fillRect(110, y0 + 12, 100, 6); hg.fillStyle = P.down.rescue ? '#ffd25a' : st < 0 ? '#7fb8f0' : '#f08060'; hg.fillRect(112, y0 + 14, Math.round(96 * wq), 2); }
    hudText.length = 0; if (a && !COARSE && !P.use) hudText.push(tx(a === 'stand' ? 'prompt.stand_key' : 'prompt.torch_key'));
    var hint = function (txt, y, col) { hudText.push(txt); hg.font = 'bold 9px system-ui, sans-serif'; hg.textAlign = 'center'; var lw2 = Math.ceil(hg.measureText(txt).width) + 12; hg.fillStyle = 'rgba(0,0,0,.66)'; hg.fillRect(160 - lw2 / 2, y, lw2, 13); hg.fillStyle = col || '#ffe9b0'; hg.fillText(txt, 160, y + 2); hg.textAlign = 'left'; hg.font = '9px ui-monospace, Menlo, Consolas, monospace'; };
    if (P.use) hint(tx(P.use.rescue ? 'prompt.warming_rescue' : 'prompt.warming'), y0 - 16, '#ffd59a');   // 引导时的提示：一动就中断（火把照样烧完）
    // 第一次出现「用火把取暖」时的小提示（每次挂载一次，约 5 s）
    if (a === 'torch' && torchTip < 0) torchTip = gameTime;
    if (torchTip >= 0 && gameTime - torchTip < 5) { hint(tx('prompt.torch_tip_1', { sec: USE_T }), y0 - 46, '#e8f0ff'); hint(tx('prompt.torch_tip_2'), y0 - 32, '#e8f0ff'); }
    // 重新点火：人物脚下的进度条
    if (P.relight && P.mode === 'top') { var rq = Math.min(1, P.relight.t / RELIGHT_T), rx = Math.round(Math.max(20, Math.min(300, qPos[0]))) - 17, ry = Math.round(Math.min(228, qPos[1] + 12));
      hg.fillStyle = 'rgba(0,0,0,.62)'; hg.fillRect(rx, ry, 34, 8); torchIcon(rx + 2, ry - 2, rq >= 0.5); hg.fillStyle = 'rgba(255,255,255,.18)'; hg.fillRect(rx + 8, ry + 2, 24, 4); hg.fillStyle = '#ffb03a'; hg.fillRect(rx + 8, ry + 2, Math.round(24 * rq), 4); }
    if (a && !COARSE && !P.use) { var lab = tx(a === 'stand' ? 'prompt.stand_key' : 'prompt.torch_key'); hg.font = 'bold 9px system-ui, sans-serif'; hg.textAlign = 'center'; var lw = Math.ceil(hg.measureText(lab).width) + 12;
      hg.fillStyle = 'rgba(0,0,0,.66)'; hg.fillRect(160 - lw / 2, y0 - 16, lw, 13); hg.fillStyle = '#ffe9b0'; hg.fillText(lab, 160, y0 - 14); hg.textAlign = 'left'; hg.font = '9px ui-monospace, Menlo, Consolas, monospace'; }
  }
  // 体温的画面效果：中度失温起画面发灰（CSS 滤镜，只作用于游戏画面，不影响 HUD）；重度失温 / 失温结束：四周结霜、整体发灰蓝；
  // 中暑结束：画面发白 + 热浪（减少动态时不扭曲）；过热时 2D 画面也有轻微热浪
  var filt = '';
  function thermoVeil() {
    var st = P.stage, dc = P.die && P.die.kind === 'cold' ? Math.min(1, P.die.t / DIE_T) : -1, dh = P.die && P.die.kind === 'heat' ? Math.min(1, P.die.t / DIE_T) : -1;
    var cold = dc >= 0 || (P.layer === 'cold') ? 1 : st <= -3 ? 0.6 : st === -2 ? 0.35 : 0;
    var f = cold ? 'saturate(' + (1 - 0.45 * cold - (dc > 0 ? 0.35 * dc : 0)).toFixed(2) + ')' : '';
    if (f !== filt) { filt = f; canvas.style.filter = f; }
    var fr = dc >= 0 ? 0.5 + 0.5 * dc : st <= -3 ? 0.4 : 0;
    if (fr > 0 || (P.drown >= 0 && st <= -3)) { if (!fr) fr = 0.5;   // 霜：四周白蓝的边 + 像素冰晶；整体压一层灰蓝
      var g2 = hg.createRadialGradient(160, 120, 60, 160, 120, 200); g2.addColorStop(0, 'rgba(200,225,245,0)'); g2.addColorStop(1, 'rgba(215,236,255,' + (0.75 * fr).toFixed(3) + ')'); hg.fillStyle = g2; hg.fillRect(0, 0, 320, 240);
      hg.fillStyle = 'rgba(150,175,205,' + (0.22 * fr).toFixed(3) + ')'; hg.fillRect(0, 0, 320, 240);
      hg.fillStyle = 'rgba(240,250,255,' + (0.8 * fr).toFixed(3) + ')';
      for (var k = 0; k < 70; k++) { var hx = hash2(k, 3, 11), hy = hash2(k, 5, 13), side = k & 3, xx = side === 0 ? hx * 40 * fr : side === 1 ? 320 - hx * 40 * fr : hx * 320, yy = side === 2 ? hy * 30 * fr : side === 3 ? 240 - hy * 30 * fr : hy * 240;
        hg.fillRect(Math.round(xx), Math.round(yy), 2, 1); hg.fillRect(Math.round(xx) + 1, Math.round(yy) - 1, 1, 3); } }
    if (dh >= 0) { hg.fillStyle = 'rgba(255,250,235,' + (0.85 * dh * dh).toFixed(3) + ')'; hg.fillRect(0, 0, 320, 240);   // 中暑：画面慢慢发白
      var g3 = hg.createRadialGradient(160, 120, 40, 160, 120, 190); g3.addColorStop(0, 'rgba(255,200,140,0)'); g3.addColorStop(1, 'rgba(255,190,120,' + (0.5 * dh).toFixed(3) + ')'); hg.fillStyle = g3; hg.fillRect(0, 0, 320, 240); }
  }
  /* ---------- 结局：草原 + 悠然城区远景（白天 / 黄昏夜晚） ---------- */
  var endT = 0;
  /* 结局背景（静态部分预渲染）：天空 → 远山 → 雾 → 丘陵上的城区（刷怪塔、木屋、白色城墙）→ 雾 → 近处草原与城外木屋。
   * 距离雾：每一层按远近与雾色混合（白天偏白蓝，黄昏夜晚偏紫灰），远处只留轮廓，近处细节多。 */
  var endBg = null, endBgKey = '';
  function endBackground(night) {
    var cv = document.createElement('canvas'); cv.width = 320; cv.height = 240; var g = cv.getContext('2d'), k, x, y;
    var FOG = night ? [74, 70, 104] : [226, 236, 244];
    function mixc0(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
    function C(hex, f) { var c = rgb(hex); if (night) c = [c[0] * 0.42 + 6, c[1] * 0.44 + 8, c[2] * 0.55 + 22]; return mixc(c, FOG, f); }
    function R(x0, y0, w, h, col) { g.fillStyle = col; g.fillRect(x0, y0, w, h); }
    // 天空
    var sky = night ? ['#121731', '#2c2b55', '#8a5466'] : ['#7fbde8', '#b6dcf2', '#e6f0f6'];
    for (y = 0; y < 160; y++) { var u = y / 160; g.fillStyle = u < 0.62 ? mixc(rgb(sky[0]), rgb(sky[1]), u / 0.62) : mixc(rgb(sky[1]), rgb(sky[2]), (u - 0.62) / 0.38); g.fillRect(0, y, 320, 1); }
    if (night) { for (k = 0; k < 46; k++) R((hash2(k, 1, 3) * 320) | 0, (hash2(k, 2, 5) * 86) | 0, 1, 1, hash2(k, 3, 3) > 0.8 ? '#fff6d8' : '#cfd3e8');
      R(54, 20, 8, 12, '#efe9cf'); R(52, 22, 12, 8, '#efe9cf'); R(58, 21, 6, 9, sky[0]); R(57, 23, 7, 5, sky[0]); }
    else { R(38, 18, 14, 14, '#fff7cc'); R(36, 20, 18, 10, '#fff7cc'); R(40, 16, 10, 18, '#fff7cc'); }
    // 远山（雾 0.72，只有轮廓）
    for (x = 0; x < 320; x++) { var hh = 26 + 10 * Math.sin(x * 0.021 + 1) + 6 * Math.sin(x * 0.067) + 3 * Math.sin(x * 0.19); g.fillStyle = C('#5f7f74', 0.72); g.fillRect(x, 150 - hh, 1, hh); }
    for (y = 104; y < 150; y++) { g.fillStyle = 'rgba(' + FOG.join(',') + ',' + ((y - 104) / 46 * 0.55).toFixed(3) + ')'; g.fillRect(0, y, 320, 1); }
    // 丘陵：中间是城区所在的台地（地面 y=142），两侧起伏
    var CG = 142;
    for (x = 0; x < 320; x++) { var t2 = x < 34 ? (34 - x) / 34 : x > 300 ? (x - 300) / 20 : 0, top = CG - 4 * Math.sin(x * 0.05) * t2 - 9 * t2 + (x > 34 && x < 300 ? 0 : 0); g.fillStyle = C('#6f9a58', 0.42); g.fillRect(x, top, 1, 152 - top); }
    // 刷怪塔（最高）：细长石砖立柱一直到地面，顶上十字平台（侧看是宽横梁 + 朝向观者的一臂）
    var tx = 230, tw = 5, ttop = 38;
    R(tx, ttop, tw, CG - ttop, C('#8d8f93', 0.36)); R(tx + tw - 1, ttop, 1, CG - ttop, C('#6e7075', 0.36));
    for (y = ttop + 2; y < CG; y += 4) R(tx + ((y >> 2) & 1) * 2, y, 2, 1, C('#74767b', 0.36));
    R(tx - 22, ttop - 7, tw + 44, 6, C('#8d8f93', 0.36)); R(tx - 22, ttop - 2, tw + 44, 1, C('#5f6166', 0.36));          // 横梁（十字平台左右两臂）
    for (x = tx - 21; x < tx + tw + 22; x += 4) R(x, ttop - 5, 2, 1, C('#74767b', 0.36));
    R(tx - 4, ttop - 10, tw + 8, 4, C('#a3a6aa', 0.36)); R(tx - 4, ttop - 7, tw + 8, 1, C('#7d8085', 0.36));                // 朝向观者的一臂（透视下更短、更亮）
    R(tx - 22, ttop - 9, 2, 2, C('#8d8f93', 0.36)); R(tx + tw + 20, ttop - 9, 2, 2, C('#8d8f93', 0.36));                  // 平台边沿
    // 城内木屋（只露出屋顶与上层窗，雾 0.3）
    var inner = [[58, 14, 10, 0], [76, 18, 13, 1], [100, 13, 9, 0], [118, 16, 14, 1], [172, 15, 11, 0], [192, 20, 12, 1], [250, 14, 10, 0], [268, 17, 13, 1]];
    inner.forEach(function (h, i) { house(h[0], CG - 8, h[1], h[2], h[3], 0.3, i, false); });
    // 白色城墙：墙段高低起伏、墙垛、角楼、城门
    var segs = [[40, 13], [70, 12], [100, 13], [130, 12], [148, 0], [172, 12], [205, 13], [240, 12], [270, 13], [300, 0]];
    for (k = 0; k + 1 < segs.length; k++) {
      var x0 = segs[k][0], x1 = segs[k + 1][0], ht = segs[k][1]; if (!ht) continue;
      R(x0, CG - ht, x1 - x0, ht, C('#f3f1ea', 0.26)); R(x0, CG - 2, x1 - x0, 2, C('#cdc8bd', 0.26));
      for (y = CG - ht + 3; y < CG - 2; y += 4) for (x = x0 + ((y >> 2) & 1) * 3; x < x1 - 1; x += 7) R(x, y, 4, 1, C('#dedad0', 0.26));
      for (x = x0; x < x1 - 1; x += 5) R(x, CG - ht - 3, 3, 3, C('#f3f1ea', 0.26));
    }
    [[38, 20], [128, 18], [203, 19], [298, 20]].forEach(function (b) {   // 角楼
      R(b[0], CG - b[1], 8, b[1], C('#ebe8df', 0.26)); for (x = b[0]; x < b[0] + 8; x += 3) R(x, CG - b[1] - 3, 2, 3, C('#ebe8df', 0.26));
      R(b[0] + 3, CG - b[1] + 5, 2, 3, C('#5a5560', 0.26));
    });
    R(146, CG - 20, 28, 20, C('#ebe8df', 0.26)); for (x = 146; x < 174; x += 4) R(x, CG - 23, 3, 3, C('#ebe8df', 0.26));   // 城楼
    R(154, CG - 11, 12, 11, C('#3d3632', 0.26)); R(155, CG - 13, 10, 2, C('#3d3632', 0.26)); R(157, CG - 14, 6, 1, C('#3d3632', 0.26));   // 拱门
    R(156, CG - 10, 4, 10, C('#7a4f2c', 0.26)); R(160, CG - 10, 4, 10, C('#6b4426', 0.26));
    for (y = 134; y < 156; y++) { g.fillStyle = 'rgba(' + FOG.join(',') + ',' + (0.22 * (1 - Math.abs(y - 146) / 12)).toFixed(3) + ')'; g.fillRect(0, y, 320, 1); }   // 城脚的薄雾
    // 近处草原
    for (y = 148; y < 240; y++) { var v = (y - 148) / 92, gb = mixc0(rgb('#7cbc58'), rgb('#5aa343'), v); if (night) gb = [gb[0] * 0.42 + 6, gb[1] * 0.44 + 8, gb[2] * 0.55 + 22]; g.fillStyle = mixc(gb, FOG, 0.16 * (1 - v)); g.fillRect(0, y, 320, 1); }
    for (k = 0; k < 220; k++) { var gy = 150 + ((hash2(k, 4, 1) * 90) | 0); R((hash2(k, 3, 7) * 320) | 0, gy, gy > 190 ? 2 : 1, 1, C('#4b9339', 0.15 * (1 - (gy - 150) / 90))); }
    for (k = 0; k < 18; k++) R((hash2(k, 5, 2) * 320) | 0, 168 + ((hash2(k, 6, 2) * 70) | 0), 1, 1, C(hash2(k, 7, 2) > 0.5 ? '#f3e35a' : '#f5f0f0', 0.05));
    // 城外木屋（近处、细节多：坡屋顶、门、窗、烟囱、栅栏）
    house(14, 176, 30, 16, 1, 0.06, 20, true); house(268, 172, 26, 14, 0, 0.08, 21, true);
    for (x = 4; x < 58; x += 4) { R(x, 170, 1, 7, C('#8a5d34', 0.06)); } R(4, 172, 54, 1, C('#a8754a', 0.06)); R(4, 175, 54, 1, C('#a8754a', 0.06));
    return cv;
    function house(hx, base, w, h, tall, f, seed, near) {
      var top = base - h, roofH = Math.round(w / 2.2);
      R(hx, top, w, h, C('#a87444', f)); R(hx, top, 2, h, C('#6e4526', f)); R(hx + w - 2, top, 2, h, C('#6e4526', f));
      if (near) for (y = top + 2; y < base; y += 3) R(hx + 2, y, w - 4, 1, C('#94653a', f));
      for (k = 0; k < roofH; k++) R(hx - 2 + k, top - k - 1, w + 4 - k * 2, 1, C(k === 0 ? '#5e2f1c' : '#7a3f26', f));
      if (near) for (k = 1; k < roofH; k += 2) R(hx - 1 + k, top - k - 1, w + 2 - k * 2, 1, C('#8a4a2c', f));
      var ch = hx + w - 7; R(ch, top - roofH + 1, 3, roofH - 1, C('#7d7a76', f)); R(ch - 1, top - roofH, 5, 1, C('#5f5c58', f));   // 烟囱
      var rows = tall ? 2 : 1, wy;
      for (var r2 = 0; r2 < rows; r2++) { wy = top + 3 + r2 * Math.max(5, (h - 6) / rows); for (x = hx + 4; x < hx + w - 6; x += 8) { var lit = night && hash2(seed * 7 + x, r2, 9) > 0.45; R(x, wy | 0, 4, 4, C('#4a3020', f)); R(x + 1, (wy | 0) + 1, 2, 2, lit ? '#ffd36a' : C(night ? '#2b2740' : '#bfe0ee', f)); } }
      if (near) { var dx = hx + (w >> 1) - 2; R(dx, base - 7, 5, 7, C('#5a3a20', f)); R(dx + 3, base - 4, 1, 1, C('#d8c070', f)); }
      if (near && night) { g.fillStyle = 'rgba(255,200,90,.18)'; g.fillRect(hx - 2, top - 2, w + 4, h + 4); }
    }
  }
  /* 出口序列：爬出井口后从井口附近（Z0 倍）拉远到整幅草原（PULL 秒），之后结算面板才淡入；减少动态时直接整幅、面板立即出现 */
  var PULL = 2.4, Z0 = 3.2, endOff = null;
  function drawEnding(dt) {
    endT += dt || 0;
    if (filt) { filt = ''; canvas.style.filter = ''; }
    if (is3D) { var gl = R.gl; gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); } else { R.g.fillStyle = '#000'; R.g.fillRect(0, 0, VW, VH); }
    var night = themeName === 'dark', k;
    if (endBgKey !== themeName) { endBg = endBackground(night); endBgKey = themeName; }
    if (!endOff) { endOff = document.createElement('canvas'); endOff.width = 320; endOff.height = 240; }
    var g = endOff.getContext('2d');
    g.drawImage(endBg, 0, 0);
    if (!night && !rm) { g.fillStyle = 'rgba(255,255,255,.9)'; for (k = 0; k < 3; k++) { var cx = ((k * 120 + endT * 3) % 380) - 40; g.fillRect(cx | 0, 34 + k * 13, 30, 5); g.fillRect((cx + 6) | 0, 31 + k * 13, 16, 3); } }
    var tt = rm ? 0 : endT;   // 烟囱的烟（城外木屋）
    g.fillStyle = night ? 'rgba(180,180,200,.35)' : 'rgba(240,240,240,.7)';
    [[38, 149], [282, 147]].forEach(function (c, i) { for (k = 0; k < 4; k++) { var ph = (tt * 0.5 + k / 4 + i * 0.3) % 1; g.fillRect(c[0] + Math.round(Math.sin(ph * 6 + i) * 2 + ph * 6), c[1] - Math.round(ph * 16), 3, 2); } });
    R2(150, 200, 16, 10, '#1a1714'); R2(153, 200, 2, 10, '#6b4a2b'); R2(161, 200, 2, 10, '#6b4a2b'); R2(153, 202, 10, 2, '#8b6338'); R2(153, 206, 10, 2, '#8b6338');   // 竖井口
    R2(148, 199, 20, 1, night ? '#2f4a2a' : '#4f8a34');
    side(g, 172, 202 - Math.round(Math.min(1, endT / 0.6) * 6));
    // 镜头：先在井口停 0.35 s，再平滑拉远到整幅
    var u = rm ? 1 : Math.max(0, Math.min(1, (endT - 0.35) / (PULL - 0.35))), e = u * u * (3 - 2 * u), sc2 = 1 + (Z0 - 1) * (1 - e);
    var fx = 164 + (160 - 164) * e, fy = 194 + (120 - 194) * e, sw = 320 / sc2, sh = 240 / sc2;
    var sx = Math.max(0, Math.min(320 - sw, fx - sw / 2)), sy = Math.max(0, Math.min(240 - sh, fy - sh / 2));
    hg.imageSmoothingEnabled = false; hg.drawImage(endOff, sx, sy, sw, sh, 0, 0, 320, 240);
    var a = rm ? 0 : 0.5 * Math.max(0, 1 - endT / 0.2); if (a > 0) { hg.fillStyle = night ? 'rgba(44,43,85,' + a.toFixed(3) + ')' : 'rgba(182,220,242,' + a.toFixed(3) + ')'; hg.fillRect(0, 0, 320, 240); }   // 从竖井里的天光淡入
    if (endPending && endT >= PULL + 0.15) { var go = endPending; endPending = null; go(); }
    function R2(x, y, w, h, c) { g.fillStyle = c; g.fillRect(x, y, w, h); }
  }
  // 最后一段竖井（3D）：天空远景贴图。渲染器在定好镜头后回调，按地表（井口地面，y = 最上层坑底 + 9）在画布上的高度把远景的地平线（第 148 行）对齐上去
  var skyCv = null;
  function skyFor(projY) {
    if (!skyCv) { skyCv = document.createElement('canvas'); skyCv.width = 320; skyCv.height = 240; }
    if (endBgKey !== themeName) { endBg = endBackground(themeName === 'dark'); endBgKey = themeName; }
    var surfY = projY(lv.ladder.x + 0.5, C.levelBase(sc.level) + 9, lv.ladder.z + 0.5) / canvas.height * 240;
    var g = skyCv.getContext('2d'); g.fillStyle = themeName === 'dark' ? '#121731' : '#7fbde8'; g.fillRect(0, 0, 320, 240); g.drawImage(endBg, 0, Math.round(surfY - 148));
    return skyCv;
  }
  /* ---------- 结算面板 ---------- */
  var endShown = false, endPending = null, endReady = false;   // endReady：结算面板已淡入（结束动画播完），此后才接受开新局的按键
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function showEnd() {
    if (endShown) return; endShown = true;
    var won = P.won, best = host.storage.get(bestKey), nextHref = typeof host.href === 'function' ? host.href(1) : null;
    // 文案一律作为文本插入：先建好结构，再用 textContent / setAttribute 填字（不把文案放进 innerHTML）
    var el = function (tag, cls, text, attrs) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]); return e; };
    var title = tx(won ? 'end.title_win' : 'end.title_lose');
    var cause = tx(won ? 'end.cause_win' : { lava: 'end.cause_lava', cold: 'end.cause_cold', heat: 'end.cause_heat', suffocate: 'end.cause_suffocate', drown: P.layer === 'cold' ? 'end.cause_drown_cold' : 'end.cause_drown' }[P.cause] || (P.layer === 'cold' ? 'end.cause_drown_cold' : 'end.cause_water'));
    // 体温（只显示，不计分）：偏离正常更多的一侧——最低体温或最高体温
    var tlo = 37 - P.th.min, thi = P.th.max - 37, tMin = tlo >= thi, tVal = (tMin ? P.th.min : P.th.max).toFixed(1);
    var levels = won ? M.levels.length : sc.level;
    var hearts = Math.ceil(P.minHp / 2), nBeacon = Object.keys(P.seen).length, sc0 = won ? P.score : null;
    var bestTxt = best != null ? tx('end.seconds', { t: best.toFixed(1) }) : tx('end.none');
    var newRec = function () { var e = el('span', 'egg-breach-nr', tx('end.new_record')); e.insertAdjacentHTML('beforeend', '<i style="left:-5px;top:-5px"></i><i style="right:-5px;top:-4px;animation-delay:.3s"></i><i style="right:6px;bottom:-6px;animation-delay:.6s"></i><i style="left:8px;bottom:-5px;animation-delay:.9s"></i>'); return e; };   // 闪光点只是装饰元素，不含文字
    endEl.setAttribute('data-t', themeName); endEl.classList.toggle('rm', rm);
    endEl.textContent = '';
    var eh = el('div', 'egg-breach-eh'); eh.append(el('span', 'egg-breach-ei', null, { style: 'background:' + (won ? '#6fcf5a' : P.cause === 'cold' ? '#9cc8f0' : P.cause === 'heat' ? '#f0a040' : P.cause === 'suffocate' ? '#8a8580' : neg ? '#3d7fd0' : '#e8622a') }), el('span', 'egg-breach-et', title, { id: 'egg-breach-et' }), el('span', 'egg-breach-ec', cause));
    endEl.append(eh);
    if (sc0) {   // 胜利且计分：总分 + 评级，下面逐行列出各项系数（时间、生命、掉坑、奇怪的石头、难度）
      var extra = Math.max(0, P.pits - ideal.pits);
      var rows = [['score_row.time', tx('score_row.time_note', { time: gameTime.toFixed(1), ideal: ideal.T.toFixed(1) }), sc0.Ft], ['score_row.hp', tx('score_row.hp_note', { hearts: hearts }), sc0.Fh],
        ['score_row.pits', (extra ? tx('score_row.pits_extra', { n: extra }) : tx('score_row.pits_none')) + (P.drops ? tx('score_row.pits_drops', { n: P.drops }) : ''), sc0.Fp],
        ['score_row.stones', tx('score_row.stones_note', { n: P.stones }), sc0.Fo], ['score_row.diff', tx('score_row.diff_note', { d: d + 1, total: C.P_D }), sc0.Fd]];
      var tm = el('div', 'egg-breach-tm'); tm.append(el('span', 'egg-breach-big egg-breach-score', C.fmtScore(sc0.S), { 'data-v': sc0.S }), el('span', 'egg-breach-grade', tx('grade.' + sc0.grade), { 'data-g': sc0.grade })); if (P.scoreNew) tm.append(newRec());
      var br = el('div', 'egg-breach-br');
      rows.forEach(function (r, k) { var ri = el('div', 'egg-breach-bri' + (k === 4 ? ' egg-breach-stamp' : '')); ri.append(el('span', null, tx(r[0])), el('em', null, r[1]), el('b', null, tx('score_row.factor', { f: r[2].toFixed(2) }), { 'data-v': r[2].toFixed(4) })); br.append(ri); });
      endEl.append(tm, el('div', 'egg-breach-best', P.prevScore && !P.scoreNew ? tx('end.time_line_score', { time: gameTime.toFixed(1), best: bestTxt, score: C.fmtScore(P.prevScore.s) }) : tx('end.time_line', { time: gameTime.toFixed(1), best: bestTxt })),
        el('div', 'egg-breach-best egg-breach-tp', tx(tMin ? 'end.temp_min' : 'end.temp_max', { temp: tVal })), br);
    } else {
      var stats = [['stat.levels', tx('stat.levels_v', { n: levels, total: M.levels.length })], ['stat.min_hp', tx('stat.min_hp_v', { n: hearts })], ['stat.pits', P.drops ? tx('stat.pits_v_drops', { n: P.pits, drops: P.drops }) : tx('stat.pits_v', { n: P.pits })], ['stat.beacons', tx('stat.beacons_v', { n: nBeacon })],
        P.wetT > 0.05 ? [neg ? 'stat.soaked_water' : 'stat.soaked_lava', tx('stat.soaked_v', { sec: P.wetT.toFixed(1) })] : [neg ? 'stat.nearest_water' : 'stat.nearest_lava', P.near < 98 ? tx('stat.nearest_v', { d: P.near.toFixed(1) }) : tx('stat.nearest_never')],
        ['stat.stones', tx('stat.stones_v', { n: P.stones })], [tMin ? 'stat.temp_min' : 'stat.temp_max', tx('stat.temp_v', { temp: tVal })]];
      var tm2 = el('div', 'egg-breach-tm'); tm2.append(el('span', 'egg-breach-big', tx('end.seconds', { t: gameTime.toFixed(1) })), el('span', 'egg-breach-best', tx('end.best_time', { best: bestTxt }))); if (won && P.newRec) tm2.append(newRec());
      var stEl = el('div', 'egg-breach-st');
      stats.forEach(function (r, k) { var di = el('div', k === stats.length - 1 ? 'egg-breach-tp' : null); di.append(el('span', null, tx(r[0])), el('b', null, r[1])); stEl.append(di); });
      endEl.append(tm2, stEl);
    }
    var ev = el('div', 'egg-breach-ev'); if (P.lagMax > 0.1) ev.append(el('span', 'egg-breach-lag', tx('end.lag', { sec: P.lagMax.toFixed(3) })));
    // 版本行：画面模式（3D / 2D）单独包一层（测试与样式用）
    var verKey = tx('end.version', { n: host.n, d: d + 1, total: C.P_D, view: '\u0000' }).split('\u0000'), ver = el('span'); ver.append(verKey[0], el('b', 'egg-breach-view', P.view), verKey.slice(1).join(P.view)); ev.append(ver);
    var eb = el('div', 'egg-breach-eb'), again = el('button', 'button ' + (won && nextHref ? 'secondary' : 'primary'), tx('end.again'), { type: 'button', 'data-a': 'again' }), next = el('a', 'button ' + (won ? 'primary' : 'secondary'), tx('end.next'), { 'data-a': 'next' });
    if (nextHref) next.setAttribute('href', nextHref); else next.hidden = true;
    eb.append(again, next); if (won) eb.append(el('button', 'button secondary egg-breach-share', tx('end.share'), { type: 'button', 'data-a': 'share' }));
    var toastEl = el('div', 'egg-breach-toast', null, { role: 'status', 'aria-live': 'polite' }); toastEl.hidden = true;
    endEl.append(ev, eb, toastEl);
    endEl.querySelector('[data-a=again]').addEventListener('click', function () { if (scoreAnim) { finishScoreAnim(); return; } startPlay(); });
    if (won) endEl.querySelector('[data-a=share]').addEventListener('click', function () { if (scoreAnim) finishScoreAnim(); doShare(); });
    var focusMain = function () { var f = endEl.querySelector(won && nextHref ? '[data-a=next]' : '[data-a=again]'); try { f.focus({ preventScroll: true }); } catch (e) {} };
    // 面板在淡入那一刻才占位（窄屏时它在舞台下方，提前显示会在拉远镜头期间留出一大块空白）
    var go = function () {
      endEl.hidden = false; void endEl.offsetWidth; endEl.classList.add('on');
      if (sc0 && !rm) { startScoreAnim(function () { endReady = true; focusMain(); }); }   // 计分动画播完（或被跳过）才接受开新局
      else { endReady = true; focusMain(); }
    };
    // 胜利：等镜头拉远结束（结局画面里 endT ≥ PULL）再淡入；万一画面不再刷新（页面隐藏等），按墙钟兜底
    if (rm) go(); else if (!won) setTimeout(go, 250);
    else { endPending = go; setTimeout(function () { if (endPending === go) { endPending = null; go(); } }, PULL * 1000 + 900); }
  }
  /* ---------- 分享（只在胜利面板上；只由用户点击触发，不自动分享；不联网、不用外部库） ----------
   * 链接从零拼出，绝不取 location.href / pathname / search / hash：
   *   origin = 正式站点；本地预览等其他来源只在 location.origin 形如 http(s)://主机[:端口] 时才用，否则仍用正式站点
   *   path   = '/v' + N，N 为宿主规范化后的版本号，再用 /^-?\d{1,4096}$/ 校验（不合格 → 不带链接）；整条链接超过 2000 字符也不带
   * 卡片上的字全部用 fillText 画；提示用 textContent。 */
  var PROD_ORIGIN = 'https://youran.qingu.moe';
  function shareLink(n, origin) {
    n = String(n == null ? '' : n); if (!/^-?\d{1,4096}$/.test(n)) return null;
    var o = origin === PROD_ORIGIN ? PROD_ORIGIN : /^https?:\/\/[a-z0-9.-]+(:\d+)?$/i.test(String(origin || '')) ? String(origin) : PROD_ORIGIN;
    var u = o + '/v' + n; return u.length <= 2000 ? u : null;
  }
  function shortN(n) { n = String(n); return n.length > 14 ? n.slice(0, 7) + '…' + n.slice(-4) : n; }
  function shareText(url) {
    var sc0 = P.score, n = /^-?\d{1,4096}$/.test(String(host.n)) ? shortN(host.n) : '?';
    var core = sc0 ? tx('share.text_score', { n: n, d: d + 1, total: C.P_D, view: P.view, score: C.fmtScore(sc0.S), grade: tx('grade.' + sc0.grade), stones: P.stones | 0 })
      : tx('share.text_time', { n: n, d: d + 1, total: C.P_D, view: P.view, time: gameTime.toFixed(1), stones: P.stones | 0 });
    return url ? tx('share.text_url', { text: core, url: url }) : core;
  }
  // 分享卡片：1080×1350（4:5，聊天软件里竖着看最合适）。上面是结局画面（直接取结局的 320×240 离屏画布按整数倍放大），下面是像素风战绩面板
  function shareCard(url) {
    var W2 = 1080, H2 = 1350, cv = document.createElement('canvas'); cv.width = W2; cv.height = H2; var g = cv.getContext('2d'), dark = themeName === 'dark';
    var title = gameName();
    g.imageSmoothingEnabled = false; g.fillStyle = '#000'; g.fillRect(0, 0, W2, H2);
    if (!endOff) drawEnding(0);
    g.drawImage(endOff, 0, 0, 320, 240, 0, 0, W2, 810);
    var C1 = dark ? '#18150f' : '#faf6ec', C2 = dark ? '#f2ede4' : '#2a241d', C3 = dark ? '#a59c90' : '#6b6156';
    g.fillStyle = dark ? '#0f0d0b' : '#3b3128'; g.fillRect(0, 810, W2, H2 - 810);
    g.fillStyle = C1; g.fillRect(12, 822, W2 - 24, H2 - 834);
    g.fillStyle = dark ? '#6b5f52' : '#c9b89a'; g.fillRect(24, 834, W2 - 48, 6); g.fillRect(24, H2 - 30, W2 - 48, 6); g.fillRect(24, 834, 6, H2 - 858); g.fillRect(W2 - 30, 834, 6, H2 - 858);
    var font = function (w, px, mono) { g.font = w + ' ' + px + 'px ' + (mono ? 'ui-monospace, Menlo, Consolas, monospace' : 'system-ui, sans-serif'); };
    g.textBaseline = 'alphabetic'; g.textAlign = 'left';
    g.fillStyle = '#6fcf5a'; g.fillRect(60, 878, 34, 34); g.fillStyle = C2; font('800', 44, false); g.fillText(title, 112, 912);
    font('600', 30, true); g.fillStyle = C3; var n = /^-?\d{1,4096}$/.test(String(host.n)) ? shortN(host.n) : '?';
    g.textAlign = 'right'; g.fillText(tx('share.card_version', { n: n, d: d + 1, total: C.P_D, view: P.view }), W2 - 60, 912); g.textAlign = 'left';
    var sc0 = P.score, y = 1030;
    if (sc0) { font('900', 112, true); g.fillStyle = C2; g.fillText(C.fmtScore(sc0.S), 60, y); var sw = g.measureText(C.fmtScore(sc0.S)).width;
      var GC = { S: ['#ffd34d', '#7a5200'], A: ['#9fe07a', '#2f6b1d'], B: ['#8fc8f0', '#24597e'], C: ['#c9c2b8', '#5d554b'] }[sc0.grade];
      g.fillStyle = GC[1]; g.fillRect(80 + sw, y - 92, 100, 100); g.fillStyle = GC[0]; g.fillRect(86 + sw, y - 86, 88, 88); g.fillStyle = '#1b1406'; font('900', 72, true); g.textAlign = 'center'; g.fillText(tx('grade.' + sc0.grade), 130 + sw, y - 16); g.textAlign = 'left'; }
    else { font('900', 96, true); g.fillStyle = C2; g.fillText(tx('end.seconds', { t: gameTime.toFixed(1) }), 60, y); }
    font('500', 38, false); g.fillStyle = C2;
    var lines = [tx('share.card_time', { time: gameTime.toFixed(1) }), tx('share.card_hp', { hearts: Math.ceil(Math.max(0, P.minHp) / 2) })];
    g.fillText(lines[0], 60, 1110); g.fillText(lines[1], 420, 1110);
    stoneIconBig(g, 60, 1134, 4); g.fillStyle = C2; g.fillText(tx('share.card_stones', { n: P.stones | 0 }), 120, 1168);
    var yy = 1222; if (P.lagMax > 0.1) { font('500', 30, true); g.fillStyle = C3; g.fillText(tx('share.card_lag', { sec: P.lagMax.toFixed(3) }), 60, yy); yy += 48; }
    if (url) { font('600', 32, true); g.fillStyle = C3; var shown = url.length > 52 ? url.slice(0, 40) + '…' + url.slice(-10) : url; g.fillText(shown, 60, Math.max(yy, 1272)); }
    return cv;
  }
  function stoneIconBig(g, x, y, k) { for (var j = 0; j < STONE_PX.length; j++) { g.fillStyle = STONE_PX[j][2]; g.fillRect(x + STONE_PX[j][0] * k, y + STONE_PX[j][1] * k, k, k); } }
  function toast(msg) { var t = endEl.querySelector('.egg-breach-toast'); if (!t) return; t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { t.hidden = true; }, 2600); }
  function download(blob, name) { var a = document.createElement('a'), u = URL.createObjectURL(blob); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 4000); }
  function doShare() {
    var url = shareLink(host.n, location.origin), text = shareText(url), title = tx('share.title', { name: gameName() });
    var cv = shareCard(url);
    cv.toBlob(function (blob) {
      if (!blob) { toast(tx('share.toast_image_fail')); return; }
      var name = 'breach-share.png', file = null; try { file = new File([blob], name, { type: 'image/png' }); } catch (e) {}
      var data = { title: title, text: text }; if (url) data.url = url;
      var quiet = function (e) { if (!e || e.name !== 'AbortError') toast(tx('share.toast_fail')); };
      if (file && navigator.canShare && navigator.share) { var df = { files: [file], title: title, text: text }; if (url) df.url = url;
        var can = false; try { can = navigator.canShare(df); } catch (e) {}
        if (can) { navigator.share(df).catch(quiet); return; } }
      if (navigator.share) { navigator.share(data).catch(quiet); download(blob, name); return; }   // 能分享文字、不能带图：分享文字 + 链接，图片另外下载
      download(blob, name);
      var ok2 = function () { toast(tx(url ? 'share.toast_link' : 'share.toast_text')); }, bad = function () { toast(tx('share.toast_copy_fail')); };
      try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok2, bad); else bad(); } catch (e) { bad(); }
    }, 'image/png');
  }
  /* 计分动画：各行依次出现、系数从 ×1.00 数到最终值（上升的提示音），难度一行最后"盖章"，总分滚动上去，评级弹出。
   * 任何按键 / 点击都直接跳到最终值（不会开新局）；减少动态时直接显示最终值。 */
  var scoreAnim = null, skippedAt = -1e9;
  // 在面板上点一下也只是跳过动画：吞掉随后的那次 click（否则会落到"再来一次" / "下一张图"上）
  endEl.addEventListener('pointerdown', function () { if (scoreAnim) { finishScoreAnim(); skippedAt = performance.now(); } }, { capture: true, signal: signal });
  endEl.addEventListener('click', function (e) { if (performance.now() - skippedAt < 600) { e.preventDefault(); e.stopPropagation(); } }, { capture: true, signal: signal });
  function startScoreAnim(done) {
    var rowsEl = endEl.querySelectorAll('.egg-breach-bri'), totEl = endEl.querySelector('.egg-breach-score'), grEl = endEl.querySelector('.egg-breach-grade'), nrEl = endEl.querySelector('.egg-breach-nr');
    var total = +totEl.getAttribute('data-v'), t0 = performance.now(), STEP = 380, ROLL = 700, n = rowsEl.length, lastK = -1;
    endEl.classList.add('anim'); totEl.textContent = '0'; if (grEl) grEl.classList.add('wait'); if (nrEl) nrEl.classList.add('wait');
    rowsEl.forEach(function (r) { r.classList.add('wait'); });
    scoreAnim = { done: done, raf: 0 };
    var stepF = function () {
      if (!scoreAnim) return;
      var e = performance.now() - t0, k = Math.min(n, Math.floor(e / STEP));
      for (var j = 0; j < n; j++) {
        var rr = rowsEl[j], b2 = rr.querySelector('b'), v = +b2.getAttribute('data-v');
        if (j < k || (j === k && k < n)) { rr.classList.remove('wait'); var u = j < k ? 1 : Math.min(1, (e - j * STEP) / (STEP * 0.8)); b2.textContent = tx('score_row.factor', { f: (1 + (v - 1) * u).toFixed(2) }); }
      }
      if (k !== lastK && k < n) { lastK = k; SND.tally(k); }
      var eT = e - n * STEP;
      if (eT >= 0) { var u2 = Math.min(1, eT / ROLL); totEl.textContent = C.fmtScore(total * (1 - Math.pow(1 - u2, 3))); if (u2 >= 1) { finishScoreAnim(); return; } }
      scoreAnim.raf = requestAnimationFrame(stepF);
    };
    scoreAnim.raf = requestAnimationFrame(stepF);
  }
  function finishScoreAnim() {
    if (!scoreAnim) return; var a = scoreAnim; scoreAnim = null; cancelAnimationFrame(a.raf);
    endEl.querySelectorAll('.egg-breach-bri').forEach(function (r) { r.classList.remove('wait'); var b2 = r.querySelector('b'); b2.textContent = tx('score_row.factor', { f: (+b2.getAttribute('data-v')).toFixed(2) }); });
    var totEl = endEl.querySelector('.egg-breach-score'); if (totEl) totEl.textContent = C.fmtScore(+totEl.getAttribute('data-v'));
    endEl.querySelectorAll('.wait').forEach(function (x) { x.classList.remove('wait'); }); endEl.classList.remove('anim'); endEl.classList.add('done');
    SND.grade(); a.done();
  }
  function hideEnd() { if (scoreAnim) { cancelAnimationFrame(scoreAnim.raf); scoreAnim = null; } endReady = false; endPending = null; endShown = false; endEl.hidden = true; endEl.classList.remove('on'); endEl.innerHTML = ''; }
  function ui() {
    if (state === 'over' && P) showEnd(); else if (endShown) hideEnd();
    if (typeof syncAct === 'function' && actBtn) syncAct();
    btn.textContent = tx(state === 'over' ? 'button.again' : state === 'pause' ? 'button.resume' : 'button.start');
    btn.hidden = state === 'run' || state === 'climb' || state === 'over';
    btn.disabled = state === 'prep';
    var best = host.storage.get(bestKey);
    info.textContent = best != null ? tx('info.time_best', { time: gameTime.toFixed(1), best: best.toFixed(1) }) : tx('info.time', { time: gameTime.toFixed(1) });
  }
  /* ---------- 尺寸 ---------- */
  var RES = +((/[?&]egg-res=([\d.]+)/.exec(qs) || [])[1] || 0.5);   // 3D 内部分辨率（相对 CSS 像素 × DPR），像素风放大
  function resize() {
    // 用画布的内容尺寸（不含舞台边框）；DPR > 2 时取整数倍的设备像素 / 内部像素，避免非整数放大造成的像素宽窄不一
    var dpr = window.devicePixelRatio || 1, cr = canvas.getBoundingClientRect(), cw = cr.width || stage.clientWidth, ch = cr.height || stage.clientHeight;
    var hw = Math.max(64, Math.round(cw * dpr)), hh = Math.max(48, Math.round(ch * dpr)), redraw = false;
    if (hud.width !== hw || hud.height !== hh) { hud.width = hw; hud.height = hh; redraw = true; }
    hg.setTransform(hw / 320, 0, 0, hh / 240, 0, 0); hg.imageSmoothingEnabled = false;
    if (is3D) {
      var per = Math.max(1, Math.round(dpr / (RES * Math.min(dpr, 2)))), w = Math.max(64, Math.round(cw * dpr / per)), h = Math.max(48, Math.round(ch * dpr / per));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; redraw = true; }
    }
    if (redraw && !raf) draw(0);
  }
  if (typeof ResizeObserver !== 'undefined') { var ro = new ResizeObserver(resize); ro.observe(stage); signal.addEventListener('abort', function () { ro.disconnect(); }); }
  window.addEventListener('resize', resize, { signal: signal });   // 缩放页面时 DPR 变化、尺寸可能不变
  resize();
  /* ---------- 主循环：固定步长 + 累加器；只在进行中且页面可见时运行 ---------- */
  function frame(ts) {
    raf = 0;
    if (state !== 'run' && state !== 'climb' && !(state === 'over' && P.won && (endT < PULL + 0.8 || (host.audio && host.audio.enabled() && endT < 40)))) { draw(0); sound(0); return; }
    var dt = lastTs ? Math.min(0.1, (ts - lastTs) / 1000) : 0; lastTs = ts;
    var w0 = performance.now();
    advance(dt);
    if (frameLog && frameLog.length && dt) frameLog[frameLog.length - 1][6] = performance.now() - w0;
    raf = requestAnimationFrame(frame);
  }
  function advance(dt) {
    acc += dt;
    while (acc >= STEP && (state === 'run' || state === 'climb')) { update(STEP); acc -= STEP; }
    if (state === 'run' || state === 'climb') { be.run(Math.floor(gameTime * PC.tps)); var lag = gameTime - sc.tick / PC.tps; if (lag > P.lagMax) P.lagMax = lag; }   // 流体落后游戏时间的最大值（结算面板提示用）
    draw(dt);
    sound(dt);
    syncAct();
    if (((gameTime * 10) | 0) !== (((gameTime - dt) * 10) | 0) || state === 'over') ui();
  }
  /* ---------- 音效状态（与画面同一份模拟数据） ---------- */
  var RX = 0.8776, RZ = -0.4794;   // 屏幕“右”方向（3D 镜头偏航 0.5；2D 时为 +x）
  function panOf(dx, dz) { var L = Math.sqrt(dx * dx + dz * dz) || 1; return is3D ? (dx * RX + dz * RZ) / L : dx / L; }
  var chatT = 0, chatK = 0, ringT = 0;
  function sound(dt) {
    if (!host.audio) return;
    snd.mode = state === 'over' ? (P && P.won ? 'end' : 'dead') : state === 'climb' ? 'climb' : state;
    if (state === 'over' && P.won && endT >= 40) snd.mode = 'dead';   // 草原声景 40 秒后淡出释放
    snd.time = state === 'over' ? endT : gameTime; snd.buff = P ? P.buff : 0;
    if (state === 'run' || state === 'climb') {
      var b = base(), px = Math.floor(P.x), pz = Math.floor(P.z);
      sndT -= dt;
      if (sndT <= 0) {   // 每 0.2 s：最近的流体、进水量、风、预警、火把
        sndT = 0.2;
        var best = 99, bx = 0, bz = 0, flow = 0, fx = 0, fz = 0, tor = 9, F = sc.field;
        for (var z = Math.max(0, pz - 12); z <= Math.min(M.H - 1, pz + 12); z++) for (var x = Math.max(0, px - 12); x <= Math.min(W - 1, px + 12); x++) {
          if (!lv.t[z * W + x]) continue;
          var c = sc.idx(x, b, z), d2 = Math.sqrt((x + 0.5 - P.x) * (x + 0.5 - P.x) + (z + 0.5 - P.z) * (z + 0.5 - P.z));
          if (sc.mat[c] === sc.fluid || sc.mat[c + sc.XZ] === sc.fluid || sc.mat[c + 2 * sc.XZ] === sc.fluid) { if (d2 < best) { best = d2; bx = x + 0.5 - P.x; bz = z + 0.5 - P.z; } }
          if (sc.mat[c + sc.XZ] === M_TORCH && d2 < tor) tor = d2;
          if (F && neg && d2 < 7 && F.heat[z * W + x] > 0) { flow += F.heat[z * W + x]; fx += (x - px) * F.heat[z * W + x]; fz += (z - pz) * F.heat[z * W + x]; }
        }
        snd.near = best; snd.nearPan = best < 99 ? panOf(bx, bz) * Math.min(1, best / 2) : 0; snd.torch = tor;
        snd.flow = flow / 12; snd.flowPan = flow ? panOf(fx, fz) * 0.7 : 0;
        if (F && F.max > 0 && F.dir[pz * W + px] >= 0) { var dd = F.dir[pz * W + px]; snd.wind = Math.sqrt(F.wind[pz * W + px] / F.max) * 1.4; snd.windPan = panOf(dd === 0 ? 1 : dd === 1 ? -1 : 0, dd === 2 ? 1 : dd === 3 ? -1 : 0) * 0.6; } else snd.wind = 0;
        var wp = 0, wpan = 0;
        for (var k = 0; k < warn.length; k++) { var w = warn[k], dw = Math.sqrt((w.x + 0.5 - P.x) * (w.x + 0.5 - P.x) + (w.z + 0.5 - P.z) * (w.z + 0.5 - P.z)), v = w.p * Math.max(0, 1 - dw / 10); if (v > wp) { wp = v; wpan = panOf(w.x + 0.5 - P.x, w.z + 0.5 - P.z) * Math.min(1, dw / 2); } }
        snd.warn = wp; snd.warnPan = wpan;
      }
      var fd = body(px, pz, P.y);
      snd.under = (neg ? fd.hi >= 5 || P.drown >= 0 : fd.hi > 0) || !!(P.die && P.die.kind === 'suff');   // 窒息也闷住
      if (P.drown >= 0 || P.die) { beatT -= dt; if (beatT <= 0) { var bu = Math.min(1, Math.max(P.drown >= 0 ? P.drown / DROWN_T : 0, P.die ? P.die.t / DIE_T : 0)); SND.thump(1 - 0.5 * bu); beatT = 0.55 + 0.9 * bu; } }   // 越来越慢的心跳
      if (P.th.shiv > 0 && !P.die) { chatT -= dt; if (chatT <= 0) { chatT = 0.7 + 0.5 * (1 - P.th.shiv / C.TH.SHIV); SND.chatter(chatK++, P.th.shiv / C.TH.SHIV); } }   // 牙齿打颤
      if (P.stage >= 2 || (P.die && P.die.kind === 'heat')) { ringT -= dt; if (ringT <= 0) { ringT = 0.85; SND.ring(P.die ? 0.5 + 0.5 * Math.min(1, P.die.t / DIE_T) : 0.3); } }   // 耳鸣
      if (P.mode === 'climb') {   // 竖井：下方流体顶面到玩家脚下的距离（格）
        var top = -99; for (var y = Math.floor(P.y); y >= C.levelBase(0); y--) if (sc.mat[sc.idx(lv.ladder.x, y, lv.ladder.z)] === sc.fluid) { top = y + sc.q[sc.idx(lv.ladder.x, y, lv.ladder.z)] / 8; break; }
        snd.shaft = top < -90 ? 99 : Math.max(0, P.y - top);
        var rung = Math.floor(P.y * 2); if (rung !== lastRung) { lastRung = rung; SND.rung(rung); }
      }
      // 脚步（按地面类型）
      var stepK = Math.floor(P.walk / 0.55);
      if (stepK !== lastStep) { lastStep = stepK; if (P.pit < 0 && !P.anim && P.mode !== 'climb') SND.step(fd.puddle ? 'puddle' : fd.lo > 0 && !neg ? 'lava' : (lv.t[pz * W + px] === 2 || lv.t[pz * W + px] === 3) ? 'wood' : 'stone', stepK); }
      // 受伤 / 气泡
      hurtT -= dt; if (P.hp < lastHp - 0.99 && hurtT <= 0) { SND.hurt(!neg); hurtT = 0.45; lastHp = P.hp; } if (P.hp > lastHp) lastHp = P.hp;
      if (neg && Math.ceil(P.air) < Math.ceil(lastAir)) SND.lowAir(Math.ceil(P.air)); lastAir = P.air;
      // 模拟事件：瞬移涌入 / 遇水成石 / 火把被毁（只听玩家附近的；涌入每 0.15 s 最多一次）
      surgeT -= dt;
      var E = sc.sndEv;
      for (k = 0; k < E.length; k += 2) {
        var i = E[k + 1], ex = i % sc.X, ez = ((i / sc.X) | 0) % sc.Z, dx = ex + 0.5 - P.x, dz = ez + 0.5 - P.z, dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > 11) continue;
        var vol = 1 - dist / 11;
        if (E[k] === 1 && surgeT <= 0) { surgeT = 0.15; SND.surge(panOf(dx, dz) * Math.min(1, dist / 2), vol, !neg); }
        else if (E[k] === 2 || E[k] === 4) SND.hiss(panOf(dx, dz), vol);
        else if (E[k] === 3) SND.poof(panOf(dx, dz), vol);
      }
    }
    sc && (sc.sndEv.length = 0);
    SND.update(snd);
  }
  function startLoop() { if (!raf) { lastTs = 0; raf = requestAnimationFrame(frame); } }
  function stopLoop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }
  /* ---------- 输入 ---------- */
  var COARSE = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;   // 触屏：QTE 提示写"点击"
  var KEYMAP = { ArrowUp: 'u', w: 'u', W: 'u', ArrowDown: 'd', s: 'd', S: 'd', ArrowLeft: 'l', a: 'l', A: 'l', ArrowRight: 'r', d: 'r', D: 'r' };
  // 一局结束时还按着的方向键（含方向按钮）记下来：松开之前它们不能开新局（否则爬出时按住 W，自动重复的按键会立刻重开）
  var latch = { u: 0, d: 0, l: 0, r: 0, j: 0 };
  function latchKeys() { latch.u = keys.u; latch.d = keys.d; latch.l = keys.l; latch.r = keys.r; latch.j = joy.on ? 1 : 0; }
  function canStartBy(k, repeat) { return state === 'ready' || (state === 'over' && endReady && !repeat && !latch[k]); }
  // 结束动画（拉远镜头）播完、结算面板出现之前，按键和点画面都不开新局
  function endBusy() { return state === 'over' && !endReady; }
  wrap.addEventListener('keydown', function (e) {
    if (scoreAnim) { e.preventDefault(); if (!e.repeat) finishScoreAnim(); return; }   // 计分动画中：任何键只跳过动画，不开新局
    var k = KEYMAP[e.key];
    if (k) { e.preventDefault(); var go = canStartBy(k, e.repeat); keys[k] = 1; if (go) startPlay(); }
    else if (e.key === 'Shift') { if (!e.repeat && state === 'run' && P && actPress()) e.preventDefault(); }   // 体温：用火把取暖 / 爬起来（不开局、不翻页）
    else if (e.key === ' ' && state === 'run' && P && P.qte > 0) { e.preventDefault(); if (!e.repeat) qteHit(); }   // 深坑 QTE：只认新按下的空格；不开局、不翻页
    else if ((e.key === ' ' || e.key === 'Enter') && e.target === canvas && state !== 'run' && state !== 'climb') { e.preventDefault(); if (!endBusy()) startPlay(); }
    else if (e.key === ' ' && e.target === canvas) e.preventDefault();   // 游戏进行中画布有焦点时，空格不滚动页面
  }, { signal: signal });
  wrap.addEventListener('keyup', function (e) { var k = KEYMAP[e.key]; if (k) { keys[k] = 0; latch[k] = 0; } }, { signal: signal });
  window.addEventListener('keyup', function (e) { var k = KEYMAP[e.key]; if (k) latch[k] = 0; }, { signal: signal });   // 焦点不在游戏里时松开也算
  window.addEventListener('blur', function () { latch.u = latch.d = latch.l = latch.r = latch.j = 0; }, { signal: signal });
  canvas.addEventListener('blur', function () { keys.u = keys.d = keys.l = keys.r = 0; }, { signal: signal });   // latch 不清：焦点移到结算面板后，松开按键的 keyup 仍会冒泡到 wrap
  wrap.querySelectorAll('.egg-breach-dpad button').forEach(function (b2) {
    var dd = b2.getAttribute('data-d');
    var on = function (e) { e.preventDefault(); if (scoreAnim) { finishScoreAnim(); skippedAt = performance.now(); return; } var go = canStartBy(dd, false); keys[dd] = 1; b2.classList.add('on'); try { b2.setPointerCapture(e.pointerId); } catch (x) {} if (go) startPlay(); };
    var off = function () { keys[dd] = 0; latch[dd] = 0; b2.classList.remove('on'); };
    b2.addEventListener('pointerdown', on, { signal: signal });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (n) { b2.addEventListener(n, off, { signal: signal }); });
  });
  // 摇杆：第一个按下的手指控制；指针捕获（拖出底座也照样控制）；松开回中、停下。与方向按钮一样：不算 QTE 的点击，开局 / 重开规则也一样（latch / endReady）
  var padEl = wrap.querySelector('.egg-breach-pad'), joyEl = wrap.querySelector('.egg-breach-joy'), knob = joyEl.querySelector('.jk'), ctlBtn = wrap.querySelector('.egg-breach-ctl'), joyId = null;
  function joySet(e) { var r = joyEl.getBoundingClientRect(), R = r.width * 9 / 28, x = (e.clientX - r.left - r.width / 2) / R, z = (e.clientY - r.top - r.height / 2) / R, m = Math.hypot(x, z);
    if (m > 1) { x /= m; z /= m; } joy.x = x; joy.z = z; knob.setAttribute('transform', 'translate(' + Math.round(x * 9) + ' ' + Math.round(z * 9) + ')'); }   // 底座 28 格，拇指头最多偏 9 格
  function joyOff() { joyId = null; joy.on = false; joy.x = joy.z = 0; latch.j = 0; knob.removeAttribute('transform'); joyEl.classList.remove('on'); }
  joyEl.addEventListener('pointerdown', function (e) { e.preventDefault(); if (joyId !== null) return; if (scoreAnim) { finishScoreAnim(); skippedAt = performance.now(); return; }
    var go = canStartBy('j', false); joyId = e.pointerId; joy.on = true; joyEl.classList.add('on'); try { joyEl.setPointerCapture(e.pointerId); } catch (x) {} joySet(e); if (go) startPlay(); }, { signal: signal });
  joyEl.addEventListener('pointermove', function (e) { if (e.pointerId === joyId) { e.preventDefault(); joySet(e); } }, { signal: signal });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (n) { joyEl.addEventListener(n, function (e) { if (e.pointerId === joyId) joyOff(); }, { signal: signal }); });
  // 操作方式切换（摇杆 / 方向键），默认摇杆；记在宿主存储里（读写失败就用默认）
  function ctlMode(m) { padEl.setAttribute('data-mode', m); ctlBtn.title = tx(m === 'joy' ? 'pad.mode_joy' : 'pad.mode_pad'); if (m !== 'joy') joyOff(); else ['u', 'd', 'l', 'r'].forEach(function (k) { keys[k] = 0; }); }
  var ctlSaved = null; try { ctlSaved = host.storage.get('ctl'); } catch (x) {}
  ctlMode(ctlSaved === 'pad' ? 'pad' : 'joy');
  // 操作区左右（左撇子可放右边），默认左；同样记在宿主存储里
  var sideBtn = wrap.querySelector('.egg-breach-side');
  function ctlSide(sd) { wrap.setAttribute('data-side', sd); sideBtn.textContent = tx(sd === 'right' ? 'pad.side_right' : 'pad.side_left'); sideBtn.title = tx(sd === 'right' ? 'pad.side_right_title' : 'pad.side_left_title'); }
  var sideSaved = null; try { sideSaved = host.storage.get('ctlSide'); } catch (x) {}
  ctlSide(sideSaved === 'right' ? 'right' : 'left');
  sideBtn.addEventListener('click', function () { var sd = wrap.getAttribute('data-side') === 'right' ? 'left' : 'right'; ctlSide(sd); try { host.storage.set('ctlSide', sd); } catch (x) {} }, { signal: signal });
  document.addEventListener('fullscreenchange', function () { resize(); }, { signal: signal });
  // 动作按钮：只在触屏操作区可见时出现；按下 = Shift（不算 QTE 的点击、不开局）
  var actKind = '', actPos = '';
  function placeAct() {
    var wr = wrap.getBoundingClientRect(), sr = stage.getBoundingClientRect(), pr = padEl.getBoundingClientRect(), side = wrap.getAttribute('data-side'), fs = !!wrap.closest('.egg-fs'), S = 68, left, top;
    var beside = pr.width > 0 && pr.top < sr.bottom - 10 && pr.bottom > sr.top + 10;
    if (!beside) { var cr = wrap.querySelector('.egg-breach-ctls').getBoundingClientRect(); top = pr.top + pr.height / 2 - S / 2; left = side === 'right' ? cr.right + 14 : cr.left - 14 - S; }
    else if (fs) { var vl = Math.max(wr.left, 0), vr = Math.min(wr.right, innerWidth, document.documentElement.clientWidth || innerWidth), mL = sr.left - vl, mR = vr - sr.right; left = side === 'right' ? vl + Math.max(8, (mL - S) / 2) : vr - Math.max(8, (mR - S) / 2) - S; top = sr.bottom - S - 24; }
    else { top = sr.bottom - S - 12; left = side === 'right' ? sr.left + 12 : sr.right - S - 12; }
    var k = Math.round(left - wr.left) + ',' + Math.round(top - wr.top); if (k !== actPos) { actPos = k; actBtn.style.left = Math.round(left - wr.left) + 'px'; actBtn.style.top = Math.round(top - wr.top) + 'px';
      // 绝对定位的网格子元素，包含块随布局而变（全屏时是中间那一列）：按实际位置校正一次
      var ar = actBtn.getBoundingClientRect(); actBtn.style.left = Math.round(left - wr.left - (ar.left - left)) + 'px'; actBtn.style.top = Math.round(top - wr.top - (ar.top - top)) + 'px'; }
  }
  function syncAct() {
    var a = state === 'run' && P ? actNow() || (P.use ? 'busy' : '') : '', vis = a && getComputedStyle(padEl).display !== 'none';   // busy：取暖引导中，按钮上写「取暖中…别动」
    if (!vis) { if (actKind) { actKind = ''; actBtn.hidden = true; } return; }
    if (a !== actKind) { actKind = a; var lab = tx(a === 'stand' ? 'act.stand' : a === 'busy' ? (P.use.rescue ? 'act.warming_rescue' : 'act.warming') : 'act.torch'); actBtn.classList.toggle('busy', a === 'busy'); actBtn.querySelector('span').textContent = lab; actBtn.setAttribute('aria-label', lab); actBtn.querySelector('svg').style.display = a === 'stand' ? 'none' : ''; actBtn.hidden = false; actPos = ''; }
    placeAct();
  }
  actBtn.addEventListener('pointerdown', function (e) { e.preventDefault(); e.stopPropagation(); actPress(); syncAct(); }, { signal: signal });
  actBtn.addEventListener('click', function (e) { e.preventDefault(); }, { signal: signal });   // 全屏切换：尺寸由 ResizeObserver 跟踪，这里再补一次
  ctlBtn.addEventListener('click', function () { var m = padEl.getAttribute('data-mode') === 'joy' ? 'pad' : 'joy'; ctlMode(m); try { host.storage.set('ctl', m); } catch (x) {} }, { signal: signal });
  btn.addEventListener('click', startPlay, { signal: signal });
  canvas.addEventListener('pointerdown', function (e) { e.preventDefault(); if (scoreAnim) { finishScoreAnim(); return; } if (state !== 'run' && state !== 'climb') { if (!endBusy()) startPlay(); } else { canvas.focus(); qteHit(); } }, { signal: signal });   // 触屏点画面 = QTE
  document.addEventListener('visibilitychange', function () { if (document.hidden && (state === 'run' || state === 'climb')) { state = 'pause'; stopLoop(); draw(0); ui(); SND.release(); } }, { signal: signal });
  if (host.audio && host.audio.onChange) host.audio.onChange(function (v) { if (!v) SND.release(); });
  host.onThemeChange(function (t) { themeName = t === 'dark' ? 'dark' : 'light'; theme = THEME3[themeName]; if (!raf) draw(0); });
  // 自动驾驶（测试 / 录像）：沿到梯子的最短路；坑里朝离出口最近的方向长按
  function makeAutopilot() {
    return function () {
      if (P.mode === 'climb') return [1, 0];
      if (P.qte > 0) qteHit();   // 自动驾驶（测试）总是接住
      var tx = Math.floor(P.x), tz = Math.floor(P.z), dist = lv.distExit, here = dist[tz * W + tx];
      if (lv.t[tz * W + tx] === 3) return [lv.t[tz * W + tx + 1] === 0 ? 1 : -1, 0];
      var best = null, bd = here, O = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (var k = 0; k < 4; k++) { var n = (tz + O[k][1]) * W + tx + O[k][0]; if (dist[n] >= 0 && dist[n] < bd && !solidTile(tx + O[k][0], tz + O[k][1])) { bd = dist[n]; best = O[k]; } }
      if (!best) return [0, 0];
      if (P.pit >= 0 && lv.pit[P.pit] === 2) return best;
      if (best[0] && Math.abs(P.z - tz - 0.5) > 0.12) return [0, P.z < tz + 0.5 ? 1 : -1];
      if (best[1] && Math.abs(P.x - tx - 0.5) > 0.12) return [P.x < tx + 0.5 ? 1 : -1, 0];
      return best;
    };
  }
  if (TEST) root.__eggTest = {
    start: function () { startPlay(); stopLoop(); }, advance: function (dt) { advance(dt); }, loop: startLoop,
    autopilot: function (on) { autopilot = on ? makeAutopilot() : null; if (on && P) P.dbg = true; },
    scoring: function (on) { forceScore = !!on; }, shareLink: shareLink, shareText: function () { return shareText(shareLink(host.n, location.origin)); }, shareCard: function () { var c = shareCard(shareLink(host.n, location.origin)); return c; },
    input: function () { return lastIn.slice(); }, bestScore: function () { return host.storage.get(scoreKey); },
    scoring: function (on) { forceScore = !!on; }, setLag: function (v) { P.lagMax = v; },
    frameLog: function (on) { if (on) frameLog = []; var r = frameLog; if (!on) frameLog = null; return r; },
    ready: function () { return state !== 'prep'; },
    prep: function () { return prep; },
    renderer: function () { return is3D ? 'webgl2:' + R.renderer() : '2d'; },
    loseContext: function () { return is3D && R.loseForTest(); }, glState: function () { return is3D ? { lost: R.lost, restored: R.restored || 0 } : null; },
    fingerprint: function () { return C.fingerprint(M, PC); },
    syncPrerun: function () { var r = C.chooseMap(seed, d, neg, PC); return { k: r.k, regen: r.regen, ticks: r.ticks, rT: r.rT, risky: r.risky, fp: C.fingerprint(r.M, PC) }; }, idealT: function () { return ideal.T; },
    workerPrerun: function (slow) { return new Promise(function (res) { var w2 = makeWorker(); if (!w2) return res(null); w2.onmessage = function (e) { if (e.data.t === 'prerun') { w2.terminate(); res({ k: e.data.k, regen: e.data.regen, ticks: e.data.ticks, rT: e.data.rT, risky: e.data.risky, fp: e.data.fp }); } }; w2.postMessage({ cmd: 'prerun', seed: seed, d: d, neg: neg, slow: slow || 0, fp: true }); }); },
    snapshot: function () { return { state: state, t: gameTime, tick: sc ? sc.tick : 0, level: sc ? sc.level : 0, x: P && P.x, z: P && P.z, y: P && P.y, hp: P && P.hp, pit: P && P.pit, mode: P && P.mode, backend: be && be.kind, d: d, k: M.k, viol: P ? P.viol || 0 : 0, np: np, occ: P ? +P.occ.toFixed(3) : 0, sw: P ? +P.sw.toFixed(3) : 0, grip: P ? +P.grip.toFixed(3) : -1, qte: P ? +P.qte.toFixed(3) : -1, qteMax: P ? P.qteMax : 0, gripMax: P ? +P.gripMax.toFixed(3) : 0, drops: P ? P.drops : 0, drown: P ? +P.drown.toFixed(3) : -1, stones: P ? P.stones : 0, vx: P ? +P.vx.toFixed(3) : 0, vz: P ? +P.vz.toFixed(3) : 0, rot: P ? +P.rot.toFixed(3) : 0, mineT: P ? +P.mineT.toFixed(3) : 0, hyaw: P ? +P.hyaw.toFixed(3) : 0, headOre: P ? P.headOre : -1, air: P ? +P.air.toFixed(3) : 0, anim: !!(P && P.anim), fading: !!fade.then, fmax: sc && sc.field ? +sc.field.max.toFixed(2) : -1, warn: warn.map(function (w) { return [w.x, w.z, +w.p.toFixed(2)]; }) }; },
    blocked: function (x, z) { return blockedAt(x, z); }, beaconAt: function (x, z, size) { var s2 = size || 5; lv.beacons.push({ i: z * W + x, x: x, z: z, size: s2, r: (s2 >> 1) + 1, dur: Math.round((s2 === 7 ? 12 : 6) * M.D.beacon * 2) / 2 }); lv.chest[z * W + x] = 1; },
    buffInfo: function () { return { buff: P.buff, max: P.buffMax, aura: P.aura }; },
    stoneAt: function (x, z) { var b = base(); sc.mat[sc.idx(x, b + 1, z)] = M_COBBLE; sc.mat[sc.idx(x, b + 2, z)] = M_COBBLE; sc.dm[sc.idx(x, b + 1, z)] = M_COBBLE; sc.solidVer++; },
    buff: function () { return P.buff; },
    zoom: function (z) { R.zoom = z; }, rot: function (a) { P.rot = a; },
    teleport: function (x, z) { P.x = x + 0.5; P.z = z + 0.5; cam.x = P.x; cam.z = P.z; },
    sim: function (ticks) { gameTime += ticks / PC.tps; be.run(Math.floor(gameTime * PC.tps)); },
    simFull: function (ticks) { gameTime += ticks / PC.tps; var target = Math.floor(gameTime * PC.tps); if (be.world) { while (be.world.S.tick < target) be.world.tick(); } be.run(target); },
    level: function (k) { sc.level = k; lv = M.levels[k]; var e = lv.entrance; P.x = e % W + 0.5; P.z = ((e / W) | 0) + 0.5; P.y = base() + 1; cam.x = P.x; cam.z = P.z; P.mode = 'top'; },
    climbAt: function (k, prog) { if (k != null) this.level(k); startClimb(); P.climb = prog; P.y = base() + 1 + prog * ((sc.level + 1 < M.levels.length ? C.levelBase(sc.level + 1) + 1 : base() + 7) - base() - 1); cam.y = P.y + 1; },
    win: function () { sc.level = M.levels.length - 1; lv = M.levels[sc.level]; P.mode = 'climb'; finishClimb(); endT = 0; },
    keys: function (str) { keys.u = keys.d = keys.l = keys.r = 0; for (var i = 0; i < str.length; i++) keys[str[i]] = 1; },
    deepPits: function () { var out = []; M.levels.forEach(function (l, k) { for (var i = 0; i < l.pit.length; i++) if (l.pit[i] === 2) out.push({ level: k, x: i % W, z: (i / W) | 0 }); }); return out; },
    setLevel: function (k) { sc.level = k; lv = M.levels[k]; },
    weirdAt: function (x, z, bits, fx, fz, ofx, ofz) { var i = z * W + x; lv.weird[i] = bits; lv.weirdList.push({ i: i, h: bits, from: fz * W + fx, thin: bits === 3 && ofx != null, other: ofx != null ? ofz * W + ofx : undefined }); sc.solidVer++; },
    matAt: function (x, y, z) { return sc.mat[sc.idx(x, y, z)]; },
    blockedTile: function (x, z) { return solidTile(x, z); },
    fluidAt: function (x, y, z, q) { if (!be.world) return false; be.world.setFluid(sc.idx(x, y, z), sc.fluid, q || 8, true); be.run(be.world.S.tick); return true; },
    flood: function (x, z, k) { if (!be.world) return false; var bb = C.levelBase(k); [bb + 1, bb + 2].forEach(function (y) { be.world.setFluid(sc.idx(x, y, z), sc.fluid, 8, true); }); be.run(be.world.S.tick); return true; },
    fluidCells: function (k) { var bb = C.levelBase(k), n = 0; for (var y = bb; y <= bb + 2; y++) for (var z = 0; z < M.H; z++) for (var x = 0; x < W; x++) if (sc.fq(sc.idx(x, y, z)) > 0) n++; return n; },
    hpAir: function () { return { hp: P.hp, air: P.air }; },
    maze: function () { return M; }, god: function (v) { god = v; },
    // 体温（设计 §32）
    thermo: function () { var D = P.down; return { Tc: +P.th.Tc.toFixed(3), Ts: +P.th.Ts.toFixed(3), stage: P.stage, wet: +P.th.wet.toFixed(3), min: +P.th.min.toFixed(3), max: +P.th.max.toFixed(3), shiv: P.th.shiv, torch: P.torch, use: P.use ? { t: P.use.t, mode: P.use.mode, rescue: P.use.rescue } : null,
      down: D ? { ph: D.ph, kind: D.kind, ang: D.ang, win: D.win, winMax: D.winMax, ready: D.ready, pr: D.pr, rescue: !!D.rescue, x: P.x, z: P.z } : null, die: P.die ? { kind: P.die.kind, t: P.die.t } : null, warm: P.warm, trend: P.trend, dT: +P.dT.toFixed(4), depth: P.depth, stuck: P.stuck, relit: P.relit, act: actNow(), slide: P.slide, cause: P.cause, layer: P.layer || '', light: is3D ? null : plView.r, filter: canvas.style.filter }; },
    setTemp: function (Tc, Ts, wet) { P.th.Tc = Tc; P.th.Ts = Ts != null ? Ts : Tc - 3; if (wet != null) P.th.wet = wet; P.stage = C.stageOf(Tc); },
    thermoOn: function (v) { thermoOn = !!v; },
    shift: function () { var ev = new KeyboardEvent('keydown', { key: 'Shift', bubbles: true, cancelable: true }); canvas.dispatchEvent(ev); return ev.defaultPrevented; },
    pose: function () { return { bp: bodyPose(), cell: bodyCell(), head: headPos(), jit: shiverJit(), tint: bodyTint() }; },
    gameName: function () { return gameName(); }, tx: function (k, p) { return tx(k, p); },
    giveTorch: function () { P.torch = true; }, setTorch: function (v) { P.torch = !!v; }, hudText: function () { return hudText.slice(); }, actLabel: function () { return actBtn.hidden ? null : actBtn.textContent; }, setAir: function (v) { P.air = v; }, relight: function () { return P.relight ? { i: P.relight.i, t: P.relight.t } : null; }, wallTorchPos: wallTorchPos,
    lieFits: function (x, z, a) { return lieFits(x, z, a); },
    setBlock: function (x, y, z, m) { var i = sc.idx(x, y, z); if (be.world) be.world.setBlock(i, m); sc.mat[i] = m; sc.dm[i] = m; sc.q[i] = 0; sc.dq[i] = 0; sc.solidVer++; sc.torchVer++; },
    waterAt: function (x, y, z, q) { if (!be.world) return false; var i = sc.idx(x, y, z); be.world.setFluid(i, M_WATER, q, true); sc.mat[i] = M_WATER; sc.q[i] = q; sc.dm[i] = M_WATER; sc.dq[i] = q; return true; },
    clearFluid: function (x, y, z) { var i = sc.idx(x, y, z); if (be.world) be.world.setBlock(i, M_AIR); sc.mat[i] = M_AIR; sc.q[i] = 0; sc.dq[i] = 0; },
    torchCells: function () { var out = [], b = base(); for (var z = 0; z < M.H; z++) for (var x = 0; x < W; x++) if (sc.mat[sc.idx(x, b + 1, z)] === M_TORCH) out.push([x, z]); return out; },
    // 本层告示牌中心在主画布上的像素位置（3D 用渲染器的投影；2D 按镜头偏移）
    signPx: function () { var b = base(); return (lv.signs || []).map(function (sg) { var zf = sg.face > 0 ? sg.z + 1.04 : sg.z - 0.04; if (is3D) { var q = R.proj(sg.x + 0.5, b + (sg.h || 1) + 0.46, zf); return { face: sg.face, x: q[0], y: q[1] }; } return { face: sg.face, x: sg.x * TS - lastCp[0] + 8, y: sg.z * TS - lastCp[1] + (sg.face > 0 ? 7 : 3) }; }); },
    placeAct: function () { syncAct(); return actBtn.hidden ? null : actBtn.getBoundingClientRect().toJSON(); }
  };
  ui(); draw(0); prerun();
  if (!rm) { var spin = function () { if (state === 'prep' && !signal.aborted) { drawPrep(); setTimeout(spin, 250); } }; setTimeout(spin, 250); }
  return { unmount: function () { stopLoop(); SND.release(); if (wk) wk.terminate(); state = 'over'; delete root.__eggTest; wrap.remove(); style.remove(); } };
}
