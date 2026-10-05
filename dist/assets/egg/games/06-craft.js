// 「合成猜谜」（Wordle 式）—— 404 彩蛋游戏 id: craft
const P = 'egg-craft-';
const MAX_TRIES = 6;

// 材料：键位 0=空，1..8 依次；id 为文案键（名字见 texts/craft.js 的 materials）
const MATS = [
  { k: '.', id: 'empty' },
  { k: 'P', id: 'planks' },
  { k: 'S', id: 'stick' },
  { k: 'C', id: 'cobblestone' },
  { k: 'I', id: 'iron_ingot' },
  { k: 'G', id: 'gold_ingot' },
  { k: 'D', id: 'diamond' },
  { k: 'R', id: 'redstone' },
  { k: 'T', id: 'string' }
];
const MAT = {};
MATS.forEach((m, i) => { m.i = i; MAT[m.k] = m; });

// 有序配方：[文案键（名字见 texts/craft.js 的 recipes）, 3×3 包围盒，按行，'.' 为空]
const RECIPES = [
  ['wooden_pickaxe', 'PPP.S..S.'], ['stone_pickaxe', 'CCC.S..S.'], ['iron_pickaxe', 'III.S..S.'],
  ['golden_pickaxe', 'GGG.S..S.'], ['diamond_pickaxe', 'DDD.S..S.'], ['furnace', 'CCCC.CCCC'],
  ['chest', 'PPPP.PPPP'], ['bow', '.STS.T.ST'], ['fishing_rod', '..S.STS.T'],
  ['piston', 'PPPCICCRC'], ['rail', 'I.IISII.I'], ['powered_rail', 'G.GGSGGRG'],
  ['compass', '.I.IRI.I.'], ['clock', '.G.GRG.G.'], ['iron_chestplate', 'I.IIIIIII'],
  ['iron_leggings', 'IIII.II.I'], ['diamond_chestplate', 'D.DDDDDDD'], ['golden_leggings', 'GGGG.GG.G'],
  ['iron_block', 'IIIIIIIII'], ['diamond_block', 'DDDDDDDDD'], ['redstone_block', 'RRRRRRRRR'],
  ['ladder', 'S.SSSSS.S'], ['sign', 'PPPPPP.S.'], ['jukebox', 'PPPPDPPPP'],
  ['note_block', 'PPPPRPPPP']
];

// 反馈：c=位置正确 p=在配方里但位置不对 a=不对。空格只判 c/a。
function evaluate(guess, target) {
  const res = new Array(9).fill('a');
  const left = {};
  for (let i = 0; i < 9; i++) {
    if (guess[i] === target[i]) res[i] = 'c';
    else if (target[i] !== '.') left[target[i]] = (left[target[i]] || 0) + 1;
  }
  for (let i = 0; i < 9; i++) {
    const g = guess[i];
    if (res[i] === 'c' || g === '.') continue;
    if (left[g] > 0) { res[i] = 'p'; left[g]--; }
  }
  return res;
}
const mirror = s => s.slice(2, 3) + s.slice(1, 2) + s.slice(0, 1) + s.slice(5, 6) + s.slice(4, 5) + s.slice(3, 4) + s.slice(8, 9) + s.slice(7, 8) + s.slice(6, 7);

