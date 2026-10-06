// 信标光环：厅内持续刷新、离开后倒计时、到时消失；7×7 的持续时间比 5×5 长；信标挡路
// 在仓库根目录起静态服务器（例如 python3 -m http.server 8137），再运行：node tools/eggs/breach/test/beacon.test.cjs（需要 playwright；BASE 可改服务器地址）
const { chromium } = require('playwright');
let pass = 0, fail = 0;
const ok = (name, c, info) => { console.log(c ? 'ok  ' : 'FAIL', name, info || ''); c ? pass++ : fail++; };
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const open = async (q) => {
    const p = await b.newPage({ viewport: { width: 900, height: 700 } }); const errs = [];
    p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
    await p.goto((process.env.BASE || 'http://localhost:8137') + '/tools/eggs/breach/harness.html?egg-test&egg-sync' + q); await p.waitForFunction(() => window.__ready);
    await p.waitForFunction(() => document.querySelector('#root').__eggTest.ready(), null, { timeout: 90000 });
    p.errs = errs; return p;
  };
  const done = new Set();
  for (let n = 5; n < 400 && done.size < 2; n += 8) {
    const p = await open('&n=' + n);
    const sizes = await p.evaluate(() => document.querySelector('#root').__eggTest.maze().levels[0].beacons.map(b => b.size));
    const want = [5, 7].filter(s => !done.has(s) && sizes.includes(s));
    for (const size of want) {
      const r = await p.evaluate((size) => {
        const t = document.querySelector('#root').__eggTest, M = t.maze(), W = M.W, lv = M.levels[0], bc = lv.beacons.find(o => o.size === size);
        t.god(true); t.start(); const step = (sec) => { for (let i = 0; i < Math.round(sec * 60); i++) t.advance(1 / 60); };
        t.teleport(bc.x + 1, bc.z + 1); step(0.1); const a = t.buffInfo();
        step(10); const b2 = t.buffInfo();
        // 离开光环：传送到离信标最远的可走格（同层），保持不动
        let far = -1, fd = -1; for (let i = 0; i < lv.t.length; i++) if (lv.t[i] && !lv.pit[i] && !lv.chest[i] && !lv.puddle[i]) { const dd = Math.max(Math.abs(i % W - bc.x), Math.abs(((i / W) | 0) - bc.z)); if (dd > fd) { fd = dd; far = i; } }
        t.teleport(far % W, (far / W) | 0); step(0.05); const c = t.buffInfo();
        step(bc.dur - 0.6); const d = t.buffInfo(); step(0.8); const e = t.buffInfo();
        // 信标挡路：从厅内朝信标走
        t.teleport(bc.x - 2, bc.z); t.keys('r'); step(1.5); t.keys(''); const s = t.snapshot();
        return { dur: bc.dur, a, b2, c, d, e, blocked: Math.floor(s.x) === bc.x - 1 && !t.blocked(s.x, s.z) && t.blocked(bc.x + 0.5, bc.z + 0.5) };
      }, size);
      ok(`${size}×${size} 进入光环立即获得效果（时长 ${r.dur}s）`, r.a.aura && Math.abs(r.a.buff - r.dur) < 1e-6, JSON.stringify(r.a));
      ok(`${size}×${size} 待在范围内 10 s 效果持续刷新`, r.b2.aura && Math.abs(r.b2.buff - r.dur) < 1e-6, JSON.stringify(r.b2));
      ok(`${size}×${size} 离开后开始倒计时`, !r.c.aura && r.c.buff < r.dur && r.c.buff > r.dur - 0.2, JSON.stringify(r.c));
      ok(`${size}×${size} 倒计时结束前仍有效、结束后消失`, r.d.buff > 0 && r.e.buff === 0, JSON.stringify([r.d.buff, r.e.buff]));
      ok(`${size}×${size} 信标是实心方块`, r.blocked);
      done.add(size); done[size] = r.dur;
    }
    if (p.errs.length) ok(`n=${n} 无报错`, false, p.errs.join(' | '));
    await p.close();
  }
  ok('找到了 5×5 与 7×7 的信标厅', done.size === 2);
  ok('7×7 的持续时间比 5×5 长', done[7] > done[5], `${done[5]} / ${done[7]}`);
  console.log(`\n${pass} passed, ${fail} failed`);
  await b.close(); process.exit(fail ? 1 : 0);
})();
