// 404 彩蛋 「钓鱼佬」（原创像素画，无外部资源）
const ID = 'fishing', P = 'egg-' + ID + '-';
const W = 160, H = 100, SURF = 40;          // 逻辑像素画布、水面 y
const STEP = 1000 / 120, CAP = 100;         // 固定步长 120Hz，单帧 dt 上限
const CASTS = 10;
const ms2t = (ms) => Math.round(ms / STEP);

// —— 物品表 ——  g: 0 鱼 1 宝藏 2 垃圾
// id 同时是文案键（名字见 texts/fishing.js 的 items）
const ITEMS = [
  ['cod', 10, 0], ['salmon', 15, 0], ['puffer', 20, 0], ['tropical', 30, 0],
  ['tag', 50, 1], ['shell', 45, 1], ['book', 60, 1],
  ['boot', 1, 2], ['stick', 1, 2],
].map(([id, pts, g]) => ({ id, pts, g }));
const BY = Object.fromEntries(ITEMS.map((x) => [x.id, x]));

// 8x8 原创像素图；每行 8 字符，'.' 透明
const FISH = ['........', '....ff..', '.aaaaa.f', 'aeaaaaff', 'abbbbaff', '.bbbbb.f', '....f...', '........'];
const SPR = {
  cod: [FISH, { a: '#8a6f4d', b: '#cdb48c', e: '#151515', f: '#62492f' }],
  salmon: [FISH, { a: '#b8463a', b: '#e88f6c', e: '#151515', f: '#7a2c22' }],
  tropical: [['........', '...ff...', '.abab..f', 'aebabaff', 'ababa.ff', '.abab..f', '...ff...', '........'],
    { a: '#f08a24', b: '#f6f2ea', e: '#151515', f: '#3a8ad0' }],
  puffer: [['.s.s.s..', '.yyyyy..', 'syeyyyyf', 'yyyyyyff', 'syyymyyf', '.yyyyy..', '.s.s.s..', '........'],
    { y: '#e8c832', s: '#a88a14', e: '#151515', m: '#e06a30', f: '#c9a018' }],
  tag: [['.s......', 's.s.....', '.s.dddd.', '..dttttd', '.dttttd.', 'dttttd..', 'dtttd...', '.ddd....'],
    { s: '#d9d9d9', d: '#7a5a2c', t: '#d4ae6e' }],
  shell: [['..cccc..', '.crrrcc.', 'crccrcc.', 'crcorcc.', 'crccrcc.', '.crrcc..', '..ccc...', '........'],
    { c: '#eadcc0', r: '#c87a5a', o: '#8a4a34' }],
  book: [['.kkkkkk.', '.kpqppkw', '.kppqpkw', '.kpppqkw', '.kqpppkw', '.kppppkw', '.kkkkkkw', '..wwwwww'],
    { k: '#3a2060', p: '#6a3fa0', q: '#d6b0ff', w: '#eeeae0' }],
  boot: [['..bbb...', '..bbb...', '..bdb...', '..bbb...', '..bbbb..', '.bbbbbbb', '.ddddddd', '........'],
    { b: '#6b4226', d: '#3e2614' }],
  stick: [['.......s', '......sd', '.....sd.', '....sd..', '...sd...', '..sd....', '.sd.....', 'sd......'],
    { s: '#a07a44', d: '#5a4226' }],
};
const BANG = ['.kkkkk.', 'kwwwwwk', 'kwwrwwk', 'kwwrwwk', 'kwwrwwk', 'kwwwwwk', 'kwwrwwk', 'kwwwwwk', '.kkkkk.', '...k...'];

