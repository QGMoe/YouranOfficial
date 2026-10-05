// 404 彩蛋 G1：红石电路（旋转方块连通拉杆与红石灯）
const P = 'egg-redstone-';
const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0]; // 方向 0北 1东 2南 3西，对应位 1<<d
const BLANK = 0, DUST = 1, LEVER = 2, LAMP = 3, REP = 4;
// 3×5 像素数字（拉杆上的起始强度牌）
const DIG = '111101101101111,010110010010111,111001111100111,111001111001111,101101111001001,111100111001111,111100111101111,111001001001001,111101111101111,111101111001111'.split(',');
const rot = m => ((m << 1) | (m >> 3)) & 15; // 顺时针 90°

function rng(a) {
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function mix(a, b) {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ b;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 16), 0x27d4eb2f);
  return (h ^ (h >>> 15)) >>> 0;
}

// 难度档表（23 档，按 cycle mod 23 周期化；23 与其他游戏的档数和游戏总数互质，见 tools/eggs/README.md）。每一档在至少一个维度上比上一档略难，其余维度不变易：
// w×h 盘面（宽不超过 8 列，手机上每格够大；往竖向延伸）、lamps 灯数、s0 拉杆起始强度（越低越早需要中继器）、
// decoy 干扰红石粉密度、rep 干扰中继器个数。解路径上的中继器个数由生成器按衰减自动放置
const TIER_TABLE = [
  // w  h  灯  s0  干扰   干扰中继器
  [4, 4, 1, 15, 0.30, 0], [4, 5, 1, 15, 0.33, 0], [5, 5, 1, 15, 0.36, 0], [5, 6, 2, 15, 0.39, 0],
  [5, 7, 2, 14, 0.42, 0], [6, 7, 2, 13, 0.45, 0], [6, 8, 2, 12, 0.48, 0], [6, 9, 3, 11, 0.51, 0],
  [6, 10, 3, 10, 0.54, 1], [7, 10, 3, 10, 0.57, 1], [7, 11, 3, 9, 0.60, 1], [7, 12, 3, 9, 0.63, 2],
  [7, 12, 4, 9, 0.66, 2], [8, 12, 4, 9, 0.69, 2], [8, 12, 4, 8, 0.72, 3], [8, 13, 4, 8, 0.74, 3],
  [8, 13, 5, 8, 0.76, 3], [8, 13, 5, 8, 0.78, 4], [8, 13, 5, 8, 0.80, 4], [8, 13, 5, 8, 0.82, 5],
  [8, 13, 6, 8, 0.84, 5], [8, 13, 6, 8, 0.85, 6], [8, 13, 6, 8, 0.85, 7]
];
export const TIERS = TIER_TABLE.length;
// 难度档周期化：tier = cycle mod TIERS（不封顶），这样每个难度档都对应无限多个 n（地图由完整的 n 决定）
export function startLevel(cycle) {
  const c = Math.floor(Math.abs(Number(cycle)));
  return Number.isFinite(c) ? c % TIERS : 0;
}
export function params(L) {
  const [w, h, lamps, s0, decoy, rep] = TIER_TABLE[Math.max(0, Math.min(TIERS - 1, Math.floor(L) || 0))];
  return { w, h, lamps, s0, decoy, rep };
}

// 通电计算（贴近 MC）：拉杆向四周输出 s0；红石粉双向互通才导通，每经过一格强度 −1，降到 0 就断；
// 中继器只有前后两个接口：从后方输入（≥1 即可），向前方输出 15，侧面不连；红石灯任意一面收到 ≥1 即亮，不再传导。
// 中继器的状态用单个方向位表示（1 << 朝向），所以旋转、镜像与红石粉共用同一套位运算。
// 返回 pw：红石粉为强度 0..15，中继器通电为 15，灯亮为 1
export function power(lv, m) {
  const { w, h, kind } = lv, pw = new Uint8Array(w * h), q = [lv.lever];
  let lit = 0;
  pw[lv.lever] = 15;
  while (q.length) {
    const c = q.pop(), k = kind[c], x = c % w, y = (c / w) | 0;
    const out = k === LEVER ? lv.s0 : k === REP ? 15 : pw[c] - 1, mm = k === LEVER ? 15 : m[c];
    for (let d = 0; d < 4; d++) {
      if (!((mm >> d) & 1)) continue;
      const nx = x + DX[d], ny = y + DY[d];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const nb = ny * w + nx, kb = kind[nb];
      if (kb === DUST) { if ((m[nb] >> ((d + 2) & 3)) & 1 && out > pw[nb]) { pw[nb] = out; q.push(nb); } }
      else if (kb === LAMP) { if (!pw[nb]) { pw[nb] = 1; lit++; } }
      else if (kb === REP) { if (m[nb] === 1 << d && !pw[nb]) { pw[nb] = 15; q.push(nb); } }
    }
  }
  return { pw, lit };
}

