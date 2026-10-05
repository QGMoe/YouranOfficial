// 「合成大矿物」（2048 变体）— 404 彩蛋游戏
const ID = 'merge';
const P = 'egg-merge';
const WIN = 8; // 钻石
const SLIDE = 100, POP = 130, CEL = 900;

// 各级方块的文案键（名字见 texts/merge.js 的 tiers）
const NAMES = ['cobblestone', 'coal', 'iron_ingot', 'gold_ingot', 'redstone', 'lapis_lazuli', 'emerald', 'diamond', 'netherite_ingot', 'nether_star', 'beacon', 'dragon_egg'];
// 第 t 级方块的数值 = 2^(t−1)：圆石 1、煤炭 2、铁锭 4……（角标与计分同一口径）
export const value = t => 2 ** (t - 1);

// 12×12 原创像素图：o 描边，1 主色，2 暗部，3 高光，. 透明
const SPR = [
  ['#3b3b3b#8a8a8a#686868#b4b4b4', 'oooooooooooo,o3311o33311o,o3112o31112o,o1122o11122o,o1222o12222o,oooooooooooo,o333111o331o,o311112o312o,o111122o112o,o112222o122o,o122222o222o,oooooooooooo'],
  ['#0e0e0e#2e2e2e#1c1c1c#6a6a6a', '............,....ooooo...,..oo33112o..,.o33111122o.,.o31111122o.,o3111111122o,o1111111222o,o1111112222o,.o11112222o.,.o2122222oo.,..oo2222o...,....oooo....'],
  ['#4a4a4a#d8d8d8#a4a4a4#ffffff', '............,............,...oooooo...,..o333331o..,.o33111112o.,.o31111122o.,o3111111222o,o1111112222o,o2222222222o,oooooooooooo,............,............'],
  ['#6b4a00#f2c838#c99a10#fff3a0', '............,............,...oooooo...,..o333311o..,..o111122o..,oooooooooooo,o3331oo3331o,o1112oo1112o,o1122oo1122o,oooooooooooo,............,............'],
  ['#5a0000#e0201a#a01010#ff8a7a', '............,..oo....oo..,.o31o..o31o.,..oo....oo..,.....oo.....,....o31o....,....o12o....,.....oo.....,..oo....oo..,.o31o..o31o.,..oo....oo..,............'],
  ['#0d1f5c#2a5bd7#1a3a9a#8fb0ff', '............,.....oo.....,....o33o....,...o3111o...,..o311121o..,.o31121111o.,.o11111211o.,..o112112o..,...o1122o...,....o22o....,.....oo.....,............'],
  ['#0b4a1e#2ecc5a#179a3c#a6ffbe', '....oooo....,...o3311o...,..o331112o..,..o311112o..,..o311122o..,..o311122o..,..o111122o..,..o111222o..,..o112222o..,...o1222o...,....oooo....,............'],
  ['#0c4f55#4ee6e0#22a8b0#d0fffc', '............,............,..oooooooo..,.o33313331o.,o3311311311o,oooooooooooo,.o11112222o.,..o111222o..,...o1122o...,....o12o....,.....oo.....,............'],
  ['#140f12#4d4246#2c2629#857579', '............,...oooooo...,..o333331o..,.o31111112o.,.o22222222o.,o3111111122o,o2222222222o,o1111111122o,o2222222222o,o1111111222o,oooooooooooo,............'],
  ['#5c5c70#f4f4ff#bcbcd6#ffffff', '.....oo.....,....o33o....,....o31o....,...o3112o...,.oo311112oo.,o3331111222o,.oo111122oo.,...o1122o...,....o12o....,....o22o....,.....oo.....,............'],
  ['#24343e#5ee8ff#7f98a4#eafcff', 'oooooooooooo,o3333333332o,o3........2o,o3..oooo..2o,o3.o1111o.2o,o3.o1111o.2o,o3.o1111o.2o,o3.o1111o.2o,o3..oooo..2o,o3........2o,o2222222222o,oooooooooooo'],
  ['#08000e#2a0f3a#160820#b04ce0', '....oooo....,...o3112o...,..o311122o..,..o113112o..,.o31111312o.,.o11211112o.,.o13111122o.,.o11113122o.,.o11211222o.,..o112222o..,...oooooo...,............']
].map(([pal, rows]) => {
  const c = pal.split('#').slice(1).map(h => '#' + h), runs = [];
  rows.split(',').forEach((row, y) => {
    for (let x = 0; x < 12;) {
      const ch = row[x]; let w = 1;
      while (x + w < 12 && row[x + w] === ch) w++;
      if (ch !== '.') runs.push([c['o123'.indexOf(ch)], x, y, w]);
      x += w;
    }
  });
  return { base: c[1], runs };
});
// 3×5 像素数字（数值角标）
const DIG = '111101101101111,010110010010111,111001111100111,111001111001111,101101111001001,111100111001111,111100111101111,111001001001001,111101111101111,111101111001111'.split(',');

