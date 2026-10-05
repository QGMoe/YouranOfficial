// 坑底渲染（不透出背景）；相邻浅坑坑底照常走路；深坑抓握条：到时间掉到下一层；及时爬出不掉；掉落后层数 / 位置 / 下层流体状态延续；掉进流体的伤害或溺水；自动驾驶“掉下去再爬回来”通关
// 在仓库根目录起静态服务器（例如 python3 -m http.server 8137），再运行：node tools/eggs/breach/test/pit.test.cjs（需要 playwright；BASE 可改服务器地址）
const { chromium } = require('playwright');
let pass = 0, fail = 0;
const ok = (name, c, info) => { console.log(c ? 'ok  ' : 'FAIL', name, info || ''); c ? pass++ : fail++; };
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const open = async (q) => {
    const p = await b.newPage({ viewport: { width: 1000, height: 800 } }); const errs = [];
    p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
    await p.goto((process.env.BASE || 'http://localhost:8137') + '/tools/eggs/breach/harness.html?egg-test&egg-sync' + q); await p.waitForFunction(() => window.__ready);
    await p.waitForFunction(() => document.querySelector('#root').__eggTest.ready(), null, { timeout: 90000 });
    p.errs = errs; return p;
  };
  // 走进深坑：传送到深坑旁边的巷道格，朝深坑走直到扒住坑沿
  // hit：掉进深坑后用什么接住坑沿（'space' 在画布上按空格、'tap' 点画面、'none' 不操作 → 超时掉下去）；返回时 s 为接住后（或 QTE 结束时）的状态
  const ENTER = async ({ god, hit = 'space' }) => { const t = document.querySelector('#root').__eggTest; t.god(god); t.start(); const M = t.maze(), W = M.W, dp = t.deepPits()[0];
    const cv = document.querySelector('#root canvas.egg-breach-main'), press = () => { if (hit === 'space') cv.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })); else if (hit === 'tap') cv.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 3 })); };
    t.setLevel(dp.level); const lv = M.levels[dp.level]; let from = null, key = '';
    for (const [dx, dz, k] of [[1, 0, 'l'], [-1, 0, 'r'], [0, 1, 'u'], [0, -1, 'd']]) { const i = (dp.z + dz) * W + dp.x + dx; if (lv.t[i] && !lv.pit[i] && !t.blocked(dp.x + dx + .5, dp.z + dz + .5)) { from = [dp.x + dx, dp.z + dz]; key = k; break; } }
    t.teleport(from[0], from[1]); t.keys(key); let s, sawQte = 0; for (let i = 0; i < 120; i++) { t.advance(1 / 60); s = t.snapshot(); if (s.qte > 0) { sawQte = s.qteMax; t.keys(''); if (!s.anim) press(); } if (s.grip >= 0 && !s.anim) break; if (hit === 'none' && sawQte && s.qte <= 0) break; if (hit === 'pad' && s.qte > 0 && !s.anim) break; } t.keys('');
    return { dp, from, key, s, sawQte, back: { l: 'r', r: 'l', u: 'd', d: 'u' }[key] }; };
  // 坑底必须画出来（不能透出清屏背景色）：浅坑（坑底干的 / 灌了岩浆）、深坑（向下能看到下层地面）。统计画面中央区域里与背景色相同的像素
  const BGCOUNT = () => { const cv = document.querySelector('#root canvas.egg-breach-main'), c2 = document.createElement('canvas'); c2.width = cv.width; c2.height = cv.height; const g = c2.getContext('2d'); g.drawImage(cv, 0, 0);
    const d = g.getImageData(0, 0, c2.width, c2.height).data, BG = [204, 194, 179]; let nbg = 0;
    for (let y = Math.floor(c2.height * 0.3); y < c2.height * 0.7; y++) for (let x = Math.floor(c2.width * 0.3); x < c2.width * 0.7; x++) { const o = (y * c2.width + x) * 4; if (Math.abs(d[o] - BG[0]) < 8 && Math.abs(d[o + 1] - BG[1]) < 8 && Math.abs(d[o + 2] - BG[2]) < 8) nbg++; }
    return nbg; };
  { const p = await open('&n=328&theme=light');
    const r = await p.evaluate((src) => { const BGC = new Function('return (' + src + ')()'); const t = document.querySelector('#root').__eggTest, M = t.maze(), lv = M.levels[0], W = M.W;
      let pick = -1; for (let i = W * 2; i < lv.t.length - 2 * W; i++) if (lv.pit[i] === 1 && lv.pit[i + 1] === 1 && lv.t[i - 1] === 1 && !lv.pit[i - 1] && !lv.puddle[i - 1]) { pick = i; break; }
      t.start(); t.god(true); const x = pick % W, z = (pick / W) | 0; t.teleport(x - 1, z); t.keys('r'); for (let k = 0; k < 30; k++) t.advance(1 / 60); t.keys('');
      const dry = BGC(); t.flood(x + 1, z, 0); for (let k = 0; k < 3; k++) t.advance(1 / 60); const wet = BGC(); return { pick, dry, wet, s: t.snapshot() }; }, BGCOUNT.toString());
    ok('浅坑坑底画出来了（干坑，中央区域背景色像素 < 40）', r.pick >= 0 && r.s.pit >= 0 && r.dry < 40, `坑 ${r.pick}，背景色像素 ${r.dry}`);
    ok('浅坑灌了岩浆时坑底也画出来了', r.wet < 40, `背景色像素 ${r.wet}`);
    if (p.errs.length) ok('坑底测试无报错', false, p.errs.join(' | ')); await p.close(); }
  { const p = await open('&n=100&theme=light');
    await p.evaluate(ENTER, { god: true });
    const nbg = await p.evaluate((src) => { const t = document.querySelector('#root').__eggTest; t.advance(1 / 60); return new Function('return (' + src + ')()')(); }, BGCOUNT.toString());
    ok('深坑：扒在坑沿时坑里与下层地面都画出来了', nbg < 40, `背景色像素 ${nbg}`); await p.close(); }
  // 相邻浅坑连成一片：坑底照常走路摆臂，不再一格一格地跳；只有掉进去与爬出来两段动画；实际用时不超过预跑路线模型的估计
  for (const n of ['200', '96']) {
    const p = await open('&n=' + n);
    const r = await p.evaluate(() => { const t = document.querySelector('#root').__eggTest, M = t.maze(), W = M.W; let found = null;
      M.levels.forEach((lv, L) => { if (found) return; for (let i = W; i < lv.t.length - W; i++) if (lv.pit[i] === 1 && lv.pit[i + 1] === 1 && lv.pit[i + 2] === 1 && lv.t[i - 1] === 1 && !lv.pit[i - 1] && !lv.puddle[i - 1] && lv.t[i + 3] && !lv.pit[i + 3] && !lv.chest[i + 3]) { found = { L, i }; break; } });
      if (!found) return null; t.god(true); t.start(); t.setLevel(found.L); const x = found.i % W, z = (found.i / W) | 0; t.teleport(x - 1, z); t.keys('r');
      const log = []; for (let k = 0; k < 60 * 8; k++) { t.advance(1 / 60); const s = t.snapshot(); log.push({ x: s.x, anim: s.anim, sw: s.sw, pit: s.pit }); if (s.x >= x + 3.5 && s.pit < 0 && !s.anim) break; } t.keys('');
      let seg = 0; for (let k = 1; k < log.length; k++) if (log[k].anim && !log[k - 1].anim) seg++;
      const mv = log.filter((r, k) => k && r.pit >= 0 && !r.anim && r.x - log[k - 1].x > 0.03), mono = log.every((r, k) => !k || r.x >= log[k - 1].x - 1e-6);
      const model = 4 / 4.3 + 0.18 + M.D.climb + 0.3;
      return { seg, swMove: mv.reduce((a, r) => a + r.sw, 0) / Math.max(1, mv.length), nMove: mv.length, mono, t: log.length / 60, model, done: log[log.length - 1].pit < 0 }; });
    ok(`n=${n} 走过一排 3 个相邻浅坑：只有掉进与爬出两段动画`, r && r.done && r.seg === 2, JSON.stringify(r));
    ok(`n=${n} 坑底照常走路摆臂、一路向前不回跳`, r && r.nMove >= 8 && r.swMove > 0.6 && r.mono, r && `摆幅 ${r.swMove.toFixed(2)}，移动帧 ${r.nMove}`);
    ok(`n=${n} 实际用时不超过预跑路线模型（+0.3 s）`, r && r.t <= r.model + 0.3, r && `${r.t.toFixed(2)} s / 模型 ${r.model.toFixed(2)} s`);
    await p.close();
  }
  // 深坑 QTE：空格 / 点画面接住 → 抓握；不操作 → 超时直接掉到下一层；方向键与方向按钮不算；空格不滚动页面；2D 同样可用
  for (const q of ['', '&egg-2d']) {
    const tag = q ? '（2D）' : '（3D）';
    { const p = await open('&n=100' + q); const r = await p.evaluate(ENTER, { god: true, hit: 'space' });
      ok(`深坑 QTE：按空格接住 → 扒住坑沿、出现抓握条${tag}`, r.sawQte > 0 && r.s.grip > 0 && r.s.qte < 0 && r.s.drops === 0, JSON.stringify({ qte: r.sawQte, grip: r.s.grip }));
      if (p.errs.length) ok('QTE 无报错', false, p.errs.join(' | ')); await p.close(); }
    { const p = await open('&n=100' + q); const r = await p.evaluate(ENTER, { god: true, hit: 'tap' });
      ok(`深坑 QTE：点一下画面接住${tag}`, r.s.grip > 0 && r.s.drops === 0); await p.close(); }
    { const p = await open('&n=100' + q); const r0 = await p.evaluate(ENTER, { god: true, hit: 'none' });
      const r = await p.evaluate(() => { const t = document.querySelector('#root').__eggTest; let s; for (let i = 0; i < 60 * 3; i++) { t.advance(1 / 60); s = t.snapshot(); if (s.drops && !s.fading && !s.anim) break; } return s; });
      ok(`深坑 QTE：不操作 → 超时（${r0.sawQte} s）后直接掉到下一层${tag}`, r.drops === 1 && r.level === r0.dp.level - 1 && r0.s.grip < 0, JSON.stringify({ drops: r.drops, level: r.level })); await p.close(); }
  }
  { const p = await open('&n=100');
    const r = await p.evaluate((src) => { const ENTERf = new Function('return (' + src + ')')(); document.body.style.minHeight = '4000px'; window.scrollTo(0, 0); const t = document.querySelector('#root').__eggTest, cv = document.querySelector('#root canvas.egg-breach-main');
      // 进入 QTE（不操作），然后依次：方向键、方向按钮——都不应接住
      const r0 = ENTERf({ god: true, hit: 'pad' }); cv.focus();
      const s0 = t.snapshot(); cv.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true })); cv.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowUp', bubbles: true }));
      document.querySelector('.egg-breach-pad [data-d=u]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 5 })); document.querySelector('.egg-breach-pad [data-d=u]').dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 5 }));
      const s1 = t.snapshot();
      const ev = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }); cv.dispatchEvent(ev);
      const s2 = t.snapshot();
      return { inQte: s0.qte > 0, notByArrows: s1.qte > 0 && s1.grip < 0, caught: s2.grip > 0, prevented: ev.defaultPrevented }; }, ENTER.toString());
    ok('深坑 QTE：方向键与方向按钮不算接住', r.inQte && r.notByArrows, JSON.stringify(r));
    ok('深坑 QTE：空格接住且阻止了默认行为（不滚动页面）', r.caught && r.prevented, JSON.stringify(r));
    const sy0 = await p.evaluate(() => { document.querySelector('#root canvas.egg-breach-main').focus({ preventScroll: true }); return window.scrollY; });
    await p.keyboard.press('Space'); const sy = await p.evaluate(() => window.scrollY);
    ok('游戏进行中画布有焦点时按空格不滚动页面', sy === sy0, `scrollY ${sy0} → ${sy}`);
    await p.close(); }
  // 2D：相邻浅坑连成一片——两格交界处（原来留着地面缝和坑沿）现在是坑底颜色，与坑中心一样
  { const p = await open('&n=200&egg-2d&theme=light');
    const r = await p.evaluate(() => { const t = document.querySelector('#root').__eggTest, M = t.maze(), W = M.W, lv = M.levels[0]; t.god(true); t.start();
      let f = -1; for (let i = W; i < lv.t.length - W; i++) if (lv.pit[i] === 1 && lv.pit[i + 1] === 1 && lv.t[i - W] + lv.t[i + W] > 0) { f = i; break; }   // 两格东西相邻的浅坑（南北至少一侧能站）
      const fx = f % W, fz = (f / W) | 0; let tx = fx, tz = fz - 1; if (!lv.t[tz * W + tx] || lv.pit[tz * W + tx]) tz = fz + 1;
      t.teleport(tx, tz); t.frameLog(true); for (let i = 0; i < 30; i++) t.advance(1 / 60); const L = t.frameLog(false), cpx = L[L.length - 1][1], cpz = L[L.length - 1][2];
      const src = document.querySelector('#root canvas.egg-breach-main'), cv = document.createElement('canvas'); cv.width = src.width; cv.height = src.height; const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(src, 0, 0);
      const k = cv.width / 320, at = (x, y) => Array.from(g.getImageData(Math.floor(x * k), Math.floor(y * k), 1, 1).data.slice(0, 3));
      const x0 = (fx + 1) * 16 - cpx, y0 = fz * 16 - cpz;   // 第 1、2 格的交界（x0），取格子中下部（避开北边坑沿）
      return { seam: at(x0, y0 + 10), seamL: at(x0 - 1, y0 + 10), mid: at(x0 - 8, y0 + 10), floor: at((tx * 16 - cpx) + 8, (tz * 16 - cpz) + 8) }; });
    const d = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
    ok('2D：相邻浅坑交界处是坑底颜色（不是地面或坑沿）', d(r.seam, r.mid) < 10 && d(r.seamL, r.mid) < 10 && d(r.seam, r.floor) > 30, JSON.stringify(r));
    if (p.errs.length) ok('2D 浅坑无报错', false, p.errs.join(' | ')); await p.close(); }
  for (const n of ['100', '-100']) {
    // 1) 不操作：抓握条用完 → 掉到下一层同一格
    { const p = await open('&n=' + n);
      const r0 = await p.evaluate(ENTER, { god: false });
      ok(`n=${n} 走进深坑后扒住坑沿、出现抓握条`, r0.s.grip > 0 && r0.s.pit >= 0, JSON.stringify(r0.s && { grip: r0.s.grip, gripMax: r0.s.gripMax, level: r0.s.level }));
      const r = await p.evaluate(async (dp) => { const t = document.querySelector('#root').__eggTest; t.simFull(400); const before = t.fluidCells(dp.level - 1), tick0 = t.snapshot().tick, hp0 = t.hpAir().hp; let s;
        for (let i = 0; i < 60 * 8; i++) { t.advance(1 / 60); s = t.snapshot(); if (s.drops && !s.fading && !s.anim) break; }
        return { s, before, after: t.fluidCells(dp.level - 1), tick0, hp0, hp: t.hpAir().hp, blocked: t.blocked(s.x, s.z) }; }, r0.dp);
      ok(`n=${n} 抓握条用完后掉到下一层`, r.s.drops === 1 && r.s.level === r0.dp.level - 1, `层 ${r0.dp.level + 1}→${r.s.level + 1}`);
      ok(`n=${n} 落点在深坑正下方、可站立`, Math.floor(r.s.x) === r0.dp.x && Math.floor(r.s.z) === r0.dp.z && !r.blocked && r.s.pit === -1, JSON.stringify([r.s.x, r.s.z]));
      ok(`n=${n} 掉落少量伤害且不致死`, r.hp < r.hp0 && r.hp0 - r.hp <= 3.01 && r.hp > 0 && r.s.state === 'run', `${r.hp0.toFixed(1)}→${r.hp.toFixed(1)}`);
      ok(`n=${n} 下层世界继续模拟（流体格数与刻数延续，没有重置）`, r.after >= r.before && r.s.tick >= r.tick0, `流体格 ${r.before}→${r.after}，刻 ${r.tick0}→${r.s.tick}`);
      ok(`n=${n} 无报错`, p.errs.length === 0, p.errs.join(' | ')); await p.close(); }
    // 2) 及时朝出口方向长按：爬出，不掉
    { const p = await open('&n=' + n);
      const r0 = await p.evaluate(ENTER, { god: true });
      const r = await p.evaluate(async (k) => { const t = document.querySelector('#root').__eggTest; t.keys(k); let s; for (let i = 0; i < 60 * 6; i++) { t.advance(1 / 60); s = t.snapshot(); if (s.pit === -1 && !s.anim) break; } t.keys(''); return s; }, r0.back);
      ok(`n=${n} 抓握条用完前长按爬出，不会掉下去`, r.pit === -1 && r.drops === 0 && r.level === r0.dp.level && r.grip < 0, JSON.stringify({ level: r.level, drops: r.drops, grip: r.grip }));
      await p.close(); }
    // 3) 下层落点被流体淹没：岩浆按层数扣血 / 水按没顶溺水
    { const p = await open('&n=' + n);
      const r0 = await p.evaluate(ENTER, { god: false });
      const r = await p.evaluate(async ({ dp, neg }) => { const t = document.querySelector('#root').__eggTest; const okF = t.flood(dp.x, dp.z, dp.level - 1); let s;
        for (let i = 0; i < 60 * 8; i++) { t.advance(1 / 60); s = t.snapshot(); if (s.drops && !s.fading && !s.anim) break; }
        const a0 = t.hpAir(); for (let i = 0; i < 60 * 2; i++) { t.flood(dp.x, dp.z, dp.level - 1); t.advance(1 / 60); } const a1 = t.hpAir(); return { okF, s, a0, a1 }; }, { dp: r0.dp, neg: n[0] === '-' });
      if (n[0] === '-') ok(`n=${n} 掉进没顶的水：气泡减少（溺水规则）`, r.okF && r.a1.air < r.a0.air, `air ${r.a0.air.toFixed(2)}→${r.a1.air.toFixed(2)}`);
      else ok(`n=${n} 掉进岩浆：按层数持续扣血`, r.okF && r.a1.hp < r.a0.hp, `hp ${r.a0.hp.toFixed(2)}→${r.a1.hp.toFixed(2)}`);
      await p.close(); }
    // 4) 自动驾驶：故意掉下去，再自己爬回来通关
    { const p = await open('&n=' + n);
      const r0 = await p.evaluate(ENTER, { god: true });
      await p.evaluate(() => { const t = document.querySelector('#root').__eggTest; for (let i = 0; i < 60 * 8; i++) { t.advance(1 / 60); const s = t.snapshot(); if (s.drops && !s.fading && !s.anim) break; } t.autopilot(true); });
      let s; for (let k = 0; k < 90; k++) { s = await p.evaluate(() => { const t = document.querySelector('#root').__eggTest; for (let i = 0; i < 120; i++) t.advance(1 / 60); return t.snapshot(); }); if (s.state === 'over') break; }
      ok(`n=${n} 自动驾驶：掉下去后爬回来并通关`, s.state === 'over' && s.mode === 'end' && s.drops === 1 && s.viol === 0, `${s.state}/${s.mode} drops=${s.drops} t=${s.t.toFixed(1)}s viol=${s.viol}`);
      await p.close(); }
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  await b.close(); process.exit(fail ? 1 : 0);
})();
