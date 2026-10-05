// 探矿：扫雷变体。纯回合制，无 rAF。
const ORES = [null, ['coal', 5], ['iron', 10], ['gold', 20], ['diamond', 50]];   // [矿物键（名字见 texts/prospect.js 的 ores）, 分值]

function rng(s) {
  let a = s >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TIERS = 11;
// 难度档周期化：tier = cycle mod P（不封顶），这样每个难度档都对应无限多个 n（地图由完整的 n 决定）
export function tier(cycle) {
  const c = Math.floor(Math.abs(Number(cycle)));
  return Number.isFinite(c) ? c % TIERS : 0;
}

// 棋盘尺寸/密度：难度等级 = cycle mod 11（0..10），wide=容器足够宽（桌面）
function config(cycle, wide) {
  const l = tier(cycle);
  const cols = wide ? 12 + Math.min(l, 4) : 9;
  const rows = wide ? 10 + Math.min(l >> 1, 2) : 9;
  return { cols, rows, mines: Math.round(cols * rows * (0.12 + 0.008 * l)) };
}

function nb(g, i) {
  const x = i % g.cols, y = (i / g.cols) | 0, r = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const X = x + dx, Y = y + dy;
    if ((dx || dy) && X >= 0 && Y >= 0 && X < g.cols && Y < g.rows) r.push(Y * g.cols + X);
  }
  return r;
}

function newGame(cols, rows, mines, seed) {
  const n = cols * rows;
  return {
    cols, rows, mines: Math.max(1, Math.min(mines, n - 1)), seed: seed >>> 0,
    cells: Array.from({ length: n }, () => ({ m: 0, o: 0, a: 0, open: 0, flag: 0 })),
    state: 'ready', opened: 0, flags: 0, score: 0, boom: -1
  };
}

// 首挖后布雷：排除首挖格及其邻格（格子不够时只排除首挖格）
function place(g, first) {
  const rand = rng(g.seed ^ Math.imul(g.cols * 64 + g.rows, 0x85EBCA6B));
  const ex = new Set([first, ...nb(g, first)]);
  let pool = [];
  for (let i = 0; i < g.cells.length; i++) if (!ex.has(i)) pool.push(i);
  if (pool.length < g.mines) pool = g.cells.map((_, i) => i).filter(i => i !== first);
  for (let k = 0; k < g.mines; k++) {
    const j = k + Math.floor(rand() * (pool.length - k));
    [pool[k], pool[j]] = [pool[j], pool[k]];
    g.cells[pool[k]].m = 1;
  }
  g.cells.forEach((c, i) => {
    c.a = nb(g, i).reduce((s, j) => s + g.cells[j].m, 0);
    const r = rand();
    if (!c.m) c.o = r < .012 ? 4 : r < .042 ? 3 : r < .102 ? 2 : r < .202 ? 1 : 0;
  });
}

function dig(g, i) {
  if (g.state === 'ready') { place(g, i); g.state = 'play'; }
  if (g.state !== 'play') return null;
  const c = g.cells[i];
  if (c.flag) return null;
  if (c.open) return chord(g, i);
  if (c.m) {
    c.open = 1; g.boom = i; g.state = 'lost';
    return { lost: true, got: [] };
  }
  const got = [], st = [i];
  while (st.length) {
    const j = st.pop(), d = g.cells[j];
    if (d.open || d.flag || d.m) continue;
    d.open = 1; g.opened++; g.score++;
    if (d.o) { g.score += ORES[d.o][1]; got.push(d.o); }
    if (!d.a) st.push(...nb(g, j));
  }
  if (g.opened === g.cells.length - g.mines) {
    g.state = 'won'; g.score += g.mines * 5;
    g.cells.forEach(d => { if (d.m && !d.flag) { d.flag = 1; g.flags++; } });
  }
  return { got };
}

// 点数字：周围火把数等于数字时挖开其余邻格
function chord(g, i) {
  const c = g.cells[i];
  if (!c.open || !c.a || g.state !== 'play') return null;
  const ns = nb(g, i);
  if (ns.filter(j => g.cells[j].flag).length !== c.a) return null;
  const res = { got: [] };
  for (const j of ns) {
    const d = g.cells[j];
    if (d.open || d.flag) continue;
    const r = dig(g, j);
    if (r) { res.got.push(...r.got); if (r.lost) res.lost = true; }
    if (g.state !== 'play') break;
  }
  return res;
}

