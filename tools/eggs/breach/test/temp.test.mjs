// 仓库根目录：node tools/eggs/breach/test/temp.test.mjs —— 体温模型（设计 §32）：标定、后降、浸没深度、变干、热辐射、积水降温、档位参数、体温预跑
import { _engine as E, _core as C } from '../../../../dist/assets/egg/games/08-breach.js';
let pass = 0, fail = 0;
function test(name, fn) { try { const r = fn(); console.log('ok  ', name, r ? '— ' + r : ''); pass++; } catch (e) { console.log('FAIL', name, '—', e.message); fail++; } }
function assert(c, m) { if (!c) throw new Error(m || 'assert'); }
const TH = C.TH, DT = 0.05;
function run(env, sched, T, S = C.thermoNew()) { const tr = []; for (let t = 0; t < T; t += DT) { C.thermoStep(S, sched(t), DT, env); tr.push(S.Tc); } return { S, tr }; }
const firstBelow = (tr, v) => { const k = tr.findIndex(x => x < v); return k < 0 ? -1 : k * DT; };
const firstAbove = (tr, v) => { const k = tr.findIndex(x => x > v); return k < 0 ? -1 : k * DT; };
const WAIST = C.immersion(1);

test('正常环境下体温稳定在 37.0（水图 / 岩浆图，两分钟）', () => {
  for (const neg of [true, false]) { const r = run(C.thermoEnv(14, neg), () => ({ f: 0 }), 120); assert(Math.abs(r.S.Tc - 37) < 0.05 && Math.abs(r.S.Ts - 34) < 0.2, `${neg} ${r.S.Tc} ${r.S.Ts}`); }
});
test('标定：中档（第 14 档）稳定齐腰深约 20 s 到中度失温、约 40 s 到重度失温', () => {
  const r = run(C.thermoEnv(14, true), () => ({ f: WAIST }), 80), t2 = firstBelow(r.tr, TH.S2c), t3 = firstBelow(r.tr, TH.S3c);
  assert(t2 > 17 && t2 < 25 && t3 > 34 && t3 < 46, `S2 ${t2} S3 ${t3}`);
  return `中度 ${t2.toFixed(1)} s、重度 ${t3.toFixed(1)} s（水温 ${C.thermoEnv(14, true).Tw} ℃）`;
});
test('后降（afterdrop）：出水后核心温度继续下降到最低点，之后回升', () => {
  const env = C.thermoEnv(14, true), r = run(env, t => ({ f: t < 12 ? WAIST : 0 }), 150), k0 = Math.round(12 / DT), atExit = r.tr[k0];
  let km = k0; for (let k = k0; k < r.tr.length; k++) if (r.tr[k] < r.tr[km]) km = k;
  const drop = atExit - r.tr[km], tMin = (km - k0) * DT, end = r.tr[r.tr.length - 1];
  assert(drop > 0.3 && tMin > 2 && end > r.tr[km] + 0.8, `drop ${drop} at +${tMin}s end ${end}`);
  return `出水时 ${atExit.toFixed(2)} ℃，出水后 ${tMin.toFixed(1)} s 降到最低 ${r.tr[km].toFixed(2)} ℃（再降 ${drop.toFixed(2)}），2 分钟后 ${end.toFixed(2)} ℃`;
});
test('浸没深度：脚踝 < 膝 < 腰 < 胸 < 没顶（比例与降温速度都单调）', () => {
  const ds = [0.15, 0.5, 1, 1.35, 1.8], fs = ds.map(C.immersion), names = ds.map(C.depthName), env = C.thermoEnv(14, true);
  for (let k = 1; k < fs.length; k++) assert(fs[k] > fs[k - 1], 'f not increasing ' + fs);
  assert(names.join() === '脚踝,膝,腰,胸,没顶', names.join());
  const after = fs.map(f => run(env, () => ({ f }), 20).S.Tc); for (let k = 1; k < after.length; k++) assert(after[k] < after[k - 1], 'cooling order ' + after);
  // 由层数换算：脚格 8 层 = 齐腰；躺着时贴着脚格
  assert(Math.abs(C.immersionOf(8, 0, false) - WAIST) < 1e-9 && C.immersionOf(1, 0, true) > C.immersionOf(1, 0, false) && C.immersionOf(0, 0, true) === 0, 'immersionOf');
  return after.map(v => v.toFixed(1)).join(' > ');
});
test('湿身：最近一次最深的浸没决定湿度，随时间变干；湿着在空气里继续降温', () => {
  const env = C.thermoEnv(14, true), S = C.thermoNew(); C.thermoStep(S, { f: 0.45 }, DT, env); assert(Math.abs(S.wet - 0.45) < 1e-9, 'wet set');
  C.thermoStep(S, { f: 0.08 }, DT, env); assert(S.wet > 0.44, 'shallower does not reset');
  const w = run(env, () => ({ f: 0 }), 8, S).S.wet; assert(w < 0.45 && w > 0.1, 'drying ' + w);
  assert(run(env, () => ({ f: 0 }), 40, Object.assign(C.thermoNew(), { wet: 1 })).S.Tc < run(env, () => ({ f: 0 }), 40).S.Tc - 0.3, 'wet skin cools');
  const lava = C.thermoEnv(14, false), S2 = Object.assign(C.thermoNew(), { wet: 1 }); run(lava, () => ({ f: 0 }), 6, S2); assert(S2.wet < 0.01, 'lava map dries fast ' + S2.wet);
  return `水图 8 s 后湿度 ${w.toFixed(2)}；岩浆图 ${lava.dry} s 内干透`;
});
test('寒战：36.5 ℃ 以下产热，到中度失温（< 32）停止', () => {
  const env = C.thermoEnv(14, true), a = Object.assign(C.thermoNew(), { Tc: 34, Ts: 30 }), b = Object.assign(C.thermoNew(), { Tc: 31, Ts: 27 }), c = C.thermoNew();
  C.thermoStep(a, { f: 0 }, DT, env); C.thermoStep(b, { f: 0 }, DT, env); C.thermoStep(c, { f: 0 }, DT, env);
  assert(a.shiv > 0 && b.shiv === 0 && c.shiv === 0, [a.shiv, b.shiv, c.shiv].join());
});
test('岩浆热辐射：按距离衰减，约 4 格以外为 0；碰到岩浆急剧升温；离开后很快降下来', () => {
  const env = C.thermoEnv(28, false), lava = new Set(['10,5']), get = (x, y, z) => lava.has(x + ',' + z) && y === 2 ? 8 : 0;
  const vs = [0.6, 1.6, 2.6, 3.6, 4.6, 5.6].map(d => C.radiant(get, 10.5 - d, 5.5, 1, env.heatR));
  for (let k = 1; k < vs.length; k++) assert(vs[k] <= vs[k - 1], 'falloff ' + vs);
  assert(vs[0] > 0.5 && vs[vs.length - 1] === 0 && C.radiant(get, 10.5 - (env.heatR + 1), 5.5, 1, env.heatR) === 0, 'range ' + vs);
  const near = run(env, () => ({ rad: 1 }), 30), touch = run(env, () => ({ rad: 1, contact: true }), 30);
  const tS1 = firstAbove(near.tr, TH.S1h), tS3c = firstAbove(touch.tr, TH.S3h);
  assert(tS1 > 5 && tS3c > 0 && tS3c < tS1 * 2, `near S1 ${tS1} contact S3 ${tS3c}`);
  const cool = run(env, () => ({ f: 0 }), 30, Object.assign(C.thermoNew(), { Tc: 40.6, Ts: 44 })); const tBack = firstBelow(cool.tr, TH.S2h);
  assert(tBack > 0 && tBack < 20, 'cool ' + tBack);
  return `衰减 ${vs.map(x => x.toFixed(2)).join(' ')}；贴着岩浆格站 ${tS1.toFixed(1)} s 轻度过热；碰到岩浆 ${tS3c.toFixed(1)} s 中暑；离开 ${tBack.toFixed(1)} s 回到轻度`;
});
test('岩浆图的积水：站进去比空气降温快；躺在里面急救，降到正常为止（不会因此失温）', () => {
  const env = C.thermoEnv(20, false), hot = () => Object.assign(C.thermoNew(), { Tc: 40.6, Ts: 44 });
  const air = run(env, () => ({ f: 0 }), 4, hot()).S.Tc, pud = run(env, () => ({ f: C.immersionOf(1, 0, false) }), 4, hot()).S.Tc;
  const lie = run(env, () => ({ f: C.immersionOf(1, 0, true), prone: true }), 120, hot()), tS1 = firstBelow(lie.tr, TH.S2h);
  assert(pud < air && tS1 > 0 && tS1 < 8 && Math.min(...lie.tr) > 36.4, `air ${air} puddle ${pud} lie S1 ${tS1} min ${Math.min(...lie.tr)}`);
  return `4 s 后：空气 ${air.toFixed(2)}、站在积水里 ${pud.toFixed(2)}；躺进积水 ${tS1.toFixed(1)} s 回到轻度，最低 ${Math.min(...lie.tr).toFixed(2)} ℃`;
});
test('火把：取暖（升到 33.5 ℃ 为止）/ 只止住降温；墙上火把冷时回暖快、越接近 / 高于正常越慢、两种地图相同、走过不明显、久待会过热', () => {
  const env = C.thermoEnv(20, true), S = Object.assign(C.thermoNew(), { Tc: 30, Ts: 22 }); C.thermoStep(S, { f: 0, torch: 1 }, 1, env); assert(Math.abs(S.Tc - (30 + env.torchW)) < 0.2, 'warm rate ' + S.Tc);
  const H = Object.assign(C.thermoNew(), { Tc: 30, Ts: 22 }); for (let k = 0; k < 40; k++) C.thermoStep(H, { f: 0.45, torch: 2 }, DT, env); assert(H.Tc >= 30 && H.Ts >= 22, 'hold');
  const T = Object.assign(C.thermoNew(), { Tc: 33, Ts: 28 }); for (let k = 0; k < 20; k++) C.thermoStep(T, { f: 0, torch: 1 }, DT, env); assert(T.Tc <= TH.WARM_TO + 0.05, 'target ' + T.Tc);
  // 墙上的火把：冷时回暖快、越接近 / 高于正常越慢（递减），两种地图相同；从旁边走过（约 0.7 s）只升约 0.1 ℃；待久了能慢慢热到轻度过热
  for (const neg of [true, false]) { const e2 = C.thermoEnv(20, neg), at = (Tc, Ts) => { const X = Object.assign(C.thermoNew(), { Tc, Ts }); C.thermoStep(X, { f: 0, wall: 1 }, 0.05, e2); const Y = Object.assign(C.thermoNew(), { Tc, Ts }); C.thermoStep(Y, { f: 0 }, 0.05, e2); return (X.Tc - Y.Tc) / 0.05; };
    const r30 = at(30, 25), r37 = at(37, 34), r40 = at(40, 41); assert(r30 > r37 * 3 && r37 > r40 && r40 > 0, `diminishing ${r30} ${r37} ${r40}`);
    const P = C.thermoNew(); for (let u = 0; u < 0.7; u += 0.05) C.thermoStep(P, { f: 0, wall: 1 }, 0.05, e2); assert(P.max - 37 < 0.2, 'pass ' + P.max);
    const Q = C.thermoNew(); for (let u = 0; u < 120; u += 0.05) C.thermoStep(Q, { f: 0, wall: 1 }, 0.05, e2); assert(Q.max > TH.S1h, 'camp ' + Q.max); }
  assert(TH.WCAP > TH.S3h, 'cap above heatstroke line');
});
test('档位：体温各维随档位单调变难，且在约定范围内', () => {
  const T = Array.from({ length: 29 }, (_, c) => C.tier(c));
  for (let c = 1; c < 29; c++) { const a = T[c - 1], b = T[c];
    assert(b.waterT <= a.waterT && b.heatK >= a.heatK && b.heatR >= a.heatR && b.torchW <= a.torchW && b.crawl <= a.crawl && b.slow2 <= a.slow2 && b.climb2 >= a.climb2, 'tier ' + c); }
  assert(T[0].waterT === 14 && T[28].waterT >= 4 && T[28].waterT <= 8 && T[0].slow2 <= 0.9 && T[28].slow2 >= 0.8 && T[28].climb2 <= 1.25 && T[28].heatR <= 4.5, 'bounds');
  return `水温 ${T[0].waterT}→${T[28].waterT} ℃，中度减速 ×${T[0].slow2}→×${T[28].slow2}，能爬 ${T[0].crawl}→${T[28].crawl} s，火把 ${T[0].torchW}→${T[28].torchW} ℃/s`;
});
test('体温预跑：选中的图上理想玩家（不用火把）不到重度；中度减速的延误不超出放宽；确定性', () => {
  const out = [];
  for (const [seed, c] of [[11, 14], [12, 20], [13, 24], [14, 28], [15, 26]]) {
    const PC = C.pacing(c, true), r = C.chooseMap(seed, c, true, PC), f = C.fairness(r.M, r.k, PC), f2 = C.fairness(r.M, r.k, PC);
    assert(r.ok && f.ok && f.tmin >= TH.S3c && f.tmin === f2.tmin && f.extra === f2.extra, JSON.stringify({ c, ok: r.ok, f }));
    out.push(`第 ${c} 档最低 ${f.tmin.toFixed(1)} ℃`);
  }
  // 失败原因会标出来（fluid / temp / slow），以便选图换破口
  const PC = C.pacing(28, true), M = C.genMaze(14, 28, true, 0); let why = new Set(); for (let k = 0; k < M.cands.length; k++) { const f = C.fairness(M, k, PC); why.add(f.ok ? 'ok' : f.why); }
  assert([...why].every(w => ['ok', 'fluid', 'temp', 'slow'].includes(w)), [...why].join());
  return out.join('，');
});
test('体温预跑：路线时间拆分（走路 / 长按爬坑 / 固定动画）之和与 route 的时间一致', () => {
  const M = C.genMaze(77, 20, true); C.selectBreach(M, 0); const R = C.route(M);
  for (let j = 1; j < R.length; j++) assert(Math.abs(R[j].t - R[j - 1].t - (R[j].w + R[j].h + R[j].x)) < 1e-9, 'step ' + j);
});
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
