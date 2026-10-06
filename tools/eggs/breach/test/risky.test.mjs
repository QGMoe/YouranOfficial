// 仓库根目录：node tools/eggs/breach/test/risky.test.mjs —— 险图（设计 §34）：各档比例、底线、T_eff、确定性；非险图的选图不变
import { _core as C } from '../../../../dist/assets/egg/games/08-breach.js';
let pass = 0, fail = 0;
function test(name, fn) { try { const r = fn(); console.log('ok  ', name, r ? '— ' + r : ''); pass++; } catch (e) { console.log('FAIL', name, '—', e.message); fail++; } }
function assert(c, m) { if (!c) throw new Error(m || 'assert'); }
const fnv = n => { let h = 0x811c9dc5; for (const ch of n) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193); } return h >>> 0; };
test('险图比例：第 22 档以下为 0；第 22–28 档约 5% → 25%（单调），按种子决定', () => {
  const out = [];
  for (let d = 0; d < 29; d++) { const want = C.tier(d).risky; let n = 0; const N = 6000; for (let s = 0; s < N; s++) if (C.riskyOf((s * 2654435761 + 12345) >>> 0, d)) n++;
    const f = n / N; assert(d < 22 ? n === 0 : Math.abs(f - want) < 0.02, `d${d} ${f} vs ${want}`); if (d > 0) assert(want >= C.tier(d - 1).risky, 'monotone'); if (d >= 22) out.push(`${d + 1}/29 ${(f * 100).toFixed(1)}%`); }
  assert(C.tier(22).risky === 0.05 && C.tier(28).risky === 0.25, 'endpoints');
  for (let s = 0; s < 50; s++) assert(C.riskyOf(s * 7919, 25) === C.riskyOf(s * 7919, 25), 'deterministic');
  return out.join('，');
});
test('T_eff 的放宽倍数：r = 1 + 0.5 × (1 − f) / 0.4，夹在 [1.15, 1.5]', () => {
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  assert(near(C.riskyR(1), 1.15) && near(C.riskyR(0.9), 1.15) && near(C.riskyR(0.8), 1.25) && near(C.riskyR(0.7), 1.375) && near(C.riskyR(0.6), 1.5) && near(C.riskyR(0.2), 1.5), 'values');
});
// 找一些险图版本（真实站点路径：n = 8c + 7、负数 n = −(8c + 1)，c ≡ d mod 29）
const cases = [['15727', 22], ['39167', 23]].map(([n, d]) => ({ n, d, seed: fnv(n), neg: false }));   // 两张已知会保留原图的险图
for (let c = 22; cases.length < 16 && c < 29 * 400; c += 29) for (const d0 of [0, 1, 2, 3, 4, 5, 6]) { const cc = c + d0, d = cc % 29; if (d < 22) continue;
  for (const n of [String(8 * cc + 7), '-' + (8 * cc + 1)]) if (C.riskyOf(fnv(n), d) && cases.length < 16) cases.push({ n, d, seed: fnv(n), neg: n[0] === '-' }); }
const results = cases.map(o => { const PC = C.pacing(o.d, o.neg), t0 = performance.now(), r = C.chooseMap(o.seed, o.d, o.neg, PC); return Object.assign(o, { r, PC, ms: performance.now() - t0 }); });
test('险图：严格测试通过 → 原图（regen 0）、rT = 1；不通过但底线成立 → 仍是原图、rT = riskyR(f)、f ≥ 0.6；底线不成立才换图', () => {
  let strict = 0, kept = 0, rer = 0;
  for (const o of results) { const r = o.r; assert(r.risky && r.M.risky, 'flag');
    if (r.ok && r.regen === 0) { strict++; assert(r.rT === 1, 'rT1'); continue; }
    if (r.regen === 0) { kept++; assert(r.floor >= C.FLOOR_F && Math.abs(r.rT - C.riskyR(r.floor)) < 1e-9, JSON.stringify({ n: o.n, f: r.floor, rT: r.rT }));
      const M = C.genMaze(o.seed, o.d, o.neg, 0), fl = C.floorTest(M, r.k, o.PC); assert(fl.startOk && Math.abs(fl.f - r.floor) < 1e-9, 'floor reproduce'); continue; }
    rer++; assert(r.rT === 1, 'rerolled rT');   // 底线不成立：原图所有试过的破口都过不了底线
    const M = C.genMaze(o.seed, o.d, o.neg, 0), cb = C.chooseBreach(M, o.PC, null, true);
    for (let k = 0; k < cb.log.length; k++) { const fl = C.floorTest(M, k, o.PC); assert(!fl.startOk || fl.f < C.FLOOR_F, `n ${o.n} k${k} floor ${fl.f}`); } }
  return `${results.length} 张险图：严格通过 ${strict}、保留原图 ${kept}、底线不成立换图 ${rer}`;
});
test('险图选图确定性（同一版本两次结果相同，含 rT，进指纹）', () => {
  for (const o of results.slice(0, 4)) { const r2 = C.chooseMap(o.seed, o.d, o.neg, o.PC); assert(r2.k === o.r.k && r2.regen === o.r.regen && r2.rT === o.r.rT && C.fingerprint(r2.M, o.PC) === C.fingerprint(o.r.M, o.PC), o.n); }
  const M = results[0].r.M, f0 = C.fingerprint(M, results[0].PC); M.rT = (M.rT || 1) + 0.25; const f1 = C.fingerprint(M, results[0].PC); M.rT -= 0.25; assert(f0 !== f1, 'fingerprint ignores rT');
});
test('非险图：rT = 1，选图规则不变', () => {
  for (let s = 0; s < 6; s++) { const d = 10 + s * 3, PC = C.pacing(d, false), r = C.chooseMap(s * 977 + 3, d, false, PC); assert(!r.risky && r.rT === 1 && r.M.rT === 1, 'd' + d); }
});
console.log(results.map(o => `${o.n}（${o.neg ? '水' : '岩浆'}，难度 ${o.d + 1}/29）${o.r.ok && o.r.regen === 0 ? '严格通过' : o.r.regen === 0 ? '保留，f=' + o.r.floor.toFixed(2) + ' rT=' + o.r.rT.toFixed(3) : '换图（regen ' + o.r.regen + '）'} ${o.ms.toFixed(0)}ms`).join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