function flag(g, i) {
  const c = g.cells[i];
  if (g.state !== 'play' || c.open) return false;
  c.flag ^= 1; g.flags += c.flag ? 1 : -1;
  return true;
}

export const _core = { rng, tier, config, nb, newGame, dig, flag, chord, ORES };

// ---------- 绘制 ----------
const PAL = {
  light: { st: '#9b9b9b', L: '#c2c2c2', D: '#6c6c6c', s1: '#858585', s2: '#b0b0b0', fl: '#d3cab7', fD: '#b2a78f',
    num: ['', '#2546c8', '#1d7a2c', '#c62b2b', '#20307a', '#7a1f1f', '#1b7377', '#222', '#555'],
    ore: [0, ['#262626', '#5c5c5c'], ['#b5784b', '#ecc29e'], ['#d9a514', '#fff07a'], ['#1fb3ae', '#b9fffb']] },
  dark: { st: '#57575e', L: '#74747c', D: '#36363b', s1: '#48484e', s2: '#65656c', fl: '#25252a', fD: '#1a1a1e',
    num: ['', '#79a3ff', '#62d873', '#ff6b6b', '#b997ff', '#ffa14d', '#4fd8d0', '#eeeeee', '#aaaaaa'],
    ore: [0, ['#050506', '#8a8a92'], ['#c98b5e', '#f0c9a6'], ['#e8b923', '#fff07a'], ['#29c7c2', '#b9fffb']] }
};
const DEEP = {
  light: { st: '#6f6f7a', L: '#8d8d99', D: '#4b4b55', s1: '#5e5e69', s2: '#80808c' },
  dark: { st: '#3c3c46', L: '#52525e', D: '#25252c', s1: '#33333c', s2: '#4a4a55' }
};
const FB = {
  light: { text: '#1f2328', muted: '#5f6873', surface: '#f3f4f6', border: '#d0d7de', accent: '#2f8f46', on: '#ffffff', danger: '#c62b2b' },
  dark: { text: '#e6edf3', muted: '#9aa4ae', surface: '#1c2128', border: '#3a414a', accent: '#4cc46a', on: '#0d1117', danger: '#ff6b6b' }
};
const SPR = {
  torch: ['', '.....oo', '....oyyo', '....yWWy', '....oyyo', '.....bb', '.....sb', '.....sb', '.....sb', '.....sb', '....dddd'],
  tnt: ['', '......k', '.RRRRRkRRRR', '.rRrRrRrRrR', '.rrrrrrrrrr', '.wwwwwwwwww', '.wkkwkwkkkw', '.wwwwwwwwww',
    '.rrrrrrrrrr', '.rRrRrRrRrR', '.dddddddddd'],
  boom: ['y....o....y', '..o..y..o', '...oyyyo', '.o.yWWWy.o', '..yWWWWWy', 'oyWWWWWWWyo', '..yWWWWWy',
    '.o.yWWWy.o', '...oyyyo', '..o..y..o', 'y....o....y'],
  x: ['', '.x........x', '..x......x', '...x....x', '....x..x', '.....xx', '.....xx', '....x..x', '...x....x', '..x......x', '.x........x']
};
const SC = { o: '#ff8c1a', y: '#ffd23f', W: '#fff6c4', b: '#5a3a1e', s: '#8a5c32', d: 'rgba(0,0,0,.25)', k: '#2a2a2a',
  R: '#f05a4a', r: '#c8352a', w: '#f2f2f2', x: '#e32020' };
const DIG = ['', '010110010010111', '110001010100111', '110001010001110', '101101111001001', '111100110001110',
  '011100111101111', '111001010010010', '111101111101111'];
const SPECK = [[1, 1, 1], [2, 1, 0], [1, 2, 0], [10, 2, 1], [9, 3, 0], [1, 9, 0], [2, 10, 1], [10, 9, 0], [9, 10, 1], [10, 10, 0]];