const dirTo = (a, b, w) => b - a === 1 ? 1 : b - a === -1 ? 3 : b - a === w ? 2 : 0;
// 先生成解（拉杆为根的随机生成树，取叶子做灯，路径并集即电路），沿路径算强度、在会衰减到 0 之前的直线段放中继器，
// 再加干扰件并打乱旋转
export function generate(seed, L) {
  const { w, h, lamps: k, s0, decoy, rep } = params(L), N = w * h;
  const r = rng(mix(seed >>> 0, (L % 4294967296) >>> 0));
  for (;;) {
    const lever = Math.floor(r() * N), lx = lever % w, ly = (lever / w) | 0;
    const par = new Int16Array(N).fill(-1), dep = new Int16Array(N), kids = new Uint8Array(N), seen = new Uint8Array(N);
    const live = [lever];
    seen[lever] = 1;
    while (live.length) { // growing tree：一半取最新、一半随机
      const li = r() < 0.5 ? live.length - 1 : Math.floor(r() * live.length), c = live[li];
      const x = c % w, y = (c / w) | 0, opts = [];
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d], ny = y + DY[d];
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && !seen[ny * w + nx]) opts.push(ny * w + nx);
      }
      if (!opts.length) { live.splice(li, 1); continue; }
      const nb = opts[Math.floor(r() * opts.length)];
      seen[nb] = 1; par[nb] = c; dep[nb] = dep[c] + 1; kids[c]++; live.push(nb);
    }
    const leaves = [];
    for (let c = 0; c < N; c++) {
      if (c === lever || kids[c] || dep[c] < 3) continue;
      if (Math.abs(c % w - lx) + Math.abs(((c / w) | 0) - ly) <= 1) continue;
      leaves.push(c);
    }
    if (leaves.length < k) continue;
    for (let i = leaves.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [leaves[i], leaves[j]] = [leaves[j], leaves[i]]; }
    const pool = leaves.sort((a, b) => dep[b] - dep[a]).slice(0, Math.max(k, Math.ceil(leaves.length * 0.6)));
    const lamps = [];
    while (lamps.length < k) lamps.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
    const kind = new Uint8Array(N), sol = new Uint8Array(N), pk = new Uint8Array(N);
    kind[lever] = LEVER;
    for (const lp of lamps) {
      kind[lp] = LAMP;
      for (let c = lp; c !== lever;) {
        const p = par[c], d = dirTo(p, c, w);
        if (!(sol[p] >> d & 1) || p === lever) pk[p]++;
        if (p !== lever) { kind[p] = DUST; sol[p] |= 1 << d; }
        if (c !== lp) sol[c] |= 1 << ((d + 2) & 3);
        c = p;
      }
    }
    const lv = { w, h, s0, kind, sol, lever, lamps, cur: null };
    // 衰减：反复找最浅的强度为 0 的路径格，在它到上一个信号源（拉杆或中继器）之间的直线段上放中继器（朝向沿路径）。
    // 共用段上的格子影响其下所有灯，所以按"最浅的缺口"处理即等于按最远的灯考虑；分叉格（T/十字）不放
    let ok = true;
    for (let guard = 0; guard < 64; guard++) {
      const { pw } = power(lv, sol);
      let gap = -1;
      for (let c = 0; c < N; c++) if (kind[c] === DUST && !pw[c] && (gap < 0 || dep[c] < dep[gap])) gap = c;
      if (gap < 0) break;
      const cand = [];
      for (let c = gap; c !== lever && kind[c] !== REP; c = par[c]) {
        if (kind[c] === DUST && pk[c] === 1 && (sol[c] === 5 || sol[c] === 10)) cand.push(c);
      }
      if (!cand.length) { ok = false; break; }
      const a = cand[Math.floor(r() * Math.min(3, cand.length))];
      let child = -1;
      for (let d = 0; d < 4; d++) if ((sol[a] >> d) & 1 && dirTo(par[a], a, w) === d) child = d;   // 出口 = 与入口相对的一边
      kind[a] = REP; sol[a] = 1 << child;
    }
    if (!ok || power(lv, sol).lit < k) continue;
    // 干扰件：先放干扰中继器（随机朝向），再按密度放干扰红石粉
    const blank = [];
    for (let c = 0; c < N; c++) if (!kind[c]) blank.push(c);
    for (let i = 0; i < rep && blank.length; i++) { const c = blank.splice(Math.floor(r() * blank.length), 1)[0]; kind[c] = REP; sol[c] = 1 << Math.floor(r() * 4); }
    for (const c of blank) {
      if (r() >= decoy) continue;
      const t = r();
      kind[c] = DUST; sol[c] = t < 0.34 ? 5 : t < 0.72 ? 3 : t < 0.95 ? 7 : 15;
    }
    const cur = new Uint8Array(N);
    for (let tries = 0; tries < 50; tries++) {
      for (let c = 0; c < N; c++) { let m = sol[c]; for (let t = Math.floor(r() * 4); t--;) m = rot(m); cur[c] = m; }
      if (power(lv, cur).lit < k) { lv.cur = cur; return lv; }
    }
  }
}

