// 浏览器测试：Worker 与同步预跑逐字节一致（含人为拖慢 Worker）；WebGL 上下文丢失后重建；mount→unmount→mount；2D 兜底通关
// 在仓库根目录起静态服务器（例如 python3 -m http.server 8137），再运行：node tools/eggs/breach/test/browser.test.cjs（需要 playwright；BASE 可改服务器地址）
const { chromium } = require('playwright');
let pass = 0, fail = 0;
const ok = (name, c, info) => { console.log(c ? 'ok  ' : 'FAIL', name, info || ''); c ? pass++ : fail++; };
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const open = async (q, vw = 1280) => {
    const p = await b.newPage({ viewport: { width: vw, height: 900 } }); const errs = [];
    p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
    await p.goto((process.env.BASE || 'http://localhost:8137') + '/tools/eggs/breach/harness.html?egg-test' + q); await p.waitForFunction(() => window.__ready);
    await p.waitForFunction(() => document.querySelector('#root').__eggTest.ready(), null, { timeout: 90000 });
    p.errs = errs; return p;
  };
  for (const n of ['5', '41', '75', '-75', '100', '224', '-224', '456']) {   // 224 / 456 → 第 28 档
    const p = await open('&n=' + n);
    const r = await p.evaluate(async () => { const t = document.querySelector('#root').__eggTest;
      const a = t.syncPrerun(), w1 = await t.workerPrerun(0), w2 = await t.workerPrerun(3), live = t.prep(), fp = t.fingerprint();
      return { a, w1, w2, live, fp }; });
    const same = r.a.k === r.w1.k && r.a.k === r.w2.k && r.a.regen === r.w1.regen && r.a.regen === r.w2.regen && r.live.regen === r.a.regen && r.a.fp === r.w1.fp && r.a.fp === r.w2.fp && r.a.ticks === r.w2.ticks && r.live.k === r.a.k && r.fp === r.a.fp;
    ok(`预跑确定性 n=${n}`, same, `图${r.a.regen} k=${r.a.k} 刻=${r.a.ticks} 指纹=${r.a.fp.toString(16)} 同步/Worker/拖慢Worker/实际 一致；实际预跑 ${r.live.ms} ms (${r.live.via})`);
    await p.close();
  }
  { const p = await open('&n=75');
    const r = await p.evaluate(async () => { const t = document.querySelector('#root').__eggTest; t.god(true); t.start(); t.sim(300); for (let i = 0; i < 10; i++) t.advance(1 / 30);
      const had = t.loseContext(); await new Promise(r => setTimeout(r, 120)); for (let i = 0; i < 5; i++) t.advance(1 / 30); const mid = t.glState();
      await new Promise(r => setTimeout(r, 600)); for (let i = 0; i < 10; i++) t.advance(1 / 30); return { had, mid, after: t.glState(), snap: t.snapshot() }; });
    ok('WebGL 上下文丢失 → 恢复后重建', r.had && r.mid.lost && !r.after.lost && r.after.restored === 1, JSON.stringify(r));
    await p.screenshot({ path: require('path').join(__dirname, '..', 'shots', 'p2-after-ctxloss.png') });
    ok('上下文丢失期间无报错', p.errs.length === 0, p.errs.join(' | '));
    await p.close(); }
  { const p = await open('&n=75');
    const leak = await p.evaluate(async () => { const t = document.querySelector('#root').__eggTest; t.start(); for (let i = 0; i < 20; i++) t.advance(1 / 30); return window.__leak(); });
    ok('无全局变量泄漏', leak.length === 0, JSON.stringify(leak));
    const r = await p.evaluate(async () => { for (let i = 0; i < 3; i++) window.__remount(); await new Promise(r => setTimeout(r, 1500)); return { wraps: document.querySelectorAll('.egg-breach-wrap').length, styles: document.querySelectorAll('style').length }; });
    ok('mount → unmount ×3 无残留', r.wraps === 1 && p.errs.length === 0, JSON.stringify(r) + p.errs.join('|'));
    await p.close(); }
  for (const [q, label] of [['&n=75&egg-2d', '2D 兜底'], ['&n=75', '3D'], ['&n=-60', '3D 地下水']]) {
    const p = await open(q);
    await p.evaluate(() => { const t = document.querySelector('#root').__eggTest; t.autopilot(true); document.querySelector('.egg-breach-btn').click(); });
    let s; for (let k = 0; k < 60; k++) { await p.waitForTimeout(2000); s = await p.evaluate(() => document.querySelector('#root').__eggTest.snapshot()); if (s.state === 'over') break; }
    ok(`${label} 自动驾驶完整通关`, s.state === 'over' && s.mode === 'end', `${s.state}/${s.mode} 用时 ${s.t.toFixed(1)}s 层 ${s.level + 1} hp ${s.hp.toFixed(1)}`);
    await p.close();
  }
  // 无火把区里，岩石顶面（俯视切面）也要暗：同一张图上，离火把最远处的画面平均亮度明显低于火把旁边
  { const luma = {};
    for (const where of ['dark', 'lit']) {
      const p = await open('&n=200&theme=light');
      luma[where] = await p.evaluate((where) => { const t = document.querySelector('#root').__eggTest, M = t.maze(), W = M.W, lv = M.levels[0];
        const tor = []; for (let i = 0; i < lv.t.length; i++) if (lv.torch[i]) tor.push(i);
        let best = -1, bd = where === 'dark' ? -1 : 1e9;
        for (let i = 0; i < lv.t.length; i++) if (lv.t[i] === 1 && !lv.pit[i] && !lv.puddle[i] && !lv.special[i]) { let m = 1e9; for (const j of tor) m = Math.min(m, Math.hypot(i % W - j % W, ((i / W) | 0) - ((j / W) | 0))); if (where === 'dark' ? m > bd : (m < bd && m >= 1)) { bd = m; best = i; } }
        t.god(true); t.start(); t.teleport(best % W, (best / W) | 0); for (let i = 0; i < 20; i++) t.advance(1 / 60);
        const cv = document.querySelector('#root canvas.egg-breach-main'), c2 = document.createElement('canvas'); c2.width = cv.width; c2.height = cv.height; const g = c2.getContext('2d'); g.drawImage(cv, 0, 0);
        const d = g.getImageData(0, 0, c2.width, c2.height).data, BG = [204, 194, 179]; let sum = 0, n = 0;
        for (let y = Math.floor(c2.height * 0.2); y < c2.height * 0.8; y += 2) for (let x = Math.floor(c2.width * 0.2); x < c2.width * 0.8; x += 2) { const o = (y * c2.width + x) * 4; if (Math.abs(d[o] - BG[0]) < 6 && Math.abs(d[o + 1] - BG[1]) < 6 && Math.abs(d[o + 2] - BG[2]) < 6) continue; sum += 0.3 * d[o] + 0.59 * d[o + 1] + 0.11 * d[o + 2]; n++; }
        return sum / n; }, where);
      await p.close();
    }
    ok('无火把区的画面（含岩石顶面）明显暗于火把旁边', luma.dark < luma.lit * 0.8, `平均亮度 暗处 ${luma.dark.toFixed(1)} / 火把旁 ${luma.lit.toFixed(1)}`);
  }
  // 2D 竖井侧视：中间几段竖井的梯子只到上一层地面（再往上是巷道入口和岩石，不是梯子）；最上一段竖井一直通到地表
  { const p = await open('&n=100&egg-2d');
    const r = await p.evaluate(() => { const t = document.querySelector('#root').__eggTest; t.god(true); t.start(); const nL = t.maze().levels.length, out = [];
      const sample = () => { const src = document.querySelector('#root canvas.egg-breach-main'), cv = document.createElement('canvas'); cv.width = src.width; cv.height = src.height; const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(src, 0, 0); const sx = cv.width / 320, sy = cv.height / 240;
        // 梯子左侧立柱在 x = 146..148（逻辑像素）、颜色 #6b4a2b；逐行看立柱是否存在
        const all = g.getImageData(0, 0, cv.width, cv.height).data, px = (x, y) => all.subarray((y * cv.width + x) * 4, (y * cv.width + x) * 4 + 3);
        const col = []; for (let y = 0; y < 240; y++) { const d = px(Math.floor(147 * sx), Math.floor((y + 0.5) * sy)); col.push(Math.abs(d[0] - 0x6b) < 12 && Math.abs(d[1] - 0x4a) < 12 && Math.abs(d[2] - 0x2b) < 12); } return col; };
      for (let k = 0; k < nL; k++) { t.climbAt(k, 0.85); for (let i = 0; i < 4; i++) t.advance(1 / 60); const col = sample(); const first = col.indexOf(true); out.push({ k, first, rungsBelow: col.slice(first).filter(Boolean).length }); }
      return { nL, out }; });
    const mid = r.out.slice(0, -1), top = r.out[r.out.length - 1];
    ok('2D 竖井：中间的竖井里梯子止于上一层地面（画面上方没有梯子）', r.nL === 3 && mid.every(o => o.first > 40), JSON.stringify(r.out));
    ok('2D 竖井：最上一段竖井的梯子一直通到地表（画面上部也有梯子，地表之上没有）', top.first > 0 && top.first < mid[0].first - 20, JSON.stringify(top));
    if (p.errs.length) ok('2D 竖井无报错', false, p.errs.join(' | ')); await p.close(); }
  console.log(`\n${pass} passed, ${fail} failed`);
  await b.close(); process.exit(fail ? 1 : 0);
})();
