/* ---------- 音效（Web Audio 实时合成，原创低保真；不加载任何音频文件） ----------
 * 通过宿主 ctx.audio 接入：enabled() / onChange(cb) / context() / out()。静音（或没有 ctx.audio）时不创建任何节点。
 * 图：各声床 / 自合成颗粒 → bus → muff（被淹没时低通）→ master（淡入淡出）→ audio.out()（宿主在其后压缩 + 软限幅）。
 * 短音效优先复用宿主的 audio.sfx（step / splash / hiss / hit / jump / tick / pickup / ok / fail / win），只有涌入、冒泡、滴水、鸟鸣等自己合成。
 * 节奏型声音（冒泡、滴水、火把噼啪、鸟鸣）按“模拟时钟”的时间槽触发，槽内随机量由槽号哈希决定 → 暂停即停、与模拟同步。 */
function makeAudio(api) {
  var A = null, lastSlot = {}, voices = {}, LIMIT = { surge: 3, hiss: 2, grain: 6 };
  function hs(a, b) { var h = Math.imul(a * 374761393 + b * 668265263, 1274126177); h ^= h >>> 13; h = Math.imul(h, 1103515245); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function on() { return !!(api && api.enabled && api.enabled()); }
  function ensure() {
    if (!on()) { if (A) release(); return null; }
    var ctx = api.context(), o = api.out && api.out(); if (!ctx || !o) return null;
    if (A && A.ctx === ctx) return A;
    if (A) release();
    build(ctx, o); return A;
  }
  function noise(ctx, brown) {
    var n = ctx.sampleRate * 2, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0), s = 12345, last = 0;
    for (var i = 0; i < n; i++) { s = (Math.imul(s, 1103515245) + 12345) >>> 0; var w = s / 2147483648 - 1; if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w; }
    return b;
  }
  function build(ctx, o) {
    var t = ctx.currentTime;
    A = { ctx: ctx, out: o, srcs: [], beds: {} };
    A.master = ctx.createGain(); A.master.gain.setValueAtTime(0, t); A.master.gain.linearRampToValueAtTime(1, t + 0.25);
    A.muff = ctx.createBiquadFilter(); A.muff.type = 'lowpass'; A.muff.frequency.value = 18000; A.muff.Q.value = 0.5;
    A.bus = ctx.createGain(); A.bus.gain.value = 0.6;
    A.bus.connect(A.muff); A.muff.connect(A.master); A.master.connect(A.out);   // 宿主 out() 之后有压缩与软限幅
    A.white = noise(ctx, false); A.brown = noise(ctx, true);
    // 声床：底噪嗡鸣、岩浆轰鸣、流水、风、深坑低频、竖井下方的流体、草原微风、信标光环
    bed('drone', [osc(ctx, 'sawtooth', 55), osc(ctx, 'sawtooth', 55.6), osc(ctx, 'triangle', 27.5)], 'lowpass', 150, 0.6);
    bed('rumble', [src(ctx, A.brown)], 'lowpass', 200, 0.8);
    bed('water', [src(ctx, A.white)], 'bandpass', 900, 0.9);
    bed('wind', [src(ctx, A.white)], 'bandpass', 420, 0.8);
    bed('warn', [osc(ctx, 'sine', 41), osc(ctx, 'triangle', 61.5)], 'lowpass', 140, 0.7);
    bed('shaft', [src(ctx, A.brown)], 'lowpass', 260, 0.9);
    bed('meadow', [src(ctx, A.white)], 'lowpass', 700, 0.5);
    bed('beacon', [osc(ctx, 'sine', 220), osc(ctx, 'sine', 330.8), osc(ctx, 'sine', 441.5)], 'lowpass', 2000, 0.5);
    var lfo = osc(ctx, 'sine', 2.2), lg = ctx.createGain(); lg.gain.value = 0.5; lfo.connect(lg); lg.connect(A.beds.warn.am.gain); A.srcs.push(lfo); lfo.start();
    var wl = osc(ctx, 'sine', 0.13), wg = ctx.createGain(); wg.gain.value = 260; wl.connect(wg); wg.connect(A.beds.water.f.frequency); A.srcs.push(wl); wl.start();
  }
  function osc(ctx, type, f) { var o = ctx.createOscillator(); o.type = type; o.frequency.value = f; return o; }
  function src(ctx, buf) { var s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; return s; }
  function bed(name, sources, ft, freq, q) {
    var ctx = A.ctx, f = ctx.createBiquadFilter(), am = ctx.createGain(), g = ctx.createGain(), p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    f.type = ft; f.frequency.value = freq; f.Q.value = q; am.gain.value = name === 'warn' ? 0.5 : 1; g.gain.value = 0;
    sources.forEach(function (s, k) { s.connect(f); s.start(ctx.currentTime, s.buffer ? (k * 0.37 + name.length * 0.11) % 1.9 : 0); A.srcs.push(s); });
    f.connect(am); am.connect(g); if (p) { g.connect(p); p.connect(A.bus); } else g.connect(A.bus);
    A.beds[name] = { f: f, g: g, p: p, am: am };
  }
  function set(name, gain, freq, pan) {
    var b = A.beds[name], t = A.ctx.currentTime;
    b.g.gain.setTargetAtTime(gain, t, 0.12);
    if (freq != null) b.f.frequency.setTargetAtTime(freq, t, 0.15);
    if (pan != null && b.p) b.p.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), t, 0.1);
  }
  // 释放：主音量 0.15 s 淡出，然后停止并断开全部节点
  function release() {
    var a = A; A = null; voices = {}; if (!a) return;
    var t = a.ctx.currentTime;
    try { a.master.gain.cancelScheduledValues(t); a.master.gain.setValueAtTime(a.master.gain.value, t); a.master.gain.linearRampToValueAtTime(0, t + 0.15); } catch (e) {}
    a.srcs.forEach(function (s) { try { s.stop(t + 0.18); } catch (e) {} });
    setTimeout(function () { a.srcs.forEach(function (s) { try { s.disconnect(); } catch (e) {} }); try { a.master.disconnect(); } catch (e) {} a.srcs.length = 0; }, 260);
  }
  /* ---- 单发声：每类有并发上限 ---- */
  function voice(cat) { if ((voices[cat] || 0) >= LIMIT[cat]) return false; voices[cat] = (voices[cat] || 0) + 1; return true; }
  function done(cat) { return function () { voices[cat] = Math.max(0, (voices[cat] || 1) - 1); }; }
  function out(pan, vol) {
    var g = A.ctx.createGain(); g.gain.value = vol;
    if (A.ctx.createStereoPanner && pan) { var p = A.ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p); p.connect(A.bus); } else g.connect(A.bus);
    return g;
  }
  // 噪声爆：滤波器 + 包络
  function burst(cat, o) {
    if (!ensure() || !voice(cat)) return;
    var ctx = A.ctx, t = ctx.currentTime + (o.delay || 0), s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), e = ctx.createGain();
    s.buffer = o.brown ? A.brown : A.white; f.type = o.type || 'bandpass'; f.frequency.setValueAtTime(o.f0, t); if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t + o.dur); f.Q.value = o.q || 1;
    e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(1, t + (o.att || 0.005)); e.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    s.connect(f); f.connect(e); e.connect(out(o.pan || 0, o.vol));
    s.onended = done(cat); s.start(t, (o.off || 0) % 1.5); s.stop(t + o.dur + 0.02);
  }
  // 音调：振荡器 + 滑音 + 包络
  function tone(cat, o) {
    if (!ensure() || !voice(cat)) return;
    var ctx = A.ctx, t = ctx.currentTime + (o.delay || 0), s = ctx.createOscillator(), e = ctx.createGain();
    s.type = o.wave || 'square'; s.frequency.setValueAtTime(o.f0, t); if (o.f1) s.frequency.exponentialRampToValueAtTime(o.f1, t + o.dur);
    e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(1, t + (o.att || 0.004)); e.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    s.connect(e); e.connect(out(o.pan || 0, o.vol));
    s.onended = done(cat); s.start(t); s.stop(t + o.dur + 0.02);
  }
  function fx(name, o) { if (api && api.sfx && on()) api.sfx(name, o); }
  var S = {
    step: function (kind, k) {
      var j = 0.9 + hs(k, 7) * 0.25;
      if (kind === 'puddle') fx('splash', { vol: 0.35, pitch: 1.4 * j });
      else if (kind === 'lava') fx('hiss', { vol: 0.6, pitch: 0.7 * j });
      else fx('step', { vol: kind === 'wood' ? 0.9 : 0.7, pitch: (kind === 'wood' ? 0.6 : 1.1) * j });
    },
    fall: function () { fx('hit', { pitch: 0.6, vol: 0.8 }); },
    qte: function () { fx('pickup', { pitch: 1.7, vol: 0.7 }); fx('tick', { pitch: 1.1, vol: 0.9 }); },   // 深坑 QTE 开始的提示音
    grab: function () { fx('tick', { pitch: 0.35, vol: 1 }); fx('step', { pitch: 0.7, vol: 0.6 }); },                 // 扒住坑沿
    drop: function () { burst('surge', { type: 'bandpass', f0: 1400, f1: 300, dur: 0.4, att: 0.02, vol: 0.35, q: 1.2 }); },   // 下坠的风声
    land: function (fl) { if (fl === 'water') fx('splash', { vol: 0.9, pitch: 0.8 }); else if (fl === 'lava') { fx('hiss', { vol: 0.8, pitch: 0.6 }); fx('hit', { pitch: 0.7, vol: 0.8 }); } else fx('hit', { pitch: 0.5, vol: 1 }); },
    climbOut: function () { fx('jump', { pitch: 0.8, vol: 0.6 }); },
    rung: function (k) { fx('tick', { pitch: 0.18 + (k & 1) * 0.03, vol: 1.2 }); },
    hurt: function (lava) { fx('hit', { pitch: lava ? 0.8 : 1.2, vol: 0.9 }); },
    lowAir: function (n) { fx('pickup', { pitch: 0.5 + n * 0.04, vol: 0.5 }); },
    beacon: function () { fx('ok', { pitch: 1.2 }); fx('pickup', { pitch: 0.75 }); },
    // 压强瞬移“涌入”：低频重击 + 上扫的噪声涌浪（与画面涌动同时触发）
    surge: function (pan, vol, lava) {
      burst('surge', { type: 'lowpass', f0: lava ? 180 : 400, f1: lava ? 900 : 2200, dur: 0.45, att: 0.06, vol: 0.55 * vol, brown: lava, pan: pan, q: 3 });
      tone('surge', { wave: 'sine', f0: lava ? 70 : 110, f1: 40, dur: 0.3, vol: 0.5 * vol, pan: pan });
    },
    // 岩浆遇水成石：长一点的嘶声（自合成）+ 宿主 hiss
    hiss: function (pan, vol) { burst('hiss', { type: 'highpass', f0: 3000, f1: 5000, dur: 0.9, att: 0.01, vol: 0.4 * vol, pan: pan, q: 0.7 }); fx('hiss', { pan: pan, vol: vol }); },
    poof: function (pan, vol) { fx('hiss', { pitch: 0.4, pan: pan, vol: 0.6 * vol }); },
    // 挖到奇怪的石头：明亮的上行琶音（E6–G#6–B6–E7，正弦 + 三角泛音），原创合成
    stone: function () { [1318.5, 1661.2, 1975.5, 2637].forEach(function (f, k) { tone('chime', { wave: 'sine', f0: f, dur: 0.5 - k * 0.06, vol: 0.32, delay: k * 0.065, att: 0.006 }); tone('chime', { wave: 'triangle', f0: f * 2, dur: 0.2, vol: 0.07, delay: k * 0.065 + 0.01 }); }); },
    tally: function (k) { tone('chime', { wave: 'square', f0: 660 * Math.pow(1.122, k), dur: 0.08, vol: 0.12 }); },   // 计分明细逐行出现：一声比一声高
    grade: function () { [784, 988, 1175].forEach(function (f, k) { tone('chime', { wave: 'triangle', f0: f, dur: 0.22, vol: 0.2, delay: k * 0.05 }); }); },
    pick: function () { fx('step', { pitch: 0.55, vol: 0.7 }); tone('grain', { wave: 'square', f0: 2400, f1: 1300, dur: 0.035, vol: 0.06 }); },   // 镐敲在石头上
    drown: function () { fx('splash', { vol: 0.7, pitch: 0.45 }); fx('pickup', { pitch: 0.35, vol: 0.5 }); },   // 气泡用完：闷住的一声
    thump: function (v) { fx('hit', { pitch: 0.22, vol: 0.9 * v }); },   // 溺水时越来越慢的心跳
    die: function () { fx('fail', { pitch: 0.8 }); },
    // 体温（设计 §32）：火把点起；倒下（跪地、侧倒）；能爬起来的提示；失温 / 中暑昏过去
    torchOn: function () { burst('hiss', { type: 'bandpass', f0: 900, f1: 2400, dur: 0.35, att: 0.03, vol: 0.25, q: 0.8 }); fx('pickup', { pitch: 0.6, vol: 0.4 }); },
    kneel: function () { fx('step', { pitch: 0.5, vol: 0.9 }); },
    thud: function () { fx('hit', { pitch: 0.45, vol: 1 }); burst('surge', { type: 'lowpass', f0: 220, dur: 0.25, att: 0.01, vol: 0.3, brown: true }); },
    ready: function () { tone('chime', { wave: 'triangle', f0: 660, f1: 880, dur: 0.18, vol: 0.12 }); },
    faint: function (hot) { fx('fail', { pitch: hot ? 0.9 : 0.6, vol: 0.7 }); },
    // 牙齿打颤：一串很短的咔嗒（寒战时，强度随寒战程度）
    chatter: function (k, v) { for (var n = 0; n < 3; n++) tone('grain', { wave: 'square', f0: 1700 + hs(k, n) * 500, f1: 900, dur: 0.012, vol: 0.05 + 0.08 * v, delay: n * 0.045 }); },
    // 中暑：耳鸣（高频正弦，渐强）
    ring: function (v) { tone('chime', { wave: 'sine', f0: 6200, f1: 6000, dur: 0.9, vol: 0.02 + 0.06 * v, att: 0.3 }); },
    win: function () { fx('win'); },
    /* 每帧：s = {mode, lava, time, near, nearPan, flow, flowPan, wind, windPan, warn, warnPan, under, shaft, buff, torch} */
    update: function (s) {
      if (!s || !(s.mode === 'run' || s.mode === 'climb' || s.mode === 'end')) { if (A) release(); lastSlot = {}; return; }
      if (!ensure()) return;
      var play = s.mode === 'run' || s.mode === 'climb', end = s.mode === 'end';
      set('drone', play ? 0.05 : 0);
      // 岩浆：越近越响越亮；声像跟随岩浆在屏幕左右的位置
      var nr = s.lava && play ? Math.max(0, 1 - s.near / 12) : 0;
      set('rumble', 0.04 + nr * nr * 0.75 * (s.lava && play ? 1 : 0), 120 + nr * 900, s.nearPan);
      // 地下水：进水越快越响；被淹没时整体低通
      set('water', !s.lava && play ? 0.02 + Math.min(1, s.flow) * 0.35 + Math.max(0, 1 - s.near / 10) * 0.08 : 0, null, s.flowPan);
      A.muff.frequency.setTargetAtTime(s.under ? 650 : 18000, A.ctx.currentTime, 0.08);
      set('wind', play ? Math.min(1, s.wind) * 0.22 : 0, 300 + Math.min(1, s.wind) * 500, s.windPan);
      set('warn', play ? Math.min(1, s.warn) * 0.55 : 0, 120 + s.warn * 80, s.warnPan);
      set('shaft', s.mode === 'climb' ? Math.max(0, 1 - s.shaft / 6) * 0.6 : 0, 160 + Math.max(0, 1 - s.shaft / 6) * 600);
      set('meadow', end ? 0.16 : 0, 600);
      set('beacon', s.buff > 0 && play ? 0.035 : 0);
      // 节奏型颗粒（按模拟时钟）
      var tm = s.time;
      if (s.lava && play && nr > 0) slot('bub', tm, 3 + nr * 9, function (k) { tone('grain', { wave: 'sine', f0: 90 + hs(k, 1) * 120, f1: 200 + hs(k, 2) * 260, dur: 0.06 + hs(k, 3) * 0.06, vol: 0.12 + nr * 0.3, pan: s.nearPan + (hs(k, 4) - 0.5) * 0.4 }); });
      if (!s.lava && play) slot('drip', tm, 0.8, function (k) { if (hs(k, 5) < 0.7) tone('grain', { wave: 'sine', f0: 1500 + hs(k, 6) * 900, f1: 700, dur: 0.09, vol: 0.12, pan: hs(k, 7) * 1.6 - 0.8 }); });
      if (play && s.torch < 3) slot('fire', tm, 6, function (k) { if (hs(k, 8) < 0.35) burst('grain', { type: 'highpass', f0: 2500, dur: 0.02, vol: 0.12 * (1 - s.torch / 3), off: hs(k, 9) }); });
      if (end) slot('bird', tm, 1.4, function (k) { if (hs(k, 10) < 0.55) { var f = 2200 + hs(k, 11) * 1400; for (var n = 0; n < 2 + ((hs(k, 12) * 3) | 0); n++) tone('grain', { wave: 'sine', f0: f, f1: f * 1.25, dur: 0.07, vol: 0.3, delay: n * 0.09, pan: hs(k, 13) * 1.4 - 0.7 }); } });
    },
    release: function () { release(); lastSlot = {}; },
    active: function () { return !!A; }
  };
  function slot(name, tm, rate, fn) { var k = Math.floor(tm * rate); if (lastSlot[name] === undefined) lastSlot[name] = k; if (k !== lastSlot[name]) { lastSlot[name] = k; fn(k); } }
  return S;
}
