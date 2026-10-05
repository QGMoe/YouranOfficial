// 「Creeper?」 — whack-a-creeper. Self-contained ES module, no globals, no external resources.
const P = 'egg-creeper-';
const CELL = 24, GAP = 4, PAD = 4, LW = PAD * 2 + CELL * 3 + GAP * 2; // 88 logical px
const STEP = 1000 / 60, CAP = 100, RISE = 8, SINK = 6, HURT = 12, BOOM = 24, SPARK = 8, TOP = 18;
const cx = i => PAD + (i % 3) * (CELL + GAP), cy = i => PAD + ((i / 3) | 0) * (CELL + GAP);
const lerp = (a, b, t) => a + (b - a) * t;

// 反应类游戏：每局的随机序列真随机（版本号只决定难度档与外观）；仅在地址带 ?egg-test&egg-seed=<整数> 时用固定种子，便于确定性测试
function roundSeed(k) {
  const m = typeof location !== 'undefined' && /[?&]egg-test\b/.test(location.search) && /[?&]egg-seed=(\d+)/.exec(location.search);
  if (m) return (Number(m[1]) ^ Math.imul(k + 1, 0x9E3779B9)) >>> 0;
  try { return crypto.getRandomValues(new Uint32Array(1))[0]; } catch (e) { return (Math.random() * 4294967296) >>> 0; }
}
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Original pixel sprites, 10x16. '.' = transparent.
const CREEPER = [
  '.gGglggGg.', '.glgggGgl.', '.gkkgGkkg.', '.gkkglkkg.', '.ggGkkggl.', '.gkkkkkGg.', '.lkkgGkkg.', '.gGggglgg.',
  '..gGglgG..', '..lggGgg..', '..gGgglg..', '..ggGggG..', '..glggGg..', '..gGglgg..', '.Ggg..gGg.', '.GGG..GGG.'
];
const VILLAGER = [
  '.ssssssss.', '.ssssssss.', '.sbbbbbbs.', '.sweSSews.', '.sssnnsss.', '.sssnnsss.', '.SssnnssS.', '.SSsssSSS.',
  'rrrrrrrrrr', 'rRRaaaaRRr', 'rRaaaaaaRr', '.rrRRRRrr.', '.rrrrrrrr.', '.rrRrrRrr.', '.rrrrrrrr.', '.RRR..RRR.'
];
const C_PAL = { g: '#4f9a4a', G: '#2f6a33', l: '#7cc277', k: '#10180f' };
const V_PAL = { s: '#c99a6e', S: '#a8784f', b: '#4a2f1d', w: '#f2efe6', e: '#3c8f4a', n: '#b57f55', r: '#7a4a2a', R: '#5d3720', a: '#8c5a34' };

function hex(c) { const v = parseInt(c.slice(1), 16); return [v >> 16, (v >> 8) & 255, v & 255]; }
function mix(c, d, t) {
  const a = hex(c), b = hex(d);
  return '#' + a.map((x, i) => Math.round(lerp(x, b[i], t)).toString(16).padStart(2, '0')).join('');
}
const tint = (pal, to, t) => Object.fromEntries(Object.entries(pal).map(([k, v]) => [k, mix(v, to, t)]));
const C_FUSE = [0, 0.2, 0.4, 0.6].map(t => tint(C_PAL, '#f4f8f0', t)); // calm whitening steps
const C_FLASH = tint(C_PAL, '#ffffff', 0.8);
const V_HURT = tint(V_PAL, '#d23a2a', 0.55);

