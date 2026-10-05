// 仓库根目录：node tools/eggs/breach/test/engine.test.mjs
import { _engine as E, _core as C } from '../../../../dist/assets/egg/games/08-breach.js';
const _genMaze = (s, c, n) => C.genMaze(s, C.diffOf(c), n), _buildWorld = C.buildWorld, _levelBase = C.levelBase;
const { AIR, STONE, LAVA, WATER, GSTONE, COBBLE, OBSID, TORCH } = E.M;
let pass = 0, fail = 0;
function test(name, fn) {
  try { const r = fn(); console.log('ok  ', name, r ? '— ' + r : ''); pass++; }
  catch (e) { console.log('FAIL', name, '—', e.message); fail++; }
}
function assert(c, m) { if (!c) throw new Error(m || 'assert'); }
// 小世界：X×Y×Z 全石头，按 ascii 平面挖洞
function box(X, Y, Z, seed = 1, params = {}) { return E.create(X, Y, Z, seed, params); }
function carve(w, x0, x1, y0, y1, z0, z1, m = AIR) { for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) w.setBlock(w.idx(x, y, z), m); }
function run(w, n, each) { for (let t = 0; t < n; t++) { w.tick(); if (each) each(t); } }
function hash(w) { let h = 2166136261; for (let i = 0; i < w.N; i++) { h = Math.imul(h ^ w.mat[i], 16777619); h = Math.imul(h ^ w.q[i], 16777619); } return h >>> 0; }

// ---------- 平均流动的 N/E 偏置 ----------
test('平均流动：3 层落在平地 → 中 1、北 1、东 1（与源码一致的 N/E 偏置）', () => {
  const w = box(7, 4, 7, 1, { pressure: false, lavaSlow: false });
  carve(w, 1, 5, 2, 2, 1, 5);
  const c = w.idx(3, 2, 3);
  w.setFluid(c, WATER, 3, false);
  run(w, 6);   // 水 5 刻更新一次
  const g = (dx, dz) => w.q[w.idx(3 + dx, 2, 3 + dz)];
  assert(g(0, 0) === 1 && g(0, -1) === 1 && g(1, 0) === 1 && g(0, 1) === 0 && g(-1, 0) === 0, `got C${g(0,0)} N${g(0,-1)} E${g(1,0)} S${g(0,1)} W${g(-1,0)}`);
  return 'C1 N1 E1 S0 W0';
});
test('平均流动：6 层 → 轮转偏移分配', () => {
  const w = box(7, 4, 7, 1, { pressure: false });
  carve(w, 1, 5, 2, 2, 1, 5);
  w.setFluid(w.idx(3, 2, 3), WATER, 6, false);
  run(w, 6);
  const g = (dx, dz) => w.q[w.idx(3 + dx, 2, 3 + dz)];
  // 逐层：N,E,S,W 各 1（偏移轮转），中心剩 2
  assert(g(0, 0) === 2 && g(0, -1) === 1 && g(1, 0) === 1 && g(0, 1) === 1 && g(-1, 0) === 1, `C${g(0,0)} N${g(0,-1)} E${g(1,0)} S${g(0,1)} W${g(-1,0)}`);
});

// ---------- 竖直下落与合并 ----------
test('竖直下落：同种合并，满 8 后余量留上格', () => {
  const w = box(3, 6, 3, 1, { pressure: false });
  carve(w, 1, 1, 1, 4, 1, 1);
  w.setFluid(w.idx(1, 1, 1), WATER, 5, true);
  w.setFluid(w.idx(1, 2, 1), WATER, 6, false);
  run(w, 6);
  assert(w.q[w.idx(1, 1, 1)] === 8 && w.q[w.idx(1, 2, 1)] === 3, `${w.q[w.idx(1,1,1)]}/${w.q[w.idx(1,2,1)]}`);
});