// 负数 n：关卡左右镜像（东西互换），中继器朝向随之翻转，玩法不变
const flip = m => (m & 5) | ((m & 2) << 2) | ((m & 8) >> 2);
export function mirror(lv) {
  const { w, h } = lv, f = c => (c - c % w) + (w - 1 - c % w), o = { w, h, s0: lv.s0, lever: f(lv.lever), lamps: lv.lamps.map(f) };
  for (const k of ['kind', 'sol', 'cur']) { o[k] = new Uint8Array(w * h); lv[k].forEach((v, c) => { o[k][f(c)] = k === 'kind' ? v : flip(v); }); }
  return o;
}

// 红石粉颜色随强度单调变化：强度越低越暗（1 = 最暗的一档），0 = 未通电的暗褐色。返回 [外圈, 芯线]
const mixc = (a, b, t) => { const p = x => [1, 3, 5].map(i => parseInt(x.substr(i, 2), 16)); const A = p(a), B = p(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
export function dustInk(s, pal) {
  if (!s) return [pal.d0, pal.d1];
  const t = (Math.min(15, s) - 1) / 14;
  return [mixc(pal.q0, pal.p0, t), mixc(pal.q1, pal.p1, t)];
}
export const PAL = {
  light: { board: '#857f75', base: '#bbb5aa', hi: '#d3cdc2', lo: '#9b958b', sp: '#aaa499', d0: '#3a2724', d1: '#5c3f3a', q0: '#4a0704', q1: '#7e150b', p0: '#9a1209', p1: '#ff3a22', p2: '#ffc9b8', rb0: '#55514b', rb1: '#7d7870', rb2: '#9a958c', ra: '#f2ede4', acc: '#b8321f', text: '#222', muted: '#666', border: '#bbb', surface: '#fff', on: '#fff', ok: '#2e7d32' },
  dark: { board: '#18191c', base: '#383a40', hi: '#474a51', lo: '#2a2c31', sp: '#33353a', d0: '#1e1412', d1: '#3a2723', q0: '#3a0503', q1: '#6e1209', p0: '#a5170c', p1: '#ff4630', p2: '#ffd0c2', rb0: '#1c1d21', rb1: '#5a5d64', rb2: '#71747c', ra: '#e6e2da', acc: '#ff6b57', text: '#e8e8e8', muted: '#9a9a9a', border: '#444', surface: '#26272b', on: '#111', ok: '#66bb6a' }
};

const CSS = `.${P}wrap{max-width:448px;margin:0 auto;font:14px/1.5 system-ui,sans-serif;color:var(--${P}text);-webkit-user-select:none;user-select:none}
.${P}bar{display:flex;flex-wrap:wrap;gap:4px 14px;justify-content:center;margin-bottom:8px;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.${P}win{color:var(--${P}ok);font-weight:700}
.${P}cv{display:block;margin:0 auto;max-width:100%;touch-action:none;image-rendering:pixelated;border-radius:4px;outline:none;cursor:pointer;-webkit-tap-highlight-color:transparent}
.${P}cv:focus-visible{box-shadow:0 0 0 3px var(--${P}acc)}
.${P}btns{display:flex;gap:8px;justify-content:center;margin-top:10px}
.${P}btns button,.${P}btns a{font:inherit;font-size:inherit;line-height:normal;padding:6px 18px;border-radius:6px;border:1px solid var(--${P}border);background:var(--${P}surface);color:var(--${P}text);cursor:pointer;display:inline-flex;align-items:center;gap:6px;text-decoration:none;margin:0}
.${P}btns .${P}pri{background:var(--${P}fill);color:var(--${P}on);border-color:transparent}
.${P}btns [hidden]{display:none}
.${P}btns svg{width:1em;height:1em;flex:none}
.${P}btns button:focus-visible,.${P}btns a:focus-visible{outline:2px solid var(--${P}acc);outline-offset:2px}
.${P}tip{text-align:center;color:var(--${P}muted);font-size:12px;margin-top:6px}`;

/* 内置文案：与 dist/assets/egg/texts/redstone.js 相同，只在文案文件加载失败时使用。改文字请改 texts/redstone.js */
const TEXTS = {
  name: '（待服主填写）',
  intro: '',
  status: { level: '第 {level} 关', power: '起始强度 {power}', lamps: '灯 {lit}/{total}', moves: '步数 {moves}', best: '最佳 {best}', best_none: '—', won: '通关！' },
  button: { start: '开始', next_level: '下一关', reset: '重置', reset_label: '重置本关', replay: '重玩本关' },
  tip: { controls: '点击方块旋转 · 方向键移动 · 空格旋转 · R 重置', new_cycle: '下一关将进入新的一轮' },
  canvas_label: '红石电路 第 {level} 关 灯 {lit}/{total}'
};

export default {
  id: 'redstone',
  title: '（待服主填写）', // 游戏名的兜底；实际显示 texts/redstone.js 的 name
  texts: TEXTS,
  mount(root, ctx) {
    const tx = ctx.t;   // 文案：texts/redstone.js（加载失败时用上面的 TEXTS）
    const ac = new AbortController(), sig = ac.signal;
    if (ctx.signal) ctx.signal.addEventListener('abort', () => ac.abort(), { once: true });
    // 关卡 = cycle mod TIERS（23）（宿主提供精确的 cycleMod，超长 n 也不受安全整数封顶影响）；关卡号显示 d + 1
    const D = typeof ctx.cycleMod === 'function' ? ctx.cycleMod(TIERS) : startLevel(ctx.cycle);
    // 「下一关」是真正的链接：同一个游戏、cycle + 1 的版本号地址，可以中键/长按在新标签打开、可以分享；第 23 关之后绕回新一轮第 1 关
    const nextHref = typeof ctx.href === 'function' ? ctx.href(1) : null;
    let L, lv, cur, phase = 'idle', moves = 0, best = null, fx = 0, fy = 0, kbd = false, anim = null, raf = 0, pal;

    const el = (t, c, txt) => { const e = document.createElement(t); if (c) e.className = P + c; if (txt) e.textContent = txt; return e; };
    const wrap = el('div', 'wrap'), style = el('style');
    style.textContent = CSS;
    const bar = el('div', 'bar'), sLv = el('span'), sPow = el('span'), sLamp = el('span'), sMv = el('span'), sBest = el('span'), sWin = el('span', 'win');
    bar.setAttribute('aria-live', 'polite');
    bar.append(sLv, sPow, sLamp, sMv, sBest, sWin);
    const cv = el('canvas', 'cv');
    cv.tabIndex = 0;
    cv.setAttribute('role', 'img');
    // 主按钮：开局前「开始」，通关后「下一关」；次按钮：进行中「重置」（恢复本关初始打乱状态），通关后「重玩本关」
    const btns = el('div', 'btns'), bPri = el('button', 'pri', tx('button.start')), aNext = el('a', 'pri', tx('button.next_level')), bSec = el('button');
    bPri.type = bSec.type = 'button';
    if (nextHref) aNext.href = nextHref;
    btns.append(bPri, aNext, bSec);
    // 键盘通关后焦点会移到“下一关”：玩家手里还按着的方向键 / 空格不能变成滚动页面（回车照常进入下一关）
    aNext.addEventListener('keydown', e => { if (e.key === ' ' || e.key.startsWith('Arrow')) e.preventDefault(); }, { signal: sig });
    const ICON = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="2" d="M3.5 8a4.5 4.5 0 1 0 1.4-3.3"/><path fill="currentColor" d="M2 2.2v4.6h4.6z"/></svg>';
    const TIP = tx('tip.controls'), tip = el('div', 'tip', TIP);
    wrap.append(style, bar, cv, btns, tip);
    root.append(wrap);

    function applyColors() {
      const th = ctx.theme && ctx.theme() === 'dark' ? 'dark' : 'light';
      pal = Object.assign({}, PAL[th]);
      pal.fill = pal.acc;   // 按钮底色用站点的 --accent-fill（与 --on-accent 配对；--accent 在深色下是浅绿文字色）
      for (const [k, v] of [['acc', '--accent'], ['fill', '--accent-fill'], ['text', '--text'], ['muted', '--muted'], ['border', '--border'], ['surface', '--surface'], ['on', '--on-accent'], ['ok', '--ok']]) {
        const c = ctx.color ? String(ctx.color(v) || '').trim() : '';
        if (c) pal[k] = c;
        wrap.style.setProperty(`--${P}${k}`, pal[k]);
      }
    }

    const bestKey = () => 'best2-' + (ctx.seed >>> 0) + '-' + L;   // best2：衰减/中继器版本的关卡与旧版不同，不沿用旧记录
    function load() {
      L = D;
      lv = generate(ctx.seed >>> 0, L);
      if (ctx.negative) lv = mirror(lv);
      cur = lv.cur.slice();
      moves = 0;
      fx = lv.lever % lv.w; fy = (lv.lever / lv.w) | 0;
      const b = Number(ctx.storage && ctx.storage.get(bestKey()));
      best = b > 0 ? b : null;
    }
    function ui() {
      const lit = power(lv, cur).lit, lvNo = String(L + 1);
      sLv.textContent = tx('status.level', { level: lvNo });
      sLamp.textContent = tx('status.lamps', { lit, total: lv.lamps.length });
      sPow.textContent = tx('status.power', { power: lv.s0 });
      sMv.textContent = tx('status.moves', { moves });
      sBest.textContent = tx('status.best', { best: best == null ? tx('status.best_none') : best });
      sWin.textContent = phase === 'won' ? tx('status.won') : '';
      bPri.hidden = phase !== 'idle';
      aNext.hidden = phase !== 'won' || !nextHref;
      tip.textContent = phase === 'won' && nextHref && D === TIERS - 1 ? tx('tip.new_cycle') : TIP;
      bSec.hidden = phase === 'idle';
      if (phase === 'play') { bSec.innerHTML = ICON; bSec.append(tx('button.reset')); bSec.setAttribute('aria-label', tx('button.reset_label')); }
      else { bSec.textContent = tx('button.replay'); bSec.removeAttribute('aria-label'); }
      cv.setAttribute('aria-label', tx('canvas_label', { level: lvNo, lit, total: lv.lamps.length }));
    }
    function start() {
      cur = lv.cur.slice(); moves = 0; phase = 'play'; anim = null;
      ui(); draw();
      cv.focus({ preventScroll: true });
    }
    function rotateAt(i) {
      if (phase !== 'play' || (lv.kind[i] !== DUST && lv.kind[i] !== REP)) return;
      const lit0 = power(lv, cur).lit;
      cur[i] = rot(cur[i]); moves++;
      const lit1 = power(lv, cur).lit, A = ctx.audio;
      // 音效：旋转红石粉是咔哒、旋转中继器是滴答；多点亮一盏灯给一声上扬音，全部点亮是通关音
      if (A) {
        A.sfx(lv.kind[i] === REP ? 'tick' : 'click', { pitch: 0.9 + (moves % 3) * 0.08 });
        if (lit1 === lv.lamps.length) A.sfx('win');
        else if (lit1 > lit0) A.sfx('pickup', { pitch: 0.8 + 0.15 * lit1 });
      }
      if (lit1 === lv.lamps.length) {
        phase = 'won';
        if (best == null || moves < best) { best = moves; if (ctx.storage) ctx.storage.set(bestKey(), moves); }
      }
      ui();
      if (phase === 'won' && nextHref && kbd) aNext.focus({ preventScroll: true });   // 键盘玩家通关后直接回车进入下一关
      if (ctx.reducedMotion) { draw(); return; }
      anim = { i, t0: performance.now() };
      if (!raf) raf = requestAnimationFrame(step);
    }
    function step(t) {
      raf = 0;
      if (anim && t - anim.t0 >= 110) anim = null;
      draw(t);
      if (anim) raf = requestAnimationFrame(step);
    }

    // —— 绘制 ——
    let g, x0, y0, sx, sy;
    const R = (a, b, w, h, c) => {
      const l = Math.round(x0 + a * sx), t = Math.round(y0 + b * sy);
      g.fillStyle = c; g.fillRect(l, t, Math.round(x0 + (a + w) * sx) - l, Math.round(y0 + (b + h) * sy) - t);
    };
    // 红石粉按强度渐变（MC 风格：越弱越暗），0 = 未通电
    function dust(m, s) {
      const [o, f] = dustInk(s, pal);
      const arm = [[6, 0, 4, 7], [9, 6, 7, 4], [6, 9, 4, 7], [0, 6, 7, 4]], inn = [[7, 0, 2, 7], [9, 7, 7, 2], [7, 9, 2, 7], [0, 7, 7, 2]];
      // 强度 1～2（快断了）：只用形状提示——连线画成断续的短段（段与段之间露出底色），颜色仍是该强度自己那一档（全条最暗）
      if (s && s <= 2) {
        R(5, 5, 6, 6, o); R(6, 6, 4, 4, f);
        for (let d = 0; d < 4; d++) if ((m >> d) & 1) for (const k of [0, 3]) {   // 每条连线两段，各 2 格长，中间留 1～2 格空隙
          if (d === 0) { R(6, k, 4, 2, o); R(7, k, 2, 2, f); }
          else if (d === 2) { R(6, 14 - k, 4, 2, o); R(7, 14 - k, 2, 2, f); }
          else if (d === 1) { R(14 - k, 6, 2, 4, o); R(14 - k, 7, 2, 2, f); }
          else { R(k, 6, 2, 4, o); R(k, 7, 2, 2, f); }
        }
        return;
      }
      R(5, 5, 6, 6, o);
      for (let d = 0; d < 4; d++) if ((m >> d) & 1) R(...arm[d], o);
      R(6, 6, 4, 4, f);
      for (let d = 0; d < 4; d++) if ((m >> d) & 1) R(...inn[d], f);
      if (s >= 8) { R(7, 7, 1, 1, pal.p2); if (m & 1) R(8, 2, 1, 1, pal.p2); if (m & 2) R(13, 8, 1, 1, pal.p2); if (m & 4) R(7, 13, 1, 1, pal.p2); if (m & 8) R(2, 7, 1, 1, pal.p2); }
    }
    // 原创像素中继器：石台 + 中线红石 + 前后两根火把 + 指向输出端的箭头。以朝北（输出在上）为基准画，再按朝向旋转坐标
    function repeater(m, on) {
      const f = m === 2 ? 1 : m === 4 ? 2 : m === 8 ? 3 : 0;
      const Q = (x, y, w, h, c) => {
        if (f === 1) R(16 - y - h, x, h, w, c); else if (f === 2) R(16 - x - w, 16 - y - h, w, h, c); else if (f === 3) R(y, 16 - x - w, h, w, c); else R(x, y, w, h, c);
      };
      Q(1, 1, 14, 14, pal.rb0); Q(2, 2, 12, 12, pal.rb1); Q(2, 2, 12, 1, pal.rb2);
      // 前后接口（红石短线），侧面没有
      const o = on ? pal.p1 : pal.d1;
      Q(7, 0, 2, 2, o); Q(7, 14, 2, 2, o);
      // 大箭头指向输出端
      const ar = on ? '#ffe27a' : pal.ra;
      Q(7, 2, 2, 1, ar); Q(6, 3, 4, 1, ar); Q(5, 4, 6, 1, ar); Q(4, 5, 8, 1, ar);
      // 两根火把沿轴线排在箭头后面：前一根、后一根（通电时火头点亮）
      const head = on ? '#ff6a3c' : '#4a1610', stick = '#8a5a2c';
      for (const ty of [7, 11]) { Q(7, ty + 1, 2, 2, stick); Q(7, ty, 2, 1, head); if (on) Q(6, ty, 1, 1, '#ffd27a'); }
    }
    function draw(now) {
      if (!lv || !cv.width) return;
      g = cv.getContext('2d');
      g.imageSmoothingEnabled = false;
      const W = lv.w, H = lv.h, csx = cv.width / W, csy = cv.height / H, { pw } = power(lv, cur);
      g.fillStyle = pal.board; g.fillRect(0, 0, cv.width, cv.height);
      for (let i = 0; i < W * H; i++) {
        const cx = i % W, cy = (i / W) | 0;
        x0 = Math.round(cx * csx); y0 = Math.round(cy * csy);
        sx = (Math.round((cx + 1) * csx) - x0) / 16; sy = (Math.round((cy + 1) * csy) - y0) / 16;
        const k = lv.kind[i], lit = k === LAMP && pw[i];
        R(0, 0, 16, 16, pal.base);
        R(0, 0, 16, 1, lit ? '#ffe27a' : pal.hi); R(0, 0, 1, 16, lit ? '#ffe27a' : pal.hi);
        R(0, 15, 16, 1, lit ? '#e0a020' : pal.lo); R(15, 0, 1, 16, lit ? '#e0a020' : pal.lo);
        let h = (i * 2654435761 + 12345) >>> 0;
        for (let s = 0; s < 4; s++) { h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0; R(1 + (h % 14), 1 + ((h >>> 8) % 14), 1, 1, pal.sp); }
        if (k === DUST || k === REP) {
          const paint = () => k === DUST ? dust(cur[i], pw[i]) : repeater(cur[i], pw[i] > 0);
          if (anim && anim.i === i) {
            const p = Math.min(1, (now - anim.t0) / 110), a = -(1 - p) * (1 - p) * Math.PI / 2, mx = x0 + 8 * sx, my = y0 + 8 * sy;
            g.save(); g.translate(mx, my); g.rotate(a); g.translate(-mx, -my); paint(); g.restore();
          } else paint();
        } else if (k === LEVER) {
          R(3, 11, 10, 4, '#5b5b5b'); R(4, 12, 8, 2, '#808080'); R(5, 12, 2, 1, '#949494'); R(9, 13, 2, 1, '#6c6c6c');
          for (let s = 0; s < 5; s++) R(6 + s, 10 - s * 1.5, 2, 2, s & 1 ? '#7a4b22' : '#956030');
          R(10, 2, 4, 4, '#8f150c'); R(11, 3, 2, 2, '#ff4630'); R(11, 3, 1, 1, '#ffd0c2');
          // 起始强度数字牌（左上角，不挡拉杆和相邻线路）：深色底 + 黄色像素数字
          // 格子在屏幕上较小（手机、8 列盘面）时一位数放大到 1.5 倍，保证数字至少约 16 CSS 像素高；两位数只出现在格子较大的前几档
          const str = String(lv.s0), f = str.length === 1 && sx * 16 / (window.devicePixelRatio || 1) < 64 ? 1.5 : 1, bw = (str.length * 4 + 1) * f;
          R(0, 0, bw, 7 * f, '#2a0d0a');
          [...str].forEach((ch, n) => { const b = DIG[+ch]; for (let q = 0; q < 15; q++) if (b[q] === '1') R((1 + n * 4 + (q % 3)) * f, (1 + ((q / 3) | 0)) * f, f, f, '#ffd23f'); });
        } else if (k === LAMP) {
          R(2, 2, 12, 12, '#3a2614');
          R(3, 3, 10, 10, lit ? '#ffc93c' : '#5a3d20');
          const q = lit ? '#fff3b0' : '#7b5631';
          R(7, 3, 2, 10, q); R(3, 7, 10, 2, q);
          R(4, 4, 2, 2, q); R(10, 4, 2, 2, q); R(4, 10, 2, 2, q); R(10, 10, 2, 2, q);
          if (lit) R(7, 7, 2, 2, '#ffffff');
        }
      }
      if (phase === 'play' && kbd) {
        const lw = Math.max(2, Math.round(csx / 14));
        g.strokeStyle = pal.acc; g.lineWidth = lw;
        const l = Math.round(fx * csx), t = Math.round(fy * csy);
        g.strokeRect(l + lw / 2, t + lw / 2, Math.round((fx + 1) * csx) - l - lw, Math.round((fy + 1) * csy) - t - lw);
      }
      if (phase === 'idle') { g.globalAlpha = 0.5; g.fillStyle = pal.board; g.fillRect(0, 0, cv.width, cv.height); g.globalAlpha = 1; }
    }
    // 盘面 W×H 由关卡决定（与设备无关）；显示尺寸按宽度和视口高度取较小的格子边长，让整块盘面尽量在一屏内
    // （留出关卡信息、按钮和站点顶栏的高度），格子不小于 28px；万一视口太矮仍放不下，键盘光标会自动滚到可见处
    function layout() {
      if (!lv) return;
      const avail = Math.min(wrap.clientWidth || 320, 448), vh = window.innerHeight || 700, dpr = window.devicePixelRatio || 1;
      const cell = Math.max(8, Math.min(avail / lv.w, Math.max(28, (vh - (root.classList.contains('egg-fs') ? 160 : 200)) / lv.h)));   // 宿主横屏全屏（.egg-fs）时没有顶栏
      const cw = Math.floor(cell * lv.w), ch = Math.floor(cell * lv.h), pw = Math.max(16, Math.round(cw * dpr)), ph = Math.max(16, Math.round(ch * dpr));
      cv.style.width = cw + 'px'; cv.style.height = ch + 'px';
      if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
      draw(performance.now());
    }
    function reveal() {
      const rc = cv.getBoundingClientRect(), ch = rc.height / lv.h, top = rc.top + fy * ch, bot = top + ch, head = 72;
      if (top < head) window.scrollBy(0, top - head - 8);
      else if (bot > window.innerHeight) window.scrollBy(0, bot - window.innerHeight + 8);
    }

    // —— 输入 ——
    cv.addEventListener('pointerdown', e => {
      e.preventDefault();
      if (e.button > 0) return;
      cv.focus({ preventScroll: true });
      kbd = false;
      if (phase === 'idle') { start(); return; }
      const rc = cv.getBoundingClientRect(), W = lv.w, H = lv.h;
      const x = Math.floor((e.clientX - rc.left) / rc.width * W), y = Math.floor((e.clientY - rc.top) / rc.height * H);
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      fx = x; fy = y;
      rotateAt(y * W + x);
      if (ctx.reducedMotion || !anim) draw();
    }, { signal: sig });
    cv.addEventListener('keydown', e => {
      const k = e.key, mv = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[k];
      if (mv) {
        e.preventDefault();
        if (phase !== 'play') return;
        kbd = true;
        fx = Math.max(0, Math.min(lv.w - 1, fx + mv[0])); fy = Math.max(0, Math.min(lv.h - 1, fy + mv[1]));
        draw(performance.now()); reveal();
      } else if ((k === 'r' || k === 'R') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (phase !== 'play') return;
        e.preventDefault();
        start();
      } else if (k === ' ' || k === 'Enter') {
        e.preventDefault();
        if (phase === 'idle') { start(); return; }
        kbd = true;
        rotateAt(fy * lv.w + fx);
        if (!anim) draw(performance.now());
      }
    }, { signal: sig });
    bPri.addEventListener('click', start, { signal: sig });
    bSec.addEventListener('click', start, { signal: sig });

    let ro = null;
    if (typeof ResizeObserver === 'function') { ro = new ResizeObserver(layout); ro.observe(wrap); }
    window.addEventListener('resize', layout, { signal: sig });   // 高度变化（横竖屏、地址栏收起）也要重排
    if (ctx.onThemeChange) ctx.onThemeChange(() => { if (sig.aborted) return; applyColors(); draw(performance.now()); });

    applyColors(); load(); ui(); layout();

    return {
      unmount() {
        ac.abort();
        if (raf) cancelAnimationFrame(raf);
        raf = 0; anim = null;
        if (ro) ro.disconnect();
        wrap.remove();
      }
    };
  }
};