const FIELD = {
  light: { g: '#8fbf4f', G: '#7aa83f', L: '#a5d063', d: '#8a5a35', D: '#6b4227', h: '#2b1a10', H: '#1a0f08', o: '#1d2a14', puff: ['#f2f2ee', '#c9c9c4', '#9a9a95'], cur: '#ffffff', fuse: '#e0a020', spark: '#ffe066' },
  dark: { g: '#3d6232', G: '#33552a', L: '#4a7340', d: '#5e3d25', D: '#4a2f1c', h: '#140c07', H: '#0a0604', o: '#060a05', puff: ['#c8c8c4', '#9a9a95', '#6e6e6a'], cur: '#f0f0f0', fuse: '#e0a020', spark: '#ffd84a' }
};
// negative n: crimson "nylium" ground instead of grass (purely cosmetic)
const NEG = { light: { g: '#b2453f', G: '#963632', L: '#c85a4f' }, dark: { g: '#6e2a27', G: '#5a211f', L: '#80352f' } };
const UI = {
  light: { text: '#1f2328', muted: '#59636e', accent: '#2f7d32', on: '#ffffff', danger: '#d1242f' },
  dark: { text: '#e6edf3', muted: '#9198a1', accent: '#5fbf62', on: '#0d1117', danger: '#f85149' }
};

const CSS = `
.${P}root{display:flex;flex-direction:column;align-items:center;gap:8px;max-width:100%;color:var(--${P}text);font:inherit}
.${P}hud{display:flex;gap:16px;align-items:center;flex-wrap:wrap;justify-content:center;font-variant-numeric:tabular-nums}
.${P}hud b{font-weight:700}
.${P}lives{display:inline-flex;gap:3px}
.${P}heart{display:inline-block;width:14px;height:12px;background:var(--${P}danger);clip-path:polygon(14.29% 0,42.86% 0,42.86% 16.67%,57.14% 16.67%,57.14% 0,85.71% 0,85.71% 16.67%,100% 16.67%,100% 50%,85.71% 50%,85.71% 66.67%,71.43% 66.67%,71.43% 83.33%,57.14% 83.33%,57.14% 100%,42.86% 100%,42.86% 83.33%,28.57% 83.33%,28.57% 66.67%,14.29% 66.67%,14.29% 50%,0 50%,0 16.67%,14.29% 16.67%)}
.${P}heart.${P}off{background:var(--${P}muted);opacity:.35}
.${P}stage{position:relative;line-height:0;max-width:100%}
.${P}cv{display:block;touch-action:none;image-rendering:pixelated;border-radius:6px;cursor:pointer;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none}
.${P}cv:focus-visible{outline:2px solid var(--${P}accent);outline-offset:3px}
.${P}ov{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;background:rgba(0,0,0,.4);border-radius:6px;line-height:normal;color:#fff}
.${P}ov[hidden]{display:none}
.${P}msg{font-weight:700;min-height:1.2em}
.${P}btn{font:inherit;font-weight:600;border:0;border-radius:6px;padding:8px 20px;min-height:40px;background:var(--${P}fill);color:var(--${P}on);cursor:pointer}
.${P}btn:focus-visible{outline:2px solid #fff;outline-offset:2px}
.${P}tip{font-size:12px;color:var(--${P}muted);text-align:center;line-height:1.5}
`;

const KEYMAP = {
  Numpad7: 0, Numpad8: 1, Numpad9: 2, Numpad4: 3, Numpad5: 4, Numpad6: 5, Numpad1: 6, Numpad2: 7, Numpad3: 8,
  Digit7: 0, Digit8: 1, Digit9: 2, Digit4: 3, Digit5: 4, Digit6: 5, Digit1: 6, Digit2: 7, Digit3: 8,
  KeyQ: 0, KeyW: 1, KeyE: 2, KeyA: 3, KeyS: 4, KeyD: 5, KeyZ: 6, KeyX: 7, KeyC: 8
};

const TIERS = 21;
// 难度档周期化：tier = cycle mod P（不封顶），这样每个难度档都对应无限多个 n（每局序列另取真随机种子）
export function tier(cycle) {
  const c = Math.floor(Math.abs(Number(cycle)));
  return Number.isFinite(c) ? c % TIERS : 0;
}