const CSS = `
.egg-prospect-w{color:var(--egp-text);font:14px/1.4 system-ui,sans-serif;max-width:100%;user-select:none;-webkit-user-select:none}
.egg-prospect-bar{display:flex;flex-wrap:wrap;gap:4px 14px;justify-content:center;margin:0 0 8px;font-variant-numeric:tabular-nums}
.egg-prospect-bar b{font-weight:600}
.egg-prospect-bar span{color:var(--egp-muted)}
.egg-prospect-st{position:relative;display:flex;justify-content:center;max-width:100%}
.egg-prospect-c{display:block;box-sizing:content-box;max-width:calc(100% - 4px);touch-action:none;outline:none;border:2px solid var(--egp-border);border-radius:4px;image-rendering:pixelated;-webkit-touch-callout:none}
.egg-prospect-c:focus-visible{border-color:var(--egp-accent)}
.egg-prospect-ov{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}
.egg-prospect-ov[hidden],.egg-prospect-w [hidden]{display:none}
.egg-prospect-w button{font:inherit;cursor:pointer;border-radius:6px;padding:6px 14px;border:1px solid var(--egp-border);background:var(--egp-surface);color:var(--egp-text)}
.egg-prospect-w button.egg-prospect-p{background:var(--egp-fill);color:var(--egp-on);border-color:transparent;font-weight:600;padding:8px 22px}
.egg-prospect-w button:focus-visible{outline:2px solid var(--egp-accent);outline-offset:2px}
.egg-prospect-row{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;justify-content:center;margin-top:8px;min-height:36px}
.egg-prospect-msg{font-weight:600}
.egg-prospect-msg.egg-prospect-bad{color:var(--egp-danger)}
.egg-prospect-hint{color:var(--egp-muted);font-size:12px}
.egg-prospect-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.egg-prospect-lp{position:absolute;pointer-events:none;box-sizing:border-box;border:3px solid var(--egp-accent);border-radius:50%;animation:egg-prospect-grow .4s linear forwards}
.egg-prospect-rm .egg-prospect-lp{animation:none;background:color-mix(in srgb,var(--egp-accent) 35%,transparent)}
@keyframes egg-prospect-grow{from{transform:scale(.25);opacity:.4}to{transform:scale(1);opacity:1}}
.egg-prospect-shake{animation:egg-prospect-sh .35s linear}
@keyframes egg-prospect-sh{20%{transform:translate(-4px,2px)}40%{transform:translate(4px,-2px)}60%{transform:translate(-3px,-1px)}80%{transform:translate(2px,1px)}}
`;

function el(tag, cls, parent, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}

/* 内置文案：与 dist/assets/egg/texts/prospect.js 相同，只在文案文件加载失败时使用。改文字请改 texts/prospect.js */
const TEXTS = {
  name: '（待服主填写）',
  intro: '',
  hud: { score: '分数', time: '时间', tnt: 'TNT', best: '最高' },
  button: { start: '开始', again: '再来一次', play_again: '再玩一局' },
  mode: { dig: '点按：挖掘', flag: '点按：标记' },
  hint: { flag: '右键/长按：标记', dig: '长按：挖掘' },
  msg: { ore: '{ore} +{points}', won: '通关', lost: '爆炸了', new_record: '{result} · 新纪录' },
  ores: { coal: '煤', iron: '铁', gold: '金', diamond: '钻石' },
  canvas_label: '探矿棋盘（方向键移动，空格挖掘，F 标记）',
  cell: { position: '第{row}行第{col}列 {state}', flagged: '已标记', unopened: '未挖', tnt: 'TNT', empty: '空' }
};

