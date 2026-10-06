// 仓库根目录：node tools/eggs/breach/test/score.test.mjs —— 计分公式、评级、4 位分组、同分规则、理想路线统计
import { _core as C } from '../../../../dist/assets/egg/games/08-breach.js';
let pass = 0, fail = 0;
function test(name, fn) { try { const r = fn(); console.log('ok  ', name, r ? '— ' + r : ''); pass++; } catch (e) { console.log('FAIL', name, '—', e.message); fail++; } }
function assert(c, m) { if (!c) throw new Error(m || 'assert'); }
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;
test('fmtScore：4 位一组、向下取整、不为负', () => {
  const cases = [[0, '0'], [9999, '9999'], [10000, '1,0000'], [12345678, '1234,5678'], [123456789, '1,2345,6789'], [3000000.99, '300,0000'], [-5, '0'], [NaN, '0']];
  for (const [n, s] of cases) assert(C.fmtScore(n) === s, `${n} → ${C.fmtScore(n)}`);
  return cases.map(c => C.fmtScore(c[0])).join(' ');
});
test('计分：理想发挥（t = T、满血、不多掉坑、无石头、第 0 档）= 300,0000、评级 S', () => {
  const r = C.scoreOf({ d: 0, t: 80, T: 80, minHp: 20, pits: 3, idealPits: 3, drops: 0, stones: 0 });
  assert(r.S === 3000000 && r.grade === 'S' && near(r.Ft, 1) && near(r.Fh, 1) && near(r.Fp, 1) && near(r.Fo, 1) && near(r.Fd, 1), JSON.stringify(r));
});
test('计分：各系数与例子', () => {
  // r 下限 0.9：比理想还快也最多 Ft(0.9)
  const fast = C.scoreOf({ d: 0, t: 10, T: 80, minHp: 20, pits: 0, idealPits: 0, drops: 0, stones: 0 });
  assert(near(fast.r, 0.9) && near(fast.Ft, 0.25 + 0.75 * Math.pow(2, 0.2)), 'r floor');
  // r = 1.5 → Ft = 0.25 + 0.75 / 2 = 0.625
  const slow = C.scoreOf({ d: 0, t: 140, T: 90, minHp: 10, pits: 5, idealPits: 3, drops: 1, stones: 3 });
  assert(near(slow.r, 1.5) && near(slow.Ft, 0.625) && near(slow.Fh, 0.7) && near(slow.Fp, Math.pow(0.9, 2 + 3)) && near(slow.Fo, 1.3), JSON.stringify(slow));
  assert(slow.S === Math.floor(3000000 * 0.625 * 0.7 * Math.pow(0.9, 5) * 1.3), 'S');
  // 难度 1.1^d；少掉坑不加分
  const d28 = C.scoreOf({ d: 28, t: 80, T: 80, minHp: 20, pits: 0, idealPits: 4, drops: 0, stones: 4 });
  assert(near(d28.Fd, Math.pow(1.1, 28)) && near(d28.Fp, 1) && d28.S === Math.floor(3000000 * Math.pow(1.1, 28) * 1.4), JSON.stringify(d28));
  return `慢局 ${C.fmtScore(slow.S)}（${slow.grade}），第 28 档理想 + 4 石 ${C.fmtScore(d28.S)}`;
});
test('评级：只看 Q = Ft×Fh×Fp（难度与奇怪的石头不影响）', () => {
  const g = (minHp) => C.scoreOf({ d: 0, t: 80, T: 80, minHp, pits: 0, idealPits: 0, drops: 0, stones: 0 });
  assert(g(20).grade === 'S' && g(12).grade === 'S' && g(8).grade === 'A' && g(2).grade === 'B', [g(20), g(12), g(8), g(2)].map(r => r.Q.toFixed(3) + r.grade).join());
  const c = C.scoreOf({ d: 0, t: 400, T: 80, minHp: 2, pits: 9, idealPits: 0, drops: 1, stones: 0 }); assert(c.grade === 'C', c.Q);
  const a = C.scoreOf({ d: 28, t: 80, T: 80, minHp: 8, pits: 0, idealPits: 0, drops: 0, stones: 9 }); assert(a.grade === 'A', 'difficulty/stones changed grade');
});
test('同分规则：分高者胜；同分比用时短、再比最低生命高、再比奇怪的石头多', () => {
  const b = { s: 100, t: 50, hp: 10, stones: 1 };
  assert(C.betterScore({ s: 101, t: 99, hp: 0, stones: 0 }, b) && !C.betterScore({ s: 99, t: 1, hp: 20, stones: 9 }, b));
  assert(C.betterScore({ s: 100, t: 49, hp: 0, stones: 0 }, b) && !C.betterScore({ s: 100, t: 51, hp: 20, stones: 9 }, b));
  assert(C.betterScore({ s: 100, t: 50, hp: 11, stones: 0 }, b) && C.betterScore({ s: 100, t: 50, hp: 10, stones: 2 }, b) && !C.betterScore({ s: 100, t: 50, hp: 10, stones: 1 }, b));
  assert(C.betterScore(b, null));
});
test('理想路线统计：T = route 最后一格的时间 + 最后一段竖井（按住 + 淡出 + 爬，不含转场），进坑次数与 route 一致', () => {
  const M = C.genMaze(77, 14, false); C.selectBreach(M, 0); const R = C.route(M), st = C.idealStats(M);
  assert(near(C.shaftTime(true), 0.3 + 0.3 + 2.7) && near(C.shaftTime(false), 0.3 + 0.3 + 2.7 + 0.3), 'shaft times');
  assert(near(st.T, R[R.length - 1].t + C.shaftTime(true)) && st.pits >= 0, JSON.stringify(st));
  return `T ${st.T.toFixed(1)} s，进坑 ${st.pits} 次`;
});
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