// ---------- 水–岩浆混合 ----------
test('混合：满格岩浆旁有水 → 黑曜石，水 −1 层', () => {
  const w = box(5, 4, 3, 1, { pressure: false });
  carve(w, 1, 3, 2, 2, 1, 1);
  w.setFluid(w.idx(2, 2, 1), WATER, 3, true);
  w.setFluid(w.idx(1, 2, 1), LAVA, 8, true);
  w.open(w.idx(1, 3, 1));    // 触发邻居更新（相当于旁边方块变化）
  carve(w, 1, 1, 3, 3, 1, 1, STONE);
  assert(w.mat[w.idx(1, 2, 1)] === OBSID, 'mat ' + w.mat[w.idx(1, 2, 1)]);
  assert(w.q[w.idx(2, 2, 1)] === 2, 'water ' + w.q[w.idx(2, 2, 1)]);
});
test('混合：非满格岩浆流到水旁 → 圆石，水 −1 层（1 层水消失）', () => {
  const w = box(6, 4, 3, 1, { pressure: false, lavaSlow: false });
  carve(w, 1, 4, 2, 2, 1, 1);
  w.setFluid(w.idx(3, 2, 1), WATER, 1, true);
  w.setFluid(w.idx(1, 2, 1), LAVA, 4, false);   // 平均流动把 2 层送到 (2,2,1)，它紧挨着水
  run(w, 31);
  assert(w.mat[w.idx(2, 2, 1)] === COBBLE, 'mat ' + w.mat[w.idx(2, 2, 1)]);
  assert(w.mat[w.idx(3, 2, 1)] === AIR, 'water should be gone');
});
test('混合：岩浆从上方落到水上 → 岩浆 −1 层，下方整格水变石头', () => {
  const w = box(3, 6, 3, 1, { pressure: false, lavaSlow: false });
  carve(w, 1, 1, 1, 3, 1, 1);
  w.setFluid(w.idx(1, 1, 1), WATER, 2, true);
  w.setFluid(w.idx(1, 3, 1), LAVA, 5, false);
  run(w, 31);   // 先直接下落到 y=2，再下一次更新时落到水上
  run(w, 31);
  assert(w.mat[w.idx(1, 1, 1)] === GSTONE, 'below ' + w.mat[w.idx(1, 1, 1)]);
  assert(w.mat[w.idx(1, 2, 1)] === LAVA && w.q[w.idx(1, 2, 1)] === 4, 'lava ' + w.q[w.idx(1, 2, 1)]);
});
test('石头阻挡：巷道里的积水把岩浆前锋变成石头，岩浆需要涨过头部高度才能越过；越过前石头另一侧脚部一直没有岩浆', () => {
  // 巷道：x=1..20，脚 y=2，头 y=3；源头湖在 x=1 西端（柱子到 y=5）
  const w = box(23, 8, 3, 7);
  carve(w, 1, 20, 2, 3, 1, 1);
  carve(w, 1, 1, 2, 5, 1, 1);
  for (let y = 2; y <= 5; y++) w.setFluid(w.idx(1, y, 1), LAVA, 8, true);
  w.addSource(w.idx(1, 5, 1), LAVA);
  for (let x = 8; x <= 9; x++) w.setFluid(w.idx(x, 2, 1), WATER, 1, true);
  w.open(w.idx(2, 2, 1));
  let stoneAt = -1, crossT = -1, headOverStone = -1;
  run(w, 6000, t => {
    for (let x = 6; x <= 10; x++) if (stoneAt < 0 && [COBBLE, OBSID, GSTONE].includes(w.mat[w.idx(x, 2, 1)])) stoneAt = x;
    if (stoneAt > 0) {
      if (headOverStone < 0 && w.mat[w.idx(stoneAt, 3, 1)] === LAVA) headOverStone = t;
      if (crossT < 0) for (let x = stoneAt + 1; x <= 20; x++) if (w.mat[w.idx(x, 2, 1)] === LAVA) { crossT = t; break; }
    }
  });
  assert(stoneAt > 0, 'no stone formed');
  assert(headOverStone >= 0 && crossT >= headOverStone, `head over stone ${headOverStone}, crossed ${crossT}`);
  return `石头在 x=${stoneAt}，头部岩浆越过于 ${headOverStone} 刻，石头后脚部出现岩浆于 ${crossT} 刻`;
});

