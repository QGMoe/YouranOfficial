// 仓库根目录：node tools/eggs/breach/test/maze.test.mjs
import { _core as C } from '../../../../dist/assets/egg/games/08-breach.js';
const _genMaze = (s, c, n) => C.genMaze(s, C.diffOf(c), n), _difficulty = d => C.mazeDifficulty(C.diffOf(d));
let pass = 0, fail = 0;
function test(name, fn) { try { const r = fn(); console.log('ok  ', name, r ? '— ' + r : ''); pass++; } catch (e) { console.log('FAIL', name, '—', e.message); fail++; } }
function assert(c, m) { if (!c) throw new Error(m || 'assert'); }
const T_ROCK = 0, T_TUN = 1, T_ROOM = 2, T_LADDER = 3, T_SHAFT = 4;
const walk = (lv, i) => lv.t[i] !== T_ROCK && !lv.chest[i];   // 箱子是实心障碍
function dist(M, lv, src, ok) {
  const N = M.W * M.H, d = new Int32Array(N).fill(-1), q = [src]; d[src] = 0;
  for (let h = 0; h < q.length; h++) { const p = q[h]; for (const o of [1, -1, M.W, -M.W]) { const n = p + o; if (d[n] < 0 && ok(n)) { d[n] = d[p] + 1; q.push(n); } } }
  return d;
}
const SEEDS = Array.from({ length: 100 }, (_, i) => (i * 2654435761) >>> 0);
const CYCLES = [0, 1, 2, 3, 4, 6, 8, 10, 12, 14, 17, 20, 24, 28];
const all = [];
for (const c of CYCLES) for (const s of SEEDS) for (const neg of [false, true]) all.push(_genMaze(s, c, neg));