const PAL = {
  light: {
    sky: ['#9fd0ff', '#b6dcfd', '#cde7fb'], orb: '#fff3b0', cloud: '#ffffff', hill: '#5f9f45', hill2: '#4b8738',
    water: ['#4a86dc', '#3d76cc', '#3266ba', '#2a58a6'], surf: '#8ab8f2', shim: '#d8ebff',
    dock: '#a0703e', dock2: '#6e4a26', rod: '#5a3a1a', line: '#2a2a2a', bob: '#d8322c', bobW: '#f4f4f4', bobO: '#1a1a1a',
    alert: '#ffd21f', bub: '#e8f4ff', strip: 'rgba(10,20,40,.35)', slot: 'rgba(255,255,255,.35)', cur: '#ffffff',
    sil: 'rgba(40,50,70,.35)', miss: '#c9d4e4',
  },
  dark: {
    sky: ['#070d22', '#0c1531', '#122046'], orb: '#efe8c4', cloud: '#c8cfee', hill: '#1d3f24', hill2: '#163219',
    water: ['#143066', '#102958', '#0c214a', '#09193a'], surf: '#33599e', shim: '#5f86cc',
    dock: '#5e4024', dock2: '#3a2614', rod: '#8a6a3a', line: '#d8d8d8', bob: '#e2453c', bobW: '#e8e8e8', bobO: '#05070d',
    alert: '#ffd21f', bub: '#9fc0f0', strip: 'rgba(0,0,0,.45)', slot: 'rgba(255,255,255,.22)', cur: '#e8eefc',
    sil: 'rgba(200,210,240,.22)', miss: '#7d8cab',
  },
};

// 反应类游戏：每局的随机序列真随机（版本号只决定难度档与外观）；仅在地址带 ?egg-test&egg-seed=<整数> 时用固定种子，便于确定性测试
function roundSeed(k) {
  const m = typeof location !== 'undefined' && /[?&]egg-test\b/.test(location.search) && /[?&]egg-seed=(\d+)/.exec(location.search);
  if (m) return (Number(m[1]) ^ Math.imul(k + 1, 0x9E3779B9)) >>> 0;
  try { return crypto.getRandomValues(new Uint32Array(1))[0]; } catch (e) { return (Math.random() * 4294967296) >>> 0; }
}
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TIERS = 11;
// 难度档周期化：tier = cycle mod P（不封顶），这样每个难度档都对应无限多个 n（每局序列另取真随机种子）
export function tier(cycle) {
  const c = Math.floor(Math.abs(Number(cycle)));
  return Number.isFinite(c) ? c % TIERS : 0;
}

// 一轮的确定性日程：每竿的咬钩时刻、假咬（轻点）、落点、战利品骰
function schedule(seed, cycle, round) {
  const r = rng((seed ^ Math.imul(round + 1, 0x9e3779b9)) >>> 0);
  const c = tier(cycle);                             // 难度档 = cycle mod 11
  const win = Math.round(1000 - c * 35);            // 1000ms → 650ms
  const maxNib = Math.min(3, 1 + Math.floor(c / 3));
  const out = [];
  for (let i = 0; i < CASTS; i++) {
    const bite = Math.round(1800 + r() * 2800);
    const k = Math.floor(r() * (maxNib + 1));
    const nib = [];
    for (let j = 0; j < k; j++) nib.push(Math.round(400 + r() * (bite - 1400)));
    nib.sort((x, y) => x - y);
    out.push({ bite, nib, x: 92 + Math.floor(r() * 36), loot: r(), pick: r(), dir: r() < 0.5 ? -1 : 1 });
  }
  return { win, casts: out };
}

function judge(rt, win) {
  if (rt <= Math.max(260, win * 0.4)) return 2;    // 完美
  if (rt <= win * 0.75) return 1;                   // 不错
  return 0;                                         // 勉强
}
function lootFor(tier, loot, pick) {
  const of = (ids) => ids[Math.min(ids.length - 1, Math.floor(pick * ids.length))];
  if (tier === 2) return loot < 0.3 ? of(['tag', 'shell', 'book']) : loot < 0.85 ? of(['salmon', 'puffer', 'tropical']) : 'cod';
  if (tier === 1) return loot < 0.06 ? of(['tag', 'shell', 'book']) : loot < 0.9 ? of(['cod', 'salmon', 'puffer']) : of(['boot', 'stick']);
  return loot < 0.6 ? of(['cod', 'salmon']) : of(['boot', 'stick']);
}