// 确定性选题：用 seed 洗牌，(cycle + round) 在排列里依次取，N 局内不重复
function mix(x) {
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return (x ^ (x >>> 16)) >>> 0;
}
function order(seed, n) {
  const a = [];
  for (let i = 0; i < n; i++) a.push(i);
  let s = (seed >>> 0) || 1;
  for (let i = n - 1; i > 0; i--) {
    s = mix(s + 0x9e3779b9);
    const j = s % (i + 1);
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}
function pickRecipe(seed, cycle, round) {
  const n = RECIPES.length;
  const c = Number.isFinite(cycle) ? Math.abs(Math.floor(cycle)) % n : 0;
  return order(seed, n)[(c + round) % n];
}

// 原创 8×8 像素图标
const SPR = {
  P: ['abbbbbbb', 'aaaaaaab', 'cccccccc', 'abaaaaaa', 'abaaaaaa', 'cccccccc', 'aaaabaaa', 'aaaabaaa', { a: '#c09a62', b: '#9c7a48', c: '#6f532d' }],
  S: ['......ab', '.....abc', '....abc.', '...abc..', '..abc...', '.abc....', 'abc.....', 'bc......', { a: '#b88d55', b: '#7d5f35', c: '#4f3a20' }],
  C: ['dabbcaad', 'abcaabba', 'bcaddacb', 'aabccdab', 'cdaabbca', 'abbcadab', 'dacbabcc', 'bacdaabd', { a: '#9a9a9a', b: '#7a7a7a', c: '#545454', d: '#c2c2c2' }],
  I: ['........', '........', '..aaaaa.', '.abbbbbc', 'abbbbbcc', 'ccccccc.', '........', '........', { a: '#ffffff', b: '#cfcfcf', c: '#6e6e6e' }],
  G: ['........', '........', '..aaaaa.', '.abbbbbc', 'abbbbbcc', 'ccccccc.', '........', '........', { a: '#fff7b0', b: '#f2c838', c: '#9a700c' }],
  D: ['........', '..abba..', '.abccbd.', 'abccccbd', '.dbccbd.', '..dbbd..', '...dd...', '........', { a: '#e9fffc', b: '#6fe3d6', c: '#2fb3a8', d: '#17635e' }],
  R: ['........', '..a..b..', '.aba.a..', '..ab..b.', '.b..aba.', '..baab..', '.a..b...', '........', { a: '#ff3b2f', b: '#8f120c' }],
  T: ['ab......', '.ab.....', '..aab...', '....ab..', '.....ab.', '.....ab.', '......ab', '.......a', { a: '#f6f6f6', b: '#5a5a5a' }],
  '.': ['aaaaaaaa', 'a......a', 'a......a', 'a......a', 'a......a', 'a......a', 'a......a', 'aaaaaaaa', { a: 'rgba(255,255,255,.45)' }]
};
// 反馈徽标：9×9 像素，黑描边 + 底色 + 字形（不只靠颜色：三种字形不同）
const BADGE = {
  c: ['....#', '...##', '#.##.', '###..', '.#...', '#2e8b3a', '#ffffff'],
  p: ['.....', '.#.#.', '#####', '.#.#.', '.....', '#e0a41c', '#1a1a1a'],
  a: ['#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#4a4a50', '#ffffff']
};
let ICONS = null;
function icons() {
  if (ICONS) return ICONS;
  ICONS = {};
  const cv = document.createElement('canvas');
  cv.width = cv.height = 8;
  const g = cv.getContext('2d');
  for (const k in SPR) {
    const sp = SPR[k], pal = sp[8];
    g.clearRect(0, 0, 8, 8);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const ch = sp[y][x];
      if (pal[ch]) { g.fillStyle = pal[ch]; g.fillRect(x, y, 1, 1); }
    }
    ICONS[k] = cv.toDataURL();
  }
  const b = document.createElement('canvas');
  b.width = b.height = 9;
  const bg = b.getContext('2d');
  for (const k in BADGE) {
    const d = BADGE[k];
    bg.clearRect(0, 0, 9, 9);
    bg.fillStyle = '#111'; bg.fillRect(0, 0, 9, 9);
    bg.fillStyle = d[5]; bg.fillRect(1, 1, 7, 7);
    bg.fillStyle = d[6];
    for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) if (d[y][x] === '#') bg.fillRect(2 + x, 2 + y, 1, 1);
    ICONS['fb-' + k] = b.toDataURL();
  }
  return ICONS;
}

const FALL = {
  light: { '--bg': '#ffffff', '--surface': '#f4f4f5', '--text': '#1b1b1f', '--muted': '#666a73', '--border': '#d4d4d8', '--accent': '#2f7d32', '--accent-fill': '#2f7d32', '--on-accent': '#ffffff', '--ok': '#2e8b3a', '--warn': '#c98a00', '--danger': '#c0392b' },
  dark: { '--bg': '#121214', '--surface': '#1d1d21', '--text': '#ececef', '--muted': '#a0a3ab', '--border': '#3a3a40', '--accent': '#5cbf60', '--accent-fill': '#5cbf60', '--on-accent': '#0d1a0e', '--ok': '#3fae4f', '--warn': '#e0a41c', '--danger': '#e0584a' }
};
const MARK = { c: 'correct', p: 'misplaced', a: 'absent' };   // 反馈 → 文案键（texts/craft.js 的 marks）