/* 内置文案：与 dist/assets/egg/texts/creeper.js 相同，只在文案文件加载失败时使用。改文字请改 texts/creeper.js */
const TEXTS = {
  name: '（待服主填写）',
  intro: '',
  hud: { score: '分数', best: '最高', lives_label: '生命 {lives}' },
  button: { start: '开始', resume: '继续', again: '再来一次' },
  msg: { paused: '已暂停', new_record: '新纪录' },
  tip: '点击洞口 · 数字键盘 1–9 · QWE/ASD/ZXC · 方向键+空格',
  canvas_label: '打苦力怕'
};

export default {
  id: 'creeper',
  title: '（待服主填写）', // 游戏名的兜底；实际显示 texts/creeper.js 的 name
  texts: TEXTS,
  mount(root, ctx) {
    const tx = ctx.t;   // 文案：texts/creeper.js（加载失败时用上面的 TEXTS）
    const ac = new AbortController(), sig = ac.signal;
    const reduced = !!ctx.reducedMotion, negative = !!ctx.negative;
    const level = tier(ctx.cycle);      // 难度档 = cycle mod 21
    const parseBest = v => { const x = parseInt(v, 10); return x > 0 && x < 1e9 ? x : 0; };
    let best = 0;
    try { best = parseBest(ctx.storage && ctx.storage.get('best')); } catch (e) { /* ignore */ }

    // ---- DOM ----
    const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = P + cls; if (txt != null) e.textContent = txt; return e; };
    const wrap = el('div', 'root');
    const style = document.createElement('style'); style.textContent = CSS;
    const hud = el('div', 'hud');
    const scoreB = el('b', null, '0'), bestB = el('b', null, String(best));
    const s1 = el('span'); s1.append(tx('hud.score') + ' ', scoreB);
    const s2 = el('span'); s2.append(tx('hud.best') + ' ', bestB);
    const livesEl = el('span', 'lives'); livesEl.setAttribute('role', 'img');
    const hearts = [0, 1, 2].map(() => { const h = el('i', 'heart'); livesEl.append(h); return h; });
    hud.append(s1, s2, livesEl);
    const stage = el('div', 'stage');
    const cv = el('canvas', 'cv'); cv.tabIndex = 0; cv.setAttribute('role', 'application'); cv.setAttribute('aria-label', tx('canvas_label'));
    const ov = el('div', 'ov'), msg = el('div', 'msg'), btn = el('button', 'btn', tx('button.start'));
    btn.type = 'button'; msg.setAttribute('aria-live', 'polite');
    ov.append(msg, btn); stage.append(cv, ov);
    const tip = el('div', 'tip', tx('tip'));
    wrap.append(style, hud, stage, tip);
    root.append(wrap);
    const g = cv.getContext('2d', { alpha: false });

    // ---- theme ----
    let theme = 'light', F = FIELD.light, bg = null;
    function applyTheme() {
      theme = (ctx.theme && ctx.theme()) === 'dark' ? 'dark' : 'light';
      F = Object.assign({}, FIELD[theme], negative ? NEG[theme] : null);
      const fb = UI[theme], pick = (n, d) => { let v = ''; try { v = (ctx.color && ctx.color(n)) || ''; } catch (e) { /* ignore */ } return v.trim() || d; };
      const vars = { text: pick('--text', fb.text), muted: pick('--muted', fb.muted), accent: pick('--accent', fb.accent), fill: pick('--accent-fill', fb.accent), on: pick('--on-accent', fb.on), danger: pick('--danger', fb.danger) };
      for (const k in vars) wrap.style.setProperty(`--${P}${k}`, vars[k]);
      buildBg(); draw();
    }
    function buildBg() {
      bg = document.createElement('canvas'); bg.width = LW; bg.height = LW;
      const b = bg.getContext('2d');
      b.fillStyle = F.g; b.fillRect(0, 0, LW, LW);
      let h = 0x9e3779b9; // fixed texture hash (independent of game rng)
      for (let y = 0; y < LW; y++) for (let x = 0; x < LW; x++) {
        h = Math.imul(h ^ (x * 73856093) ^ (y * 19349663), 0x85ebca6b) >>> 0; h ^= h >>> 13;
        const r = h & 15;
        if (r < 2) { b.fillStyle = F.G; b.fillRect(x, y, 1, 1); } else if (r === 2) { b.fillStyle = F.L; b.fillRect(x, y, 1, 1); }
      }
      for (let i = 0; i < 9; i++) {
        const x = cx(i), y = cy(i);
        b.fillStyle = F.D; b.fillRect(x + 5, y + 12, 14, 1); b.fillRect(x + 3, y + 13, 18, 1);
        b.fillStyle = F.h; b.fillRect(x + 3, y + 14, 18, 5);
        b.fillStyle = F.H; b.fillRect(x + 5, y + 15, 14, 3);
        b.fillStyle = F.d; b.fillRect(x + 3, y + 19, 18, 1); b.fillRect(x + 5, y + 20, 14, 1);
        b.fillStyle = F.D; b.fillRect(x + 6, y + 21, 12, 1);
      }
    }

    // ---- sizing (integer device pixels per logical pixel => no shimmer) ----
    let scale = 1;
    function resize() {
      const dpr = window.devicePixelRatio || 1;
      // 横屏手机等矮视口：棋盘连同上下的 HUD、提示一屏放得下
      const avail = Math.min(root.clientWidth || wrap.clientWidth || LW * 4, 440, Math.max(LW, (window.innerHeight || 800) - (root.classList.contains('egg-fs') ? 110 : 150)));   // 宿主横屏全屏（.egg-fs）时没有顶栏
      scale = Math.max(1, Math.floor(avail * dpr / LW));
      const px = LW * scale;
      if (cv.width !== px) { cv.width = px; cv.height = px; }
      cv.style.width = cv.style.height = (px / dpr) + 'px';
      draw();
    }

    // ---- game state ----
    let S = null, attempt = 0, raf = 0, last = 0, cursor = 4, showCursor = false, hidden = !!document.hidden;
    const diff = T => Math.min(1, S.d0 + T / 7200);
    function newGame() {
      attempt++;
      S = {
        st: 'play', tick: 0, acc: 0, score: 0, lives: 3, holes: Array(9).fill(null), fx: [], next: 40, n: 0, shakeAt: -99,
        rnd: mulberry(roundSeed(attempt - 1)), d0: level * 0.015,
        inputs: [], log: [], hashes: []
      };
    }
    const lg = s => { if (S.log.length < 2000) S.log.push(S.tick + ':' + s); };
    const blocked = i => S.holes[i] || S.fx.some(f => f.k === 'b' && f.i === i);
    function rise(m, T) {
      if (m.ph === 'live') return Math.round(Math.min(T - m.born, RISE) / RISE * TOP);
      return Math.max(0, Math.round(m.from * (1 - (T - m.downAt) / m.dur)));
    }
    function spawn(T) {
      const r = S.rnd, r1 = r(), r2 = r(), r3 = r(), r4 = r(), r5 = r(), d = diff(T);
      let i = (r1 * 9) | 0, k = 0;
      while (k < 9 && blocked((i + k) % 9)) k++;
      S.next = T + Math.round(lerp(78, 26, d) * (0.7 + 0.6 * r4));
      if (r5 < d * 0.4) S.next = Math.min(S.next, T + 8);
      if (k === 9) { lg('full'); return; }
      i = (i + k) % 9;
      const t = S.n >= 4 && r2 < 0.14 + 0.1 * d ? 'v' : 'c';
      S.holes[i] = { t, born: T, fuse: Math.round(lerp(130, 46, d) * (0.85 + 0.3 * r3)), stay: Math.round(lerp(80, 46, d)), ph: 'live' };
      S.n++; lg('s' + t + i);
    }
    // 音效（都在模拟步 step 里触发，与画面同一个时钟）：打中 / 打空 / 误打村民 / 引信闪白时嘶一声 / 爆炸 / 结束
    const snd = (n, o) => { if (ctx.audio) ctx.audio.sfx(n, o); };
    const pan = i => ((i % 3) - 1) * 0.6;
    function hit(i, T) {
      const m = S.holes[i];
      if (!m || m.ph !== 'live') { lg('m' + i); snd('click', { vol: 0.5, pan: pan(i) }); return; }
      snd(m.t === 'c' ? 'hit' : 'fail', { pan: pan(i) });
      m.from = rise(m, T); m.ph = 'down'; m.downAt = T;
      if (m.t === 'c') { m.dur = SINK; S.score++; S.fx.push({ k: 's', i, at: T }); lg('h' + i); }
      else { m.dur = HURT; m.hurt = 1; S.lives--; lg('v' + i); }
    }
    function step() {
      const T = S.tick;
      while (S.inputs.length && S.inputs[0].at <= T) hit(S.inputs.shift().i, T);
      if (S.lives > 0 && T >= S.next) spawn(T);
      let hiss = -1;
      for (let i = 0; i < 9; i++) {
        const m = S.holes[i]; if (!m) continue;
        const age = T - m.born;
        if (m.ph === 'live' && m.t === 'c' && T > m.born && creeperPal(m, T) !== creeperPal(m, T - 1) && creeperPal(m, T) !== C_PAL) hiss = i;
        if (m.ph === 'live') {
          if (m.t === 'c' && age >= RISE + m.fuse) { S.holes[i] = null; S.fx.push({ k: 'b', i, at: T }); S.lives--; S.shakeAt = T; lg('x' + i); snd('boom', { pan: pan(i) }); }
          else if (m.t === 'v' && age >= RISE + m.stay) { m.from = TOP; m.ph = 'down'; m.downAt = T; m.dur = RISE; }
        } else if (T - m.downAt >= m.dur) S.holes[i] = null;
      }
      if (hiss >= 0) snd('hiss', { pan: pan(hiss) });
      S.fx = S.fx.filter(f => T - f.at < (f.k === 'b' ? BOOM : SPARK));
      S.tick++;
      if (S.tick % 60 === 0) S.hashes.push(hashState());
      if (S.lives <= 0) { S.lives = 0; over(); }
    }
    function hashState() {
      let s = [S.tick, S.score, S.lives, S.next, S.n].join(',');
      for (const m of S.holes) s += m ? `|${m.t}${m.born}${m.ph}${m.fuse}` : '|';
      let h = 2166136261;
      for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
      return (h >>> 0).toString(16);
    }

    // ---- loop ----
    function frame() {
      raf = 0;
      if (!S || S.st !== 'play' || hidden) return;
      const now = performance.now();
      let dt = now - last; last = now;
      if (!(dt > 0)) dt = 0; else if (dt > CAP) dt = CAP;
      S.acc += dt;
      while (S.acc >= STEP - 1e-6 && S.st === 'play') { S.acc -= STEP; step(); }
      draw();
      if (S.st === 'play') raf = requestAnimationFrame(frame);
    }
    function loop() { if (!raf && S && S.st === 'play' && !hidden) raf = requestAnimationFrame(frame); }
    function stopLoop() { if (raf) cancelAnimationFrame(raf); raf = 0; }

    function queueHit(i) {
      if (!S || S.st !== 'play') return;
      const now = performance.now();
      const simNow = S.tick * STEP + S.acc + Math.min(CAP, Math.max(0, now - last));
      const at = Math.max(S.tick, Math.floor(simNow / STEP + 1e-6));
      S.inputs.push({ at, i });
    }

    // ---- UI state ----
    function hudSync() {
      const sc = S ? S.score : 0, lv = S ? S.lives : 3;
      if (scoreB.textContent !== String(sc)) scoreB.textContent = sc;
      if (bestB.textContent !== String(best)) bestB.textContent = best;
      hearts.forEach((h, k) => h.classList.toggle(P + 'off', k >= lv));
      livesEl.setAttribute('aria-label', tx('hud.lives_label', { lives: lv }));
    }
    function overlay(text, label) { msg.textContent = text; btn.textContent = label; ov.hidden = false; }
    function start() {
      newGame(); ov.hidden = true; msg.textContent = '';
      last = performance.now(); hudSync(); draw();
      try { cv.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
      loop();
    }
    function pause() {
      if (!S || S.st !== 'play') return;
      S.st = 'pause'; stopLoop(); overlay(tx('msg.paused'), tx('button.resume')); draw();
    }
    function resume() {
      if (!S || S.st !== 'pause' || hidden) return;
      S.st = 'play'; ov.hidden = true; msg.textContent = ''; last = performance.now();
      try { cv.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
      loop();
    }
    function over() {
      S.st = 'over'; stopLoop(); snd('fail', { pitch: 0.7 });
      const rec = S.score > best;
      if (rec) { best = S.score; try { ctx.storage && ctx.storage.set('best', String(best)); } catch (e) { /* ignore */ } }
      overlay(rec ? tx('msg.new_record') : '', tx('button.again'));
      try { btn.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    }
    btn.addEventListener('click', () => { if (S && S.st === 'pause') resume(); else start(); }, { signal: sig });

    // ---- input ----
    cv.addEventListener('pointerdown', e => {
      if (!S || S.st !== 'play') return;
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      if (x < 0 || x >= 1 || y < 0 || y >= 1) return;
      queueHit(Math.min(2, (y * 3) | 0) * 3 + Math.min(2, (x * 3) | 0));
    }, { signal: sig });
    cv.addEventListener('contextmenu', e => e.preventDefault(), { signal: sig });
    wrap.addEventListener('keydown', e => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.target === btn) return;
      if (!S || S.st !== 'play') {
        if (S && S.st === 'pause' && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); resume(); }
        return;
      }
      const k = KEYMAP[e.code];
      if (k != null) { e.preventDefault(); if (!e.repeat) queueHit(k); return; }
      const mv = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (mv) {
        e.preventDefault(); showCursor = true;
        const c = Math.max(0, Math.min(2, cursor % 3 + mv[0])), r = Math.max(0, Math.min(2, ((cursor / 3) | 0) + mv[1]));
        cursor = r * 3 + c; draw(); return;
      }
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); showCursor = true; if (!e.repeat) queueHit(cursor); return; }
      if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') { e.preventDefault(); pause(); }
    }, { signal: sig });
    document.addEventListener('visibilitychange', () => {
      hidden = !!document.hidden;
      if (hidden) pause();
    }, { signal: sig });

    // ---- render (state at S.tick only; integer logical coords) ----
    function sprite(rows, pal, x, y, clip) {
      g.fillStyle = F.o;
      for (let r = 0; r < 16; r++) for (let c = 0; c < 10; c++) {
        if (rows[r][c] === '.') continue;
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const nr = r + dy, nc = c + dx;
          if (nr >= 0 && nr < 16 && nc >= 0 && nc < 10 && rows[nr][nc] !== '.') continue;
          if (y + nr <= clip) g.fillRect(x + nc, y + nr, 1, 1);
        }
      }
      for (let r = 0; r < 16 && y + r <= clip; r++) for (let c = 0; c < 10; c++) {
        const ch = rows[r][c]; if (ch === '.') continue;
        g.fillStyle = pal[ch]; g.fillRect(x + c, y + r, 1, 1);
      }
    }
    function creeperPal(m, T) {
      if (m.ph !== 'live') return C_PAL;
      const p = Math.max(0, (T - m.born - RISE) / m.fuse);
      if (reduced) return C_FUSE[Math.min(3, (p * 4) | 0)];
      if (p < 0.45) return C_PAL;
      const period = Math.max(6, Math.round(lerp(20, 6, (p - 0.45) / 0.55)));
      return Math.floor((T - m.born) / period) % 2 ? C_FLASH : C_PAL;
    }
    function draw() {
      if (!bg) return;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.imageSmoothingEnabled = false;
      g.fillStyle = F.G; g.fillRect(0, 0, cv.width, cv.height);
      const T = S ? S.tick : 0;
      let ox = 0;
      if (S && !reduced && S.st === 'play') { const a = T - S.shakeAt; if (a >= 0 && a < 8) ox = [2, -2, 1, -1, 1, -1, 0, 0][a]; }
      g.setTransform(scale, 0, 0, scale, ox * scale, 0);
      g.drawImage(bg, 0, 0);
      const holes = S ? S.holes : [null, null, null, null, { t: 'c', born: -99, ph: 'idle', from: TOP }, null, null, null, null];
      for (let i = 0; i < 9; i++) {
        const m = holes[i], x = cx(i), y = cy(i);
        if (m) {
          const rz = m.ph === 'idle' ? 10 : rise(m, T);
          if (rz > 0) {
            const pal = m.t === 'c' ? creeperPal(m, T) : (m.hurt ? V_HURT : V_PAL);
            sprite(m.t === 'c' ? CREEPER : VILLAGER, pal, x + 7, y + 20 - rz, y + 18);
          }
          if (reduced && m.t === 'c' && m.ph === 'live') {
            const left = 1 - Math.max(0, (T - m.born - RISE) / m.fuse);
            g.fillStyle = F.o; g.fillRect(x + 4, y, 16, 2);
            g.fillStyle = F.fuse; g.fillRect(x + 4, y, Math.max(0, Math.round(16 * left)), 2);
          }
        }
      }
      if (S) for (const f of S.fx) {
        const a = T - f.at, x = cx(f.i), y = cy(f.i);
        if (f.k === 's') {
          g.fillStyle = F.spark;
          const o = reduced ? 3 : 2 + (a >> 1);
          g.fillRect(x + 11, y + 4 - o, 2, 2); g.fillRect(x + 11 - o - 1, y + 4, 2, 2); g.fillRect(x + 12 + o, y + 4, 2, 2);
        } else {
          const st = Math.min(2, (a / (BOOM / 3)) | 0);
          g.fillStyle = F.puff[st];
          const grow = reduced ? 1 : st;
          for (const [px, py] of [[12, 12], [7, 10], [17, 9], [9, 5], [15, 4], [5, 15], [19, 15]]) {
            const s = 2 + grow;
            g.fillRect(x + px - (s >> 1), y + py - (s >> 1), s, s);
          }
          if (!reduced && a < 3) { g.fillStyle = F.spark; g.fillRect(x + 10, y + 10, 4, 4); }
        }
      }
      if (S && S.st === 'play' && showCursor) {
        const x = cx(cursor) - 2, y = cy(cursor) - 2, w = CELL + 4;
        g.fillStyle = F.cur;
        g.fillRect(x, y, w, 1); g.fillRect(x, y + w - 1, w, 1); g.fillRect(x, y, 1, w); g.fillRect(x + w - 1, y, 1, w);
      }
      hudSync();
    }

    // ---- lifecycle ----
    let ro = null;
    if (typeof ResizeObserver === 'function') { ro = new ResizeObserver(() => resize()); ro.observe(root); }
    window.addEventListener('resize', resize, { signal: sig });
    if (ctx.onThemeChange) ctx.onThemeChange(() => { if (!sig.aborted) applyTheme(); });
    overlay('', tx('button.start'));
    applyTheme(); resize();

    let dead = false;
    function unmount() {
      if (dead) return; dead = true;
      stopLoop(); ac.abort(); if (ro) ro.disconnect();
      wrap.remove(); S = null;
    }
    if (ctx.signal) {
      if (ctx.signal.aborted) unmount(); else ctx.signal.addEventListener('abort', unmount, { once: true });
    }
    return {
      unmount,
      // test hook (not used by the host)
      debug: () => S ? { st: S.st, tick: S.tick, score: S.score, lives: S.lives, log: S.log.slice(), hashes: S.hashes.slice(), raf: !!raf, best, up: S.holes.filter(m => m && m.ph === 'live').length } : { st: 'idle', raf: !!raf, best }
    };
  }
};