const CSS = `
.${P}wrap{max-width:642px;margin:0 auto;font:inherit;color:var(--${P}text);user-select:none;-webkit-user-select:none}
.${P}hud{display:flex;gap:12px;justify-content:space-between;font-size:14px;margin:0 2px 6px;font-variant-numeric:tabular-nums}
.${P}stage{position:relative;touch-action:none;-webkit-tap-highlight-color:transparent;line-height:0}
.${P}cv{display:block;margin:0 auto;max-width:calc(100% - 2px);height:auto;aspect-ratio:${W}/${H};image-rendering:pixelated;border-radius:6px;border:1px solid var(--${P}border);outline:none;cursor:pointer;box-sizing:content-box}
.${P}cv:focus-visible{box-shadow:0 0 0 3px var(--${P}accent)}
.${P}ov{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;line-height:1.4;pointer-events:none}
.${P}ov[hidden]{display:none}
.${P}ov>*{pointer-events:auto}
.${P}res{background:var(--${P}surface);color:var(--${P}text);padding:4px 12px;border-radius:6px;font-size:15px;border:1px solid var(--${P}border)}
.${P}res:empty{display:none}
.${P}btn{font:inherit;font-size:16px;padding:8px 22px;border-radius:8px;border:0;background:var(--${P}fill);color:var(--${P}on);cursor:pointer}
.${P}btn:focus-visible{outline:3px solid var(--${P}text);outline-offset:2px}
.${P}st{min-height:1.5em;margin:6px 2px 0;font-size:14px;color:var(--${P}muted);text-align:center}
.${P}dex{display:flex;align-items:center;gap:8px;margin-top:6px;font-size:13px;color:var(--${P}muted)}
.${P}dexc{height:24px;width:auto;aspect-ratio:108/12;image-rendering:pixelated}
`;

/* 内置文案：与 dist/assets/egg/texts/fishing.js 相同，只在文案文件加载失败时使用。改文字请改 texts/fishing.js */
const TEXTS = {
  name: '（待服主填写）',
  intro: '',
  hud: { score: '分数 {score}', cast: '竿 {cast}/{casts}', best: '最高 {best}' },
  button: { start: '开始', again: '再钓一轮' },
  result: { score: '本轮 {score} 分', score_record: '本轮 {score} 分 · 新纪录' },
  msg: {
    ready: '点击或按空格抛竿', waiting: '等待咬钩…', bite: '上钩了！快收竿', too_early: '太早了', got_away: '跑掉了', caught: '{item} +{points}',
    caught_perfect: '{item} +{points}（完美）'
  },
  dex: { count: '图鉴 {found}/{total}', label: '图鉴：{items}', separator: '、', none: '无' },
  items: { cod: '鳕鱼', salmon: '鲑鱼', puffer: '河豚', tropical: '热带鱼', tag: '命名牌', shell: '鹦鹉螺壳', book: '附魔书', boot: '旧靴子', stick: '木棍' },
  canvas_label: '钓鱼小游戏画面'
};