const CSS = `
.${P}w{--sl:#9b9b9b;--sd:#5b5b5b;max-width:520px;margin:0 auto;color:var(--x-text);font:14px/1.4 system-ui,sans-serif;touch-action:manipulation;-webkit-tap-highlight-color:transparent;outline:none;box-sizing:border-box}
.${P}w[data-t=dark]{--sl:#3c3c40;--sd:#202023}
.${P}w *{box-sizing:border-box}
.${P}w [hidden]{display:none!important}
.${P}w:focus-visible{outline:2px dashed var(--x-accent);outline-offset:4px}
.${P}top{display:flex;flex-wrap:wrap;justify-content:space-between;gap:0 8px;color:var(--x-muted);font-size:13px;margin-bottom:8px;min-height:20px}
.${P}top b{color:var(--x-text)}
.${P}bench{display:flex;align-items:center;justify-content:center;gap:10px}
.${P}g{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px;padding:6px;background:var(--sd);border-radius:4px;width:min(244px,62vw)}
.${P}cell,.${P}m{position:relative;aspect-ratio:1;border:2px solid;border-color:var(--sd) #e0e0e0 #e0e0e0 var(--sd);background:var(--sl);padding:0;margin:0;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;font:inherit;color:#fff;border-radius:2px}
.${P}w[data-t=dark] .${P}cell,.${P}w[data-t=dark] .${P}m{border-color:#151517 #5a5a60 #5a5a60 #151517}
.${P}cell img,.${P}m img,.${P}mini img,.${P}out img{image-rendering:pixelated;display:block;pointer-events:none}
.${P}nm{font-size:12px;line-height:1.1;text-shadow:1px 1px 0 #000;margin-top:2px;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis}
.${P}cell:disabled{cursor:default}
.${P}cell.${P}sel{outline:3px solid var(--x-accent);outline-offset:1px;z-index:1}
.${P}cell:focus-visible,.${P}m:focus-visible,.${P}btn:focus-visible{outline:3px solid var(--x-text);outline-offset:2px;z-index:2}
.${P}w[data-neg] .${P}bench{flex-direction:row-reverse}
.${P}arrow{font-size:22px;color:var(--x-muted)}
.${P}out{width:72px;min-height:72px;border:3px solid var(--sd);background:var(--sl);display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;text-shadow:1px 1px 0 #000;font-size:13px;text-align:center;overflow-wrap:anywhere;padding:4px;border-radius:2px}
.${P}out .${P}q{font-size:26px;font-weight:700}
.${P}msg{text-align:center;min-height:22px;margin:8px 0 4px;font-weight:600}
.${P}pal{display:grid;grid-template-columns:repeat(9,minmax(0,1fr));gap:4px;margin-top:6px}
.${P}m{padding:12px 1px 2px}
.${P}m img.${P}ic{width:50%;height:auto}
.${P}m .${P}nm{font-size:11px}
.${P}m .${P}key{position:absolute;left:2px;top:0;font-size:10px;text-shadow:1px 1px 0 #000;opacity:.9}
.${P}m.${P}on{outline:3px solid var(--x-accent);outline-offset:1px;z-index:1}
.${P}m:disabled{cursor:default;opacity:.55}
.${P}row{display:flex;justify-content:center;gap:8px;margin:10px 0 6px;flex-wrap:wrap}
.${P}btn{font:inherit;font-weight:600;padding:8px 18px;min-height:40px;border-radius:6px;border:1px solid var(--x-border);background:var(--x-surface);color:var(--x-text);cursor:pointer}
.${P}btn.${P}pri{background:var(--x-accent-fill);color:var(--x-on-accent);border-color:transparent}
.${P}btn:disabled{opacity:.45;cursor:default}
.${P}leg,.${P}hint{overflow-wrap:anywhere;text-align:center;color:var(--x-muted);font-size:12px;margin:4px 0}
.${P}leg span{margin:0 5px;white-space:nowrap}
.${P}mini .${P}mk{font-size:9px;right:0;top:0;padding:0 1px}
.${P}cell img.${P}ic{width:46%;height:auto}
.${P}bd{position:absolute;image-rendering:pixelated;pointer-events:none}
.${P}leg img.${P}lg{display:inline-block;width:13px;height:13px;image-rendering:pixelated;vertical-align:-2px;margin-right:3px}
.${P}hist{display:grid;grid-template-columns:repeat(3,auto);justify-content:center;gap:10px;margin-top:10px}
@media (max-width:420px){.${P}hist{grid-template-columns:repeat(2,auto)}}
.${P}mini{display:grid;grid-template-columns:repeat(3,32px);gap:2px;padding:4px;background:var(--sd);border-radius:3px}
.${P}ms{position:relative;width:32px;height:32px;background:var(--sl);display:flex;align-items:center;justify-content:center;border:2px solid;border-color:var(--sd) #e0e0e0 #e0e0e0 var(--sd)}
.${P}w[data-t=dark] .${P}ms{border-color:#151517 #5a5a60 #5a5a60 #151517}
.${P}ms img.${P}ic{width:16px;height:16px}
/* 反馈：MC 槽位 + 角徽标。正确=绿槽，位置不对=琥珀斜纹槽，错误=暗槽+图标去色；右上角像素徽标 ✓ ↔ ✕ */
.${P}fb-c{background:color-mix(in srgb,var(--x-ok) 60%,var(--sl))!important}
.${P}fb-p{background:repeating-linear-gradient(45deg,color-mix(in srgb,var(--x-warn) 75%,var(--sl)) 0 3px,var(--sl) 3px 9px)!important}
.${P}fb-a{background:var(--sd)!important}
.${P}fb-a img.${P}ic{opacity:.75}
.${P}cell .${P}bd{right:3px;top:3px;width:22%;max-width:20px}
.${P}m{padding:13px 1px 2px}
.${P}m .${P}bd{right:2px;top:2px;width:11px;height:11px}
.${P}ms .${P}bd{right:-1px;top:-1px;width:9px;height:9px}
.${P}ms{width:34px;height:34px}.${P}mini{grid-template-columns:repeat(3,34px)}
@media (max-width:420px){.${P}nm{font-size:11px}.${P}pal{grid-template-columns:repeat(5,minmax(0,1fr))}.${P}m img.${P}ic{width:42%}}
@media (prefers-reduced-motion:no-preference){.${P}w:not([data-rm]) .${P}mini{animation:${P}in .25s ease-out}}
@keyframes ${P}in{from{transform:scale(.85);opacity:0}to{transform:none;opacity:1}}
/* 宿主横屏全屏（root 带 .egg-fs）且横屏时：工作台在左，材料栏与按钮在右，一屏放得下；右上角留给宿主的退出/音效按钮 */
@media (orientation:landscape){
.egg-fs .${P}w{max-width:min(720px,calc(100% - 232px));display:grid;grid-template-columns:auto minmax(0,1fr);column-gap:16px;align-items:start}
.egg-fs .${P}top{grid-column:1/-1}
.egg-fs .${P}bench{grid-column:1;grid-row:2/span 4;align-self:center}
.egg-fs .${P}msg{grid-column:1;grid-row:6}
.egg-fs .${P}pal{grid-column:2;grid-row:2;margin-top:0;grid-template-columns:repeat(5,minmax(0,1fr))}
.egg-fs .${P}row{grid-column:2;grid-row:3;margin-top:8px}
.egg-fs .${P}leg{grid-column:2;grid-row:4}
.egg-fs .${P}hint{grid-column:2;grid-row:5}
.egg-fs .${P}hist{grid-column:2;grid-row:6/span 2;grid-template-columns:repeat(2,auto);margin-top:6px}
.egg-fs .${P}g{width:min(220px,calc(100vh - 150px));width:min(220px,calc(100dvh - 150px))}
}
`;

