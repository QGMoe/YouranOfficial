// 奇怪的矿石：挖矿（先挖头部、岩浆里不能挖、水里变慢 / 淹没不能挖、挖开变空气且流体流进来、薄墙挖穿可走）、
// 奇怪的石头计数、转头看向矿石（±90° 以内、最近且看得见、不隔岩石）；3D 与 2D 无报错
// 在仓库根目录起静态服务器（例如 python3 -m http.server 8137），再运行：node tools/eggs/breach/test/ore.test.cjs（需要 playwright；BASE 可改服务器地址）
const { chromium } = require('playwright');
let pass = 0, fail = 0;
const ok = (name, c, info) => { console.log(c ? 'ok  ' : 'FAIL', name, info || ''); c ? pass++ : fail++; };
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const open = async (q) => {
    const p = await b.newPage({ viewport: { width: 900, height: 800 } }); const errs = [];
    p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
    await p.goto((process.env.BASE || 'http://localhost:8137') + '/tools/eggs/breach/harness.html?egg-test&egg-sync' + q); await p.waitForFunction(() => window.__ready);
    await p.waitForFunction(() => document.querySelector('#root').__eggTest.ready(), null, { timeout: 90000 });
    p.errs = errs; return p;
  };
  // 在页面里：找一条东西向巷道里、北面是岩石且背后也是岩石的格子，把它北面那格设成奇怪的矿石（bits），站到巷道格上
  const SETUP = (bits) => { const t = document.querySelector('#root').__eggTest, M = t.maze(), W = M.W, lv = M.levels[0]; t.god(true); t.start();
    for (let i = 3 * W; i < lv.t.length - W; i++) { const n = i - W, nn = i - 2 * W;
      if (lv.t[i] === 1 && !lv.special[i] && !lv.pit[i] && !lv.puddle[i] && !lv.torch[i] && !lv.hall[i] && lv.t[n] === 0 && lv.t[nn] === 0 && !lv.weird[n] && lv.t[n - 1] === 0 && lv.t[n + 1] === 0 && Math.abs(i % W - M.lake.bx) > 3) {
        t.weirdAt(n % W, (n / W) | 0, bits, i % W, (i / W) | 0); t.teleport(i % W, (i / W) | 0); t.advance(1 / 60); return { x: i % W, z: (i / W) | 0, ox: n % W, oz: (n / W) | 0, b: 1 + 0 }; } }
    return null; };
  const hold = (p, key, sec) => p.evaluate(({ key, sec }) => { const t = document.querySelector('#root').__eggTest; t.keys(key); let mx = 0; for (let i = 0; i < Math.round(sec * 60); i++) { t.advance(1 / 60); mx = Math.max(mx, t.snapshot().mineT); } t.keys(''); t.advance(1 / 60); return { s: t.snapshot(), mx }; }, { key, sec });
  for (const q of ['', '&egg-2d']) {
    const tag = q ? '（2D）' : '（3D）';
    // 1. 普通矿石：按住朝它的方向挖，0.8 s 左右挖到；挖开处变空气；计数 +1
    let p = await open('&n=29' + q); let c = await p.evaluate(SETUP, 2);
    let r = await hold(p, 'u', 0.6);
    ok(`没挖完松开：进度清零、没有挖到${tag}`, r.s.stones === 0 && r.s.mineT === 0 && r.mx > 0.4, JSON.stringify({ mx: r.mx }));
    r = await hold(p, 'u', 1.0);
    const m1 = await p.evaluate((c) => document.querySelector('#root').__eggTest.matAt(c.ox, 3, c.oz), c);
    ok(`按住约 0.8 s 挖到一块奇怪的石头，挖开处变成空气${tag}`, r.s.stones === 1 && m1 === 0, JSON.stringify({ stones: r.s.stones, mat: m1 }));
    r = await hold(p, 'u', 1.2);
    ok(`挖过的矿石不会再出石头${tag}`, r.s.stones === 1);
    if (p.errs.length) ok('无报错', false, p.errs.join(' | ')); await p.close();
    // 2. 一格里脚、头都有：先挖头部
    p = await open('&n=29' + q); c = await p.evaluate(SETUP, 3);
    r = await hold(p, 'u', 1.0);
    const hm = await p.evaluate((c) => { const t = document.querySelector('#root').__eggTest; return [t.matAt(c.ox, 2, c.oz), t.matAt(c.ox, 3, c.oz)]; }, c);
    ok(`脚、头都是矿石时先挖头部${tag}`, r.s.stones === 1 && hm[0] !== 0 && hm[1] === 0, JSON.stringify(hm));
    await p.close();
  }
  // 3. 岩浆：身上有岩浆时不能挖
  { const p = await open('&n=29'); const c = await p.evaluate(SETUP, 2);
    await p.evaluate((c) => { const t = document.querySelector('#root').__eggTest; t.flood(c.x, c.z, 0); }, c);
    const r = await hold(p, 'u', 1.2);
    ok('身上碰到岩浆时不能挖', r.s.stones === 0 && r.mx === 0, JSON.stringify({ mx: r.mx })); await p.close(); }
  // 4. 地下水：淹到头部一部分时变慢，完全淹没时不能挖
  { const p = await open('&n=-29'); const c = await p.evaluate(SETUP, 2);
    const slow = await p.evaluate((c) => { const t = document.querySelector('#root').__eggTest; t.fluidAt(c.x, 2, c.z, 8); t.fluidAt(c.x, 3, c.z, 3); t.keys('u'); for (let i = 0; i < 30; i++) t.advance(1 / 60); const s = t.snapshot(); t.keys(''); return s; }, c);
    ok('水淹过上半身时挖得更慢（0.5 s 进度明显少于 0.5）', slow.mineT > 0.05 && slow.mineT < 0.4, JSON.stringify({ mineT: slow.mineT }));
    const sub = await p.evaluate((c) => { const t = document.querySelector('#root').__eggTest; t.fluidAt(c.x, 3, c.z, 8); t.fluidAt(c.x, 2, c.z, 8); t.keys('u'); let mx = 0; for (let i = 0; i < 30; i++) { t.fluidAt(c.x, 3, c.z, 8); t.advance(1 / 60); mx = Math.max(mx, t.snapshot().mineT); } t.keys(''); return mx; }, c);
    ok('完全淹没时不能挖', sub === 0, 'mineT ' + sub); await p.close(); }
  // 5. 挖开后流体从下一刻起流进去（同步模式）
  { const p = await open('&n=-29'); const c = await p.evaluate(SETUP, 1);
    await p.evaluate((c) => document.querySelector('#root').__eggTest.fluidAt(c.x, 2, c.z, 4), c);   // 巷道格里脚部有半格水（没过头部，照样能挖）
    await hold(p, 'u', 1.0);
    const r = await p.evaluate((c) => { const t = document.querySelector('#root').__eggTest; let got = -1; for (let i = 0; i < 60 * 8; i++) { t.advance(1 / 60); if (t.matAt(c.ox, 2, c.oz) === 3) { got = i; break; } } return got; }, c);
    ok('挖开的格子流体会流进去（同步模式）', r >= 0, 'frame ' + r); await p.close(); }
  // 6. 薄墙一对：两个高度都挖掉后可以走过去
  { const p = await open('&n=29'); const c = await p.evaluate(() => { const t = document.querySelector('#root').__eggTest, M = t.maze(), W = M.W, lv = M.levels[0]; t.god(true); t.start();
      for (let i = 3 * W; i < lv.t.length - 3 * W; i++) { const n = i - W, o = i - 2 * W; if (lv.t[i] === 1 && lv.t[o] === 1 && lv.t[n] === 0 && !lv.special[i] && !lv.pit[i] && !lv.puddle[i] && !lv.special[o] && !lv.pit[o] && !lv.hall[i] && !lv.hall[o]) { t.weirdAt(n % W, (n / W) | 0, 3, i % W, (i / W) | 0, o % W, (o / W) | 0); t.teleport(i % W, (i / W) | 0); t.advance(1 / 60); return { ox: n % W, oz: (n / W) | 0 }; } } return null; });
    const before = await p.evaluate((c) => document.querySelector('#root').__eggTest.blockedTile(c.ox, c.oz), c);
    await hold(p, 'u', 1.0); const mid = await p.evaluate((c) => document.querySelector('#root').__eggTest.blockedTile(c.ox, c.oz), c);
    const r = await hold(p, 'u', 1.0); const after = await p.evaluate((c) => document.querySelector('#root').__eggTest.blockedTile(c.ox, c.oz), c);
    const walk = await hold(p, 'u', 1.0);
    ok('薄墙：只挖一个高度仍然挡路，两个都挖掉后可以走过去', before && mid && !after && r.s.stones === 2 && Math.floor(walk.s.z) <= c.oz, JSON.stringify({ before, mid, after, z: walk.s.z, oz: c.oz })); await p.close(); }
  // 7. 转头：附近看得见的矿石 → 头转向它（±90° 以内）；转到身后超过 90° 就回正；隔着岩石不转
  { const p = await open('&n=29'); const c = await p.evaluate(SETUP, 2);
    const r = await p.evaluate((c) => { const t = document.querySelector('#root').__eggTest, M = t.maze(), W = M.W, lv = M.levels[0];
      // 沿巷道往东走两格，面朝东，矿石在西北后方
      const out = {}; t.rot(0); for (let i = 0; i < 40; i++) t.advance(1 / 60); out.near = t.snapshot();
      t.rot(Math.PI / 2); for (let i = 0; i < 40; i++) t.advance(1 / 60); out.side = t.snapshot();   // 面朝南：矿石在正后方（北）→ 不跟
      // 把人放到隔着岩石的另一条巷道（离矿石 ≤ 5 格但视线被挡）
      let far = null; for (let dz = 2; dz <= 4 && !far; dz++) for (let dx = -3; dx <= 3 && !far; dx++) { const x = c.ox + dx, z = c.oz - dz, i = z * W + x; if (z > 0 && lv.t[i] === 1 && !lv.pit[i]) far = [x, z]; }
      if (far) { t.teleport(far[0], far[1]); t.rot(Math.atan2(c.oz - far[1], c.ox - far[0])); for (let i = 0; i < 40; i++) t.advance(1 / 60); out.wall = t.snapshot(); }
      return out; }, c);
    ok('转头：看向附近的矿石，头身夹角在 ±90° 以内', r.near.headOre >= 0 && Math.abs(r.near.hyaw) > 0.2 && Math.abs(r.near.hyaw) <= Math.PI / 2 + 2e-3, JSON.stringify({ ore: r.near.headOre, hyaw: r.near.hyaw }));
    ok('转头：矿石在身后超过 90° 时头回正', Math.abs(r.side.hyaw) < 0.05, 'hyaw ' + r.side.hyaw);
    ok('转头：隔着岩石不看', !r.wall || r.wall.headOre < 0, JSON.stringify(r.wall && { ore: r.wall.headOre }));
    if (p.errs.length) ok('无报错', false, p.errs.join(' | ')); await p.close(); }
  console.log(`\n${pass} passed, ${fail} failed`);
  await b.close(); process.exit(fail ? 1 : 0);
})();
