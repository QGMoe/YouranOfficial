// 地下水溺水：气泡用完后失去控制（移动 / QTE 输入无效），约 3.5 s 内生命扣完，死因"溺水"；期间按键不会重开；岩浆不受影响
// 在仓库根目录起静态服务器（例如 python3 -m http.server 8137），再运行：node tools/eggs/breach/test/drown.test.cjs（需要 playwright；BASE 可改服务器地址）
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
  for (const q of ['', '&egg-2d']) {
    const tag = q ? '（2D）' : '（3D）', p = await open('&n=-29' + q);
    const r = await p.evaluate(() => { const t = document.querySelector('#root').__eggTest; t.start(); t.god(false);
      // 把人物所在格灌满水，直到气泡用完
      let s = t.snapshot(), k = 0; for (; k < 60 * 25; k++) { s = t.snapshot(); if (s.drown >= 0) break; if (k % 6 === 0) t.flood(Math.floor(s.x), Math.floor(s.z), s.level); t.advance(1 / 60); }
      const s0 = t.snapshot(); return { s0, k }; });
    ok(`气泡用完后进入溺水${tag}`, r.s0.drown >= 0 && r.s0.air === 0 && r.s0.state === 'run', JSON.stringify({ drown: r.s0.drown, air: r.s0.air, hp: r.s0.hp }));
    const r2 = await p.evaluate(() => { const t = document.querySelector('#root').__eggTest, cv = document.querySelector('#root canvas.egg-breach-main'); const s0 = t.snapshot();
      t.keys('r'); for (let i = 0; i < 30; i++) t.advance(1 / 60); t.keys('');
      cv.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', bubbles: true, cancelable: true })); cv.dispatchEvent(new KeyboardEvent('keyup', { key: 'w', bubbles: true }));
      cv.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
      const s1 = t.snapshot(); let tEnd = -1, i = 0;
      for (; i < 60 * 6; i++) { t.advance(1 / 60); const s = t.snapshot(); if (s.state === 'over') { tEnd = s0.drown + 0.5 + (i + 1) / 60; break; } }
      // 刚结束（面板还没淡入）时按方向键 / 点画面不重开
      cv.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', bubbles: true, cancelable: true })); cv.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 2 }));
      const s2 = t.snapshot();
      return { moved: Math.hypot(s1.x - s0.x, s1.z - s0.z), st1: s1.state, tEnd, st2: s2.state }; });
    ok(`溺水期间移动 / 按键输入无效${tag}`, r2.moved < 0.05 && r2.st1 === 'run', JSON.stringify(r2));
    ok(`气泡用完后约 3.5 s 内生命扣完（≤ 4 s）${tag}`, r2.tEnd > 2.5 && r2.tEnd <= 4.05, `${r2.tEnd.toFixed(2)} s`);
    ok(`溺水过程中与刚结束时按键不开新局${tag}`, r2.st2 === 'over');
    const cause = await p.evaluate(async () => { await new Promise(r => setTimeout(r, 1200)); const e = document.querySelector('.egg-breach-ec'); return e && e.textContent; });
    ok(`死因显示为溺水${tag}`, cause === '溺水', cause);
    if (p.errs.length) ok('无报错', false, p.errs.join(' | ')); await p.close();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  await b.close(); process.exit(fail ? 1 : 0);
})();