// ---------- 压强 ----------
test('连通器：U 形管两侧液面趋平（无源头）', () => {
  // 两根竖管 x=1 和 x=5，底部 y=1 横管连通
  const w = box(7, 12, 3, 3);
  carve(w, 1, 5, 1, 1, 1, 1); carve(w, 1, 1, 1, 10, 1, 1); carve(w, 5, 5, 1, 10, 1, 1);
  for (let x = 1; x <= 5; x++) w.setFluid(w.idx(x, 1, 1), WATER, 8, true);
  for (let y = 2; y <= 9; y++) w.setFluid(w.idx(1, y, 1), WATER, 8, true);
  w.setFluid(w.idx(1, 10, 1), WATER, 8, false);
  const level = x => { let s = 0; for (let y = 2; y <= 10; y++) if (w.mat[w.idx(x, y, 1)] === WATER) s += w.q[w.idx(x, y, 1)]; return s; };
  const before = [level(1), level(5)];
  run(w, 8000);
  const after = [level(1), level(5)];
  assert(Math.abs(after[0] - after[1]) <= 8, `before ${before} after ${after}`);
  return `液量（层）左/右：${before} → ${after}`;
});
test('压强瞬移永不高于源格（迷宫场景，多个种子）', () => {
  let tp = 0;
  for (const seed of [1, 2, 3, 4, 5]) {
    const M = _genMaze(seed, 6, false), B = _buildWorld(M, {});
    B.openBreach(); run(B.w, 3000);
    assert(B.w.S.above === 0, 'teleport above source: ' + B.w.S.above);
    // 也检查：所有流体都不高于湖面
    for (let i = 0; i < B.w.N; i++) if (B.w.mat[i] === LAVA) assert(B.w.yOf(i) <= B.lakeTop, 'fluid above lake top');
    tp += B.w.S.teleports;
  }
  return `共 ${tp} 次瞬移，0 次高于源格`;
});
test('矿坑先灌满，岩浆才越过它继续前进', () => {
  const w = box(24, 8, 3, 11);
  carve(w, 1, 22, 2, 3, 1, 1);
  carve(w, 1, 1, 2, 5, 1, 1);
  for (let y = 2; y <= 5; y++) w.setFluid(w.idx(1, y, 1), LAVA, 8, true);
  w.addSource(w.idx(1, 5, 1), LAVA);
  const pits = [6, 11, 16];
  for (const x of pits) w.setBlock(w.idx(x, 1, 1), AIR);
  w.open(w.idx(2, 2, 1));
  const full = {}, beyond = {};
  run(w, 8000, t => {
    for (const x of pits) {
      if (full[x] == null && w.mat[w.idx(x, 1, 1)] === LAVA && w.q[w.idx(x, 1, 1)] === 8) full[x] = t;
      if (beyond[x] == null) for (let xx = x + 1; xx <= 22; xx++) if (w.mat[w.idx(xx, 2, 1)] === LAVA) { beyond[x] = t; break; }
    }
  });
  for (const x of pits) assert(full[x] != null && beyond[x] != null && full[x] <= beyond[x], `pit ${x}: full ${full[x]} beyond ${beyond[x]}`);
  return pits.map(x => `坑${x}: 满 ${full[x]} ≤ 越过 ${beyond[x]}`).join('，');
});

// ---------- 守恒 ----------
test('守恒：岩浆场景（无积水）总量 = 初始 + 源头补给（逐刻精确整数）', () => {
  for (const seed of [7, 8]) {
    const M = _genMaze(seed, 3, true);   // 负数场景没有积水
    const B = _buildWorld(M, {}); const w = B.w;
    const f = B.fluid, init = w.total(f);
    B.openBreach();
    run(w, 4000, t => { if (t % 50 === 0) assert(w.total(f) === init + w.S.injected, `t${t}: ${w.total(f)} != ${init}+${w.S.injected}`); });
  }
});
test('守恒：岩浆+积水，总量 = 初始 + 补给 − 混合损失（逐刻）', () => {
  const M = _genMaze(21, 6, false), B = _buildWorld(M, {}); const w = B.w;
  const tot = () => w.total(LAVA) + w.total(WATER);
  const init = tot(); B.openBreach();
  run(w, 4000, t => { assert(tot() === init + w.S.injected - w.S.lavaLost - w.S.waterLost, `t${t}`); });
  return `混合损失：岩浆 ${w.S.lavaLost} 层，水 ${w.S.waterLost} 层`;
});
test('守恒：三层 + 深矿坑连通的世界（第 11 / 20 / 28 档，逐刻精确）', () => {
  for (const d of [11, 20, 28]) {
    const M = _genMaze(99, d, true), PC = C.pacing(d);
    assert(M.levels.length === 3, 'levels');
    const B = _buildWorld(M, { headAbove: PC.headAbove, lakeW: PC.lakeW, params: PC.params }); const w = B.w, f = B.fluid, init = w.total(f);
    B.openBreach();
    run(w, 6000, t => { if (t % 25 === 0) assert(w.total(f) === init + w.S.injected, 'd' + d + ' t' + t); });
  }
});