function h(tag, cls, attrs) {
  const e = document.createElement(tag);
  if (cls) e.className = cls.split(' ').map(c => P + c).join(' ');
  if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}
function readStats(storage) {
  let v = null;
  try { v = storage.get('craft-stats'); if (typeof v === 'string') v = JSON.parse(v); } catch (e) { v = null; }
  const s = { played: 0, wins: 0, streak: 0, best: 0 };
  if (v && typeof v === 'object') for (const k in s) if (Number.isFinite(v[k]) && v[k] >= 0) s[k] = Math.floor(v[k]);
  return s;
}

function mount(root, ctx) {
  const sig = ctx.signal;
  const tx = ctx.t;   // 文案：texts/craft.js（加载失败时用本文件末尾的 TEXTS）
  const mname = m => tx('materials.' + m.id), mark = f => tx('marks.' + MARK[f]);
  const on = (el, ev, fn) => el.addEventListener(ev, fn, sig ? { signal: sig } : undefined);
  const ic = icons();
  const stats = readStats(ctx.storage);

  const style = h('style');
  style.textContent = CSS;
  const w = h('div', 'w', { tabindex: '0', role: 'application', 'aria-label': tx('aria.game') });
  if (ctx.reducedMotion) w.setAttribute('data-rm', '');
  if (ctx.negative) w.setAttribute('data-neg', '');

  const top = h('div', 'top');
  const tTry = h('span'), tStat = h('span');
  top.append(tTry, tStat);

  const bench = h('div', 'bench');
  const grid = h('div', 'g', { role: 'group', 'aria-label': tx('aria.grid') });
  const cells = [];
  for (let i = 0; i < 9; i++) {
    const b = h('button', 'cell', { type: 'button', 'data-i': String(i) });
    const img = h('img', '', { alt: '', width: '8', height: '8' });
    img.className = P + 'ic';
    const nm = h('span', 'nm'), bd = h('img', 'bd', { alt: '', 'aria-hidden': 'true', width: '9', height: '9' });
    bd.hidden = true;
    b.append(img, nm, bd);
    grid.append(b);
    cells.push({ b, img, nm, bd });
  }
  const arrow = h('span', 'arrow', { 'aria-hidden': 'true' });
  arrow.textContent = tx(ctx.negative ? 'arrow_mirrored' : 'arrow'); // 负数 n：工作台左右镜像（仅布局，玩法不变）
  const out = h('div', 'out', { 'aria-live': 'polite', 'aria-label': tx('aria.result') });
  bench.append(grid, arrow, out);

  const msg = h('div', 'msg', { 'aria-live': 'polite' });
  const pal = h('div', 'pal', { role: 'group', 'aria-label': tx('aria.palette') });
  const mbtn = MATS.map((m, i) => {
    const b = h('button', 'm', { type: 'button', 'data-m': String(i) });
    const img = h('img', '', { alt: '', src: ic[m.k], width: '8', height: '8' });
    const nm = h('span', 'nm'); nm.textContent = mname(m);
    const key = h('span', 'key', { 'aria-hidden': 'true' }); key.textContent = String(i);
    img.className = P + 'ic';
    const mk = h('img', 'bd', { alt: '', 'aria-hidden': 'true', width: '9', height: '9' }); mk.hidden = true;
    b.append(img, nm, key, mk);
    pal.append(b);
    return { b, mk };
  });
  // 手机上 5 列：把“空”放到最后更顺手
  pal.append(mbtn[0].b);

  const row = h('div', 'row');
  const bStart = h('button', 'btn pri', { type: 'button' }); bStart.textContent = tx('button.start');
  const bSubmit = h('button', 'btn pri', { type: 'button' }); bSubmit.textContent = tx('button.submit');
  const bClear = h('button', 'btn', { type: 'button' }); bClear.textContent = tx('button.clear');
  const bReset = h('button', 'btn', { type: 'button' }); bReset.textContent = tx('button.clear_feedback');   // 只去掉主网格上的反馈外观，材料不动
  row.append(bStart, bSubmit, bClear, bReset);

  const leg = h('div', 'leg');
  for (const k of ['c', 'p', 'a']) {
    const sp = h('span'), im = h('img', '', { alt: '', src: ic['fb-' + k] });
    im.className = P + 'lg';
    sp.append(im, mark(k));
    leg.append(sp);
  }
  const hint = h('div', 'hint');
  hint.textContent = tx('hint');
  const hist = h('div', 'hist', { 'aria-label': tx('aria.history') });

  w.append(top, bench, msg, pal, row, leg, hint, hist);
  root.append(style, w);

  // 主题
  function applyTheme() {
    const t = ctx.theme() === 'dark' ? 'dark' : 'light';
    w.setAttribute('data-t', t);
    for (const k in FALL[t]) {
      let v = '';
      try { v = (ctx.color(k) || '').trim(); } catch (e) { v = ''; }
      w.style.setProperty('--x-' + k.slice(2), v || FALL[t][k]);
    }
  }
  applyTheme();
  if (ctx.onThemeChange) ctx.onThemeChange(applyTheme);

  // 状态
  let st = 'idle'; // idle | play | done
  let lastFb = new Array(9).fill('');
  let round = 0, target = '', name = '', board = new Array(9).fill('.'), tries = [], sel = 4, brush = -1, armed = false, known = {}, won = false;

  function newRound() {
    const idx = pickRecipe(ctx.seed >>> 0, ctx.cycle, round);
    name = RECIPES[idx][0]; target = RECIPES[idx][1];
    board = new Array(9).fill('.');
    tries = []; known = {}; lastFb.fill(''); sel = 4; brush = -1; armed = false; won = false;
    hist.textContent = '';
    st = 'play';
    msg.textContent = '';
    render();
    cells[sel].b.focus();
  }

  // 音效：放材料 / 清空槽位；提交时三种反馈（对 / 位置不对 / 没有）各一个音，猜中、没猜中各一个音
  const snd = (n, o) => { if (ctx.audio) ctx.audio.sfx(n, o); };
  function setSlot(i, k) { if (board[i] !== k) { lastFb.fill(''); snd(k === '.' ? 'click' : 'place', { pitch: k === '.' ? 0.7 : 1 }); } board[i] = k; }

  function submit() {
    if (st !== 'play' || board.every(k => k === '.')) return;
    let g = board.join('');
    if (g !== target && g === mirror(target)) target = g; // 镜像同样合法
    const fb = evaluate(g, target);
    tries.push({ g, fb });
    const rank = { a: 1, p: 2, c: 3 };
    for (let i = 0; i < 9; i++) {
      const k = g[i];
      if (k === '.') continue;
      if (!known[k] || rank[fb[i]] > rank[known[k]]) known[k] = fb[i];
    }
    addHistory(g, fb, tries.length);
    lastFb = fb.slice();
    if (g !== target && tries.length < MAX_TRIES) {
      if (fb.includes('c')) snd('ok', { vol: 0.8 });
      if (fb.includes('p')) snd('pickup', { pitch: 0.75, vol: 0.8 });
      if (fb.includes('a')) snd('click', { pitch: 0.55 });
    }
    if (g === target) finish(true);
    else if (tries.length >= MAX_TRIES) finish(false);
    else render();
  }

  function finish(win) {
    st = 'done'; won = win; snd(win ? 'win' : 'fail');
    stats.played++;
    if (win) { stats.wins++; stats.streak++; if (stats.streak > stats.best) stats.best = stats.streak; } else stats.streak = 0;
    try { ctx.storage.set('craft-stats', JSON.stringify(stats)); } catch (e) { /* 静默 */ }
    msg.textContent = tx(win ? 'msg.win' : 'msg.lose');
    render();
    bStart.focus();
  }

  function addHistory(g, fb, n) {
    const m = h('div', 'mini', { role: 'img' });
    const lab = [];
    for (let i = 0; i < 9; i++) {
      const s = h('span', 'ms fb-' + fb[i]);
      if (g[i] !== '.') s.append(h('img', 'ic', { alt: '', src: ic[g[i]] }));
      s.append(h('img', 'bd', { alt: '', src: ic['fb-' + fb[i]] }));
      m.append(s);
      lab.push(tx('aria.history_cell', { material: mname(MAT[g[i]]), mark: mark(fb[i]) }));
    }
    m.setAttribute('aria-label', tx('aria.history_item', { n, cells: lab.join(tx('aria.history_sep')) }));
    hist.append(m);
  }

  function render() {
    const play = st === 'play';
    const show = st === 'done' ? target : board.join('');
    const bold = (k, v) => { const b = h('b'); b.textContent = String(v); return b; };
    tTry.textContent = '';
    if (st !== 'idle') tTry.append(...tx.nodes('top.tries', { tries: tries.length + '/' + MAX_TRIES }, bold));
    tStat.textContent = '';
    tStat.append(...tx.nodes('top.stats', { streak: stats.streak, best: stats.best }, bold));
    for (let i = 0; i < 9; i++) {
      const c = cells[i], k = show[i], m = MAT[k];
      c.b.disabled = !play;
      const f = st === 'done' ? (won ? 'c' : '') : (play ? lastFb[i] : '');
      c.b.className = P + 'cell' + (play && i === sel ? ' ' + P + 'sel' : '') + (f ? ' ' + P + 'fb-' + f : '');
      c.bd.hidden = !f;
      if (f) c.bd.src = ic['fb-' + f];
      if (k === '.') { c.img.hidden = true; c.img.removeAttribute('src'); } else { c.img.hidden = false; c.img.src = ic[k]; }
      c.nm.textContent = k === '.' ? '' : mname(m);
      c.b.setAttribute('aria-label', tx(f ? 'aria.cell_marked' : 'aria.cell', { row: Math.floor(i / 3) + 1, col: i % 3 + 1, material: mname(m), mark: f ? mark(f) : '' }));
    }
    out.textContent = '';
    if (st === 'done') {
      const nm = h('span'); nm.textContent = tx('recipes.' + name);
      out.append(nm);
    } else {
      const q = h('span', 'q'); q.textContent = tx('result_unknown');
      out.append(q);
    }
    for (let i = 0; i < MATS.length; i++) {
      const mb = mbtn[i], k = MATS[i].k, kn = known[k];
      mb.b.disabled = !play;
      mb.b.className = P + 'm' + (play && brush === i ? ' ' + P + 'on' : '') + (kn ? ' ' + P + 'fb-' + kn : '');
      mb.mk.hidden = !kn;
      if (kn) mb.mk.src = ic['fb-' + kn];
      mb.b.setAttribute('aria-label', tx(kn ? 'aria.material_marked' : 'aria.material', { material: mname(MATS[i]), key: i, mark: kn ? mark(kn) : '' }));
      mb.b.setAttribute('aria-pressed', brush === i ? 'true' : 'false');
    }
    bStart.hidden = play;
    // 开局前“开始”；进行中隐藏（只有提交 / 清空）；结束后：猜中“再来一题”，没猜中“再来一次”（都换下一道题）
    bStart.textContent = tx(st === 'idle' ? 'button.start' : won ? 'button.next' : 'button.again');
    bSubmit.hidden = bClear.hidden = !play;
    bReset.hidden = !play || !lastFb.some(Boolean);
    bSubmit.disabled = board.every(k => k === '.');
  }

  // 交互
  on(grid, 'click', e => {
    const b = e.target.closest('button');
    if (!b || st !== 'play') return;
    const i = +b.getAttribute('data-i');
    sel = i;
    if (brush >= 0) {
      const k = MATS[brush].k;
      setSlot(i, board[i] === k ? '.' : k);
      armed = false;
    } else armed = true;
    render();
  });
  on(grid, 'focusin', e => {
    const b = e.target.closest('button');
    if (!b || st !== 'play') return;
    const i = +b.getAttribute('data-i');
    if (i !== sel) { sel = i; armed = false; render(); }
  });
  on(pal, 'click', e => {
    const b = e.target.closest('button');
    if (!b || st !== 'play') return;
    const i = +b.getAttribute('data-m');
    if (armed) { setSlot(sel, MATS[i].k); armed = false; brush = i; }
    else brush = brush === i ? -1 : i;
    render();
  });
  on(bStart, 'click', () => { if (st !== 'idle') round++; newRound(); });
  on(bSubmit, 'click', submit);
  on(bReset, 'click', () => { lastFb.fill(''); render(); cells[sel].b.focus(); });
  on(bClear, 'click', () => { for (let i = 0; i < 9; i++) setSlot(i, '.'); armed = false; render(); });

  on(w, 'keydown', e => {
    if (st !== 'play' || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    const inGrid = cells.some(c => c.b === document.activeElement);
    let mv = 0;
    if (k === 'ArrowLeft') mv = sel % 3 ? -1 : 2;
    else if (k === 'ArrowRight') mv = sel % 3 < 2 ? 1 : -2;
    else if (k === 'ArrowUp') mv = sel > 2 ? -3 : 6;
    else if (k === 'ArrowDown') mv = sel < 6 ? 3 : -6;
    if (mv) {
      e.preventDefault(); sel += mv; armed = false; render();
      if (inGrid || document.activeElement === w) cells[sel].b.focus();
      return;
    }
    if (/^[0-8]$/.test(k)) {
      e.preventDefault();
      setSlot(sel, MATS[+k].k);
      if (sel < 8) sel++;
      armed = false; render();
      if (inGrid) cells[sel].b.focus();
    } else if (k === 'Backspace' || k === 'Delete') {
      e.preventDefault();
      if (board[sel] === '.' && k === 'Backspace' && sel > 0) sel--;
      setSlot(sel, '.'); armed = false; render();
      if (inGrid) cells[sel].b.focus();
    } else if (k === 'Enter') {
      const t = document.activeElement;
      if (t === w || inGrid || t === bSubmit) { e.preventDefault(); submit(); }
    } else if (k === 'Escape') {
      brush = -1; armed = false; render();
    }
  });

  render();

  return {
    unmount() {
      st = 'gone';
      root.textContent = '';
    }
  };
}

export const _internals = { evaluate, pickRecipe, order, mirror, RECIPES, MATS, MAX_TRIES };
/* 内置文案：与 dist/assets/egg/texts/craft.js 相同，只在文案文件加载失败时使用。改文字请改 texts/craft.js */
const TEXTS = {
  name: '（待服主填写）',
  intro: '',
  top: { tries: '次数 {tries}', stats: '连胜 {streak} · 最佳 {best}' },
  button: { start: '开始', submit: '提交', clear: '清空', clear_feedback: '清除反馈', next: '再来一题', again: '再来一次' },
  msg: { win: '合成成功', lose: '没猜中' },
  marks: { correct: '正确', misplaced: '位置不对', absent: '错误' },
  hint: '方向键移动 · 数字键选材料 · 退格清除 · 回车提交',
  arrow: '→',
  arrow_mirrored: '←',
  result_unknown: '?',
  materials: { empty: '空', planks: '木板', stick: '木棍', cobblestone: '圆石', iron_ingot: '铁锭', gold_ingot: '金锭', diamond: '钻石', redstone: '红石', string: '线' },
  recipes: {
    wooden_pickaxe: '木镐', stone_pickaxe: '石镐', iron_pickaxe: '铁镐', golden_pickaxe: '金镐', diamond_pickaxe: '钻石镐', furnace: '熔炉', chest: '箱子', bow: '弓',
    fishing_rod: '钓鱼竿', piston: '活塞', rail: '铁轨', powered_rail: '动力铁轨', compass: '指南针', clock: '时钟', iron_chestplate: '铁胸甲', iron_leggings: '铁护腿',
    diamond_chestplate: '钻石胸甲', golden_leggings: '金护腿', iron_block: '铁块', diamond_block: '钻石块', redstone_block: '红石块', ladder: '梯子', sign: '告示牌',
    jukebox: '唱片机', note_block: '音符盒'
  },
  aria: {
    game: '合成台猜谜', grid: '合成格', result: '结果', palette: '材料', history: '历史', cell: '第{row}行第{col}列：{material}',
    cell_marked: '第{row}行第{col}列：{material}，{mark}', material: '{material}（{key}）', material_marked: '{material}（{key}），{mark}',
    history_item: '第{n}次：{cells}', history_cell: '{material}{mark}', history_sep: '，'
  }
};

export default {
  id: 'craft',
  title: '（待服主填写）', // 游戏名的兜底；实际显示 texts/craft.js 的 name
  texts: TEXTS,
  mount
};