export default {
  id: 'prospect',
  title: '（待服主填写）', // 游戏名的兜底；实际显示 texts/prospect.js 的 name
  texts: TEXTS,
  mount(root, ctx) {
    const tx = ctx.t;   // 文案：texts/prospect.js（加载失败时用上面的 TEXTS）
    const sig = ctx.signal, on = (t, ev, f, o) => t.addEventListener(ev, f, Object.assign({ signal: sig }, o));
    const style = el('style', null, root, CSS);
    const w = el('div', 'egg-prospect-w', root);
    if (ctx.reducedMotion) w.classList.add('egg-prospect-rm');
    const bar = el('div', 'egg-prospect-bar', w);
    const stat = {};
    for (const k of ['score', 'time', 'tnt', 'best']) {
      const s = el('div', null, bar); el('span', null, s, tx('hud.' + k) + ' '); stat[k] = el('b', null, s, '0');
    }
    const stage = el('div', 'egg-prospect-st', w);
    const cv = el('canvas', 'egg-prospect-c', stage);
    cv.tabIndex = 0;
    cv.setAttribute('role', 'application');
    cv.setAttribute('aria-label', tx('canvas_label'));
    const g2 = cv.getContext('2d');
    const ov = el('div', 'egg-prospect-ov', stage);
    const startBtn = el('button', 'egg-prospect-p', ov, tx('button.start'));
    startBtn.type = 'button';
    const row = el('div', 'egg-prospect-row', w);
    const msg = el('span', 'egg-prospect-msg', row);
    msg.setAttribute('aria-live', 'polite');
    const modeBtn = el('button', null, row);
    modeBtn.type = 'button';
    const again = el('button', 'egg-prospect-p', row, tx('button.again'));
    again.type = 'button';
    const hint = el('span', 'egg-prospect-hint', row, tx('hint.flag'));
    const sr = el('span', 'egg-prospect-sr', w);
    sr.setAttribute('aria-live', 'polite');

    let P, best = parseInt(ctx.storage.get('best'), 10) || 0, round = 0, g, S = 12, k = 1;
    let cur = 0, kbd = false, press = null, lpTimer = 0, lpEl = null, t0 = 0, tick = 0, flagMode = false, started = false;
    let fx = null;   // 踩雷动画：{ t: 已模拟毫秒, chain: [[格, 引爆时刻]], end, raf, acc, last }

    function theme() {
      const t = ctx.theme() === 'dark' ? 'dark' : 'light';
      // n 为负数时换成深板岩色调的石头（纯视觉，玩法不变）
      P = Object.assign({}, PAL[t], ctx.negative ? DEEP[t] : null);
      const fb = FB[t], pick = (v, d) => (ctx.color(v) || '').trim() || d;
      const set = (n, v) => w.style.setProperty('--egp-' + n, v);
      set('text', pick('--text', fb.text)); set('muted', pick('--muted', fb.muted));
      set('surface', pick('--surface', fb.surface)); set('border', pick('--border', fb.border));
      set('accent', pick('--accent', fb.accent)); set('fill', pick('--accent-fill', fb.accent)); set('on', pick('--on-accent', fb.on));
      set('danger', pick('--danger', fb.danger));
      P.cur = pick('--accent', fb.accent);
    }

    function fresh() {
      // 宿主横屏全屏（.egg-fs）的矮屏（手机横屏）仍用手机的 9×9 棋盘，格子才够大
      const c = config(ctx.cycle, stage.clientWidth >= 560 && !(fsMode() && (window.innerHeight || 800) < 560));
      g = newGame(c.cols, c.rows, c.mines, (ctx.seed >>> 0) + Math.imul(round, 0x9E3779B9));
      cur = (g.rows >> 1) * g.cols + (g.cols >> 1);
    }

    const fsMode = () => root.classList.contains('egg-fs');
    function layout() {
      const dpr = window.devicePixelRatio || 1;
      let avail = Math.min(stage.clientWidth || 320, 44 * g.cols) - 4;
      // 全屏时按高度收紧：棋盘连同上方计分行、下方按钮行一屏放得下
      if (fsMode()) avail = Math.min(avail, Math.max(9 * 12, ((window.innerHeight || 800) - 90) * g.cols / g.rows) - 4);
      k = Math.max(1, Math.floor(avail * dpr / (g.cols * 12)));
      S = 12 * k;
      cv.width = g.cols * S; cv.height = g.rows * S;
      cv.style.width = cv.width / dpr + 'px';
      cv.style.aspectRatio = g.cols + '/' + g.rows;
      draw();
    }

    const px = (x0, y0, x, y, w_, h, c) => { g2.fillStyle = c; g2.fillRect(x0 + x * k, y0 + y * k, w_ * k, h * k); };
    function spr(x0, y0, rows) {
      rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) if (r[x] !== '.') px(x0, y0, x, y, 1, 1, SC[r[x]]); });
    }

    function cell(i) {
      const c = g.cells[i], x0 = (i % g.cols) * S, y0 = ((i / g.cols) | 0) * S;
      const over = g.state === 'lost' || g.state === 'won';
      if (c.open && !c.m) {
        px(x0, y0, 0, 0, 12, 12, P.fl);
        px(x0, y0, 0, 0, 12, 1, P.fD); px(x0, y0, 0, 0, 1, 12, P.fD);
        if (c.o) for (const [x, y, h] of SPECK) px(x0, y0, x, y, 1, 1, P.ore[c.o][h]);
        if (c.a) {
          const d = DIG[c.a];
          for (let j = 0; j < 15; j++) if (d[j] === '1') px(x0, y0, 3 + (j % 3) * 2, 1 + ((j / 3) | 0) * 2, 2, 2, P.num[c.a]);
        }
        return;
      }
      if (c.m && over && g.state === 'lost' && !c.flag && shown(i)) {
        px(x0, y0, 0, 0, 12, 12, i === g.boom ? '#7a1d0c' : P.D);
        spr(x0, y0, i === g.boom ? SPR.boom : SPR.tnt);
        if (i === g.boom && ctx.reducedMotion) {      // 减少动态效果：静态的白色描边标出被挖到的 TNT
          px(x0, y0, 0, 0, 12, 1, '#ffffff'); px(x0, y0, 0, 11, 12, 1, '#ffffff'); px(x0, y0, 0, 0, 1, 12, '#ffffff'); px(x0, y0, 11, 0, 1, 12, '#ffffff');
        }
        return;
      }
      const pressed = press && press.i === i && !c.flag && !over;
      px(x0, y0, 0, 0, 12, 12, pressed ? P.D : P.st);
      if (!pressed) {
        px(x0, y0, 0, 0, 12, 1, P.L); px(x0, y0, 0, 0, 1, 12, P.L);
        px(x0, y0, 0, 11, 12, 1, P.D); px(x0, y0, 11, 0, 1, 12, P.D);
        let h = Math.imul(i + 1, 2654435761) >>> 0;
        for (let t = 0; t < 6; t++) {
          h = (Math.imul(h, 1103515245) + 12345) >>> 0;
          px(x0, y0, 2 + (h >>> 8) % 8, 2 + (h >>> 16) % 8, 1 + (t & 1), 1, t & 2 ? P.s2 : P.s1);
        }
      }
      if (c.flag) {
        spr(x0, y0, SPR.torch);
        if (g.state === 'lost' && !c.m && !fx) spr(x0, y0, SPR.x);
      }
    }

    function draw() {
      for (let i = 0; i < g.cells.length; i++) cell(i);
      if (fx) fxDraw();
      if (kbd && started && document.activeElement === cv) {
        const x0 = (cur % g.cols) * S, y0 = ((cur / g.cols) | 0) * S;
        g2.strokeStyle = P.cur; g2.lineWidth = k * 1.5;
        g2.strokeRect(x0 + k * .75, y0 + k * .75, S - k * 1.5, S - k * 1.5);
      }
    }

    /* ---------- 踩雷动画（参考 MC 点燃的 TNT：闪白、膨胀，然后爆炸；其余 TNT 按距离连锁引爆） ----------
     * 时间轴（毫秒）：0~FUSE 点燃闪烁（半周期 300→100，最快 5Hz），FUSE 起爆炸烟团扩散 BLAST，
     * 其余 TNT 在 FUSE+150 之后按距离依次闪白、爆开（每格 +70，最多再 +700），最后进入结算；总长 ≤ 约 2.4 秒。
     * 固定步长 1000/60 推进，绘制只依赖模拟时间 fx.t；所有坐标是逻辑像素整数 × k。 */
    const FUSE = 1150, BLAST = 520, FSTEP = 1000 / 60;
    const BLINK = [300, 260, 220, 180, 140, 110, 100, 100, 100];   // 交替的“暗 / 亮”持续时长，逐渐加快
    function lit(t) { let a = 0; for (let n = 0; n < BLINK.length; n++) { a += BLINK[n]; if (t < a) return n % 2 === 1; } return true; }
    function shown(i) { return !fx || (i === g.boom ? fx.t >= FUSE : fx.at[i] !== undefined && fx.t >= fx.at[i] + 100); }
    function boomStart() {
      const bx = g.boom % g.cols, by = (g.boom / g.cols) | 0, at = {}, list = [];
      g.cells.forEach((c, i) => { if (c.m && !c.flag && i !== g.boom) list.push([i, Math.hypot(i % g.cols - bx, ((i / g.cols) | 0) - by)]); });
      list.sort((a, b) => a[1] - b[1]);
      let end = FUSE + BLAST;
      for (const [i, d] of list) { at[i] = FUSE + 150 + Math.min(700, Math.round(d * 70)); end = Math.max(end, at[i] + 260); }
      fx = { t: 0, at, list: list.map(x => x[0]), end, acc: 0, last: 0, raf: 0, shook: false };
      g.tEnd = performance.now(); stopTick();
      msg.textContent = ''; msg.classList.remove('egg-prospect-bad');
      hud(); draw();
      if (document.hidden) { fxEnd(); return; }
      fx.raf = requestAnimationFrame(fxFrame);
    }
    function fxFrame(ts) {
      if (!fx) return;
      fx.raf = 0;
      fx.acc += fx.last ? Math.min(100, ts - fx.last) : 0; fx.last = ts;
      while (fx.acc >= FSTEP) { fx.acc -= FSTEP; const t0_ = fx.t; fx.t += FSTEP; fxSound(t0_, fx.t); }
      if (fx.t >= FUSE && !fx.shook) {                // 爆炸瞬间：沿用现有的轻微屏震
        fx.shook = true; cv.classList.remove('egg-prospect-shake'); void cv.offsetWidth; cv.classList.add('egg-prospect-shake');
      }
      if (fx.t >= fx.end) { fxEnd(); return; }
      draw();
      fx.raf = requestAnimationFrame(fxFrame);
    }
    // 音效跟着同一个模拟时钟 fx.t：引信每次闪亮嘶一声（闪烁加快，嘶声也加快）；FUSE 时主爆炸；
    // 连锁里每个 TNT 在"爆开"那一刻（at + 100）响一声，同一步里有多个就合成一声更响的，宿主再限制并发
    function fxSound(a, b) {
      const A = ctx.audio; if (!A) return;
      if (b < FUSE && lit(b) && !lit(a)) A.sfx('hiss', { pitch: 0.8 + b / FUSE * 0.6 });
      if (a < FUSE && b >= FUSE) A.sfx('boom');
      let n = 0;
      for (const i of fx.list) { const e = fx.at[i] + 100; if (a < e && b >= e) n++; }
      if (n) A.sfx('boom', { vol: Math.min(1, 0.45 + 0.15 * n), pitch: 1.1 + Math.random() * 0.3 });
    }
    function fxEnd() {
      if (!fx) return;
      if (fx.raf) cancelAnimationFrame(fx.raf);
      fx = null; finish(); hud(); draw();
    }
    function fxCancel() { if (fx) { if (fx.raf) cancelAnimationFrame(fx.raf); fx = null; } }
    // 以格子左上角为原点、逻辑像素为单位画方块（可超出本格）
    const at2 = (i, x, y, w_, h, c) => px((i % g.cols) * S, ((i / g.cols) | 0) * S, x, y, w_, h, c);
    const PUFF = [[0, -1], [.7, -.7], [1, 0], [.7, .7], [0, 1], [-.7, .7], [-1, 0], [-.7, -.7], [.38, -.92], [.92, .38], [-.38, .92], [-.92, -.38]];
    function puff(i, q, reach, n) {               // 像素烟团：从格子中心向外扩散，先亮黄再灰，逐渐变小
      const col = q < .2 ? '#fff6c4' : q < .45 ? '#ffd23f' : q < .7 ? '#a8a8a8' : '#707070';
      const sz = Math.max(1, 3 - Math.floor(q * 3));
      for (let j = 0; j < n; j++) {
        const [dx, dy] = PUFF[j], r = 2 + Math.round(q * reach * (j % 2 ? 1 : .8));
        at2(i, 6 + Math.round(dx * r) - (sz >> 1), 6 + Math.round(dy * r) - (sz >> 1), sz, sz, col);
      }
    }
    function fxDraw() {
      const t = fx.t, b = g.boom;
      if (t < FUSE) {                                 // 点燃：TNT 一闪一闪变白，亮时膨胀 1 像素
        const on = lit(t), e = on ? 1 : 0;
        at2(b, -e, -e, 12 + 2 * e, 12 + 2 * e, P.D);
        spr((b % g.cols) * S, ((b / g.cols) | 0) * S, SPR.tnt);
        if (on) { g2.globalAlpha = .78; at2(b, -e, -e, 12 + 2 * e, 12 + 2 * e, '#ffffff'); g2.globalAlpha = 1; }
      } else {
        const q = Math.min(1, (t - FUSE) / BLAST);
        if (q < 1) {                                  // 周围 3×3 被震开、短暂压暗
          g2.globalAlpha = .4 * (1 - q); g2.fillStyle = '#000';
          const bx = b % g.cols, by = (b / g.cols) | 0;
          g2.fillRect(Math.max(0, bx - 1) * S, Math.max(0, by - 1) * S, (Math.min(g.cols - 1, bx + 1) - Math.max(0, bx - 1) + 1) * S, (Math.min(g.rows - 1, by + 1) - Math.max(0, by - 1) + 1) * S);
          g2.globalAlpha = 1;
          if (t - FUSE < 90) at2(b, -3, -3, 18, 18, '#fff6c4');   // 起爆闪光（单帧级，不重复）
          puff(b, q, 14, 12);
        }
      }
      for (const i of fx.list) {                      // 连锁：依次闪白 → 爆开 → 露出 TNT
        const d = t - fx.at[i];
        if (d < 0) continue;
        if (d < 100) { at2(i, 0, 0, 12, 12, P.D); spr((i % g.cols) * S, ((i / g.cols) | 0) * S, SPR.tnt); g2.globalAlpha = .78; at2(i, 0, 0, 12, 12, '#ffffff'); g2.globalAlpha = 1; }
        else if (d < 260) puff(i, (d - 100) / 160, 6, 8);
      }
    }

    function secs() { return t0 ? Math.floor(((g.state === 'play' ? performance.now() : g.tEnd) - t0) / 1000) : 0; }
    function hud() {
      stat.score.textContent = g.score;
      stat.time.textContent = Math.min(999, secs());
      stat.tnt.textContent = g.mines - g.flags;
      stat.best.textContent = best;
      modeBtn.textContent = tx(flagMode ? 'mode.flag' : 'mode.dig');
      modeBtn.setAttribute('aria-pressed', String(flagMode));
      hint.textContent = tx(flagMode ? 'hint.dig' : 'hint.flag');
      const end = (g.state === 'won' || g.state === 'lost') && !fx;
      again.hidden = !end; modeBtn.hidden = end || !!fx || !started; hint.hidden = end || !!fx || !started;
      ov.hidden = started;
    }

    function stopTick() { clearInterval(tick); tick = 0; }
    function finish() {
      if (!g.tEnd) g.tEnd = performance.now();
      stopTick();
      const win = g.state === 'won';
      if (ctx.audio) ctx.audio.sfx(win ? 'win' : 'fail');
      let m = tx(win ? 'msg.won' : 'msg.lost');
      again.textContent = tx(win ? 'button.play_again' : 'button.again');
      if (g.score > best) { best = g.score; ctx.storage.set('best', String(best)); m = tx('msg.new_record', { result: m }); }
      msg.textContent = m;
      msg.classList.toggle('egg-prospect-bad', !win);
      requestAnimationFrame(() => again.focus({ preventScroll: true }));
    }

    function act(i, how) {
      if (!started || g.state === 'won' || g.state === 'lost') return;
      let r = null;
      if (how === 'flag') { if (!flag(g, i)) { r = chord(g, i); if (!r) return; } }
      else {
        const was = g.state;
        r = dig(g, i);
        if (was === 'ready' && g.state !== 'ready') { t0 = performance.now(); tick = setInterval(hud, 1000); }
      }
      const A = ctx.audio;
      if (A && g.state !== 'lost') {                  // 挖掘 / 插火把；挖到矿石时音调随矿物等级升高
        if (how === 'flag' && !r) A.sfx('place');
        else A.sfx('step', { pitch: 1.2 });
        if (r && r.got.length) A.sfx('pickup', { pitch: 0.7 + 0.25 * Math.max(...r.got) });
      }
      if (A && g.state === 'lost' && ctx.reducedMotion) A.sfx('boom');
      if (r && r.got.length) {
        const o = ORES[Math.max(...r.got)];
        msg.classList.remove('egg-prospect-bad');
        msg.textContent = tx('msg.ore', { ore: tx('ores.' + o[0]), points: r.got.filter(x => ORES[x] === o).length * o[1] });
      }
      if (g.state === 'lost' && !ctx.reducedMotion) { boomStart(); return; }
      if (g.state === 'won' || g.state === 'lost') finish();
      hud(); draw();
    }

    function start() {
      if (started) round++;
      fxCancel();
      started = true; stopTick(); t0 = 0;
      fresh(); layout(); msg.textContent = ''; hud();
      cv.focus({ preventScroll: true });
    }

    function cellAt(e) {
      const r = cv.getBoundingClientRect();
      const x = Math.floor((e.clientX - r.left - 2) / (r.width - 4) * g.cols), y = Math.floor((e.clientY - r.top - 2) / (r.height - 4) * g.rows);
      return x >= 0 && y >= 0 && x < g.cols && y < g.rows ? y * g.cols + x : -1;
    }
    function clearPress() {
      clearTimeout(lpTimer);
      if (lpEl) { lpEl.remove(); lpEl = null; }
      const had = press; press = null;
      if (had) draw();
    }

    on(cv, 'contextmenu', e => e.preventDefault());
    on(cv, 'pointerdown', e => {
      const i = cellAt(e);
      kbd = false;
      if (i < 0 || !started) return;
      cur = i;
      if (e.pointerType === 'mouse') {
        if (e.button === 2) act(i, 'flag');
        else if (e.button === 0) { press = { i, id: e.pointerId }; draw(); }
        return;
      }
      e.preventDefault();
      clearPress();
      press = { i, id: e.pointerId, x: e.clientX, y: e.clientY, done: false };
      if (g.state === 'play' || g.state === 'ready') {
        const r = cv.getBoundingClientRect(), sr_ = stage.getBoundingClientRect(), cs = (r.width - 4) / g.cols;
        lpEl = el('div', 'egg-prospect-lp', stage);
        Object.assign(lpEl.style, { left: r.left - sr_.left + 2 + (i % g.cols) * cs + 'px', top: r.top - sr_.top + 2 + ((i / g.cols) | 0) * cs + 'px', width: cs + 'px', height: cs + 'px' });
      }
      draw();
      lpTimer = setTimeout(() => {
        if (!press) return;
        press.done = true;
        const j = press.i;
        clearPress();
        act(j, flagMode ? 'dig' : 'flag');
        if (navigator.vibrate) try { navigator.vibrate(15); } catch (_) {}
      }, 400);
    });
    on(cv, 'pointermove', e => {
      if (!press || e.pointerId !== press.id) return;
      if (e.pointerType === 'mouse' ? cellAt(e) !== press.i : Math.hypot(e.clientX - press.x, e.clientY - press.y) > 12) clearPress();
    });
    on(cv, 'pointerup', e => {
      if (!press || e.pointerId !== press.id) return;
      const p = press, i = cellAt(e);
      clearPress();
      if (p.done || i !== p.i) return;
      if (e.pointerType !== 'mouse') e.preventDefault();
      act(i, e.pointerType === 'mouse' ? 'dig' : flagMode ? 'flag' : 'dig');
    });
    on(cv, 'pointercancel', clearPress);
    on(cv, 'pointerleave', e => { if (e.pointerType === 'mouse') clearPress(); });
    on(cv, 'focus', draw); on(cv, 'blur', draw);

    function announce() {
      const c = g.cells[cur];
      sr.textContent = tx('cell.position', { row: ((cur / g.cols) | 0) + 1, col: cur % g.cols + 1,
        state: c.flag ? tx('cell.flagged') : !c.open ? tx('cell.unopened') : c.m ? tx('cell.tnt') : c.a ? c.a : tx('cell.empty') });
    }
    on(cv, 'keydown', e => {
      if (!started || e.altKey || e.ctrlKey || e.metaKey) return;
      const D = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (D) {
        const x = Math.min(g.cols - 1, Math.max(0, cur % g.cols + D[0])), y = Math.min(g.rows - 1, Math.max(0, ((cur / g.cols) | 0) + D[1]));
        cur = y * g.cols + x;
        kbd = true; e.preventDefault(); draw(); announce();
      } else if (e.key === ' ' || e.key === 'Enter') {
        kbd = true; e.preventDefault(); act(cur, 'dig'); announce();
      } else if (e.key === 'f' || e.key === 'F') {
        kbd = true; e.preventDefault(); act(cur, 'flag'); announce();
      }
    });
    on(startBtn, 'click', start);
    on(again, 'click', start);
    on(modeBtn, 'click', () => { flagMode = !flagMode; hud(); });

    theme(); fresh(); layout(); hud();
    ctx.onThemeChange(() => { theme(); draw(); });
    let lastW = stage.clientWidth;
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
      if (stage.clientWidth === lastW) return;
      lastW = stage.clientWidth;
      if (!started) fresh();
      layout();
    }) : null;
    if (ro) ro.observe(stage);
    // 视口高度变化（进出宿主全屏、横竖屏）也要重算；没有 ResizeObserver 时也靠它
    let fsWas = false;
    on(window, 'resize', () => {
      const fs = fsMode();
      if (ro && !fs && !fsWas) return;
      fsWas = fs; lastW = stage.clientWidth;
      if (!started) fresh();
      layout();
    });
    on(document, 'visibilitychange', () => { if (document.hidden) fxEnd(); });   // 动画中切到后台：直接跳到结算
    if (/[?&]egg-test\b/.test(location.search)) root.__eggTest = { game: () => g, anim: () => fx && { t: fx.t, end: fx.end } };

    return {
      unmount() {
        stopTick(); clearTimeout(lpTimer); fxCancel();
        if (ro) ro.disconnect();
        delete root.__eggTest;
        style.remove(); w.remove();
      }
    };
  }
};