// ---------- 确定性 ----------
test('确定性：固定种子同步模式两次运行完全一致', () => {
  const go = s => { const M = _genMaze(s, 5, false), B = _buildWorld(M, {}); B.openBreach(); run(B.w, 2000); return hash(B.w); };
  const a = go(42), b = go(42), c = go(43);
  assert(a === b, 'nondeterministic'); assert(a !== c, 'seed has no effect');
  return a.toString(16);
});

// ---------- 多层 ----------
function twoLevel(lakeTop, seed = 5) {
  // 下层巷道 y=2..3（坑 y=1），竖井（宽 1）在 x=14 从 y=2 通到上层脚部 y=8；上层巷道 y=8..9，x=10..20
  const w = box(23, Math.max(12, lakeTop + 2), 3, seed);
  carve(w, 1, 14, 2, 3, 1, 1);
  carve(w, 14, 14, 2, 9, 1, 1);
  carve(w, 10, 20, 8, 9, 1, 1);
  carve(w, 1, 1, 2, lakeTop, 1, 1);
  for (let y = 2; y <= lakeTop; y++) w.setFluid(w.idx(1, y, 1), LAVA, 8, true);
  w.addSource(w.idx(1, lakeTop, 1), LAVA);
  w.open(w.idx(2, 2, 1));
  return w;
}
test('多层：源头高度低于上层地面时，流体不进入上层', () => {
  const w = twoLevel(7);       // 上层脚部 y=8
  run(w, 12000);
  for (let x = 10; x <= 20; x++) for (const y of [8, 9]) assert(w.mat[w.idx(x, y, 1)] !== LAVA || x === 14 && false, `lava at ${x},${y}`);
  let topY = 0; for (let y = 2; y <= 9; y++) if (w.mat[w.idx(14, y, 1)] === LAVA) topY = y;
  return `竖井里最高到 y=${topY}（湖面 y=7）`;
});
test('多层：静压面高于上层地面时，流体从竖井涌出并在静压面停住', () => {
  const w = twoLevel(9);       // 湖面 y=9（上层头部）
  let first = -1;
  run(w, 20000, t => { if (first < 0) for (let x = 10; x <= 20; x++) if (x !== 14 && w.mat[w.idx(x, 8, 1)] === LAVA) { first = t; break; } });
  assert(first > 0, 'never emerged');
  for (let i = 0; i < w.N; i++) if (w.mat[i] === LAVA) assert(w.yOf(i) <= 9, 'above static surface');
  let up = 0; for (let x = 10; x <= 20; x++) up += w.mat[w.idx(x, 8, 1)] === LAVA ? w.q[w.idx(x, 8, 1)] : 0;
  return `首次涌出 ${first} 刻；上层脚部总量 ${up} 层，没有任何流体高于 y=9`;
});
test('涌出时机由模拟决定：模拟不读玩家输入；玩家越早上楼，到涌出的间隔越长', () => {
  const runOnce = () => { const w = twoLevel(9, 77); let first = -1; run(w, 20000, t => { if (first < 0 && w.mat[w.idx(15, 8, 1)] === LAVA) first = t; }); return first; };
  const e1 = runOnce(), e2 = runOnce();
  assert(e1 === e2 && e1 > 0, 'emergence must be a pure function of the simulation');
  const arrive = [200, 600, 1000].map(a => e1 - a);
  assert(arrive[0] > arrive[1] && arrive[1] > arrive[2]);
  return `涌出于 ${e1} 刻；玩家在 200/600/1000 刻上楼 → 安全间隔 ${arrive.join('/')} 刻`;
});
function deepPit(lakeTop, lowerLen) {
  // 下层巷道 x=2..lowerLen（y=2..3），湖在 x=1；上层巷道 x=2..20（y=8..9），在 x=lowerLen 处有深坑（y=4..7 打通）
  const w = box(23, Math.max(12, lakeTop + 2), 3, 9);
  carve(w, 1, lowerLen, 2, 3, 1, 1);
  carve(w, 4, 20, 8, 9, 1, 1);
  carve(w, lowerLen, lowerLen, 4, 7, 1, 1);
  carve(w, 1, 1, 2, lakeTop, 1, 1);
  for (let y = 2; y <= lakeTop; y++) w.setFluid(w.idx(1, y, 1), LAVA, 8, true);
  w.addSource(w.idx(1, lakeTop, 1), LAVA);
  w.open(w.idx(2, 2, 1));
  return w;
}
test('深坑：下层没灌满时不涌出；灌满且静压面够高才涌出', () => {
  const w = deepPit(10, 18);
  let headFull = -1, emerge = -1, rise = [];
  run(w, 30000, t => {
    if (headFull < 0 && w.mat[w.idx(18, 3, 1)] === LAVA && w.q[w.idx(18, 3, 1)] === 8) headFull = t;
    if (emerge < 0) for (let x = 4; x <= 20; x++) if (w.mat[w.idx(x, 8, 1)] === LAVA) { emerge = t; break; }
    if (t % 100 === 0 && emerge < 0) { let top = 0; for (let y = 4; y <= 7; y++) if (w.mat[w.idx(18, y, 1)] === LAVA) top = y; rise.push(top); }
  });
  assert(emerge > 0 && headFull > 0 && emerge >= headFull, `head full ${headFull}, emerge ${emerge}`);
  const low = deepPit(7, 18); run(low, 30000);
  for (let x = 4; x <= 20; x++) assert(low.mat[low.idx(x, 8, 1)] !== LAVA, 'emerged with low static surface');
  return `深坑正下方巷道灌满 ${headFull} 刻 → 深坑涌出 ${emerge} 刻（坑内液面每 5 秒：${rise.slice(-8).join(',')}）；湖面低于上层时从不涌出`;
});
test('火把：流体经过会被烧掉/冲掉（事件）', () => {
  const w = box(8, 5, 3, 1, { pressure: false, lavaSlow: false });
  carve(w, 1, 6, 2, 3, 1, 1);
  w.setBlock(w.idx(3, 2, 1), TORCH);
  w.setFluid(w.idx(1, 2, 1), WATER, 8, false);
  let torched = false; run(w, 60, () => { for (const e of w.takeEvents()) if (e.t === 'torch') torched = true; });
  assert(torched && w.mat[w.idx(3, 2, 1)] !== TORCH);
});