// 方块内布局（相对方块左上角，设备像素）：k 圆角/边距，ps 图案像素，ox/oy 图案左上角；
// 数值角标放在图案上方的空带里，位数多时缩小像素：不压图案、不出方块；dp = 0 表示太小不画（仅出现在弹出动画的头几帧）
export function layout(s, digits) {
  const k = Math.max(1, Math.round(s / 24)), ps = Math.floor(s * 0.6 / 12);
  const ox = Math.floor((s - ps * 12) / 2), oy = Math.floor((s - ps * 12) / 2) + ps;
  const bx = 2 * k, by = k;
  const dp = Math.max(0, Math.min(Math.max(1, Math.floor(s / 30)), Math.floor((oy - 1 - by) / 7), Math.floor((s - 4 * k) / (digits * 4 + 1))));
  return { k, ps, ox, oy, bx, by, dp, bw: digits * 4 * dp + dp, bh: 7 * dp };
}

// ---------- 纯逻辑（可测试） ----------
// 反应类游戏：每局的随机序列真随机（版本号只决定难度档与外观）；仅在地址带 ?egg-test&egg-seed=<整数> 时用固定种子，便于确定性测试
function roundSeed(k) {
  const m = typeof location !== 'undefined' && /[?&]egg-test\b/.test(location.search) && /[?&]egg-seed=(\d+)/.exec(location.search);
  if (m) return (Number(m[1]) ^ Math.imul(k + 1, 0x9E3779B9)) >>> 0;
  try { return crypto.getRandomValues(new Uint32Array(1))[0]; } catch (e) { return (Math.random() * 4294967296) >>> 0; }
}
export function rng(a) {
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// dir：0 左 1 右 2 上 3 下；返回从目标边开始排列的格子下标
function line(dir, k) {
  const a = [];
  for (let i = 0; i < 4; i++) {
    const j = dir === 0 || dir === 2 ? i : 3 - i;
    a.push(dir < 2 ? k * 4 + j : j * 4 + k);
  }
  return a;
}
// g：长度 16 的数组，0 为空，其余为材料等级（1 = 圆石）
export function move(g, dir) {
  const out = g.slice(), slides = [], merged = [];
  let score = 0, moved = false;
  for (let k = 0; k < 4; k++) {
    const idx = line(dir, k), vals = idx.map(i => g[i]);
    idx.forEach(i => { out[i] = 0; });
    let w = -1, can = false;
    for (let i = 0; i < 4; i++) {
      const v = vals[i];
      if (!v) continue;
      if (can && out[idx[w]] === v) {
        out[idx[w]] = v + 1; score += value(v + 1); merged.push(idx[w]); can = false;
      } else { out[idx[++w]] = v; can = true; }
      slides.push([idx[i], idx[w], v]);
      if (idx[i] !== idx[w]) moved = true;
    }
  }
  return { g: out, score, moved, slides, merged };
}
export function canMove(g) {
  for (let i = 0; i < 16; i++) {
    if (!g[i]) return true;
    if (i % 4 < 3 && g[i] === g[i + 1]) return true;
    if (i < 12 && g[i] === g[i + 4]) return true;
  }
  return false;
}
export function spawn(g, r) {
  const e = [];
  g.forEach((v, i) => { if (!v) e.push(i); });
  if (!e.length) return -1;
  const i = e[Math.floor(r() * e.length)];
  g[i] = r() < 0.9 ? 1 : 2;
  return i;
}
export function newBoard(seed, round) {
  const r = rng((seed + Math.imul(round, 0x9E3779B9)) >>> 0), g = new Array(16).fill(0);
  spawn(g, r); spawn(g, r);
  return { g, r };
}

// ---------- 界面 ----------
const CSS = `.${P}{max-width:440px;margin:0 auto;font:inherit;color:var(--${P}-txt);-webkit-user-select:none;user-select:none}
.${P}-bar,.${P}-foot{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:6px 2px;font-size:14px;font-variant-numeric:tabular-nums}
.${P}-cv{display:block;touch-action:none;border-radius:6px;outline:none;cursor:grab}
.${P}-cv:focus-visible{box-shadow:0 0 0 3px var(--${P}-acc)}
.${P}-msg{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.85}
.${P}-btn{font:inherit;font-size:14px;padding:6px 14px;border:0;border-radius:6px;cursor:pointer;white-space:nowrap;background:var(--${P}-fill);color:var(--${P}-on)}
.${P}-btn.${P}-sec{background:transparent;color:var(--${P}-txt);box-shadow:inset 0 0 0 1px currentColor}
.${P}-btn:focus-visible{outline:2px solid var(--${P}-txt);outline-offset:2px}`;

const THEMES = {
  light: { board: '#cdc3b0', empty: '#e7dfcf', tile: '#faf6ee', text: '#2b2b2b', acc: '#3a7d44', on: '#ffffff', dim: 'rgba(250,246,238,.5)', badge: 'rgba(30,30,30,.72)' },
  dark: { board: '#1d2128', empty: '#2c313a', tile: '#5a616d', text: '#e8e8e8', acc: '#6fbf73', on: '#10140f', dim: 'rgba(14,16,20,.5)', badge: 'rgba(0,0,0,.6)' }
};
const KEYS = { ArrowLeft: 0, ArrowRight: 1, ArrowUp: 2, ArrowDown: 3, a: 0, d: 1, w: 2, s: 3 };

/* 内置文案：与 dist/assets/egg/texts/merge.js 相同，只在文案文件加载失败时使用。改文字请改 texts/merge.js */
const TEXTS = {
  name: '（待服主填写）',
  intro: '',
  hud: { score: '分数 {score}', best: '最高分 {best}' },
  button: { start: '开始', new_game: '新的一局', again: '再来一次' },
  msg: { controls: '方向键 / WASD / 滑动', unlocked: '已解锁：{tier}', diamond: '钻石！可继续合成', over: '无路可走' },
  tiers: {
    cobblestone: '圆石', coal: '煤炭', iron_ingot: '铁锭', gold_ingot: '金锭', redstone: '红石', lapis_lazuli: '青金石',
    emerald: '绿宝石', diamond: '钻石', netherite_ingot: '下界合金锭', nether_star: '下界之星', beacon: '信标', dragon_egg: '龙蛋'
  },
  canvas_label: '矿物合成 4×4 棋盘',
  canvas_label_unlocked: '矿物合成 4×4 棋盘，已解锁：{tier}（{value}）'
};

export default {
  id: ID,
  title: '（待服主填写）', // 游戏名的兜底；实际显示 texts/merge.js 的 name
  texts: TEXTS,
  mount(root, ctx) {
    const tx = ctx.t;   // 文案：texts/merge.js（加载失败时用上面的 TEXTS）
    const nameOf = t => tx('tiers.' + NAMES[Math.min(t, NAMES.length) - 1]);
    const ac = new AbortController(), sig = ac.signal;
    const on = (el, ev, fn, o) => el.addEventListener(ev, fn, Object.assign({ signal: sig }, o));
    ctx.signal && ctx.signal.addEventListener('abort', () => ac.abort(), { once: true });
    let style = document.getElementById(P + '-style');
    const ownStyle = !style;
    if (ownStyle) { style = document.createElement('style'); style.id = P + '-style'; style.textContent = CSS; document.head.appendChild(style); }

    const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = P + '-' + cls; if (txt) e.textContent = txt; return e; };
    const wrap = el('div'); wrap.className = P;
    const bar = el('div', 'bar'), scoreEl = el('span'), bestEl = el('span');
    const cv = el('canvas', 'cv'); cv.tabIndex = 0; cv.setAttribute('role', 'img');
    const foot = el('div', 'foot'), msg = el('span', 'msg'), btn = el('button', 'btn', tx('button.start'));
    btn.type = 'button'; msg.setAttribute('aria-live', 'polite');
    bar.append(scoreEl, bestEl); foot.append(msg, btn); wrap.append(bar, cv, foot); root.appendChild(wrap);
    const g2 = cv.getContext('2d');

    const rm = !!ctx.reducedMotion;
    let state = 'idle', g = new Array(16).fill(0), r = null, round = 0, score = 0, top = 0, won = false;
    let best = +(ctx.storage && ctx.storage.get('best')) || 0;
    let anim = null, cel = null, raf = 0, T = THEMES.light;

    function theme() {
      const dark = (ctx.theme && ctx.theme()) === 'dark', b = dark ? THEMES.dark : THEMES.light;
      const c = n => (ctx.color && ctx.color(n) || '').trim();
      T = Object.assign({}, b, { text: c('--text') || b.text, acc: c('--accent') || b.acc, fill: c('--accent-fill') || b.acc, on: c('--on-accent') || b.on });   // 棋盘底色用自带配色：站点 --border 与空格底色几乎相同，空格会看不出来
      wrap.style.setProperty(`--${P}-txt`, T.text);
      wrap.style.setProperty(`--${P}-acc`, T.acc);
      wrap.style.setProperty(`--${P}-on`, T.on);
      wrap.style.setProperty(`--${P}-fill`, T.fill);
      draw(performance.now());
    }
    function hud() {
      scoreEl.textContent = tx('hud.score', { score });
      bestEl.textContent = tx('hud.best', { best });
      cv.setAttribute('aria-label', top ? tx('canvas_label_unlocked', { tier: nameOf(top), value: value(top) }) : tx('canvas_label'));
    }
    function say(t) { msg.textContent = t; }

    // 尺寸（设备像素，整数对齐）
    let W = 0, off = 0, cell = 0, gap = 0, dpr = 1;
    function resize() {
      // 宿主横屏全屏（.egg-fs）时按高度收紧：棋盘连同上下两行一屏放得下，两行与棋盘同宽
      const fs = root.classList.contains('egg-fs');
      wrap.style.maxWidth = '';
      let cw = Math.max(200, Math.min(440, wrap.clientWidth || root.clientWidth || 320));
      if (fs) { cw = Math.max(160, Math.min(cw, (window.innerHeight || 800) - 90)); wrap.style.maxWidth = cw + 'px'; }
      dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
      W = Math.round(cw * dpr);
      cv.width = cv.height = W; cv.style.width = cv.style.height = W / dpr + 'px';
      gap = Math.max(2, Math.round(W * 0.022));
      cell = Math.floor((W - Math.round(W * 0.03) * 2 - gap * 3) / 4);
      off = Math.floor((W - cell * 4 - gap * 3) / 2);
      draw(performance.now());
    }
    const pos = i => [off + (i % 4) * (cell + gap), off + (i >> 2) * (cell + gap)];

    function box(x, y, s, col) {
      const k = Math.max(1, Math.round(s / 24));
      g2.fillStyle = col;
      g2.fillRect(x + k, y, s - 2 * k, s); g2.fillRect(x, y + k, s, s - 2 * k);
      return k;
    }
    function tile(x, y, s, t) {
      x = Math.round(x); y = Math.round(y); s = Math.round(s);
      if (s < 4) return;
      const sp = SPR[Math.min(t, SPR.length) - 1], str = String(value(t)), L = layout(s, str.length);
      const k = box(x, y, s, T.tile);
      g2.fillStyle = sp.base; g2.fillRect(x + k, y + s - 3 * k, s - 2 * k, 2 * k);
      const ps = L.ps;
      if (ps < 1) return;
      const ox = x + L.ox, oy = y + L.oy;
      for (const [c, rx, ry, w] of sp.runs) { g2.fillStyle = c; g2.fillRect(ox + rx * ps, oy + ry * ps, w * ps, ps); }
      // 数值角标（2^(t−1)）
      const dp = L.dp, bx = x + L.bx, by = y + L.by;
      if (dp < 1) return;
      g2.fillStyle = T.badge; g2.fillRect(bx, by, L.bw, L.bh);
      g2.fillStyle = '#ffffff';
      [...str].forEach((d, n) => {
        const b = DIG[+d];
        for (let q = 0; q < 15; q++) if (b[q] === '1') g2.fillRect(bx + dp + n * 4 * dp + (q % 3) * dp, by + dp + Math.floor(q / 3) * dp, dp, dp);
      });
    }

    function draw(now) {
      if (!W) return;
      g2.imageSmoothingEnabled = false;
      g2.clearRect(0, 0, W, W);
      g2.fillStyle = T.board; g2.fillRect(0, 0, W, W);
      for (let i = 0; i < 16; i++) { const [x, y] = pos(i); box(x, y, cell, T.empty); }
      const e = anim ? now - anim.t0 : Infinity;
      if (e < SLIDE) {
        const p = 1 - (1 - e / SLIDE) ** 2;
        for (const [f, to, v] of anim.slides) {
          const [ax, ay] = pos(f), [bx, by] = pos(to);
          tile(ax + (bx - ax) * p, ay + (by - ay) * p, cell, v);
        }
      } else {
        const q = (e - SLIDE) / POP;
        for (let i = 0; i < 16; i++) {
          if (!g[i]) continue;
          let s = 1;
          if (q < 1 && anim.merged.includes(i)) s = 1 + 0.12 * Math.sin(Math.PI * q);
          if (q < 1 && anim.spawn === i) s = Math.max(0.1, q);
          const [x, y] = pos(i), d = Math.round(cell * s);
          tile(x + Math.round((cell - d) / 2), y + Math.round((cell - d) / 2), d, g[i]);
        }
      }
      let more = e < SLIDE + POP;
      if (cel) {
        const t = (now - cel.t0) / CEL;
        if (t < 1) {
          const [x, y] = pos(cel.i), cx = x + cell / 2, cy = y + cell / 2, sz = Math.max(2, Math.round(cell / 14));
          g2.globalAlpha = 1 - t;
          for (let n = 0; n < 20; n++) {
            const a = n / 20 * Math.PI * 2, d = cell * (0.3 + t * (n % 2 ? 1.1 : 0.8));
            g2.fillStyle = n % 3 ? '#4ee6e0' : '#ffffff';
            g2.fillRect(Math.round(cx + Math.cos(a) * d - sz / 2), Math.round(cy + Math.sin(a) * d - sz / 2), sz, sz);
          }
          g2.globalAlpha = 1; more = true;
        } else cel = null;
      }
      if (state === 'over' && !more) { g2.fillStyle = T.dim; g2.fillRect(0, 0, W, W); }
      if (more && !raf) raf = requestAnimationFrame(t => { raf = 0; draw(t); });
      if (!more) anim = null;
    }

    function start() {
      ({ g, r } = newBoard(roundSeed(round), round)); round++;
      state = 'play'; score = 0; won = false; top = Math.max(...g); anim = null; cel = null;
      // 进行中是次要样式的「新的一局」，只有无路可走时才是主按钮「再来一次」，避免开局就像输了
      btn.textContent = tx('button.new_game'); btn.classList.add(P + '-sec'); say(tx('msg.unlocked', { tier: nameOf(top) })); hud();
      draw(performance.now());
      cv.focus({ preventScroll: true });
    }
    function go(dir) {
      if (state !== 'play') return;
      const m = move(g, dir);
      if (!m.moved) return;
      g = m.g; score += m.score;
      const sp = spawn(g, r), mx = Math.max(...g), A = ctx.audio;
      // 音效：滑动一声轻响；有合成时音调随合成出的最高等级升高；首次合成钻石是庆祝音；无路可走是失败音
      if (A) {
        if (m.merged.length) A.sfx('pickup', { pitch: 0.55 + 0.09 * Math.max(...m.merged.map(i => g[i])) });
        else A.sfx('step', { vol: 0.6 });
        if (!won && mx >= WIN) A.sfx('win');
        if (!canMove(g)) A.sfx('fail');
      }
      if (score > best) { best = score; ctx.storage && ctx.storage.set('best', String(best)); }
      if (mx > top) { top = mx; say(tx('msg.unlocked', { tier: nameOf(top) })); }
      if (!won && mx >= WIN) {
        won = true; say(tx('msg.diamond'));
        if (!rm) cel = { t0: performance.now() + SLIDE, i: g.indexOf(mx) };
      }
      if (!canMove(g)) { state = 'over'; say(tx('msg.over')); btn.textContent = tx('button.again'); btn.classList.remove(P + '-sec'); }
      hud();
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      anim = rm ? null : { t0: performance.now(), slides: m.slides, merged: m.merged, spawn: sp };
      draw(performance.now());
    }

    on(btn, 'click', start);
    on(wrap, 'keydown', e => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const d = KEYS[e.key.length === 1 ? e.key.toLowerCase() : e.key];
      if (d !== undefined && state === 'play') { e.preventDefault(); go(d); }
      else if (e.target === cv && state !== 'play' && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); start(); }
    });
    let sw = null;
    on(cv, 'pointerdown', e => {
      if (!e.isPrimary || e.button > 0) return;
      cv.focus({ preventScroll: true });
      sw = { id: e.pointerId, x: e.clientX, y: e.clientY };
      try { cv.setPointerCapture(e.pointerId); } catch (_) { /* 忽略 */ }
      e.preventDefault();
    });
    on(cv, 'pointerup', e => {
      if (!sw || e.pointerId !== sw.id) return;
      const dx = e.clientX - sw.x, dy = e.clientY - sw.y, th = Math.max(24, cv.clientWidth * 0.08);
      sw = null;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < th) return;
      go(Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 0 : 1) : (dy < 0 ? 2 : 3));
    });
    on(cv, 'pointercancel', () => { sw = null; });
    on(cv, 'touchmove', e => e.preventDefault(), { passive: false });

    const ro = new ResizeObserver(resize);
    on(window, 'resize', () => { if (root.classList.contains('egg-fs')) resize(); });   // 全屏中横竖屏切换：高度变而宽度可能不变
    ro.observe(root);
    ctx.onThemeChange && ctx.onThemeChange(theme);
    say(tx('msg.controls')); hud(); theme(); resize();
    // 自动测试用：地址带 ?egg-test 时可直接摆盘（检查高位数角标），不影响正常游玩
    if (/[?&]egg-test\b/.test(location.search)) root.__eggTest = { set(a) { g = a.slice(); top = Math.max(...g); state = 'play'; anim = null; hud(); draw(performance.now()); } };

    return {
      unmount() {
        ac.abort(); ro.disconnect(); delete root.__eggTest;
        if (raf) cancelAnimationFrame(raf);
        raf = 0; state = 'gone';
        wrap.remove();
        if (ownStyle) style.remove();
      }
    };
  }
};
