/* 404 彩蛋宿主：由根目录 404 页在路径匹配 /v<n>（n > 3）时按需 import()。
 * 按 ((n mod 游戏总数) + 游戏总数) mod 游戏总数（BigInt）选出一个游戏模块，只加载这一个；构造 ctx（约定见 tools/eggs/README.md），
 * 加载失败或 mount 抛错时静默移除游戏区块，页面回到普通 404。 */
import { forGame, toggleButton } from './audio.js';
const MAX = BigInt(Number.MAX_SAFE_INTEGER);

/* ---------- 文案 ----------
 * 用户可见的文字集中在 texts/ 下（约定见 tools/eggs/CONTRACT.md「文案」）：texts/common.js 是宿主自己的（区块标题、全屏 / 音效按钮），
 * texts/<id>.js 是各游戏的（name 游戏名、intro 简介、其余为游戏内文字）。每个文件 export default 一个普通对象，可以分节嵌套，
 * 占位符写作 {名字}。文件加载失败时用内置文案（宿主为下面的 COMMON，游戏为模块导出的 texts），游戏照常运行。 */
const COMMON = {
  title: '（待服主填写）',
  version: 'v{n}',
  fullscreen: { enter: '横屏全屏', exit: '退出全屏', rotate_hint: '请把手机横过来' },
  audio: { label: '游戏音效', on: '音效：开', off: '音效：关' }
};
const PH = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

/* 替换 {名字} 占位符；params 里没有的占位符原样保留 */
export function fill(s, params) {
  s = String(s);
  return params ? s.replace(PH, (m, k) => (own(params, k) && params[k] != null ? String(params[k]) : m)) : s;
}

/* 按点分隔的键（'hud.score'）在嵌套对象里取值，取不到时返回 undefined */
export function lookup(obj, key) {
  let o = obj;
  for (const k of String(key).split('.')) {
    if (!o || typeof o !== 'object' || !own(o, k)) return undefined;
    o = o[k];
  }
  return o;
}

/* 加载文案文件（ES module，export default 一个对象）；失败或格式不对时返回 null */
export async function loadTexts(url) {
  if (!url) return null;
  try {
    const d = (await import(url)).default;
    return d && typeof d === 'object' ? d : null;
  } catch (e) { return null; }
}

