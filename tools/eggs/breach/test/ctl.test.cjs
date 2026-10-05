// 触屏操作：摇杆 / 方向键切换与记忆、操作区左右、摇杆方向（8 个方向 + 模拟量 + 死区）、摇杆不算 QTE 点击、按住摇杆时另一根手指点画面接 QTE、
// 摇杆挖奇怪的矿石（±45° 以内）、摇杆开局 / 结束后松开前不重开、方向键模式照常；横屏全屏（.egg-fs）布局
// 在仓库根目录起静态服务器（例如 python3 -m http.server 8137），再运行：node tools/eggs/breach/test/ctl.test.cjs（需要 playwright；BASE 可改服务器地址）
const { chromium } = require('playwright');
let pass = 0, fail = 0;
const ok = (name, c, info) => { console.log(c ? 'ok  ' : 'FAIL', name, info || ''); c ? pass++ : fail++; };
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const open = async (q, vp) => {
    const c = await b.newContext({ viewport: vp || { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }); const p = await c.newPage(); const errs = [];
    p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
    await p.goto((process.env.BASE || 'http://localhost:8137') + '/tools/eggs/breach/harness.html?egg-test&egg-sync' + q); await p.waitForFunction(() => window.__ready);
    await p.waitForFunction(() => document.querySelector('#root').__eggTest.ready(), null, { timeout: 90000 });
    p.errs = errs; p.ctx = c; return p;
  };
  // 在页面里按住摇杆：从底座中心往 (ux, uy)（相对底座半径 R = 拇指头最大偏移）方向推
  const JOY = `window.__joy = (ux, uy, id) => { const j = document.querySelector('.egg-breach-joy'), r = j.getBoundingClientRect(), R = r.width * 9 / 28, cx = r.left + r.width / 2, cy = r.top + r.height / 2, o = { bubbles: true, cancelable: true, pointerId: id || 21, pointerType: 'touch', isPrimary: true };
      if (!window.__jdown) { j.dispatchEvent(new PointerEvent('pointerdown', Object.assign({ clientX: cx, clientY: cy }, o))); window.__jdown = true; }
      j.dispatchEvent(new PointerEvent('pointermove', Object.assign({ clientX: cx + ux * R, clientY: cy + uy * R }, o))); };
    window.__jup = (id) => { const j = document.querySelector('.egg-breach-joy'); j.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: id || 21, pointerType: 'touch' })); window.__jdown = false; };`;
  // 1. 切换与记忆
  { const p = await open('&n=29');
    const r = await p.evaluate(async () => { const pad = () => document.querySelector('.egg-breach-pad'), w = () => document.querySelector('.egg-breach-wrap');
      const a = { mode: pad().getAttribute('data-mode'), side: w().getAttribute('data-side'), joyVis: getComputedStyle(document.querySelector('.egg-breach-joy')).display !== 'none', label: document.querySelector('.egg-breach-ctl').getAttribute('aria-label'), sideLabel: document.querySelector('.egg-breach-side').getAttribute('aria-label') };
      document.querySelector('.egg-breach-ctl').click(); document.querySelector('.egg-breach-side').click();
      const bb = { mode: pad().getAttribute('data-mode'), side: w().getAttribute('data-side'), dpadVis: getComputedStyle(document.querySelector('.egg-breach-dpad')).display !== 'none' };
      window.__remount(); await new Promise(r => setTimeout(r, 300));
      const c = { mode: pad().getAttribute('data-mode'), side: w().getAttribute('data-side') }; return { a, bb, c }; });
    ok('默认摇杆、操作区在左；开关的无障碍名称', r.a.mode === 'joy' && r.a.side === 'left' && r.a.joyVis && r.a.label === '操作方式：摇杆 / 方向键' && r.a.sideLabel === '操作区：左 / 右', JSON.stringify(r.a));
    ok('切到方向键、操作区放右边；重新挂载后仍记得', r.bb.mode === 'pad' && r.bb.dpadVis && r.bb.side === 'right' && r.c.mode === 'pad' && r.c.side === 'right', JSON.stringify([r.bb, r.c]));
    await p.ctx.close(); }
  // 2. 方向：8 个方向 + 模拟量 + 死区（按屏幕方向：往上推 = ArrowUp）
  { const p = await open('&n=29'); await p.evaluate(JOY);
    const r = await p.evaluate(() => { const t = document.querySelector('#root').__eggTest; t.start(); t.god(true); const out = [];
      const dirs = [[0, -1, 0, -1], [1, -1], [1, 0, 1, 0], [1, 1], [0, 1, 0, 1], [-1, 1], [-1, 0, -1, 0], [-1, -1]];
      for (const d of dirs) { const m = Math.hypot(d[0], d[1]); window.__joy(d[0] / m, d[1] / m); t.advance(1 / 60); out.push(t.input()); }
      window.__joy(0.1, 0); t.advance(1 / 60); const dead = t.input();
      window.__joy(0, -0.3); t.advance(1 / 60); const half = t.input();
      window.__joy(0, -0.6); t.advance(1 / 60); const full = t.input();
      window.__jup(); t.advance(1 / 60); const rel = t.input();
      return { out, dead, half, full, rel }; });
    const good = r.out.every((v, k) => { const a = k * Math.PI / 4, ex = Math.sin(a), ez = -Math.cos(a); return Math.abs(v[0] - ex) < 0.03 && Math.abs(v[1] - ez) < 0.03 && Math.hypot(v[0], v[1]) > 0.97; });
    ok('摇杆 8 个方向与方向键一致（上 = −z、右 = +x），全速', good, JSON.stringify(r.out.map(v => v.slice(0, 2).map(x => +x.toFixed(2)))));
    ok('摇杆主轴方向（爬坑 / 挖矿用）', r.out[0][3] === -1 && r.out[0][2] === 0 && r.out[2][2] === 1 && r.out[4][3] === 1 && r.out[6][2] === -1);
    ok('死区 15%：推 10% 不动；30% 半速；60% 全速；松开停下', r.dead[0] === 0 && r.dead[1] === 0 && Math.abs(r.half[1] + 0.5) < 0.02 && Math.abs(r.full[1] + 1) < 1e-6 && r.rel[0] === 0 && r.rel[1] === 0, JSON.stringify([r.dead, r.half, r.full, r.rel]));
    if (p.errs.length) ok('无报错', false, p.errs.join(' | ')); await p.ctx.close(); }
  // 3. QTE：按住摇杆不算点击；按住摇杆时另一根手指点画面接住
  { const p = await open('&n=100'); await p.evaluate(JOY);
    const r = await p.evaluate(() => { const t = document.querySelector('#root').__eggTest, M = t.maze(), W = M.W, dp = t.deepPits()[0]; t.god(true); t.start(); t.setLevel(dp.level); const lv = M.levels[dp.level];
      let dir = null; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const i = (dp.z + dz) * W + dp.x + dx; if (lv.t[i] && !lv.pit[i] && !t.blocked(dp.x + dx + .5, dp.z + dz + .5)) { t.teleport(dp.x + dx, dp.z + dz); dir = [-dx, -dz]; break; } }
      let s; for (let i = 0; i < 120; i++) { window.__joy(dir[0], dir[1]); t.advance(1 / 60); s = t.snapshot(); if (s.qte > 0 && !s.anim) break; }
      // 摇杆在 QTE 中再按一次（新的手指落在摇杆上）不算
      const j = document.querySelector('.egg-breach-joy'); j.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 33, pointerType: 'touch', clientX: 10, clientY: 10 })); j.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 33, pointerType: 'touch' }));
      const s1 = t.snapshot();
      document.querySelector('#root canvas.egg-breach-main').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 34, pointerType: 'touch', clientX: 100, clientY: 100 }));
      const s2 = t.snapshot(); window.__jup(); return { inQte: s.qte > 0, s1: { qte: s1.qte, grip: s1.grip }, s2: { qte: s2.qte, grip: s2.grip } }; });
    ok('摇杆把人推进深坑后出现 QTE；摇杆上的触摸不算 QTE 点击', r.inQte && r.s1.qte > 0 && r.s1.grip < 0, JSON.stringify(r));
    ok('按住摇杆时另一根手指点画面接住坑沿', r.s2.grip > 0, JSON.stringify(r.s2)); await p.ctx.close(); }
  // 4. 摇杆挖奇怪的矿石：朝矿石方向偏 30° 也算
  { const p = await open('&n=29'); await p.evaluate(JOY);
    const r = await p.evaluate(() => { const t = document.querySelector('#root').__eggTest, M = t.maze(), W = M.W, lv = M.levels[0]; t.god(true); t.start();
      for (let i = 3 * W; i < lv.t.length - W; i++) { const n = i - W; if (lv.t[i] === 1 && !lv.special[i] && !lv.pit[i] && !lv.puddle[i] && !lv.torch[i] && !lv.hall[i] && lv.t[n] === 0 && lv.t[i - 2 * W] === 0 && lv.t[n - 1] === 0 && lv.t[n + 1] === 0 && lv.t[i - 1] === 0 && lv.t[i + 1] === 0 && !lv.weird[n]) {
        t.weirdAt(n % W, (n / W) | 0, 2, i % W, (i / W) | 0); t.teleport(i % W, (i / W) | 0); break; } }
      const a = 30 * Math.PI / 180; for (let k = 0; k < 75; k++) { window.__joy(Math.sin(a), -Math.cos(a)); t.advance(1 / 60); } window.__jup(); t.advance(1 / 60); return t.snapshot().stones; });
    ok('摇杆朝矿石方向（偏 30°）按住就能挖到', r === 1, 'stones ' + r); await p.ctx.close(); }
  // 5. 方向键模式照常；摇杆开局；结束时摇杆按着 → 松开之前不重开
  { const p = await open('&n=29'); await p.evaluate(JOY);
    const r = await p.evaluate(async () => { const t = document.querySelector('#root').__eggTest; const st0 = t.snapshot().state;
      window.__joy(0, -1); const st1 = t.snapshot().state;   // 摇杆按下 = 开局（与方向按钮一样）
      t.god(true); t.win(); for (let i = 0; i < 260; i++) t.advance(1 / 60);
      const e = document.querySelector('.egg-breach-end'), t0 = performance.now(); while (!e.classList.contains('on') && performance.now() - t0 < 6000) await new Promise(r => setTimeout(r, 40));
      await new Promise(r => setTimeout(r, 300));
      window.__joy(0, -1); const st2 = t.snapshot().state;   // 还没松开：不重开
      window.__jup(); window.__joy(0, -1); const st3 = t.snapshot().state; window.__jup();
      // 方向键模式
      document.querySelector('.egg-breach-ctl').click(); const s0 = t.snapshot(); const u = document.querySelector('.egg-breach-dpad [data-d=r]');
      u.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 41, pointerType: 'touch' })); for (let i = 0; i < 20; i++) t.advance(1 / 60); const s1 = t.input(); u.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 41, pointerType: 'touch' }));
      return { st0, st1, st2, st3, pad: s1 }; });
    ok('摇杆按下开局；结束时还按着摇杆，松开前不重开，松开后再按重开', r.st0 === 'ready' && r.st1 === 'run' && r.st2 === 'over' && r.st3 === 'run', JSON.stringify(r));
    ok('切到方向键后方向按钮照常', r.pad[0] === 1 && r.pad[1] === 0, JSON.stringify(r.pad));
    if (p.errs.length) ok('无报错', false, p.errs.join(' | ')); await p.ctx.close(); }
  // 6. 横屏全屏：走宿主真实的全屏路径（通用调试页 tools/eggs/harness.html，与 404 页同一实现：点「横屏全屏」按钮，宿主给 root 加 egg-fs）
  //    画面居中、按可用高度铺满、4:3、绿色描边完整可见；"用时"行隐藏；边距跟随主题（不是自己涂的黑底）；操作区在左 / 右边距里，在右边时避开宿主右上角的按钮区
  const HOST = async (vp, q, theme) => {
    const c = await b.newContext({ viewport: vp, deviceScaleFactor: 2, hasTouch: true, isMobile: true }); const p = await c.newPage(); const errs = [];
    p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.goto((process.env.BASE || 'http://localhost:8137') + '/tools/eggs/harness.html?egg-test&egg-sync' + q);
    await p.waitForSelector('#game option', { state: 'attached' }); await p.selectOption('#theme', theme); await p.selectOption('#game', '08-breach.js'); await p.fill('#n', '29'); await p.click('#mount');
    await p.waitForFunction(() => { const r = document.querySelector('#root'); return r.__eggTest && r.__eggTest.ready(); }, null, { timeout: 90000 });
    await p.click('.egg-fsb'); await p.waitForFunction(() => document.querySelector('#root').classList.contains('egg-fs')); await p.waitForTimeout(300);
    p.errs = errs; p.ctx = c; return p; };
  for (const vp of [{ width: 844, height: 390 }, { width: 932, height: 430 }]) for (const side of ['left', 'right']) for (const [q, theme] of [['', 'light'], ['&egg-2d', 'dark']]) {
    const p = await HOST(vp, q, theme);
    const r = await p.evaluate(async (side) => { if (side === 'right') document.querySelector('.egg-breach-side').click(); await new Promise(r => setTimeout(r, 150));
      const t = document.querySelector('#root').__eggTest; t.scoring(true); t.start(); t.god(true); for (let i = 0; i < 5; i++) t.advance(1 / 60);
      const R = (s) => document.querySelector(s).getBoundingClientRect(), st = R('.egg-breach-stage'), joy = R('.egg-breach-joy'), cv = R('#root canvas.egg-breach-main'), hb = R('.egg-fs-on .egg-head');
      const bg = getComputedStyle(document.querySelector('.egg-breach-wrap')).backgroundColor, cardBg = getComputedStyle(document.querySelector('.egg-fs-on')).backgroundColor, info = getComputedStyle(document.querySelector('.egg-breach-info')).display;
      // 边距处的实际颜色：取 stage 左侧边距中点那一点在哪个元素上，以及那个元素的背景
      const pickEl = document.elementFromPoint(Math.max(2, st.left / 2), 6); let el = pickEl, mbg = 'rgba(0, 0, 0, 0)'; while (el && (mbg = getComputedStyle(el).backgroundColor) === 'rgba(0, 0, 0, 0)') el = el.parentElement;
      t.win(); for (let i = 0; i < 260; i++) t.advance(1 / 60); const e = document.querySelector('.egg-breach-end'), t0 = performance.now(); while (!e.classList.contains('on') && performance.now() - t0 < 6000) await new Promise(r => setTimeout(r, 40));
      await new Promise(r => setTimeout(r, 2600)); const en = R('.egg-breach-end'), sh = R('.egg-breach-end [data-a=share]'), rt = document.querySelector('#root');
      return { vw: innerWidth, vh: innerHeight, st: [st.left, st.top, st.right, st.bottom].map(Math.round), cv: [cv.width, cv.height].map(Math.round), joy: [joy.left, joy.right, joy.top, joy.bottom].map(Math.round), hb: [hb.left, hb.top, hb.right, hb.bottom].map(Math.round),
        bg, cardBg, mbg, info, en: [en.left, en.top, en.right, en.bottom].map(Math.round), sh: [sh.right, sh.bottom].map(Math.round), over: [rt.scrollWidth - rt.clientWidth, rt.scrollHeight - rt.clientHeight] }; }, side);
    const tag = `${vp.width}×${vp.height} ${side === 'left' ? '左' : '右'} ${q ? '2D 深色' : '3D 浅色'}`;
    const centred = Math.abs((r.st[0] + r.st[2]) / 2 - r.vw / 2) < 2, vcent = Math.abs((r.st[1] + r.st[3]) / 2 - r.vh / 2) < 3, tall = r.st[3] - r.st[1] > r.vh * 0.9 && r.st[1] >= 2 && r.st[3] <= r.vh - 2, ratio = Math.abs((r.cv[0] / r.cv[1]) - 4 / 3) < 0.03;
    const lum = (c) => { const m = c.match(/\d+(\.\d+)?/g).map(Number); return 0.3 * m[0] + 0.59 * m[1] + 0.11 * m[2]; };
    ok(`宿主全屏 ${tag}：画面水平垂直居中、按可用高度铺满、4:3，描边不被裁，"用时"行隐藏`, centred && vcent && tall && ratio && r.info === 'none', JSON.stringify({ st: r.st, cv: r.cv, info: r.info }));
    ok(`宿主全屏 ${tag}：边距透明，露出宿主随主题的底色（${theme === 'light' ? '近白' : '近黑'}）`, r.bg === 'rgba(0, 0, 0, 0)' && (theme === 'light' ? lum(r.mbg) > 200 : lum(r.mbg) < 40), JSON.stringify({ bg: r.bg, mbg: r.mbg }));
    const inMargin = side === 'left' ? r.joy[1] <= r.st[0] && r.joy[0] >= 0 : r.joy[0] >= r.st[2] && r.joy[1] <= r.vw;
    const clearHost = !(r.joy[0] < r.hb[2] && r.joy[1] > r.hb[0] && r.joy[2] < r.hb[3] && r.joy[3] > r.hb[1]) && !(r.st[2] > r.hb[0] && r.st[1] < r.hb[3]);
    ok(`宿主全屏 ${tag}：摇杆在${side === 'left' ? '左' : '右'}边距里，摇杆与画面都避开宿主右上角按钮`, inMargin && clearHost && r.joy[3] <= r.vh, JSON.stringify({ joy: r.joy, st: r.st, host: r.hb }));
    ok(`宿主全屏 ${tag}：结算面板（含分享按钮）在视口内、不需滚动`, r.en[0] >= 0 && r.en[1] >= 0 && r.en[2] <= r.vw && r.en[3] <= r.vh && r.sh[0] <= r.vw && r.sh[1] <= r.vh && r.over[0] <= 0 && r.over[1] <= 0, JSON.stringify({ en: r.en, sh: r.sh, over: r.over }));
    if (p.errs.length) ok('宿主全屏无报错', false, p.errs.join(' | ')); await p.ctx.close();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  await b.close(); process.exit(fail ? 1 : 0);
})();