export default {
  id: ID,
  title: '（待服主填写）', // 游戏名的兜底；实际显示 texts/fishing.js 的 name
  texts: TEXTS,
  mount(root, ctx) {
    const tx = ctx.t;   // 文案：texts/fishing.js（加载失败时用上面的 TEXTS）
    const sig = ctx.signal;
    const on = (el, ev, fn, o) => el.addEventListener(ev, fn, Object.assign({ signal: sig }, o));
    const doc = root.ownerDocument || document;
    const style = doc.createElement('style');
    style.textContent = CSS;
    const el = (tag, cls, txt) => { const e = doc.createElement(tag); if (cls) e.className = P + cls; if (txt != null) e.textContent = txt; return e; };

    const wrap = el('div', 'wrap');
    const hud = el('div', 'hud');
    const hScore = el('span'), hCast = el('span'), hBest = el('span');
    hud.append(hScore, hCast, hBest);
    const stage = el('div', 'stage');
    const cv = el('canvas', 'cv');
    cv.tabIndex = 0;
    cv.setAttribute('role', 'img');
    cv.setAttribute('aria-label', tx('canvas_label'));
    const ov = el('div', 'ov');
    const res = el('div', 'res');
    const btn = el('button', 'btn', tx('button.start'));
    btn.type = 'button';
    ov.append(res, btn);
    stage.append(cv, ov);
    const st = el('div', 'st');
    st.setAttribute('aria-live', 'polite');
    const dex = el('div', 'dex');
    const dexL = el('span');
    const dexC = el('canvas', 'dexc');
    dexC.setAttribute('role', 'img');
    dex.append(dexL, dexC);
    wrap.append(style, hud, stage, st, dex);
    root.append(wrap);

    const buf = doc.createElement('canvas');
    buf.width = W; buf.height = H;
    const g = buf.getContext('2d');
    const out = cv.getContext('2d');
    dexC.width = 108; dexC.height = 12;
    const dg = dexC.getContext('2d');

    // —— 存储 ——
    const sget = (k) => { try { return ctx.storage.get(k); } catch (e) { return null; } };
    const sset = (k, v) => { try { ctx.storage.set(k, v); } catch (e) { /* 静默 */ } };
    let best = parseInt(sget('best'), 10) || 0;
    const found = new Set(String(sget('dex') || '').split(',').filter((x) => BY[x]));

    // —— 状态 ——
    const cycle = Number(ctx.cycle) || 0;
    const rm = !!ctx.reducedMotion, mirror = !!ctx.negative;
    let round = 0, sch = schedule(roundSeed(0), cycle, 0);
    let S = { ph: 'idle', i: 0, pt: 0, t: 0, score: 0, log: [], last: null };
    let acc = 0, lastTs = null, raf = 0, queue = 0, dead = false, newBest = false;
    const active = () => S.ph !== 'idle' && S.ph !== 'over';

    // —— 主题配色 ——
    let pal;
    function theme() {
      const dk = ctx.theme && ctx.theme() === 'dark';
      pal = PAL[dk ? 'dark' : 'light'];
      const fb = dk
        ? { text: '#e6e9f0', muted: '#9aa3b5', border: '#2c3446', surface: '#161b26', accent: '#5ea0ff', fill: '#5ea0ff', on: '#0b0f17' }
        : { text: '#1d2330', muted: '#5d6678', border: '#d5dae3', surface: '#ffffff', accent: '#2f6fdb', fill: '#2f6fdb', on: '#ffffff' };
      const map = { text: '--text', muted: '--muted', border: '--border', surface: '--surface', accent: '--accent', fill: '--accent-fill', on: '--on-accent' };
      for (const k in map) {
        let v = '';
        try { v = (ctx.color && ctx.color(map[k])) || ''; } catch (e) { v = ''; }
        wrap.style.setProperty('--' + P + k, String(v).trim() || fb[k]);
      }
      draw(); drawDex();
    }

    // —— 尺寸 ——
    // 后备缓冲 = 160×100 逻辑像素 × 整数 k，CSS 尺寸 = 缓冲 / dpr：每个逻辑像素都是 k×k 个设备像素，
    // 移动的波光、浮漂不会忽宽忽窄；按宿主容器（不受本游戏尺寸影响）计算，HUD 与图鉴跟画布同宽
    function fit() {
      const dpr = (doc.defaultView && doc.defaultView.devicePixelRatio) || 1;
      const vh = (doc.defaultView && doc.defaultView.innerHeight) || 800;   // 横屏手机：画布连同 HUD 一屏放得下
      const avail = Math.min(640, Math.max(0, (root.clientWidth || W * 2) - 2), Math.max(H, vh - 150) * W / H);
      const k = Math.max(1, Math.floor(avail * dpr / W));
      cv.style.width = (W * k / dpr) + 'px';
      wrap.style.width = (W * k / dpr + 2) + 'px';
      if (cv.width !== W * k) { cv.width = W * k; cv.height = H * k; draw(); }
    }

    // —— 输入 ——
    function press() {
      if (!active() || dead || doc.hidden) return;
      queue++;
      if (!raf) kick();
    }
    on(cv, 'pointerdown', (e) => {
      if (e.button > 0) return;
      e.preventDefault();
      try { cv.focus({ preventScroll: true }); } catch (_) { /* */ }
      press();
    });
    on(cv, 'contextmenu', (e) => e.preventDefault());
    on(root, 'keydown', (e) => {
      if (e.target === btn || e.repeat) return;
      if (e.key === ' ' || e.key === 'Enter' || e.code === 'Space') {
        if (!active()) return;
        e.preventDefault();
        press();
      }
    });
    on(btn, 'click', start);
    on(doc, 'visibilitychange', () => {
      if (doc.hidden) { if (raf) cancelAnimationFrame(raf); raf = 0; lastTs = null; queue = 0; }
      else if (active()) kick();
    });
    let ro = null;
    if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(fit); ro.observe(root); }
    on(doc.defaultView, 'resize', fit);
    if (ctx.onThemeChange) ctx.onThemeChange(theme);

    // —— 流程 ——
    function start() {
      sch = schedule(roundSeed(round), cycle, round); round++;
      S = { ph: 'ready', i: 0, pt: 0, t: 0, score: 0, log: [], last: null };
      newBest = false; acc = 0; queue = 0;
      res.textContent = '';
      ov.hidden = true;
      try { cv.focus({ preventScroll: true }); } catch (_) { /* */ }
      ui(tx('msg.ready'));
      kick();
    }
    function go(ph) { S.ph = ph; S.pt = 0; }
    // 音效（都在固定步长 tick / 输入里触发，与画面同一个时钟）：抛竿、浮漂入水、轻啄、咬钩（与"!"同一步）、
    // 收竿水花，鱼 / 宝藏 / 垃圾各不同；太早或跑掉是失败音
    const snd = (n, o) => { if (ctx.audio) ctx.audio.sfx(n, o); };
    function input() {
      const c = sch.casts[S.i];
      if (S.ph === 'ready') { go('cast'); ui(tx('msg.waiting')); snd('jump', { pitch: 0.6, vol: 0.7 }); }
      else if (S.ph === 'wait') { snd('fail', { vol: 0.6 }); finish(null, tx('msg.too_early')); }
      else if (S.ph === 'bite') {
        const tier = judge(S.pt * STEP, sch.win);
        const it = BY[lootFor(tier, c.loot, c.pick)];
        const pts = it.pts * (tier === 2 ? 2 : 1);
        S.score += pts;
        if (!found.has(it.id)) { found.add(it.id); sset('dex', [...found].join(',')); }
        snd('splash', { vol: 0.8 });
        snd(it.g === 1 ? 'win' : it.g === 2 ? 'place' : 'pickup', it.g === 2 ? { pitch: 0.6 } : { vol: it.g === 1 ? 0.7 : 1, pitch: tier === 2 ? 1.25 : 1 });
        finish({ id: it.id, tier, pts, rt: Math.round(S.pt * STEP) },
          tx(tier === 2 ? 'msg.caught_perfect' : 'msg.caught', { item: tx('items.' + it.id), points: pts }));
      }
    }
    function finish(entry, msg) {
      S.log.push(entry);
      S.last = entry;
      go('result');
      ui(msg);
    }
    function tick() {
      S.t++; S.pt++;
      const c = sch.casts[S.i];
      if (S.ph === 'cast' && S.pt >= ms2t(350)) { go('wait'); snd('splash', { pitch: 1.8, vol: 0.4 }); }
      else if (S.ph === 'wait' && S.pt >= ms2t(c.bite)) { go('bite'); ui(tx('msg.bite')); snd('ok', { pitch: 1.3 }); }
      else if (S.ph === 'bite' && S.pt >= ms2t(sch.win)) { snd('fail', { vol: 0.6 }); finish(null, tx('msg.got_away')); }
      else if (S.ph === 'wait' && c.nib.some((n) => S.pt === Math.ceil(n / STEP - 1e-9))) snd('tick', { pitch: 0.5, vol: 0.8 });
      else if (S.ph === 'result' && S.pt >= ms2t(1100)) {
        S.i++;
        if (S.i >= CASTS) end();
        else { go('ready'); ui(tx('msg.ready')); }
      }
    }
    function end() {
      S.ph = 'over';
      if (S.score > best) { best = S.score; newBest = true; sset('best', String(best)); }
      res.textContent = tx(newBest ? 'result.score_record' : 'result.score', { score: S.score });
      btn.textContent = tx('button.again');   // 一轮钓满结束，不是失败
      ov.hidden = false;
      ui('');
      try { btn.focus({ preventScroll: true }); } catch (_) { /* */ }
    }
    function kick() {
      if (raf || dead || doc.hidden || !active()) return;
      lastTs = null;
      raf = requestAnimationFrame(frame);
    }
    function frame(ts) {
      raf = 0;
      if (dead || doc.hidden || !active()) return;
      let dt = lastTs == null ? 0 : ts - lastTs;
      lastTs = ts;
      dt = Math.min(Math.max(dt, 0), CAP);
      // 先处理输入：以玩家看到的那一帧的状态判定（卡顿不会造成不公平的错过）
      while (queue > 0 && active()) { queue--; input(); }
      queue = 0;
      acc += dt;
      while (acc >= STEP && active()) { acc -= STEP; tick(); }
      if (!active()) acc = 0;
      draw();
      if (active()) raf = requestAnimationFrame(frame);
    }

    function ui(msg) {
      hScore.textContent = tx('hud.score', { score: S.score });
      hCast.textContent = tx('hud.cast', { cast: Math.min(S.i + (S.ph === 'idle' ? 0 : 1), CASTS), casts: CASTS });
      hBest.textContent = tx('hud.best', { best });
      if (msg != null) st.textContent = msg;
      dexL.textContent = tx('dex.count', { found: found.size, total: ITEMS.length });
      dexC.setAttribute('aria-label', tx('dex.label', { items: ITEMS.filter((x) => found.has(x.id)).map((x) => tx('items.' + x.id)).join(tx('dex.separator')) || tx('dex.none') }));
      drawDex();
    }

    // —— 绘制 ——
    const px = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x | 0, y | 0, w, h); };
    function spr(ctx2, rows, colors, x, y, tint) {
      for (let r = 0; r < rows.length; r++) for (let q = 0; q < rows[r].length; q++) {
        const ch = rows[r][q];
        if (ch === '.') continue;
        ctx2.fillStyle = tint || colors[ch];
        ctx2.fillRect((x | 0) + q, (y | 0) + r, 1, 1);
      }
    }
    function line(x0, y0, x1, y1, c) {
      x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
      const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      let e = dx + dy;
      g.fillStyle = c;
      for (let n = 0; n < 400; n++) {
        g.fillRect(x0, y0, 1, 1);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * e;
        if (e2 >= dy) { e += dy; x0 += sx; }
        if (e2 <= dx) { e += dx; y0 += sy; }
      }
    }
    const TIP = [54, 14];
    function draw() {
      if (!pal) return;
      const p = pal, ms = S.t * STEP, anim = !rm;
      // 天空
      px(0, 0, W, 14, p.sky[0]); px(0, 14, W, 12, p.sky[1]); px(0, 26, W, SURF - 26, p.sky[2]);
      if (p === PAL.dark) {
        const stars = [[8, 4], [23, 10], [41, 3], [66, 7], [79, 15], [97, 5], [118, 11], [133, 3], [151, 9], [60, 20], [108, 22]];
        for (const [x, y] of stars) px(x, y, 1, 1, p.cloud);
        px(139, 5, 5, 7, p.orb); px(138, 6, 7, 5, p.orb); px(140, 7, 2, 2, p.cloud);
      } else {
        px(136, 5, 7, 7, p.orb);
        px(84, 8, 14, 3, p.cloud); px(88, 6, 7, 2, p.cloud); px(20, 14, 10, 2, p.cloud);
      }
      // 远岸方块
      for (let x = 60; x < W; x += 8) {
        const h = 3 + ((x * 7) % 5);
        px(x, SURF - h, 8, h, ((x >> 3) & 1) ? p.hill : p.hill2);
      }
      // 水
      const bands = [SURF, 54, 68, 82, H];
      for (let b = 0; b < 4; b++) px(0, bands[b], W, bands[b + 1] - bands[b], p.water[b]);
      px(0, SURF, W, 1, p.surf);
      if (anim) {
        for (let k = 0; k < 9; k++) {
          const y = SURF + 4 + k * 5, sp = 6 + (k % 3) * 3;
          const x = ((k * 37 + (ms / 1000) * sp * (k & 1 ? 1 : -1)) % W + W) % W;
          px(x, y, 3 + (k % 3), 1, p.shim);
        }
      } else {
        for (let k = 0; k < 9; k++) px((k * 37) % W, SURF + 4 + k * 5, 3 + (k % 3), 1, p.shim);
      }
      // 码头与鱼竿
      px(0, SURF - 2, 34, 3, p.dock); px(0, SURF + 1, 34, 1, p.dock2);
      for (let x = 2; x < 34; x += 10) px(x, SURF + 2, 2, 8, p.dock2);
      line(22, SURF - 3, TIP[0], TIP[1], p.rod);
      line(23, SURF - 3, TIP[0] + 1, TIP[1], p.rod);

      const c = sch && S.ph !== 'idle' && S.ph !== 'over' ? sch.casts[S.i] : null;
      let bx = TIP[0], by = TIP[1] + 8, sub = 0, alert = false;
      if (c) {
        const ph = S.ph, t = S.pt * STEP;
        if (ph === 'cast') {
          const k = Math.min(1, t / 350);
          bx = TIP[0] + (c.x - TIP[0]) * k;
          by = TIP[1] + 8 + (SURF - 3 - TIP[1] - 8) * k - Math.sin(k * Math.PI) * 14;
        } else if (ph !== 'ready') {
          bx = c.x; by = SURF - 3;
          if (anim && ph === 'wait') by += Math.round(Math.sin(ms / 420)) ;
          if (ph === 'wait') {
            for (const n of c.nib) if (t >= n && t < n + 160) { sub = 1; ripple(bx, 3); }
            const app = c.bite - 1500;
            if (t >= app) {
              const k = (t - app) / 1500;
              const sx = c.x + c.dir * 40 * (1 - k), sy = SURF + 10 - 8 * k;
              for (let j = 0; j < 4; j++) {
                const kk = Math.max(0, k - j * 0.06);
                const wob = anim ? Math.round(Math.sin(ms / 90 + j)) : 0;
                px(c.x + c.dir * 40 * (1 - kk) + 1, SURF + 10 - 8 * kk + wob - j, 1, 1, p.bub);
              }
              px(sx, sy, 2, 1, p.bub);
            }
          } else if (ph === 'bite') {
            sub = 2; alert = true;
            ripple(bx, 4 + (anim ? Math.floor(t / 120) % 3 : 1));
            const f = anim ? Math.floor(t / 80) % 2 : 0;
            px(bx - 4 - f, SURF - 2, 1, 1, p.bub); px(bx + 6 + f, SURF - 3, 1, 1, p.bub);
            px(bx - 2, SURF - 4 - f, 1, 1, p.bub); px(bx + 4, SURF - 5 + f, 1, 1, p.bub);
          } else if (ph === 'result' && S.last) {
            const k = Math.min(1, t / 400);
            const it = S.last.id;
            by = SURF - 3 - Math.round(k * 6);
            spr(g, SPR[it][0], SPR[it][1], bx - 3, SURF - 12 - Math.round(k * 14));
          }
        }
      }
      // 鱼线与浮漂
      if (!(c && S.ph === 'result' && !S.last)) {
        line(TIP[0], TIP[1], bx + 1, by + sub, alert ? p.alert : p.line);
        drawBobber(bx | 0, (by | 0) + sub, alert);
      }
      if (alert) spr(g, BANG, { k: '#1a1a1a', w: p.alert, r: '#c0201a' }, (bx | 0) - 2, SURF - 18);
      // 本轮渔获栏
      if (S.ph !== 'idle') {
        px(3, H - 13, W - 6, 12, p.strip);
        for (let i = 0; i < CASTS; i++) {
          const x = 6 + i * 15, y = H - 12, e = S.log[i];
          const cur = i === S.i && active();
          g.fillStyle = cur ? p.cur : p.slot;
          g.fillRect(x, y, 10, 1); g.fillRect(x, y + 9, 10, 1); g.fillRect(x, y, 1, 10); g.fillRect(x + 9, y, 1, 10);
          if (e) spr(g, SPR[e.id][0], SPR[e.id][1], x + 1, y + 1);
          else if (i < S.log.length) { line(x + 3, y + 3, x + 6, y + 6, p.miss); line(x + 6, y + 3, x + 3, y + 6, p.miss); }
        }
      }
      out.imageSmoothingEnabled = false;
      out.setTransform(1, 0, 0, 1, 0, 0);
      if (mirror) out.setTransform(-1, 0, 0, 1, cv.width, 0);   // 负数 n：镜像水面（玩法不变）
      out.drawImage(buf, 0, 0, W, H, 0, 0, cv.width, cv.height);
    }
    function ripple(x, r) {
      const p = pal;
      px(x - r - 1, SURF, 2, 1, p.shim); px(x + 3 + r - 1, SURF, 2, 1, p.shim);
    }
    // 浮漂：顶尖与红（咬钩时黄）帽始终露出水面，外加 1px 深色描边，停在远岸方块或天空前面也看得清
    function drawBobber(x, y, alert) {
      const p = pal, top = alert ? p.alert : p.bob;
      const rows = [[1, top], [0, top], [0, p.bobW], [0, p.bobW]], pts = [];
      for (let r = 0; r < rows.length; r++) {
        const yy = y + r;
        if (yy > SURF || (yy === SURF && r > (alert ? 1 : 0))) continue;   // 水下部分不画（咬钩时帽沉到水面线）
        for (let q = rows[r][0]; q < 3 - rows[r][0]; q++) pts.push([x + q, yy, rows[r][1]]);
      }
      const has = (a, b) => pts.some((t) => t[0] === a && t[1] === b);
      g.fillStyle = p.bobO;
      for (const [u, v] of pts) for (const [du, dv] of [[-1, 0], [1, 0], [0, -1]]) {
        if (v + dv < SURF && !has(u + du, v + dv)) g.fillRect(u + du, v + dv, 1, 1);
      }
      for (const [u, v, col] of pts) px(u, v, 1, 1, col);
      if (alert) { px(x - 1, y + 1, 1, 1, '#1a1a1a'); px(x + 3, y + 1, 1, 1, '#1a1a1a'); }
    }
    function drawDex() {
      if (!pal) return;
      dg.clearRect(0, 0, 108, 12);
      ITEMS.forEach((it, i) => {
        const [rows, cols] = SPR[it.id];
        spr(dg, rows, cols, i * 12 + 2, 2, found.has(it.id) ? null : pal.sil);
      });
    }

    theme();
    fit();
    ui('');

    return {
      unmount() {
        dead = true;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        if (ro) ro.disconnect();
        wrap.remove();
      },
      // 测试用只读探针
      _debug: () => ({ ph: S.ph, i: S.i, pt: S.pt, t: S.t, score: S.score, log: S.log.slice(), sch, raf: !!raf, best, dex: [...found] }),
    };
  },
};