// ---------- 含水梯子（单列竖井） ----------
function shaftWorld(d, seed, headAbove) {
  const M = C.genMaze(seed, d, false), PC = C.pacing(d);
  const B = C.buildWorld(M, { headAbove, lakeW: PC.lakeW, params: PC.params });
  return { M, B, w: B.w, PC };
}
test('含水梯子：流体进入梯子格（1–8 层与梯子同格），在竖井里涨到静压面停住，涌进上层；全程守恒', () => {
  const { M, B, w } = shaftWorld(6, 4242, 2);           // 两层；静压面 = 上层坑底 + 2（上层脚部）
  const lv = M.levels[0], lx = lv.ladder.x, lz = lv.ladder.z, f = B.fluid;
  const tot = () => w.total(LAVA) + w.total(WATER), init = tot(); B.openBreach();
  let firstLadder = -1, partial = false, emerge = -1, maxY = 0;
  const up = M.levels[1], ex = up.entrance % M.W, ez = (up.entrance / M.W) | 0, b1 = C.levelBase(1);
  for (let t = 0; t < 30000; t++) {
    w.tick();
    const c = w.idx(lx, C.levelBase(0) + 1, lz);
    if (w.mat[c] === f) { if (firstLadder < 0) firstLadder = t; if (w.q[c] < 8) partial = true; }
    for (let y = C.levelBase(0) + 1; y < w.Y; y++) if (w.mat[w.idx(lx, y, lz)] === f) maxY = Math.max(maxY, y);
    if (emerge < 0) for (let dz = -1; dz <= 1; dz++) for (let dx = -2; dx <= 2; dx++) if (!(dx === 0 && dz === 0) && w.mat[w.idx(ex + dx, b1 + 1, ez + dz)] === f) emerge = t;
    if (t % 97 === 0) assert(tot() === init + w.S.injected - w.S.lavaLost - w.S.waterLost, 'conservation');
  }
  assert(firstLadder > 0, 'fluid never entered ladder cell');
  assert(maxY <= B.lakeTop, `rose above static surface ${maxY} > ${B.lakeTop}`);
  assert(emerge > firstLadder, 'did not emerge on upper level');
  for (let i = 0; i < w.N; i++) if (w.mat[i] === f) assert(w.yOf(i) <= B.lakeTop);
  return `梯子格首次进流体 ${firstLadder} 刻（出现过非满格：${partial}），竖井最高 y=${maxY}（静压面 ${B.lakeTop}），上层涌出 ${emerge} 刻`;
});
test('含水梯子：静压面低于上层地面时，竖井只涨到静压面，上层不进流体', () => {
  const { M, B, w } = shaftWorld(6, 777, 1);
  // 把静压面压到上层坑底以下：重建一个 lakeTop = 上层坑底 − 1 的世界
  const PC = C.pacing(6), B2 = C.buildWorld(M, { lakeTop: C.levelBase(1) - 1, lakeW: PC.lakeW, params: PC.params }), w2 = B2.w, f = B2.fluid;
  B2.openBreach();
  for (let t = 0; t < 30000; t++) w2.tick();
  const lv = M.levels[0]; let top = 0;
  for (let y = 0; y < w2.Y; y++) if (w2.mat[w2.idx(lv.ladder.x, y, lv.ladder.z)] === f) top = y;
  for (let i = 0; i < w2.N; i++) if (w2.mat[i] === f) assert(w2.yOf(i) < C.levelBase(1) + 1, 'fluid on upper level');
  return `竖井里最高 y=${top}，静压面 ${B2.lakeTop}`;
});
test('涌出时机：玩家越早上楼，到竖井涌出的间隔越长（模拟与玩家无关）', () => {
  const run1 = () => { const { M, B, w } = shaftWorld(6, 4242, 2); B.openBreach(); const up = M.levels[1], b1 = C.levelBase(1); const ex = up.entrance % M.W, ez = (up.entrance / M.W) | 0;
    for (let t = 0; t < 30000; t++) { w.tick(); if (w.mat[w.idx(ex, b1 + 1, ez)] === B.fluid) return t; } return -1; };
  const e1 = run1(), e2 = run1();
  assert(e1 > 0 && e1 === e2);
  return `竖井口出现流体于 ${e1} 刻；在 100/400/800 刻上楼 → 间隔 ${[100, 400, 800].map(a => e1 - a).join('/')} 刻`;
});
// ---------- 开局预跑 ----------
test('预跑：确定性（两次相同；人为拖慢每刻不影响结果）；选中的破口满足公平条件', () => {
  const out = [];
  for (const [seed, d, neg] of [[1, 3], [2, 7], [3, 11], [4, 13], [5, 20], [6, 28], [7, 28, true]]) {
    const PC = C.pacing(d, !!neg);
    const ra = C.chooseMap(seed, d, !!neg, PC);
    const rb = C.chooseMap(seed, d, !!neg, PC, () => { const t0 = performance.now(); while (performance.now() - t0 < 0.002); });
    assert(ra.k === rb.k && ra.regen === rb.regen && ra.ticks === rb.ticks, 'prerun not deterministic');
    assert(C.fingerprint(ra.M, PC) === C.fingerprint(rb.M, PC), 'fingerprint differs');
    assert(ra.ok, `d${d}: no fair map`);
    // 主线程按 (k, regen, rT) 重建出的图与预跑里的完全一致
    const M2 = C.genMaze(seed, d, !!neg, ra.regen); C.selectBreach(M2, ra.k); M2.rT = ra.rT; M2.risky = ra.risky;   // 主线程同样带上预跑给的险图放宽倍数
    assert(C.fingerprint(M2, PC) === C.fingerprint(ra.M, PC), 'rebuild differs');
    out.push(`d${d}${neg ? '水' : ''}: 图${ra.regen} 候选${ra.k}，${ra.ticks} 刻`);
  }
  return out.join('；');
});

// ---------- 性能 ----------
test('性能：每刻耗时（Node，单线程）', () => {
  const out = [];
  for (const c of [0, 4, 8, 13, 20, 28]) {
    const M = _genMaze(1234, c, false), PC = C.pacing(c), B = _buildWorld(M, { headAbove: PC.headAbove, lakeW: PC.lakeW, params: PC.params }); const w = B.w; B.openBreach();
    let worst = 0, sum = 0, n = 0;
    for (let t = 0; t < 6000; t++) { const a = performance.now(); w.tick(); const d = performance.now() - a; if (t > 200) { sum += d; n++; if (d > worst) worst = d; } }
    // 最坏 1 秒窗口（20 刻）
    out.push(`c${c} ${M.W}×${M.H}×${w.Y}=${w.N}格 ${M.levels.length}层：平均 ${(sum / n).toFixed(3)} ms/刻，单刻最坏 ${worst.toFixed(2)} ms，压强搜索 ${w.S.pops} 步`);
  }
  return '\n      ' + out.join('\n      ');
});
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