test('总能从起点/入口走到梯子（每层）', () => {
  let n = 0;
  for (const M of all) M.levels.forEach((lv, k) => {
    const o = k === 0 ? lv.start : lv.entrance;
    assert(o >= 0, 'no origin');
    const d = dist(M, lv, o, i => walk(lv, i));
    assert(d[lv.ladder.i] > 0, `seed ${M.seed} c${M.d} L${k} unsolvable`);
    n++;
  });
  return `${n} 层`;
});
test('积水全部按“会变成石头”处理（积水格 + 相邻格不可走）后仍能到梯子', () => {
  let withPud = 0;
  for (const M of all) M.levels.forEach((lv, k) => {
    const bad = new Uint8Array(M.W * M.H); let any = false;
    for (let i = 0; i < bad.length; i++) if (lv.puddle[i]) { any = true; for (const o of [0, 1, -1, M.W, -M.W]) bad[i + o] = 1; }
    if (M.negative) assert(!any, 'puddles in water scene');
    if (!any) return;
    withPud++;
    const o = k === 0 ? lv.start : lv.entrance;
    const d = dist(M, lv, o, i => walk(lv, i) && !bad[i]);
    assert(d[lv.ladder.i] > 0, `seed ${M.seed} c${M.d} L${k}: puddles block the only route`);
  });
  return `${withPud} 个含积水的层`;
});
test('积水离矿坑 ≥ 6 步（否则 1 层水会按坡度流进坑）', () => {
  for (const M of all) for (const lv of M.levels) {
    const pits = []; for (let i = 0; i < lv.pit.length; i++) if (lv.pit[i]) pits.push(i);
    for (let i = 0; i < lv.puddle.length; i++) if (lv.puddle[i]) {
      const d = dist(M, lv, i, j => walk(lv, j));
      for (const p of pits) assert(d[p] < 0 || d[p] >= 6, `puddle ${i} near pit ${p}`);
    }
  }
});
test('全连通、矿坑/火把/积水不在特殊位置、梯子离入口足够远', () => {
  let minLad = 1e9;
  for (const M of all) M.levels.forEach((lv, k) => {
    const o = k === 0 ? lv.start : lv.entrance;
    const d = dist(M, lv, o, i => walk(lv, i));
    for (let i = 0; i < lv.t.length; i++) {
      if (walk(lv, i)) assert(d[i] >= 0, 'disconnected tile');
      if (lv.pit[i] || lv.puddle[i]) assert(lv.t[i] === T_TUN && !lv.special[i], 'pit/puddle on special tile');
      if (lv.torch[i]) assert(!lv.pit[i] && !lv.puddle[i], 'torch on pit/puddle');
    }
    minLad = Math.min(minLad, d[lv.ladder.i]);
    if (k > 0) assert(d[lv.ladder.i] >= 20, `ladder too close to entrance: ${d[lv.ladder.i]}`);
  });
  return `入口/起点到梯子最短路径的最小值 ${minLad}`;
});
test('起点到破口的距离随难度缩短', () => {
  const avg = {};
  for (const M of all) { const lv = M.levels[0]; const d = dist(M, lv, lv.start, i => walk(lv, i));
    const b = M.lake.bx + 4 * M.W; (avg[M.d] = avg[M.d] || []).push(d[b]); }
  const r = CYCLES.map(c => (avg[c].reduce((a, b) => a + b, 0) / avg[c].length).toFixed(1));
  for (let k = 1; k < r.length; k++) assert(+r[k] <= +r[k - 1] + 0.5, 'not decreasing');
  return CYCLES.map((c, k) => `c${c}:${r[k]}`).join(' ');
});
test('靠近出口：矿坑更多、矿物更少、火把更密（按出口距离分三段统计）', () => {
  const bins = [0, 1, 2].map(() => ({ tiles: 0, pit: 0, torch: 0, wall: 0, ore: 0 }));
  for (const M of all) for (const lv of M.levels) for (let i = 0; i < lv.t.length; i++) {
    const g = lv.grad[i], b = bins[Math.min(2, Math.floor(g * 3))];
    if (lv.t[i] === T_TUN && !lv.special[i]) { b.tiles++; if (lv.pit[i]) b.pit++; if (lv.torch[i]) b.torch++; }
  }
  for (const M of all) for (const lv of M.levels) for (let i = 0; i < lv.t.length; i++) {
    if (lv.t[i] !== T_ROCK) continue;
    let g = -1; for (const o of [1, -1, M.W, -M.W]) if (lv.t[i + o] === T_TUN) g = Math.max(g, lv.grad[i + o]);
    if (g < 0) continue; const b = bins[Math.min(2, Math.floor(g * 3))]; b.wall++; if (lv.ore[i]) b.ore++;
  }
  const r = bins.map(b => ({ pit: b.pit / b.tiles, torch: b.torch / b.tiles, ore: b.ore / b.wall }));
  assert(r[2].pit > r[0].pit && r[2].ore < r[0].ore && r[2].torch > r[0].torch, JSON.stringify(r));
  return ['远', '中', '近'].map((n, k) => `${n}: 坑${(r[k].pit * 100).toFixed(1)}% 火把${(r[k].torch * 100).toFixed(1)}% 矿${(r[k].ore * 100).toFixed(1)}%`).join('；');
});
test('无火把区与矿坑随难度增加', () => {
  const st = {};
  for (const M of all) { const s = st[M.d] = st[M.d] || { dark: 0, pit: 0, tun: 0 };
    for (const lv of M.levels) for (let i = 0; i < lv.t.length; i++) if (lv.t[i] === T_TUN) { s.tun++; if (lv.dark[i]) s.dark++; if (lv.pit[i]) s.pit++; } }
  const r = CYCLES.map(c => [st[c].dark / st[c].tun, st[c].pit / st[c].tun]);
  assert(r[r.length - 1][0] > r[0][0] && r[r.length - 1][1] > r[0][1]);
  return CYCLES.map((c, k) => `c${c}:暗${(r[k][0] * 100) | 0}%/坑${(r[k][1] * 100) | 0}%`).join(' ');
});
test('多层：层数阈值、越往上矿物等级越低、深坑规则', () => {
  for (const M of all) {
    assert(M.levels.length === _difficulty(M.d).levels);
    M.levels.forEach((lv, k) => {
      for (let i = 0; i < lv.ore.length; i++) if (lv.ore[i]) {
        if (k === 2) assert(lv.ore[i] >= 5, 'deep ore on top level');
        if (k === 1) assert(lv.ore[i] !== 1 && lv.ore[i] !== 4, 'diamond/lapis on level 2');
      }
      let deep = 0;
      for (let i = 0; i < lv.pit.length; i++) if (lv.pit[i] === 2) {
        deep++;
        assert(k > 0, 'deep pit on bottom level');
        assert(lv.distIn[i] >= 12, 'deep pit near entrance');
        assert(M.levels[k - 1].t[i] === T_TUN, 'deep pit not over a tunnel');
      }
      assert(deep <= _difficulty(M.d).deep, 'too many deep pits');
      if (k > 0) { // 入口 = 下层梯子的位置
        const below = M.levels[k - 1];
        assert(lv.entrance === below.ladder.i && lv.t[lv.entrance] === T_SHAFT, 'shaft misaligned');
      }
    });
  }
  return CYCLES.map(c => `c${c}:${_difficulty(c).levels}层`).join(' ');
});
test('破口候选：每个候选的起点都能到梯子，积水按石头处理后仍可解；候选顺序由种子决定', () => {
  let n = 0;
  for (const M of all) {
    const lv = M.levels[0];
    assert(M.cands.length >= 2, 'too few candidates');
    for (let k = 0; k < M.cands.length; k++) {
      C.selectBreach(M, k);
      const bad = new Uint8Array(M.W * M.H);
      for (let i = 0; i < bad.length; i++) if (lv.puddle[i]) for (const o of [0, 1, -1, M.W, -M.W]) bad[i + o] = 1;
      assert(dist(M, lv, lv.start, i => walk(lv, i) && !bad[i])[lv.ladder.i] > 0, 'candidate unsolvable');
      assert(lv.t[M.lake.bx + 4 * M.W] === T_TUN, 'breach branch not carved');
      n++;
    }
    C.selectBreach(M, 0);
  }
  return n + ' 个候选';
});
test('难度周期化：d = cycle mod 29；同一 d 的不同 n 生成不同地图，同 n 相同', () => {
  assert(C.P_D === 29);
  assert(C.diffOf(0) === 0 && C.diffOf(28) === 28 && C.diffOf(29) === 0 && C.diffOf(57) === 28 && C.diffOf(9007199254740991) === 9007199254740991 % 29);
  const a = C.genMaze(111, C.diffOf(3), false), b = C.genMaze(222, C.diffOf(32), false);
  assert(a.levels.length === b.levels.length && a.W === b.W, 'same d → same table');
  assert(a.levels[0].t.join() !== b.levels[0].t.join(), 'different seeds → different maps');
  const big = C.genMaze(333, C.diffOf(1e15), false);
  assert(big.levels.length === C.mazeDifficulty(C.diffOf(1e15)).levels);
  return 'd(29)=0, d(28)=28, d(57)=28, d(1e15)=' + C.diffOf(1e15);
});
test('档位表：第 0 档与原 13 档版第 0 档相同；每一维单调不变易；相邻两档至少一维变难', () => {
  const t0 = C.tier(0);
  const old0 = { levels: 1, nb: 8, ns: 2, breachDist: 14, pitP: 0.05, deep: 1, darkZones: 0, puddles: 1, climb: 0.8, halls: 2, hall7: 0.32, beacon: 1, loopP: 0.34, crossP: 0.12, torchGap: 0, tps: 20, lakeW: 2, headAbove: 3, sourceStatic: false, sourceLevel: 3, dispersion: 20, slack: 1.7 };
  for (const k in old0) assert(t0[k] === old0[k], `tier 0 ${k}: ${t0[k]} != ${old0[k]}`);
  // 变难方向：+1 = 数值越大越难，−1 = 越小越难（cands 不是难度，不参与）
  const DIR = { levels: 1, nb: 1, ns: 1, breachDist: -1, pitP: 1, deep: 1, darkZones: 1, puddles: 1, climb: 1, qte: -1, halls: -1, hall7: -1, beacon: -1, loopP: -1, crossP: -1, torchGap: 1, tps: 1, lakeW: 1, headAbove: 1, sourceStatic: 1, sourceLevel: 1, dispersion: -1, slack: -1 };
  const harder = [];
  for (let d = 1; d < C.P_D; d++) {
    const a = C.tier(d - 1), b = C.tier(d), up = [];
    for (const k in DIR) { const s = Math.sign((+b[k] - +a[k]) * DIR[k]); assert(s >= 0, `tier ${d}: ${k} easier (${a[k]} → ${b[k]})`); if (s > 0) up.push(k); }
    // 奇怪的矿石不是难度（是奖励），但随档位单调不减：每层个数、薄墙概率
    for (let L = 0; L < 3; L++) assert(b.weird[L] >= a.weird[L], `tier ${d}: weird[${L}] decreased`); assert(b.thinP >= a.thinP, 'thinP decreased');
    assert(up.length >= 1, `tier ${d}: nothing harder`);
    harder.push(up.length);
  }
  // 中段 ≈ 原第 12 档
  const t13 = C.tier(13);
  assert(t13.levels === 3 && t13.nb === 14 && t13.ns === 3 && t13.lakeW === 4 && t13.sourceLevel === 5 && t13.dispersion === 10 && t13.headAbove === 3 && t13.tps === 26 && t13.slack === 1.25, 'tier 13 ≈ old tier 12');
  return `每档变难的维数 ${Math.min(...harder)}–${Math.max(...harder)}`;
});
test('重生成：regen = 0 与原图相同，regen > 0 换一张同尺寸的图', () => {
  for (const d of [0, 14, 28]) {
    const a = C.genMaze(4242, d, false), b = C.genMaze(4242, d, false, 0), c = C.genMaze(4242, d, false, 1);
    assert(a.levels[0].t.join() === b.levels[0].t.join() && a.regen === 0, 'regen 0 differs');
    assert(c.W === a.W && c.H === a.H && c.levels.length === a.levels.length && c.regen === 1, 'size changed');
    assert(c.levels[0].t.join() !== a.levels[0].t.join(), 'regen 1 same map');
  }
});
test('装饰箱子：只在小厅靠墙处，不在门口 / 门口内外一格 / 必经路线上；小厅可走格互相连通', () => {
  let n = 0;
  for (const M of all) M.levels.forEach((lv, k) => {
    const W = M.W, O = [1, -1, W, -W];
    for (const c of lv.chests) {
      n++;
      assert(lv.t[c] === T_ROOM && lv.chest[c], 'chest not in room');
      assert(O.some(o => lv.t[c + o] === T_ROCK), 'chest not against a wall');
      for (const o of [0, ...O]) { const j = c + o; if (lv.t[j] === T_ROOM) assert(!O.some(o2 => lv.t[j + o2] === T_TUN), 'chest at/next to a doorway'); }
      assert(c !== lv.ladder.i && c !== lv.entrance);
    }
    // 小厅可走格（及整层）连通；任何一个箱子都不在“起点→梯子”的必经路线上（去掉箱子后最短路不变 ⇒ 不是瓶颈）
    const o = k === 0 ? lv.start : lv.entrance, d = dist(M, lv, o, i => walk(lv, i));
    for (let i = 0; i < lv.t.length; i++) if (walk(lv, i)) assert(d[i] >= 0, 'room/level disconnected by chests');
    const d0 = dist(M, lv, o, i => lv.t[i] !== T_ROCK);
    assert(d[lv.ladder.i] === d0[lv.ladder.i], 'chest lengthens the route');
  });
  return n + ' 个箱子';
});
test('信标厅：5×5 / 7×7、信标在中央且是实心；厅不放坑 / 积水 / 火把；全层连通、梯子可达；7×7 比 5×5 少', () => {
  let n5 = 0, n7 = 0;
  for (const M of all) M.levels.forEach((lv, k) => {
    const W = M.W;
    for (const b of lv.beacons) {
      assert(b.size === 5 || b.size === 7, 'size ' + b.size); b.size === 7 ? n7++ : n5++;
      assert(b.i === b.z * W + b.x && lv.hall[b.i] === 2 && lv.chest[b.i], 'beacon not solid at hall centre');
      assert(b.dur === Math.round((b.size === 7 ? 12 : 6) * M.D.beacon * 2) / 2 && b.r === (b.size >> 1) + 1, 'aura params');
      const h = b.size >> 1;
      for (let dz = -h; dz <= h; dz++) for (let dx = -h; dx <= h; dx++) { const i = (b.z + dz) * W + b.x + dx; assert(lv.t[i] === T_TUN && lv.hall[i], 'hall cell not open');
        assert(!lv.pit[i] && !lv.puddle[i] && !lv.torch[i] && !lv.item[i], 'pit/puddle/torch/item in hall'); }
      for (let i = 0; i < lv.hall.length; i++) if (lv.hall[i]) assert(Math.max(Math.abs(i % W - b.x), Math.abs(((i / W) | 0) - b.z)) <= h || lv.beacons.some(o => o !== b && Math.max(Math.abs(i % W - o.x), Math.abs(((i / W) | 0) - o.z)) <= (o.size >> 1)), 'stray hall cell');
    }
    const o = k === 0 ? lv.start : lv.entrance, d = dist(M, lv, o, i => walk(lv, i));
    for (let i = 0; i < lv.t.length; i++) if (walk(lv, i)) assert(d[i] >= 0, 'level disconnected (beacon blocks)');
    assert(d[lv.ladder.i] >= 0, 'ladder unreachable');
  });
  assert(n5 > n7 && n7 > 0, `5×5 ${n5} / 7×7 ${n7}`);
  return `5×5 ${n5} 个，7×7 ${n7} 个`;
});
test('奇怪的矿石：只在巷道侧壁的脚 / 头高度；普通的只有一面朝巷道、背后是岩石、离理想路线 ≤ 8 格；薄墙只成对（脚 + 头）', () => {
  let nOre = 0, nThin = 0, nHead = 0, short = 0;
  for (const M of all) {
    let thinMaps = 0;
    M.levels.forEach((lv, k) => {
      const W = M.W, O = [1, -1, W, -W]; let stones = 0;
      for (const o of lv.weirdList) {
        assert(lv.t[o.i] === T_ROCK && lv.weird[o.i] === o.h && (o.h === 1 || o.h === 2 || o.h === 3), 'ore not on rock / bad bits');
        const open = O.map(d => o.i + d).filter(n => walk(lv, n));
        assert(open.includes(o.from) && lv.t[o.from] === T_TUN && !lv.special[o.from] && !lv.hall[o.from] && !lv.pit[o.from] && !lv.puddle[o.from] && !lv.torch[o.from], 'bad tunnel side');
        if (o.thin) {
          nThin++; thinMaps++; assert(o.h === 3 && k <= 1 && M.d >= 5, 'thin pair rules');
          assert(open.length === 2 && open.includes(o.other) && o.other - o.i === o.i - o.from, 'thin wall not between two opposite tunnels');
          const d = dist(M, lv, o.from, i => walk(lv, i)); assert(d[o.other] - 2 >= 4 && d[o.other] - 2 <= 12, 'thin saving ' + (d[o.other] - 2));
          stones += 2;
        } else {
          assert(o.h !== 3, 'lone pair'); nOre++; if (o.h === 2) nHead++;
          assert(open.length === 1, 'ordinary ore must face exactly one tunnel');
          const bx = 2 * (o.i % W) - o.from % W, bz = 2 * ((o.i / W) | 0) - ((o.from / W) | 0);
          assert(bx < 0 || bz < 0 || bx >= W || bz >= M.H || lv.t[bz * W + bx] === T_ROCK, 'not backed by rock');
          stones += 1;
        }
      }
      for (let i = 0; i < lv.weird.length; i++) if (lv.weird[i]) assert(lv.weirdList.some(o => o.i === i), 'stray weird bit');
      const want = C.mazeDifficulty(M.d).weird[k] || 0;
      assert(stones <= Math.ceil(want), `level ${k} too many: ${stones} > ${want}`);
      if (stones < Math.floor(want)) short++;
    });
    assert(thinMaps <= 1, 'more than one thin pair');
  }
  return `普通 ${nOre} 个（头部 ${(nHead / nOre * 100).toFixed(0)}%），薄墙 ${nThin} 对，空间不够少放的层 ${short}`;
});
test('奇怪的矿石：各档每层个数（第 1 层 2→3→4，第 2 层 0→1→2，第 3 层 0→50%→1+30%）', () => {
  const out = [];
  for (const d of [0, 5, 9, 10, 19, 20, 28]) { const c = [0, 0, 0]; let n = 0;
    for (const s of SEEDS.slice(0, 40)) { const M = C.genMaze(s, d, false); n++; M.levels.forEach((lv, k) => { c[k] += lv.weirdList.reduce((a, o) => a + (o.h === 3 ? 2 : 1), 0); }); }
    out.push(`d${d}:` + c.map(v => (v / n).toFixed(2)).join('/')); }
  const e = d => C.mazeDifficulty(d).weird;
  assert(e(0)[0] === 2 && e(10)[0] === 3 && e(20)[0] === 4 && e(4)[1] === 0 && e(5)[1] === 1 && e(10)[1] === 2 && e(9)[2] === 0 && e(10)[2] === 0.5 && e(20)[2] === 1.3);
  return out.join(' ');
});
test('奇怪的矿石：确定性，且计入地图指纹', () => {
  for (const s of SEEDS.slice(0, 10)) { const a = C.genMaze(s, 22, false), b = C.genMaze(s, 22, false); a.levels.forEach((lv, k) => assert(lv.weird.join() === b.levels[k].weird.join(), 'weird differs')); }
  const M = C.genMaze(5, 12, false), PC = C.pacing(12); C.selectBreach(M, 0); const f0 = C.fingerprint(M, PC);
  const o = M.levels[0].weirdList[0]; M.levels[0].weird[o.i] ^= 3; const f1 = C.fingerprint(M, PC); M.levels[0].weird[o.i] ^= 3;
  assert(f0 !== f1, 'fingerprint ignores weird');
});
test('确定性：同 seed+cycle 生成完全相同', () => {
  for (const s of SEEDS.slice(0, 20)) {
    const a = _genMaze(s, 7, false), b = _genMaze(s, 7, false);
    a.levels.forEach((lv, k) => { for (const key of ['t', 'pit', 'puddle', 'torch', 'ore', 'item']) assert(lv[key].join() === b.levels[k][key].join(), key); });
  }
});
test('出口一侧：第 1 层由种子决定（东 / 西约各一半），往上每层都在入口（下层竖井口）的另一端；破口候选在第 1 层出口的另一端', () => {
  const cnt = [[0, 0], [0, 0], [0, 0]];
  for (const M of all) {
    M.levels.forEach((lv, L) => { cnt[L][lv.exitSide]++; if (L) assert(lv.exitSide !== M.levels[L - 1].exitSide, `seed ${M.seed} L${L} same side as entrance`);
      const lx = lv.ladder.x; assert(lv.exitSide ? lx >= M.W - 3 : lx <= 2, 'ladder on its side'); });
    assert(M.levels[0].exitSide === M.side0, 'side0');
    for (const cd of M.cands) assert(M.side0 ? cd.bx < M.W * 0.6 : cd.bx > M.W * 0.4, `breach column ${cd.bx} on exit side`);
  }
  for (let L = 0; L < 3; L++) { const n = cnt[L][0] + cnt[L][1], f = cnt[L][0] / n; assert(n && f > 0.4 && f < 0.6, `L${L} west ${cnt[L][0]}/${n}`); }
  return cnt.map((c, L) => `第 ${L + 1} 层 西 ${c[0]} / 东 ${c[1]}`).join('，');
});
test('出口一侧由种子决定（确定性）：同一种子、同一档结果相同', () => {
  for (const c of [3, 12, 25]) for (let s = 0; s < 20; s++) { const a = _genMaze(s * 977, c, false), b = _genMaze(s * 977, c, false); assert(a.side0 === b.side0 && a.levels.every((l, k) => l.t.join() === b.levels[k].t.join()), 'nondeterministic'); }
});
test('告示牌：每个出口小厅的北墙、南墙正中各一块，挂在岩石上头部高度、面朝小厅；墙上没有奇怪的矿石', () => {
  let n = 0, chestUnder = 0;
  for (const M of all) M.levels.forEach(lv => {
    assert(lv.signs && lv.signs.length === 2, 'two signs'); const W = M.W, z0 = lv.ladder.z + 1;   // 梯子在小厅北排，小厅中线 = 梯子 z + 1
    const [nS, sS] = lv.signs; assert(nS.face === 1 && sS.face === -1 && nS.z === z0 - 2 && sS.z === z0 + 2 && nS.x === sS.x, JSON.stringify(lv.signs));
    for (const sg of lv.signs) { assert(lv.t[sg.z * W + sg.x] === T_ROCK && lv.t[(sg.z + sg.face) * W + sg.x] === T_ROOM, `sign wall ${JSON.stringify(sg)}`);
      // 挂在头部高度（不与靠墙的箱子穿插，箱子顶在脚格的 0.75 处）；这两格墙上没有奇怪的矿石
      assert(sg.h === 2 && !(lv.weird && lv.weird[sg.z * W + sg.x]), `sign height / ore ${JSON.stringify(sg)}`); if (lv.chest[(sg.z + sg.face) * W + sg.x]) chestUnder++; n++; }
  });
  return `${n} 块（其中 ${chestUnder} 块下面有箱子）`;
});
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
