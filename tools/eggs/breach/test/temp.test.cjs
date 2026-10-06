// 体温（设计 §32）的游戏内行为：HUD（3D / 2D）、阶段效果（减速、发灰、发抖）、手里火把的水位规则与用掉后的结果、墙上火把、
// 重度倒下（侧倒不穿墙 / 梯子上先滑到底 / 坑里蜷着）、爬的时间窗、两种急救 + 爬起来、趴着溺水与失温叠加、窒息（头所在格凝固）、触屏动作按钮的位置
// 在仓库根目录起静态服务器（例如 python3 -m http.server 8137），再运行：node tools/eggs/breach/test/temp.test.cjs（需要 playwright；BASE 可改服务器地址）
const { chromium } = require('playwright');
let pass = 0, fail = 0;
const ok = (name, c, info) => { console.log(c ? 'ok  ' : 'FAIL', name, info || ''); c ? pass++ : fail++; };
const BASE = process.env.BASE || 'http://localhost:8137';
// 页面里的公用小工具：找格子、按住温度、推进
const LIB = `window.__L = (() => {
  const t = document.querySelector('#root').__eggTest, M = t.maze(), W = M.W;
  const lv = () => M.levels[t.snapshot().level], open = (x, z) => x >= 0 && z >= 0 && x < W && z < M.H && lv().t[z * W + x] !== 0 && !lv().chest[z * W + x];
  const plain = (x, z) => open(x, z) && lv().t[z * W + x] === 1 && !lv().pit[z * W + x] && !lv().puddle[z * W + x];
  const step = (n, f) => { for (let i = 0; i < n; i++) { if (f) f(i); t.advance(1 / 60); } };
  const pin = (Tc, Ts) => () => t.setTemp(Tc, Ts);
  // 一条东西向的直巷道中段：本格与东西各 2 格都是平地；离破口最远的排在前面（流体最晚到），身边 2 格内没有墙上火把
  const corridor = (k = 0) => { const out = [], tc = t.torchCells(), bx = M.lake.bx;
    for (let z = 1; z < M.H - 1; z++) for (let x = 3; x < W - 3; x++) if ([-2, -1, 0, 1, 2].every(d => plain(x + d, z)) && !open(x, z - 1) && !open(x, z + 1) && !tc.some(([a, c]) => Math.abs(a - x) <= 3 && Math.abs(c - z) <= 2)) out.push([x, z]);
    out.sort((a, b) => Math.hypot(b[0] - bx, b[1]) - Math.hypot(a[0] - bx, a[1]) || a[0] - b[0] || a[1] - b[1]); return out[(k * 5) % out.length]; };
  const deadEnd = () => { for (let z = 1; z < M.H - 1; z++) for (let x = 1; x < W - 1; x++) { if (!plain(x, z)) continue; const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([a, b]) => open(x + a, z + b)); if (n.length === 1) return [x, z, n[0]]; } return null; };
  const base = () => 1 + 6 * t.snapshot().level;
  return { t, M, W, lv, open, plain, step, pin, corridor, deadEnd, base };
})();`;
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const open = async (q, ctxOpt) => {
    const c = await b.newContext(Object.assign({ viewport: { width: 900, height: 800 } }, ctxOpt || {})); const p = await c.newPage(); const errs = [];
    p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
    await p.goto(BASE + '/tools/eggs/breach/harness.html?egg-test&egg-sync' + q); await p.waitForFunction(() => window.__ready);
    await p.waitForFunction(() => document.querySelector('#root').__eggTest.ready(), null, { timeout: 90000 });
    await p.evaluate(LIB); p.errs = errs; p.ctx = c; return p;
  };
  const done = async (p) => { if (p.errs.length) ok('无报错', false, p.errs.join(' | ')); await p.ctx.close(); };

  // 1. HUD（3D / 2D）：圆点颜色（黄 → 蓝）、温度文字、轻度起的图标与阶段名；中度失温：减速、画面发灰；轻度寒战时发抖（减少动态时不抖）
  for (const q of ['', '&egg-2d']) { const tag = q ? '（2D）' : '（3D）', p = await open('&n=-120' + q);
    const r = await p.evaluate(() => { const { t, step, corridor } = window.__L, hud = document.querySelector('#root canvas.egg-breach-hud');
      const px = (x, y) => { const c = document.createElement('canvas'); c.width = hud.width; c.height = hud.height; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(hud, 0, 0); const k = hud.width / 320; return Array.from(g.getImageData(Math.floor(x * k), Math.floor(y * k), 1, 1).data); };
      const ink = (x0, x1, y0, y1) => { const c = document.createElement('canvas'); c.width = hud.width; c.height = hud.height; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(hud, 0, 0); const k = hud.width / 320, d = g.getImageData(Math.floor(x0 * k), Math.floor(y0 * k), Math.floor((x1 - x0) * k), Math.floor((y1 - y0) * k)).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 100) n++; return n; };
      t.start(); t.god(true); const [cx, cz] = corridor(); t.teleport(cx, cz); step(3, () => t.setTemp(37, 34));
      const norm = { dot: px(240.5, 8.5), label: ink(250, 318, 16, 28), stage: t.thermo().stage, filter: t.thermo().filter };
      // 正常速度
      t.teleport(cx - 2, cz); t.keys('r'); step(30, () => t.setTemp(37, 34)); const v0 = Math.abs(t.snapshot().vx); t.keys('');
      t.teleport(cx - 2, cz); t.keys('r'); step(30, () => t.setTemp(30, 25)); const v2 = Math.abs(t.snapshot().vx); t.keys('');
      const cold = { dot: px(240.5, 8.5), label: ink(250, 318, 16, 28), stage: t.thermo().stage, filter: t.thermo().filter };
      step(2, () => t.setTemp(34, 30)); const s1 = t.thermo(), jit = t.pose().jit;
      return { norm, cold, v0, v2, slow2: t.maze().D.c, s1: { stage: s1.stage, shiv: s1.shiv }, jit }; });
    ok(`HUD 正常：黄色圆点、没有阶段名${tag}`, r.norm.stage === 0 && r.norm.dot[0] > 200 && r.norm.dot[1] > 160 && r.norm.dot[2] < 130 && r.norm.label === 0, JSON.stringify(r.norm));
    ok(`HUD 中度失温：圆点变蓝、出现雪花图标与阶段名；画面发灰（只作用于游戏画面）${tag}`, r.cold.stage === -2 && r.cold.dot[2] > r.cold.dot[0] && r.cold.label > 20 && /saturate\(0\.\d+\)/.test(r.cold.filter), JSON.stringify(r.cold));
    ok(`中度失温走路变慢（约 ×0.85）${tag}`, r.v2 / r.v0 > 0.8 && r.v2 / r.v0 < 0.9, (r.v2 / r.v0).toFixed(3));
    ok(`轻度失温有寒战、人物发抖${tag}`, r.s1.stage === -1 && r.s1.shiv > 0 && Math.hypot(r.jit[0], r.jit[1]) > 0, JSON.stringify(r));
    await done(p); }
  { const p = await open('&n=-120&rm');
    const r = await p.evaluate(() => { const { t, step } = window.__L; t.start(); t.god(true); step(3, () => t.setTemp(30, 26)); const a = t.thermo(); step(2, () => t.setTemp(34, 30)); return { jit: t.pose().jit, shiv: t.thermo().shiv, filter: a.filter }; });
    ok('减少动态：不发抖，但画面发灰等颜色提示照常', r.shiv > 0 && r.jit[0] === 0 && r.jit[1] === 0 && /saturate/.test(r.filter), JSON.stringify(r)); await done(p); }
  { const p = await open('&n=120');
    const r = await p.evaluate(() => { const { t, step } = window.__L, hud = document.querySelector('#root canvas.egg-breach-hud'); t.start(); t.god(true); step(3, () => t.setTemp(40, 42));
      const c = document.createElement('canvas'); c.width = hud.width; c.height = hud.height; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(hud, 0, 0); const k = hud.width / 320, d = g.getImageData(Math.floor(240.5 * k), Math.floor(8.5 * k), 1, 1).data;
      return { stage: t.thermo().stage, dot: Array.from(d), filter: t.thermo().filter }; });
    ok('HUD 中度过热：圆点变红（岩浆图）', r.stage === 2 && r.dot[0] > 200 && r.dot[2] < 120 && !r.filter, JSON.stringify(r)); await done(p); }

  // 2. 手里火把：≤ 3 层升温；4–5 层只止住降温；> 5 层立刻被浇灭；不论结果火都灭了（手里留着没点着的木棍，不扔）、没有随身的光；灭了不能取暖；一动就中断
  for (const q of ['', '&egg-2d']) { const tag = q ? '（2D）' : '（3D）', p = await open('&n=-120' + q);
    const r = await p.evaluate(() => { const { t, step, corridor, base } = window.__L; t.start(); t.god(true); const [cx, cz] = corridor(); const res = {};
      const trial = (q2) => { t.giveTorch(); t.teleport(cx, cz); t.clearFluid(cx, base() + 1, cz); step(2, () => t.setTemp(30, 22)); const a0 = t.thermo().act, pressed = t.shift(); const T0 = t.thermo(); let outAt = -1, tr = [];
        step(170, (i) => { if (q2) t.waterAt(cx, base() + 1, cz, q2); else t.clearFluid(cx, base() + 1, cz); const h = t.thermo(); if (outAt < 0 && !h.use) outAt = i; if (outAt < 0) tr.push(h.Tc); });
        t.clearFluid(cx, base() + 1, cz); step(60); const h = t.thermo(); return { a0, pressed, Tc0: T0.Tc, Ts0: T0.Ts, used: !!T0.use, outAt, minTc: Math.min(...tr), maxTc: Math.max(...tr), end: tr[tr.length - 1], torch: h.torch, toss: h.toss, sticks: h.sticks, light: h.light }; };
      res.w2 = trial(2); res.w5 = trial(5); res.w6 = trial(6);
      // 火灭了：再到中度失温也不能用（要先重新点着）
      t.teleport(cx, cz); step(2, () => t.setTemp(30, 22)); res.again = { act: t.thermo().act, pressed: t.shift(), use: !!t.thermo().use };
      // 一动就中断（火把照样用掉）
      t.giveTorch(); t.teleport(cx, cz); step(2, () => t.setTemp(30, 22)); t.shift(); step(20); t.keys('r'); step(2); t.keys(''); const mv = t.thermo(); res.cancel = { use: !!mv.use, torch: mv.torch };
      res.hint = null;
      return res; });
    ok(`中度失温时可用火把（Shift）${tag}`, r.w2.a0 === 'torch' && r.w2.pressed && r.w2.used, JSON.stringify(r.w2));
    ok(`脚下 ≤ 3 层水：升温，约 2.5 s 后用完${tag}`, r.w2.maxTc > r.w2.Tc0 + 1.5 && r.w2.outAt > 140 && r.w2.outAt < 160, JSON.stringify(r.w2));
    ok(`脚下 4–5 层：只止住降温（不升温）${tag}`, r.w5.used && r.w5.minTc >= r.w5.Tc0 - 0.01 && r.w5.maxTc <= r.w5.Tc0 + 0.3, JSON.stringify(r.w5));
    ok(`脚下 > 5 层：火把立刻被浇灭，不再取暖${tag}`, r.w6.used && r.w6.outAt >= 0 && r.w6.outAt <= 1, JSON.stringify(r.w6));
    ok(`不论哪种结果火都灭了，木棍留在手里（不扔、没有飞出去的木棍）；随身的光没了${tag}`, !r.w2.torch && !r.w5.torch && !r.w6.torch && r.w2.toss === undefined && r.w2.sticks === undefined && (r.w2.light === null || r.w2.light < 2), JSON.stringify({ s: [r.w2.toss, r.w5.sticks, r.w6.sticks], light: r.w2.light }));
    ok(`火灭了以后 Shift 不再有反应（要先重新点着）${tag}`, r.again.act === '' && !r.again.pressed && !r.again.use, JSON.stringify(r.again));
    ok(`取暖时一动就中断，火把照样用掉${tag}`, !r.cancel.use && !r.cancel.torch, JSON.stringify(r.cancel));
    await done(p); }

  // 2b. 火把的生命周期（服主）：火灭了留着木棍；够得着墙上点着的火把时出现「取火」动作（桌面提示「按住 Shift 取火」），按住 Shift 约 1.5 s 重新点着
  //     （次数不限、不消耗墙上的火把）；方向键只管走路，朝着火把走 / 贴着它都不会自动取火；松开 / 走开 / 墙上火把被水浇灭 / 自己脚下水 > 5 层都点不着；
  //     碰到深水（脚格 > 5 层、头格有水、躺着时任何水）手里的火把就灭；引导时的提示
  for (const q of ['', '&egg-2d']) { const tag = q ? '（2D）' : '（3D）', p = await open('&n=-120' + q);
    const r = await p.evaluate(() => { const { t, step, corridor, base } = window.__L; t.start(); t.god(true); t.thermoOn(false); t.level(t.maze().levels.length - 1); const [cx, cz] = corridor(3), b = base(), res = {};   // 最上层：流体很久以后才到
      const setup = () => { t.shiftUp(); t.teleport(cx - 1, cz); t.setBlock(cx + 1, b + 1, cz, 7); t.clearFluid(cx - 1, b + 1, cz); t.clearFluid(cx, b + 1, cz); t.setTorch(false); step(2); };
      // 用方向键走到够得着墙上火把的地方（出现「取火」动作）后松开方向键
      const arrive = () => { setup(); t.keys('r'); let n = 0; while (t.thermo().act !== 'relight' && n++ < 200) step(1); t.keys(''); step(3); return n; };
      const press = () => t.shift();
      // 只按方向键朝着火把走、再贴着它按住方向键 3 s：不取火、不被定住，还能走（被石头挡住前一直往前）
      setup(); t.keys('r'); let relightSeen = false, x0 = t.snapshot().x; for (let i = 0; i < 180; i++) { step(1); if (t.relight()) relightSeen = true; } t.keys(''); res.walk = { relightSeen, torch: t.thermo().torch, moved: t.snapshot().x - x0 };
      // 取火：到位后按住 Shift
      arrive(); t.thermoOn(true); step(3);   /* HUD 文字只在体温开着时画 */ res.prompt = { act: t.thermo().act, hud: t.hudText(), label: t.actLabel() }; t.thermoOn(false); press(); let litAt = -1, maxT = 0; for (let i = 0; i < 240 && litAt < 0; i++) { step(1); const rl = t.relight(); if (rl) maxT = Math.max(maxT, rl.t); if (t.thermo().torch) litAt = i / 60; } t.shiftUp();
      res.ok = { litAt, maxT, still: t.torchCells().some(([x, z]) => x === cx + 1 && z === cz), relit: t.thermo().relit, light: t.thermo().light, actAfter: t.thermo().act };
      // 没按 Shift：在火把旁站 3 s 也不会点着
      arrive(); step(180); res.idle = { torch: t.thermo().torch, rl: t.relight() };
      // 次数不限
      let n = 0; for (let k = 0; k < 3; k++) { arrive(); press(); step(150); t.shiftUp(); if (t.thermo().torch) n++; } res.unlimited = { n, relit: t.thermo().relit, still: t.torchCells().some(([x, z]) => x === cx + 1 && z === cz) };
      // 松开：进度清零，再按要重新算满 1.5 s
      arrive(); press(); step(70); const p1 = t.relight(); t.shiftUp(); step(2); const p2 = t.relight(); press(); step(30); const p3 = t.relight(); t.shiftUp();
      res.release = { p1: p1 && p1.t, p2, p3: p3 && p3.t, torch: t.thermo().torch };
      // 走开：按住 Shift 的同时按方向键，进度清零，不点着
      arrive(); press(); step(70); const q1 = t.relight(); t.keys('l'); step(30); t.keys(''); const q2 = t.relight(); step(100); res.away = { q1: q1 && q1.t, q2, torch: t.thermo().torch }; t.shiftUp();
      // 墙上火把在取火时被水浇灭
      arrive(); press(); step(70); t.waterAt(cx + 1, b + 1, cz, 3); step(60); t.shiftUp(); res.flood = { torch: t.thermo().torch, rl: t.relight(), gone: !t.torchCells().some(([x, z]) => x === cx + 1 && z === cz) };
      t.clearFluid(cx + 1, b + 1, cz);
      // 自己脚下水 > 5 层：点不着
      arrive(); press(); step(60); const c0 = [Math.floor(t.snapshot().x), Math.floor(t.snapshot().z)]; step(150, () => t.waterAt(c0[0], b + 1, c0[1], 6)); t.shiftUp(); res.deep = { torch: t.thermo().torch, rl: t.relight() }; t.clearFluid(c0[0], b + 1, c0[1]); t.clearFluid(cx, b + 1, cz); t.clearFluid(cx - 1, b + 1, cz);
      // 火把点着时没有「取火」动作
      setup(); t.setTorch(true); t.teleport(cx, cz); step(3); res.lit = { act: t.thermo().act };
      return res; });
    ok(`方向键朝着墙上火把走 / 按住：不取火、不被定住${tag}`, !r.walk.relightSeen && !r.walk.torch && r.walk.moved > 0.2, JSON.stringify(r.walk));
    ok(`火灭了、够得着墙上火把时出现「取火」动作，桌面提示「按住 Shift 取火」${tag}`, r.prompt.act === 'relight' && r.prompt.hud.includes('按住 Shift 取火') && r.prompt.label === null, JSON.stringify(r.prompt));
    ok(`按住 Shift 约 1.5 s 重新点着，光回来了，墙上火把不消耗${tag}`, r.ok.litAt > 1.45 && r.ok.litAt < 2.6 && r.ok.maxT > 1.3 && r.ok.still && r.ok.relit === 1 && (r.ok.light === null || r.ok.light > 3) && r.ok.actAfter === '', JSON.stringify(r.ok));
    ok(`不按 Shift 站在墙上火把旁：不会点着${tag}`, !r.idle.torch && r.idle.rl === null, JSON.stringify(r.idle));
    ok(`取火中松开 Shift：进度清零，重新按要从头算${tag}`, r.release.p1 > 0.5 && r.release.p2 === null && r.release.p3 < 0.6 && !r.release.torch, JSON.stringify(r.release));
    ok(`取火中走开（方向键）：进度清零、不点着${tag}`, r.away.q1 > 0.5 && r.away.q2 === null && !r.away.torch, JSON.stringify(r.away));
    ok(`取火中墙上火把被水浇灭：点不着${tag}`, !r.flood.torch && r.flood.rl === null && r.flood.gone, JSON.stringify(r.flood));
    ok(`自己脚下水 > 5 层：点不着${tag}`, !r.deep.torch && r.deep.rl === null, JSON.stringify(r.deep));
    ok(`重新点火次数不限${tag}`, r.unlimited.n === 3 && r.unlimited.still, JSON.stringify(r.unlimited));
    ok(`火把点着时没有「取火」动作${tag}`, r.lit.act === '', JSON.stringify(r.lit));
    await done(p); }
  for (const q of ['', '&egg-2d']) { const tag = q ? '（2D）' : '（3D）', p = await open('&n=-120' + q);
    const r = await p.evaluate(() => { const { t, step, corridor, base } = window.__L; t.start(); t.god(true); const b = base(), res = {};
      // 引导时的提示（桌面 HUD 文字）+ 第一次出现取暖提示时的小提示
      const [hx, hz] = corridor(5); t.teleport(hx, hz); t.setTorch(true); step(3, () => t.setTemp(30.5, 24)); res.tip = t.hudText(); t.shift(); step(10); res.busy = t.hudText(); step(200);
      // 碰到水就灭：脚格 ≤ 5 层不灭、> 5 层灭、头格有水灭
      const [dx, dz] = corridor(4); t.teleport(dx, dz); const dous = (y, q2) => { t.setTorch(true); step(20, () => { t.setTemp(37, 34); t.waterAt(dx, y, dz, q2); }); const lit = t.thermo().torch; t.clearFluid(dx, y, dz); step(2); return lit; };
      res.wade5 = dous(b + 1, 5); res.wade6 = dous(b + 1, 6); res.head = dous(b + 2, 1);
      // 躺着：身上任何水都灭
      t.setTorch(true); t.setTemp(27.5, 24); step(70, () => t.setTemp(27.5, 24)); const c = t.pose().cell; step(3, () => { t.setTemp(27.5, 24); t.waterAt(c.x, b + 1, c.z, 1); }); res.prone = { down: !!t.thermo().down, torch: t.thermo().torch }; t.clearFluid(c.x, b + 1, c.z); t.setTemp(37, 34); step(5); t.shift(); step(50);
      return res; });
    ok(`手里的火把：脚格 ≤ 5 层水不灭，> 5 层灭，头格有水灭${tag}`, r.wade5 && !r.wade6 && !r.head, JSON.stringify([r.wade5, r.wade6, r.head]));
    ok(`躺着时身上碰到任何水，手里的火把就灭${tag}`, r.prone.down && !r.prone.torch, JSON.stringify(r.prone));
    ok(`第一次出现取暖提示时有小提示；引导中显示「取暖中…别动」${tag}`, r.tip.some(x => /一动就中断/.test(x)) && r.tip.includes('Shift 用火把取暖') && r.busy.includes('取暖中…别动'), JSON.stringify([r.tip, r.busy]));
    await done(p); }
  { const p = await open('&n=-120', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    const r = await p.evaluate(() => { const { t, step } = window.__L; t.start(); t.god(true); step(3, () => t.setTemp(30.5, 24)); t.placeAct(); const a = t.actLabel();
      document.querySelector('.egg-breach-act').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 5, pointerType: 'touch' })); step(5); t.placeAct(); const b2 = t.actLabel(); step(200); t.placeAct(); return { a, b: b2, after: t.actLabel() }; });
    ok('触屏：引导中动作按钮写「取暖中…别动」，火灭后按钮消失', r.a === '用火把取暖' && r.b === '取暖中…别动' && r.after === null, JSON.stringify(r)); await done(p); }

  // 3. 墙上火把（水图、岩浆图相同）：身边 1 格内被动加热（冷时快、越接近 / 高于正常越慢），比手里火把慢；水位规则相同；隔着岩石无效；被水淹到就永久熄灭
  { const p = await open('&n=-120');
    const r = await p.evaluate(() => { const { t, step, corridor, deadEnd, base } = window.__L; t.start(); t.god(true); const [cx, cz] = corridor(1), b = base(), res = {};
      t.teleport(cx, cz); t.setBlock(cx + 1, b + 1, cz, 7);
      const rate = (wq) => { t.setTemp(30, 26); step(1); const a = t.thermo().Tc; step(60, () => { if (wq) t.waterAt(cx, b + 1, cz, wq); }); const h = t.thermo(); t.clearFluid(cx, b + 1, cz); return { d: h.Tc - a, warm: h.warm }; };
      res.dry = rate(0); res.w3 = rate(3); res.w5 = rate(5); res.w6 = rate(6);
      t.setBlock(cx + 1, b + 1, cz, 0); res.none = rate(0);
      // 手里火把的速度（对照）
      t.giveTorch(); t.setTemp(30, 26); step(1); const a = t.thermo().Tc; t.shift(); step(60); res.hand = t.thermo().Tc - a; step(150);
      // 隔着岩石（死胡同斜对角）
      const de = deadEnd(); if (de) { const [x, z, [ax, az]] = de, tx = x - ax + (az ? 1 : 0), tz = z - az + (ax ? 1 : 0); t.teleport(x, z); t.setBlock(tx, b + 1, tz, 7); res.rock = rate(0); res.rockAt = [x, z, tx, tz]; t.setBlock(tx, b + 1, tz, 0); }
      // 被水淹到：火把方块被流体冲掉，之后不再出现
      t.teleport(cx, cz); t.setBlock(cx + 1, b + 1, cz, 7); t.fluidAt(cx + 2, b + 1, cz, 8); t.simFull(60); const gone = !t.torchCells().some(([x, z]) => x === cx + 1 && z === cz);
      t.clearFluid(cx + 1, b + 1, cz); t.clearFluid(cx + 2, b + 1, cz); t.simFull(20); res.flood = { gone, still: !t.torchCells().some(([x, z]) => x === cx + 1 && z === cz) };
      return res; });
    ok('墙上火把：身边被动取暖（显示暖光提示），不用按键', r.dry.warm === 1 && r.dry.d > 0.3, JSON.stringify(r.dry));
    ok('墙上火把的升温明显慢于手里火把', r.dry.d < r.hand * 0.75 && r.dry.d > r.hand * 0.2, JSON.stringify({ wall: r.dry.d, hand: r.hand }));
    ok('墙上火把的水位规则：≤ 3 层取暖、4–5 层只止住降温、> 5 层无效', r.w3.warm === 1 && r.w3.d > 0 && r.w5.warm === 0 && r.w5.d >= -0.01 && r.w6.warm === 0 && r.w6.d < 0, JSON.stringify([r.w3, r.w5, r.w6]));
    ok('身边没有火把 / 隔着岩石：没有效果', r.none.warm === 0 && r.rock && r.rock.warm === 0, JSON.stringify([r.none, r.rock, r.rockAt]));
    ok('墙上火把被水淹到就永久熄灭', r.flood.gone && r.flood.still, JSON.stringify(r.flood));
    await done(p); }
  // 岩浆图同样加热；一直待着会慢慢热到轻度过热；正常速度从旁边走过几乎不升温；手里的火把本身不加热；HUD 的 ↑ / ↓ / 不显示（带死区不闪）
  for (const n of ['120', '-120']) { const p = await open('&n=' + n);
    const r = await p.evaluate(() => { const { t, step, corridor, base } = window.__L; t.start(); t.god(true); t.level(t.maze().levels.length - 1); const [cx, cz] = corridor(1), b = base(), res = {};   // 最上层：流体很久以后才到
      // 走过：从西边 2 格外全速走到东边 2 格外，火把在路中间那格
      t.setBlock(cx, b + 1, cz, 7); t.teleport(cx - 2, cz); step(30, () => t.setTemp(37, 34)); const T0 = t.thermo().Tc; t.keys('r'); let mx = T0; step(70, () => { mx = Math.max(mx, t.thermo().Tc); }); t.keys(''); step(120, () => { mx = Math.max(mx, t.thermo().Tc); }); res.pass = mx - T0;
      t.setBlock(cx, b + 1, cz, 0);
      // 挨着待着：37 ℃ 起 60 s
      t.teleport(cx, cz); t.setBlock(cx + 1, b + 1, cz, 7); t.setTemp(37, 34); const tr = []; step(60 * 60, (i) => { if (i % 60 === 0) { const h = t.thermo(); tr.push([h.Tc, h.trend, h.warm]); } }); res.camp = { max: Math.max(...tr.map(x => x[0])), warm: tr[5][2], trendUp: tr[3][1] };
      t.setBlock(cx + 1, b + 1, cz, 0);
      // 手里的火把不加热：点着 / 没点着各待 20 s，体温一样
      const run = (lit) => { t.setTorch(lit); t.setTemp(36, 33); step(20 * 60); return t.thermo().Tc; }; res.handLit = run(true); res.handUnlit = run(false);
      // 稳定时不显示箭头，且不闪
      t.setTemp(37, 34); step(240); let flips = 0, last = t.thermo().trend; step(600, () => { const tr2 = t.thermo().trend; if (tr2 !== last) { flips++; last = tr2; } }); res.stable = { trend: t.thermo().trend, flips };
      return res; });
    const tag = n[0] === '-' ? '（水图）' : '（岩浆图）';
    ok(`墙上火把加热${tag}：挨着时显示暖光、体温在升（↑）；一直待着会慢慢热到轻度过热`, r.camp.warm === 1 && r.camp.trendUp === 1 && r.camp.max > 38.5, JSON.stringify(r.camp));
    ok(`正常速度从墙上火把旁走过几乎不升温（< 0.2 ℃）${tag}`, r.pass < 0.2, r.pass.toFixed(3));
    ok(`手里的火把本身不加热（点着 / 没点着一样）${tag}`, Math.abs(r.handLit - r.handUnlit) < 1e-6, JSON.stringify([r.handLit, r.handUnlit]));
    ok(`体温稳定时不显示箭头，也不闪${tag}`, r.stable.trend === 0 && r.stable.flips === 0, JSON.stringify(r.stable));
    await done(p); }
  // 泡在冷水里体温在降：显示 ↓
  { const p = await open('&n=-120');
    const r = await p.evaluate(() => { const { t, step, corridor, base } = window.__L; t.start(); t.god(true); const [cx, cz] = corridor(2), b = base(); t.teleport(cx, cz); t.setTemp(37, 34); step(240, () => t.waterAt(cx, b + 1, cz, 8)); return t.thermo().trend; });
    ok('泡在冷水里体温在降：HUD 显示 ↓', r === -1, String(r)); await done(p); }

  // 4. 重度失温倒下：跪下 → 顺着巷道侧倒，身体不穿墙；倒下过程不响应输入；梯子上先滑到底；坑里蜷着
  for (const q of ['', '&egg-2d']) { const tag = q ? '（2D）' : '（3D）', p = await open('&n=-120' + q);
    const r = await p.evaluate(() => { const { t, M, W, step, plain, open: op, base } = window.__L; t.start(); t.god(true); const res = { n: 0, bad: [], kinds: {} };
      const lv = M.levels[0], cells = [], bodyOk = (x, z) => op(x, z) && lv.t[z * W + x] !== 3 && lv.t[z * W + x] !== 4 && !lv.pit[z * W + x];
      for (let i = 0; i < lv.t.length; i++) if (plain(i % W, (i / W) | 0) && !lv.special[i]) cells.push(i);
      for (let k = 0; k < 24; k++) { const i = cells[(k * 7919) % cells.length], x = i % W, z = (i / W) | 0; t.level(0); t.teleport(x, z); t.rot(k * 0.7); step(2, () => t.setTemp(37, 34));
        t.setTemp(27.5, 24); step(1); const th0 = t.thermo(); t.keys('ul'); step(20); const midX = t.thermo().down && t.snapshot().x; t.keys(''); step(70, () => t.setTemp(27.5, 24));
        const h = t.thermo(), D = h.down; if (!D) { res.bad.push([x, z, 'nodown']); continue; } res.kinds[D.kind] = (res.kinds[D.kind] || 0) + 1;
        if (D.kind === 'lie') { // 身体（脚 → 头 1.75 格、宽 ±0.24）经过的格都要是能走的平地
          const ca = Math.cos(D.ang), sa = Math.sin(D.ang); for (let s = -0.1; s <= 1.85; s += 0.05) for (const l of [-0.24, 0, 0.24]) { const cx = Math.floor(D.x + ca * s - sa * l), cz = Math.floor(D.z + sa * s + ca * l); if (!bodyOk(cx, cz)) { res.bad.push([x, z, D.ang.toFixed(2), cx, cz]); s = 9; break; } } }
        if (D.ph !== 'lie') res.bad.push([x, z, 'ph ' + D.ph]); res.n++;
        t.setTemp(37, 34); step(5); t.shift(); step(50); }
      return res; });
    ok(`倒下时身体顺着巷道躺平，不进墙 / 坑 / 梯子（${r.n} 处）${tag}`, r.n === 24 && !r.bad.length, JSON.stringify(r));
    await done(p); }
  { const p = await open('&n=-120');
    const r = await p.evaluate(() => { const { t, M, W, step, base } = window.__L; t.start(); t.god(true); const res = {};
      // 倒下过程不响应输入：跪下 + 侧倒期间按方向键，位置只按动画走
      const [cx, cz] = window.__L.corridor(2); t.teleport(cx, cz); t.setTemp(27.5, 24); step(1); const D0 = t.thermo().down; t.keys('d'); const xs = []; step(55, () => { t.setTemp(27.5, 24); const h = t.thermo(); xs.push([h.down && h.down.ph, t.snapshot().x, t.snapshot().z]); }); t.keys('');
      res.noInput = xs.every(([ph, x, z]) => ph === 'kneel' || ph === 'fall' || ph === 'lie') && xs.slice(0, 20).every(([, x, z]) => Math.abs(z - (cz + 0.5)) < 1e-6);
      t.setTemp(37, 34); step(5); t.shift(); step(50);
      // 梯子上：滑到梯子底，回到本层俯视、在小厅里倒下
      t.climbAt(0, 0.6); step(2, () => t.setTemp(37, 34)); const y0 = t.snapshot().y; t.setTemp(27.5, 24); step(1); res.slide = t.thermo().slide; step(140, () => t.setTemp(27.5, 24));
      const s = t.snapshot(), h = t.thermo(); res.ladder = { y0, state: s.state, mode: s.mode, level: s.level, down: h.down && h.down.kind, ph: h.down && h.down.ph, room: M.levels[0].t[Math.floor(s.z) * W + Math.floor(s.x)] };
      t.setTemp(37, 34); step(5); t.shift(); step(50);
      // 浅坑里：蜷在坑底
      const lv = M.levels[0]; let pit = null; for (let i = 0; i < lv.pit.length && !pit; i++) if (lv.pit[i] === 1) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const j = i + dz * W + dx; if (lv.t[j] === 1 && !lv.pit[j] && !t.blockedTile(j % W + 0, (j / W) | 0)) { pit = [i % W, (i / W) | 0, dx, dz]; break; } }
      if (pit) { t.teleport(pit[0] + pit[2], pit[1] + pit[3]); t.keys(pit[2] > 0 ? 'l' : pit[2] < 0 ? 'r' : pit[3] > 0 ? 'u' : 'd'); step(60, () => t.setTemp(37, 34)); t.keys(''); const inPit = t.snapshot().pit >= 0; t.setTemp(27.5, 24); step(80, () => t.setTemp(27.5, 24)); const h2 = t.thermo(); res.pit = { inPit, kind: h2.down && h2.down.kind, ph: h2.down && h2.down.ph }; }
      return res; });
    ok('倒下过程（跪下 → 侧倒）不响应方向键', r.noInput, '');
    ok('在梯子上到重度：先滑到梯子底，回到本层，在小厅里倒下（躺不下就靠墙坐倒）', r.slide && r.ladder.state === 'run' && r.ladder.mode === 'top' && r.ladder.level === 0 && (r.ladder.down === 'lie' || r.ladder.down === 'slump') && r.ladder.ph === 'lie' && (r.ladder.room === 2 || r.ladder.room === 3), JSON.stringify(r.ladder));
    ok('在浅坑里到重度：蜷在坑底', r.pit && r.pit.inPit && r.pit.kind === 'curl', JSON.stringify(r.pit));
    await done(p); }

  // 5. 爬：约走路的 30%，不进矿坑；时间窗用完没被救 → 失温结束（约 3.5 s，失去控制），死因"失温"
  { const p = await open('&n=-120');
    const r = await p.evaluate(async () => { const { t, step, corridor } = window.__L; t.start(); t.god(false); const [cx, cz] = corridor(3); t.teleport(cx, cz); t.rot(0); t.setTemp(27.5, 24); step(70, () => t.setTemp(27.5, 24));
      const D = t.thermo().down, x0 = t.snapshot().x, z0 = t.snapshot().z; const dir = Math.abs(Math.cos(D.ang)) > 0.5 ? (Math.cos(D.ang) > 0 ? 'r' : 'l') : (Math.sin(D.ang) > 0 ? 'd' : 'u');
      t.keys(dir); step(30, () => t.setTemp(27.5, 24)); t.keys(''); const moved = Math.hypot(t.snapshot().x - x0, t.snapshot().z - z0) * 2;
      const w0 = t.thermo().down.win; let dieAt = -1, overAt = -1; for (let i = 0; i < 60 * 12; i++) { t.setTemp(27.5, 24); t.advance(1 / 60); const h = t.thermo(); if (dieAt < 0 && h.die) dieAt = i / 60; if (t.snapshot().state === 'over') { overAt = i / 60; break; } }
      await new Promise(r => setTimeout(r, 1200)); const ec = document.querySelector('.egg-breach-ec'), tp = document.querySelector('.egg-breach-tp');
      return { moved, w0, winMax: D.winMax, dieAt, overAt, cause: ec && ec.textContent, tp: tp && tp.textContent }; });
    ok('躺着能爬，速度约为走路的 30%', r.moved > 1.0 && r.moved < 1.6, r.moved.toFixed(2) + ' 格/秒');
    ok('爬的时间窗用完没被救：进入失温结束过程', Math.abs(r.dieAt - r.w0) < 0.1, JSON.stringify(r));
    ok('失温结束约 3.5 s，死因"失温"；结算面板有最低体温', r.overAt - r.dieAt > 3 && r.overAt - r.dieAt < 4 && r.cause === '失温' && /^最低体温27\.\d°C$/.test(r.tp), JSON.stringify(r));
    await done(p); }

  // 6. 急救（地下水图）：躺着、身上没有一点水、还有火把 → Shift 取暖回到轻度 → 「Shift 爬起来」→ 起身、恢复操作；碰到水就中断 / 不能用
  for (const q of ['', '&egg-2d']) { const tag = q ? '（2D）' : '（3D）', p = await open('&n=-120' + q);
    const r = await p.evaluate(() => { const { t, step, corridor, base } = window.__L; t.start(); t.god(true); const [cx, cz] = corridor(4), b = base(), res = {};
      t.teleport(cx, cz); t.setTemp(27.5, 24); step(70, () => t.setTemp(27.5, 24)); const h0 = t.thermo(); res.act0 = h0.act;
      // 身上有水：不能用
      const c = t.pose().cell; t.waterAt(c.x, b + 1, c.z, 1); step(1, () => t.waterAt(c.x, b + 1, c.z, 1)); res.wetAct = t.thermo().act; t.clearFluid(c.x, b + 1, c.z); step(1); t.giveTorch();
      res.pressed = t.shift(); let readyAt = -1; for (let i = 0; i < 600; i++) { t.advance(1 / 60); const h = t.thermo(); if (h.act === 'stand') { readyAt = i / 60; break; } }
      const h1 = t.thermo(); res.after = { Tc: h1.Tc, torch: h1.torch, act: h1.act, win: h1.down && h1.down.win, w0: h0.down.win };
      res.standPressed = t.shift(); step(50); res.stood = t.thermo().down; const x0 = t.snapshot().x, z0 = t.snapshot().z; t.keys('r'); step(20); t.keys(''); res.moved = Math.hypot(t.snapshot().x - x0, t.snapshot().z - z0);
      res.readyAt = readyAt;
      // 碰到水：急救中断（火把被浇灭）
      t.giveTorch(); const [ix, iz] = corridor(7); t.teleport(ix, iz); t.setTemp(27.5, 24); step(70, () => t.setTemp(27.5, 24)); res.dbgI = t.thermo().act; res.started = t.shift(); step(10); const c2 = t.pose().cell; step(2, () => t.waterAt(c2.x, b + 1, c2.z, 1)); const h2 = t.thermo(); res.interrupt = { use: !!h2.use, torch: h2.torch };
      return res; });
    ok(`急救：躺着、身上没有水、有火把时可用（Shift）；身上有水时不能用${tag}`, r.act0 === 'torch' && r.wetAct === '' && r.pressed, JSON.stringify(r));
    ok(`急救把核心温度拉回轻度（期间爬的时间窗暂停），出现「爬起来」${tag}`, r.readyAt > 0 && r.after.Tc >= 32 && r.after.act === 'stand' && Math.abs(r.after.win - r.after.w0) < 0.2 && !r.after.torch, JSON.stringify(r.after));
    ok(`Shift 爬起来 → 起身，恢复操作${tag}`, r.standPressed && r.stood === null && r.moved > 0.5, JSON.stringify({ stood: r.stood, moved: r.moved }));
    ok(`急救中碰到水：火把被浇灭，中断${tag}`, r.started && !r.interrupt.use && !r.interrupt.torch, JSON.stringify([r.started, r.interrupt, r.dbgI]));
    await done(p); }
  // 墙上火把作为急救：躺在火把旁、没有水 → 慢慢回到轻度（时间窗暂停）
  { const p = await open('&n=-120');
    const r = await p.evaluate(() => { const { t, step, corridor, base } = window.__L; t.start(); t.god(true); const [cx, cz] = corridor(5), b = base(); t.teleport(cx, cz); t.setTemp(27.5, 24); step(70, () => t.setTemp(27.5, 24));
      const c = t.pose().cell; t.setBlock(c.x, b + 1, c.z === cz ? c.z : c.z, 0); t.setBlock(cx, b + 1, cz, 0); t.setBlock(c.hx, b + 1, c.hz, 7); const w0 = t.thermo().down.win; let readyAt = -1;
      for (let i = 0; i < 60 * 20; i++) { t.advance(1 / 60); const h = t.thermo(); if (h.down && h.down.ready) { readyAt = i / 60; break; } }
      return { readyAt, w0, w1: t.thermo().down && t.thermo().down.win, warm: t.thermo().warm }; });
    ok('墙上火把也能急救：躺在旁边慢慢回到轻度（比手里火把慢，时间窗暂停）', r.readyAt > 2 && Math.abs(r.w1 - r.w0) < 0.2, JSON.stringify(r)); await done(p); }

  // 7. 急救（岩浆图）：中暑倒下 → 爬进积水（这里直接在身下放 1 层水）→ 快速降温到轻度 → 爬起来
  { const p = await open('&n=120');
    const r = await p.evaluate(() => { const { t, step, corridor, base } = window.__L; t.start(); t.god(true); const [cx, cz] = corridor(1), b = base(); t.teleport(cx, cz); t.setTemp(40.8, 44); step(70, () => t.setTemp(40.8, 44));
      const D0 = t.thermo().down; const c = t.pose().cell; let readyAt = -1, minTc = 99; for (let i = 0; i < 60 * 15; i++) { t.waterAt(c.x, b + 1, c.z, 1); t.advance(1 / 60); const h = t.thermo(); minTc = Math.min(minTc, h.Tc); if (h.act === 'stand' && readyAt < 0) readyAt = i / 60; if (readyAt > 0 && i / 60 > readyAt + 8) break; }
      const pressed = t.shift(); step(50); return { kind: D0 && D0.kind, readyAt, minTc, pressed, down: t.thermo().down, rescue: true }; });
    ok('中暑倒下后躺进积水：几秒内降到轻度，可以爬起来；不会降到失温', r.kind && r.readyAt > 0 && r.readyAt < 10 && r.minTc > 36.4 && r.pressed && r.down === null, JSON.stringify(r)); await done(p); }

  // 8. 趴着溺水又失温：两种结束效果叠加；死因"溺水 · 失温"
  { const p = await open('&n=-120');
    const r = await p.evaluate(async () => { const { t, step, corridor, base } = window.__L; t.start(); t.god(false); const [cx, cz] = corridor(6), b = base(); t.teleport(cx, cz); t.setTemp(27.5, 24); step(70, () => t.setTemp(27.5, 24));
      const c = t.pose().cell; t.setAir(3); let drownAt = -1, over = -1; for (let i = 0; i < 60 * 20; i++) { t.waterAt(c.hx, b + 1, c.hz, 4); t.setTemp(27, 23); t.advance(1 / 60); const s = t.snapshot(); if (drownAt < 0 && s.drown >= 0) drownAt = i / 60; if (s.state === 'over') { over = i / 60; break; } }
      const f = t.thermo().filter; await new Promise(r => setTimeout(r, 1200)); const ec = document.querySelector('.egg-breach-ec'); return { drownAt, over, cause: ec && ec.textContent, layer: t.thermo().layer, filter: f }; });
    ok('趴着时头所在格水深 ≥ 3 层就憋气，气泡用完溺水', r.drownAt > 0 && r.over > r.drownAt, JSON.stringify(r));
    ok('溺水与失温叠加：画面发灰 + 结霜，死因"溺水 · 失温"', r.cause === '溺水 · 失温' && r.layer === 'cold' && /saturate/.test(r.filter), JSON.stringify(r)); await done(p); }

  // 9. 窒息：头所在格因为流体凝固变成实心 → 立即窒息（死因"窒息"）；趴着时只有身体那格变实心 → 卡住爬不动（时间窗照走）；站着只有脚格变实心不窒息
  { const p = await open('&n=120');
    const r = await p.evaluate(async () => { const { t, step, corridor, base } = window.__L; t.start(); t.god(false); const [cx, cz] = corridor(2), b = base(); t.teleport(cx, cz); t.setTemp(40.8, 44); step(70, () => t.setTemp(40.8, 44));
      const c = t.pose().cell; t.waterAt(c.x, b + 1, c.z, 1); step(5, () => t.waterAt(c.x, b + 1, c.z, 1)); t.setBlock(c.hx, b + 1, c.hz, 5); step(1); const d1 = t.thermo().die;
      let over = -1; for (let i = 0; i < 60 * 6; i++) { t.advance(1 / 60); if (t.snapshot().state === 'over') { over = i / 60; break; } }
      await new Promise(r => setTimeout(r, 1200)); const ec = document.querySelector('.egg-breach-ec'); return { d1, over, cause: ec && ec.textContent }; });
    ok('趴在积水里、岩浆把水凝成石头盖住头：立即窒息，约 3.5 s 后结束，死因"窒息"', r.d1 && r.d1.kind === 'suff' && r.over > 3 && r.over < 4 && r.cause === '窒息', JSON.stringify(r)); await done(p); }
  { const p = await open('&n=120');
    const r = await p.evaluate(() => { const { t, step, corridor, base } = window.__L; t.start(); t.god(true); const [cx, cz] = corridor(2), b = base(); t.teleport(cx, cz); t.setTemp(40.8, 44); step(70, () => t.setTemp(40.8, 44));
      const D = t.thermo().down, c = t.pose().cell; t.setBlock(c.x, b + 1, c.z, 6); step(2, () => t.setTemp(40.8, 44)); const x0 = t.snapshot().x, z0 = t.snapshot().z, w0 = t.thermo().down.win;
      const dir = Math.abs(Math.cos(D.ang)) > 0.5 ? (Math.cos(D.ang) > 0 ? 'r' : 'l') : (Math.sin(D.ang) > 0 ? 'd' : 'u'); t.keys(dir); step(60, () => t.setTemp(40.8, 44)); t.keys('');
      const h = t.thermo(); const body = { stuck: h.stuck, moved: Math.hypot(t.snapshot().x - x0, t.snapshot().z - z0), die: h.die, winDrop: w0 - (h.down ? h.down.win : 0) };
      // 站着：脚格变实心不窒息；头格变实心立即窒息
      t.setBlock(c.x, b + 1, c.z, 0); t.setTemp(37, 34); step(5); t.shift(); step(50); const [sx, sz] = window.__L.corridor(4); t.teleport(sx, sz); step(5, () => t.setTemp(37, 34));
      t.setBlock(sx, b + 1, sz, 5); step(3, () => t.setTemp(37, 34)); const feet = t.thermo().die; t.setBlock(sx, b + 1, sz, 0); t.setBlock(sx, b + 2, sz, 5); step(2, () => t.setTemp(37, 34)); const head = t.thermo().die;
      return { body, feet, head }; });
    ok('趴着只有身体那格变实心：卡住爬不动，时间窗照走，不窒息', r.body.stuck && r.body.moved < 0.01 && !r.body.die && r.body.winDrop > 0.8, JSON.stringify(r.body));
    ok('站着：只有脚格凝固不窒息；头格凝固立即窒息', !r.feet && r.head && r.head.kind === 'suff', JSON.stringify(r)); await done(p); }

  // 10. 触屏动作按钮：只在触屏操作区可见时出现；在不管移动的那只手旁边（与摇杆相对的一侧），不压住摇杆，在视口内；按下 = Shift
  for (const [vp, side] of [[{ width: 390, height: 844 }, 'left'], [{ width: 390, height: 844 }, 'right'], [{ width: 844, height: 390 }, 'left'], [{ width: 844, height: 390 }, 'right']]) {
    const p = await open('&n=-120', { viewport: vp, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    const r = await p.evaluate(async (side) => { const { t, step } = window.__L; if (side === 'right') document.querySelector('.egg-breach-side').click(); await new Promise(r => setTimeout(r, 100));
      t.start(); t.god(true); step(2, () => t.setTemp(37, 34)); const hidden0 = t.placeAct(); step(2, () => t.setTemp(30, 24)); const a = t.placeAct(), j = document.querySelector('.egg-breach-joy').getBoundingClientRect().toJSON();
      const btn = document.querySelector('.egg-breach-act'), label = btn.textContent; btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 5, pointerType: 'touch' })); const used = !!t.thermo().use;
      return { hidden0, a, j, vw: innerWidth, vh: innerHeight, label, used }; }, side);
    const tag = `${vp.width}×${vp.height} 操作区在${side === 'left' ? '左' : '右'}`, a = r.a, j = r.j;
    const overlap = a && !(a.right <= j.left || a.left >= j.right || a.bottom <= j.top || a.top >= j.bottom);
    const opposite = a && (side === 'left' ? a.left + a.width / 2 > r.vw / 2 : a.left + a.width / 2 < r.vw / 2);
    ok(`动作按钮 ${tag}：中度失温时出现「用火把取暖」，在摇杆另一侧、不压住摇杆、在视口内；按下即取暖`, r.hidden0 === null && a && !overlap && opposite && a.left >= 0 && a.top >= 0 && a.right <= r.vw && a.bottom <= r.vh && r.label === '用火把取暖' && r.used, JSON.stringify(r));
    await done(p); }
  // 触屏：火把灭着、够得着墙上火把时，动作按钮写「取火」，按住约 1.5 s 点着；松开 / 手指移开中断
  { const p = await open('&n=-120', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    const r = await p.evaluate(() => { const { t, step, corridor, base } = window.__L; t.start(); t.god(true); t.thermoOn(false); t.level(t.maze().levels.length - 1); const [cx, cz] = corridor(3), b = base(), btn = document.querySelector('.egg-breach-act'), res = {};
      const ev = (n) => btn.dispatchEvent(new PointerEvent(n, { bubbles: true, cancelable: true, pointerId: 5, pointerType: 'touch' }));
      const arrive = () => { t.teleport(cx - 1, cz); t.setBlock(cx + 1, b + 1, cz, 7); t.clearFluid(cx - 1, b + 1, cz); t.clearFluid(cx, b + 1, cz); t.setTorch(false); step(2); t.keys('r'); let n = 0; while (t.thermo().act !== 'relight' && n++ < 200) step(1); t.keys(''); step(3); };
      arrive(); res.label = t.actLabel(); ev('pointerdown'); step(40); const p1 = t.relight(); ev('pointerup'); step(2); res.release = { p1: p1 && p1.t, p2: t.relight(), torch: t.thermo().torch };
      arrive(); ev('pointerdown'); step(150); res.lit = t.thermo().torch; ev('pointerup'); return res; });
    ok('触屏：动作按钮写「取火」，按住约 1.5 s 点着，松开中断', r.label === '取火' && r.release.p1 > 0.4 && r.release.p2 === null && !r.release.torch && r.lit === true, JSON.stringify(r));
    await done(p); }
  // 横屏全屏（宿主的全屏路径）：按钮在另一侧的边距里，避开宿主右上角的按钮区
  for (const side of ['left', 'right']) {
    const c = await b.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }); const p = await c.newPage(); const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    await p.goto(BASE + '/tools/eggs/harness.html?egg-test&egg-sync'); await p.waitForSelector('#game option', { state: 'attached' }); await p.selectOption('#game', '08-breach.js'); await p.fill('#n', '-120'); await p.click('#mount');
    await p.waitForFunction(() => { const r = document.querySelector('#root'); return r.__eggTest && r.__eggTest.ready(); }, null, { timeout: 90000 });
    await p.click('.egg-fsb'); await p.waitForFunction(() => document.querySelector('#root').classList.contains('egg-fs')); await p.waitForTimeout(300);
    const r = await p.evaluate(async (side) => { if (side === 'right') document.querySelector('.egg-breach-side').click(); await new Promise(r => setTimeout(r, 150));
      const t = document.querySelector('#root').__eggTest; t.start(); t.god(true); for (let i = 0; i < 3; i++) { t.setTemp(30, 24); t.advance(1 / 60); }
      const a = t.placeAct(), st = document.querySelector('.egg-breach-stage').getBoundingClientRect().toJSON(), hb = document.querySelector('.egg-fs-on .egg-head').getBoundingClientRect().toJSON(), j = document.querySelector('.egg-breach-joy').getBoundingClientRect().toJSON();
      return { a, st, hb, j, vw: innerWidth, vh: innerHeight }; }, side);
    const a = r.a, inMargin = a && (side === 'left' ? a.left >= r.st.right : a.right <= r.st.left), clearHost = a && !(a.left < r.hb.right && a.right > r.hb.left && a.top < r.hb.bottom && a.bottom > r.hb.top);
    ok(`横屏全屏 操作区在${side === 'left' ? '左' : '右'}：动作按钮在另一侧的边距里、避开宿主右上角按钮、在视口内`, inMargin && clearHost && a.bottom <= r.vh && a.right <= r.vw && a.left >= 0, JSON.stringify(r));
    if (errs.length) ok('无报错', false, errs.join(' | ')); await c.close(); }
  // 桌面：没有触屏操作区时不出现按钮，HUD 写「Shift 用火把取暖」（这里只检查按钮不出现）
  { const p = await open('&n=-120');
    const r = await p.evaluate(() => { const { t, step } = window.__L; t.start(); t.god(true); step(2, () => t.setTemp(30, 24)); return { act: t.thermo().act, btn: t.placeAct() }; });
    ok('桌面：没有触屏操作区时不出现动作按钮（用 Shift）', r.act === 'torch' && r.btn === null, JSON.stringify(r)); await done(p); }

  console.log(`\n${pass} passed, ${fail} failed`);
  await b.close(); process.exit(fail ? 1 : 0);
})();