/* 游戏模块地址 …/games/NN-id.js 对应的文案文件 …/texts/id.js */
export function textsUrlFor(url) {
  const m = /\/\d{2}-([a-z0-9-]+)\.js(?:[?#].*)?$/.exec(String(url));
  return m ? new URL('../texts/' + m[1] + '.js', url).href : null;
}

/* 文案查询函数 t(key, params, fallback)：先查文案文件 file，再查内置文案 builtin，再用 fallback，最后返回键名本身。
 * params 可省略（t(key, fallback)）。文件已加载但缺少某个键（或哪里都没有）时，每个键只 console.warn 一次。
 * t.nodes(key, params, wrap)：同样取文案，但返回 [字符串 | 节点] 数组，每个占位符的值先交给 wrap(名字, 值) 包装（例如把数字包进 <b>），可直接 append。 */
export function translator(file, builtin, label) {
  const warned = new Set();
  function raw(key, fallback) {
    let s = file ? lookup(file, key) : undefined;
    if (typeof s === 'string') return s;
    s = builtin ? lookup(builtin, key) : undefined;
    if (typeof s !== 'string') s = fallback != null ? String(fallback) : undefined;
    if ((file || s === undefined) && !warned.has(key)) {
      warned.add(key);
      try { console.warn('[彩蛋文案] ' + (label || '') + ' 缺少键 ' + key + (s === undefined ? '' : '，使用内置文案')); } catch (e) {}
    }
    return s === undefined ? String(key) : s;
  }
  function t(key, params, fallback) {
    if (typeof params === 'string') { fallback = params; params = null; }
    return fill(raw(key, fallback), params);
  }
  t.nodes = function (key, params, wrap, fallback) {
    const s = raw(key, fallback), out = [];
    let i = 0, m;
    PH.lastIndex = 0;
    while ((m = PH.exec(s))) {
      if (!params || !own(params, m[1]) || params[m[1]] == null) continue;
      if (m.index > i) out.push(s.slice(i, m.index));
      const v = params[m[1]];
      out.push(wrap ? wrap(m[1], v) : String(v));
      i = m.index + m[0].length;
    }
    if (i < s.length) out.push(s.slice(i));
    return out;
  };
  return t;
}

function fnv1a(s) {                       // 32 位 FNV-1a：同一个 n 每次得到同一个 seed
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

/* 规范化版本号：去掉前导零，-0 视为 0。返回字符串（可能带负号） */
export function normalize(raw) {
  let s = String(raw).replace(/^(-?)0+(?=\d)/, '$1');
  if (s === '-0') s = '0';
  return s;
}

/* 选游戏：index = ((n mod c) + c) mod c（负数也落在 0..c-1）；cycle = floor(|n| / c)，超过安全整数时取 MAX_SAFE_INTEGER。
 * n 为规范化后的字符串，用 BigInt 精确计算（URL 长度本身受浏览器与 Cloudflare 限制，几千位的 BigInt 运算也只需几毫秒） */
export function pick(n, count) {
  const big = BigInt(n), c = BigInt(count);
  const abs = big < 0n ? -big : big, q = abs / c;
  return { index: Number(((big % c) + c) % c), cycle: Number(q > MAX ? MAX : q), negative: big < 0n };
}

/* 同一个游戏的其他轮次：cycle 加 delta 后的版本号路径 /v<m>（游戏下标不变）。
 * 正数 n：m = n + delta × count；负数 n：m = n − delta × count（|n| 增大则 cycle 增大）。
 * 结果会落到不触发彩蛋的 0～3、或负数越过 0 变号时返回 null。 */
export function hrefFor(n, count, delta) {
  let big, c, d;
  try { big = BigInt(n); c = BigInt(count); d = BigInt(delta); } catch (e) { return null; }
  if (c <= 0n) return null;
  if (big < 0n) { const m = big - d * c; return m < 0n ? '/v' + m : null; }
  const m = big + d * c;
  return m > 3n ? '/v' + m : null;
}

/* 精确的 cycle mod p（cycle = floor(|n| / count)，不受 MAX_SAFE_INTEGER 封顶影响），用于周期化难度档 */
export function cycleMod(n, count, p) {
  const big = BigInt(n), abs = big < 0n ? -big : big, q = BigInt(p);
  return q > 0n ? Number((abs / BigInt(count)) % q) : 0;
}

function currentTheme() {
  const t = document.documentElement.getAttribute('data-theme');
  if (t === 'light' || t === 'dark') return t;
  return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function makeStorage(id) {
  const ns = 'youran-egg:' + id + ':';
  return {
    get(key) {
      try {
        const raw = window.localStorage.getItem(ns + key);
        if (raw === null) return null;
        try { return JSON.parse(raw); } catch (e) { return raw; }
      } catch (e) { return null; }
    },
    set(key, value) { try { window.localStorage.setItem(ns + key, JSON.stringify(value)); } catch (e) {} }
  };
}

/* 把选中的游戏挂到 root 上；返回 { game, unmount }。开发用的 tools/eggs/harness.html 也用这个函数（opts.reducedMotion 可覆盖系统设置；
 * opts.count 为游戏总数，供 ctx.href / ctx.cycleMod 使用，缺省时 href 返回 null）。 */
export async function mountGame(root, url, n, cycle, opts = {}) {
  n = normalize(n);
  // 文案文件与游戏模块并行加载；opts.texts === false 时不加载（调试页用来检查内置文案），opts.textsUrl 可指定地址
  const txUrl = opts.texts === false ? null : (opts.textsUrl || textsUrlFor(url));
  const txP = loadTexts(txUrl);
  const ac = new AbortController();
  const listeners = [];
  const fire = () => { const t = currentTheme(); listeners.forEach((cb) => { try { cb(t); } catch (e) {} }); };
  const mo = new MutationObserver(fire);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  const mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  if (mq && mq.addEventListener) mq.addEventListener('change', fire, { signal: ac.signal });
  ac.signal.addEventListener('abort', () => mo.disconnect());
  try {
    const [mod, texts] = await Promise.all([import(url).then((m) => m.default), txP]);
    if (!mod || typeof mod.mount !== 'function') throw new Error('bad egg module');
    if (txUrl && !texts) { try { console.warn('[彩蛋文案] 未能加载 ' + txUrl + '，使用游戏内置文案'); } catch (e) {} }
    const builtin = mod.texts && typeof mod.texts === 'object' ? mod.texts : null;
    const t = translator(texts, builtin, mod.id || 'egg');
    const ctx = {
      n,
      cycle,
      seed: fnv1a(n),
      negative: n.charAt(0) === '-',
      theme: currentTheme,
      onThemeChange(cb) { if (typeof cb === 'function') listeners.push(cb); },
      color(name) { try { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); } catch (e) { return ''; } },
      storage: makeStorage(mod.id || 'egg'),
      reducedMotion: 'reducedMotion' in opts ? !!opts.reducedMotion : !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches),
      signal: ac.signal,
      audio: forGame(ac.signal),
      href(delta) { return opts.count ? hrefFor(n, opts.count, delta) : null; },
      cycleMod(p) { return opts.count ? cycleMod(n, opts.count, p) : Math.floor(cycle) % Math.max(1, Math.floor(p)); },
      t,
      tNodes: t.nodes,
      texts: texts || builtin
    };
    const handle = mod.mount(root, ctx) || {};
    // 游戏名与简介：文案文件优先，其次模块内置（texts.name / title）
    const pickStr = (k) => (texts && typeof texts[k] === 'string' ? texts[k] : builtin && typeof builtin[k] === 'string' ? builtin[k] : null);
    const name = pickStr('name');
    return {
      game: mod,
      texts,
      name: (name != null ? name : typeof mod.title === 'string' ? mod.title : '').trim(),
      intro: (pickStr('intro') || '').trim(),
      unmount() {
        try { if (handle.unmount) handle.unmount(); } catch (e) {}
        ac.abort(); listeners.length = 0; root.textContent = '';
      }
    };
  } catch (e) {
    ac.abort(); listeners.length = 0;
    throw e;
  }
}

/* ---------- 横屏全屏 ----------
 * 宿主给游戏区块加一个“横屏全屏”按钮（全屏中为“退出全屏”）。card 为要全屏的整块容器（标题行 + 游戏根），root 为游戏根。
 * 有元素全屏（含 webkit 前缀）时：requestFullscreen(card)，成功后 screen.orientation.lock('landscape')（不支持或拒绝时忽略）；
 * 没有或请求被拒（iPhone Safari）时：CSS 伪全屏（card 固定铺满 100dvh，锁住页面滚动，竖屏时显示“请把手机横过来”）。
 * 全屏期间 root 带 class egg-fs（约定见 CONTRACT.md），进入/退出后派发一次 window resize。
 * 退出：按钮、Esc / 系统返回（真全屏由 fullscreenchange 得知；伪全屏监听 Esc 与 popstate）、卸载时 exit()。 */
const FS_ICON_ON = '<svg viewBox="0 0 16 16" width="20" height="20" aria-hidden="true" fill="currentColor" shape-rendering="crispEdges"><path d="M1 1h5v2H3v3H1zM10 1h5v5h-2V3h-3zM1 10h2v3h3v2H1zM13 10h2v5h-5v-2h3z"/></svg>';
const FS_ICON_OFF = '<svg viewBox="0 0 16 16" width="20" height="20" aria-hidden="true" fill="currentColor" shape-rendering="crispEdges"><path d="M4 1h2v5H1V4h3zM10 1h2v3h3v2h-5zM1 10h5v5H4v-3H1zM10 10h5v2h-3v3h-2z"/></svg>';
const FS_ICON_ROT = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="currentColor" shape-rendering="crispEdges"><path d="M5 1h6v1H5zM4 2h1v12H4zM11 2h1v6h-1zM5 14h6v1H5zM7 12h2v1H7zM13 9h1v4h-1zM12 13h1v1h-1zM10 14h2v1h-2zM12 8h1v1h-1zM14 8h1v1h-1z"/></svg>';
export const FS_CSS =
  '.egg-fsb{flex:none;display:inline-flex;align-items:center;justify-content:center;gap:6px;height:40px;padding:0 10px;border-radius:8px;border:1px solid var(--border);' +
  'background:var(--surface);color:var(--text);font:inherit;font-size:.9rem;font-weight:600;white-space:nowrap;cursor:pointer}' +
  '.egg-fsb:focus-visible{outline:2px solid var(--accent);outline-offset:2px}.egg-fsb[hidden],.egg-rot[hidden]{display:none}' +
  '.egg-head .egg-fsb{margin-left:auto}.egg-head .egg-fsb+.egg-audio{margin-left:0}' +
  '.egg-fs-on{position:fixed;inset:0;z-index:2147483000;box-sizing:border-box;width:auto;max-width:none;height:100%;height:100dvh;margin:0;border:0;border-radius:0;box-shadow:none;' +
  'padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px);' +
  'background:var(--bg);color:var(--text);display:flex;flex-direction:column;overflow:hidden}' +
  '.egg-fs-on::backdrop{background:var(--bg)}' +
  '.egg-fs-on .egg-head{position:absolute;z-index:3;top:calc(env(safe-area-inset-top,0px) + 8px);right:calc(env(safe-area-inset-right,0px) + 8px);' +
  'flex-direction:column;align-items:flex-end;gap:8px;margin:0}' +
  '.egg-fs-on .egg-tt{display:none}.egg-fs-on .egg-head .egg-fsb{margin-left:0}' +
  '.egg-root.egg-fs{flex:1;min-height:0;min-width:0;overflow:auto;overscroll-behavior:contain;display:flex;flex-direction:column}' +
  '.egg-root.egg-fs::before,.egg-root.egg-fs::after{content:"";flex:1 0 0}' +   // 上下等分留白：放得下时垂直居中，放不下时可滚动且不裁掉顶部
  '.egg-rot{display:none;position:absolute;z-index:3;left:calc(env(safe-area-inset-left,0px) + 8px);top:calc(env(safe-area-inset-top,0px) + 8px);align-items:center;gap:6px;' +
  'padding:4px 10px;border-radius:999px;border:1px solid var(--border);background:var(--surface);color:var(--muted);font-size:.8rem;white-space:nowrap;pointer-events:none}' +
  '@media (orientation:portrait){.egg-fs-on .egg-rot{display:inline-flex}}' +
  'html.egg-fs-lock,html.egg-fs-lock body{overflow:hidden;overscroll-behavior:none}';

export function isTouch() {
  try { return matchMedia('(any-pointer:coarse)').matches || (navigator.maxTouchPoints || 0) > 0; } catch (e) { return false; }
}

/* 返回 { button, exit() }。button 由调用方放进标题行；card 需含 button 所在的标题行。t 为宿主文案查询函数（可省略，用内置文案）。 */
export function fullscreenControl(card, root, signal, t) {
  const d = document, html = d.documentElement;
  const L = typeof t === 'function' ? t : translator(null, COMMON, 'common');
  const b = d.createElement('button');
  b.type = 'button'; b.className = 'egg-fsb';
  const rot = d.createElement('div');
  rot.className = 'egg-rot'; rot.setAttribute('role', 'note');
  rot.innerHTML = FS_ICON_ROT;
  const rotTxt = d.createElement('span'); rotTxt.textContent = L('fullscreen.rotate_hint'); rot.appendChild(rotTxt);
  card.appendChild(rot);
  let mode = '', scroll = null, pushed = false, busy = false;
  const fsEl = () => d.fullscreenElement || d.webkitFullscreenElement || null;
  const paint = () => {
    b.innerHTML = mode ? FS_ICON_OFF : FS_ICON_ON;
    const sp = d.createElement('span'); sp.textContent = L(mode ? 'fullscreen.exit' : 'fullscreen.enter'); b.appendChild(sp);
    b.setAttribute('aria-pressed', String(!!mode));
  };
  const kick = () => requestAnimationFrame(() => { try { dispatchEvent(new Event('resize')); } catch (e) {} });
  function on(m) {
    mode = m;
    scroll = scroll || [scrollX, scrollY];
    card.classList.add('egg-fs-on'); root.classList.add('egg-fs');
    if (m === 'css') {
      html.classList.add('egg-fs-lock');
      try { history.pushState({ eggFs: 1 }, ''); pushed = true; } catch (e) {}
    }
    paint(); kick();
  }
  function off(fromPop) {
    if (!mode) return;
    const m = mode; mode = '';
    card.classList.remove('egg-fs-on'); root.classList.remove('egg-fs'); html.classList.remove('egg-fs-lock');
    try { screen.orientation && screen.orientation.unlock && screen.orientation.unlock(); } catch (e) {}
    if (m === 'css' && pushed && !fromPop) { pushed = false; try { if (history.state && history.state.eggFs) history.back(); } catch (e) {} }
    pushed = false;
    const s = scroll; scroll = null;
    paint(); kick();
    if (s) requestAnimationFrame(() => scrollTo(s[0], s[1]));
  }
  async function enter() {
    const req = card.requestFullscreen || card.webkitRequestFullscreen;
    if (req) {
      scroll = [scrollX, scrollY];
      try {
        const r = req.call(card, { navigationUI: 'hide' });
        if (r && r.then) await r;
        else await new Promise((res) => {          // 旧版 webkit 前缀不返回 Promise：等 change/error 事件，最多 600ms
          const t = setTimeout(res, 600), f = () => { clearTimeout(t); res(); };
          d.addEventListener('webkitfullscreenchange', f, { once: true }); d.addEventListener('webkitfullscreenerror', f, { once: true });
        });
        if (fsEl() === card) {
          if (mode !== 'real') on('real');
          try { const p = screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape'); if (p && p.catch) p.catch(() => {}); } catch (e) {}
          return;
        }
      } catch (e) {}
      if (fsEl() === card) { if (mode !== 'real') on('real'); return; }
    }
    on('css');
  }
  function exit() {
    if (mode === 'real') {
      const x = d.exitFullscreen || d.webkitExitFullscreen;
      if (fsEl() && x) { try { const p = x.call(d); if (p && p.catch) p.catch(() => {}); } catch (e) {} }
    }
    off(false);
  }
  const opt = signal ? { signal } : undefined;
  b.addEventListener('click', () => { if (mode) exit(); else if (!busy) { busy = true; enter().finally(() => { busy = false; }); } }, opt);
  const change = () => {
    if (fsEl() === card) { if (mode !== 'real') { if (mode) off(true); on('real'); } }
    else if (mode === 'real') off(false);
  };
  d.addEventListener('fullscreenchange', change, opt);
  d.addEventListener('webkitfullscreenchange', change, opt);
  d.addEventListener('keydown', (e) => { if (mode === 'css' && e.key === 'Escape' && !e.defaultPrevented) exit(); }, opt);
  addEventListener('popstate', () => { if (mode === 'css') off(true); }, opt);
  paint();
  return { button: b, exit };
}

/* 404 页入口：n 为版本号字符串（可能带负号），games 为构建时扫描出的文件名列表（已排序） */
export async function start(n, games) {
  if (!games || !games.length || document.getElementById('egg')) return;
  const anchor = document.querySelector('main .nf') || document.querySelector('main');
  if (!anchor) return;
  n = normalize(n);
  const { index, cycle } = pick(n, games.length);
  const shown = n;
  // 宿主文案、游戏模块、游戏文案三者同时发出请求（后两者先预取，mountGame 再次 import 时直接命中模块缓存）
  const url = new URL('games/' + games[index], import.meta.url).href;
  import(url).catch(() => {});
  loadTexts(textsUrlFor(url));
  const common = await loadTexts(new URL('texts/common.js', import.meta.url).href);
  if (document.getElementById('egg')) return;
  const C = translator(common, COMMON, 'common');
  const style = document.createElement('style');
  style.textContent =
    '.egg{padding-bottom:40px}.egg-card{margin:0;padding:20px}' +
    '.egg-head{display:flex;align-items:flex-start;gap:12px;margin-bottom:12px}.egg-tt{flex:1;min-width:0;display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;min-height:40px}.egg-head h2{margin:0;font-size:1.2rem}' +
    '.egg-v{display:inline-block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0 8px;border-radius:999px;font-size:.8rem;font-weight:700;' +
    'background:var(--accent-soft);color:var(--accent);font-family:var(--mono)}' +
    '.egg-name{min-width:0;max-width:100%;overflow-wrap:anywhere;font-weight:650;color:var(--muted)}' +
    '.egg-audio{flex:none;margin-left:auto;display:inline-grid;place-items:center;width:40px;height:40px;padding:0;border-radius:8px;border:1px solid var(--border);' +
    'background:var(--surface);color:var(--text);cursor:pointer}.egg-audio[aria-pressed="true"]{color:var(--accent);background:var(--accent-soft)}' +
    '.egg-audio:focus-visible{outline:2px solid var(--accent);outline-offset:2px}' +
    '.egg-intro{margin:-4px 0 14px;color:var(--muted);font-size:.92rem;line-height:1.6;overflow-wrap:anywhere}.egg-intro[hidden],.egg-fs-on .egg-intro{display:none}' +
    '@media (max-width:760px){.egg-card{padding:14px}}' + FS_CSS;
  const sec = document.createElement('section');
  sec.className = 'egg wrap';
  sec.id = 'egg';
  sec.setAttribute('aria-labelledby', 'egg-title');
  sec.innerHTML = '<div class="egg-card block"><div class="egg-head"><div class="egg-tt"><h2 id="egg-title"></h2><span class="egg-v"></span></div></div>' +
    '<p class="egg-intro" id="egg-intro" hidden></p><div class="egg-root"></div></div>';
  sec.querySelector('#egg-title').textContent = C('title');
  sec.querySelector('.egg-v').textContent = C('version', { n: shown.length > 12 ? shown.slice(0, 12) + '…' : shown });
  const root = sec.querySelector('.egg-root');
  const fsAc = new AbortController();
  const fsCtl = isTouch() ? fullscreenControl(sec.querySelector('.egg-card'), root, fsAc.signal, C) : null;
  if (fsCtl) sec.querySelector('.egg-head').appendChild(fsCtl.button);
  sec.querySelector('.egg-head').appendChild(toggleButton(undefined, { label: C('audio.label'), on: C('audio.on'), off: C('audio.off') }));
  root.setAttribute('data-egg', games[index]);
  document.head.appendChild(style);
  anchor.parentNode.insertBefore(sec, anchor.nextSibling);
  try {
    const h = await mountGame(root, url, n, cycle, { count: games.length });
    // 游戏名（texts/<id>.js 的 name，没有时用模块的 title）：作为区块标题旁的副标题，用文本节点插入；过长时换行
    if (h.name) { const s = document.createElement('span'); s.className = 'egg-name'; s.textContent = h.name; sec.querySelector('.egg-v').before(s); }
    // 简介（intro，空字符串不显示）：标题行下方一行说明文字，全屏时隐藏
    if (h.intro) { const p = sec.querySelector('.egg-intro'); p.textContent = h.intro; p.hidden = false; sec.setAttribute('aria-describedby', 'egg-intro'); }
    addEventListener('pagehide', (e) => { if (!e.persisted) { if (fsCtl) fsCtl.exit(); fsAc.abort(); h.unmount(); } });
  } catch (e) {
    if (fsCtl) fsCtl.exit(); fsAc.abort();
    sec.remove(); style.remove();          // 加载失败或 mount 出错：回到普通 404
  }
}
