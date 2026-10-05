// 结算面板：胜利/失败 × 有无新纪录、按钮与焦点、href 为 null 时隐藏"下一张图"、减少动态时立即出现、窄屏不溢出、结束时按住的方向键不会重开
// 在仓库根目录起静态服务器（例如 python3 -m http.server 8137），再运行：node tools/eggs/breach/test/end.test.cjs（需要 playwright；BASE 可改服务器地址）
const { chromium } = require('playwright');
let pass = 0, fail = 0;
const ok = (name, c, info) => { console.log(c ? 'ok  ' : 'FAIL', name, info || ''); c ? pass++ : fail++; };
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const open = async (q, vp, rm) => {
    const p = await b.newPage({ viewport: vp || { width: 900, height: 900 }, reducedMotion: rm ? 'reduce' : 'no-preference' }); const errs = [];
    p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
    await p.goto((process.env.BASE || 'http://localhost:8137') + '/tools/eggs/breach/harness.html?egg-test&egg-sync' + q); await p.waitForFunction(() => window.__ready);
    await p.waitForFunction(() => document.querySelector('#root').__eggTest.ready(), null, { timeout: 90000 });
    p.errs = errs; return p;
  };
  // 在页面里跑一局：win=true 用自动驾驶 sec 秒后直接通关；win=false 让流体追着玩家灌，直到死亡
  const play = (p, win, sec) => p.evaluate(({ win, sec }) => {
    const t = document.querySelector('#root').__eggTest, step = (n) => { for (let i = 0; i < n; i++) t.advance(1 / 60); };
    t.start();
    if (win) { t.god(true); t.autopilot(true); step(Math.round(sec * 60)); t.win(); step(90); }
    else { t.god(false); t.autopilot(true); step(240); t.autopilot(false); t.simFull(600);
      for (let i = 0; i < 60 * 60; i++) { const s = t.snapshot(); if (s.state === 'over') break; if (i % 6 === 0) t.flood(Math.floor(s.x), Math.floor(s.z), s.level); t.advance(1 / 60); } step(30); }
    return t.snapshot().state;
  }, { win, sec });
  const panel = (p, wait) => p.evaluate(async (wait) => {
    const t0 = performance.now(); const e = document.querySelector('.egg-breach-end');
    while (wait && !e.classList.contains('on') && performance.now() - t0 < wait) await new Promise(r => setTimeout(r, 20));
    const q = (s) => e.querySelector(s), nx = q('[data-a=next]'), ag = q('[data-a=again]');
    return { shown: !e.hidden && e.classList.contains('on'), ms: performance.now() - t0, title: q('.egg-breach-et') && q('.egg-breach-et').textContent, cause: q('.egg-breach-ec') && q('.egg-breach-ec').textContent,
      rec: !!q('.egg-breach-nr'), stats: e.querySelectorAll('.egg-breach-st > div').length, temp: q('.egg-breach-tp') && q('.egg-breach-tp').textContent, ver: q('.egg-breach-ev') && q('.egg-breach-ev').textContent,
      nextHidden: !nx || nx.hidden || nx.getBoundingClientRect().width === 0, href: nx && nx.getAttribute('href'), againTag: ag && ag.tagName, nextTag: nx && nx.tagName,
      primary: (e.querySelector('.primary') || {}).textContent, focus: document.activeElement && document.activeElement.textContent,
      over: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      clip: [...e.querySelectorAll('*')].some(x => x.scrollWidth > x.clientWidth + 1 && getComputedStyle(x).overflow !== 'visible') || e.scrollWidth > e.clientWidth + 1 };
  }, wait);

  // 1. 首次胜利：新纪录，主按钮"下一张图"并获得焦点
  let p = await open('&n=29');
  ok('首次胜利进入结算', await play(p, true, 5) === 'over');
  let r = await panel(p, 5000);
  ok('胜利面板出现（标题/原因）', r.shown && r.title === '逃出生天' && r.cause === '回到地面', JSON.stringify(r));
  ok('胜利面板淡入有延迟', r.ms > 200, r.ms.toFixed(0) + 'ms');
  ok('首次胜利显示新纪录', r.rec);
  ok('统计 7 项（含挖到奇怪的石头、最低 / 最高体温）、版本与难度行', r.stats === 7 && /^(最低|最高)体温\d+\.\d°C$/.test(r.temp) && /^v29 · 难度 \d+ \/ \d+ · 3D$/.test(r.ver), r.ver + ' ' + r.temp);
  ok('"再来一次"是 button、"下一张图"是带 href 的链接', r.againTag === 'BUTTON' && r.nextTag === 'A' && r.href === '/v37', r.href);
  ok('胜利时主按钮是"下一张图"且获得焦点', r.primary === '下一张图' && r.focus === '下一张图', r.focus);
  // 2. 键盘"再来一次"（同一张图），较慢地再赢一次：无新纪录
  const seed0 = await p.evaluate(() => JSON.stringify(document.querySelector('#root').__eggTest.maze().levels[0].t.slice(0, 200)));
  await p.focus('.egg-breach-end [data-a=again]'); await p.keyboard.press('Enter');
  r = await panel(p, 0);
  const same = await p.evaluate(() => JSON.stringify(document.querySelector('#root').__eggTest.maze().levels[0].t.slice(0, 200)));
  ok('键盘回车"再来一次"关闭面板、同一张图', !r.shown && same === seed0 && await p.evaluate(() => document.querySelector('#root').__eggTest.snapshot().state) !== 'over');
  await play(p, true, 9); r = await panel(p, 5000);
  ok('较慢的胜利不显示新纪录', r.shown && r.title === '逃出生天' && !r.rec, JSON.stringify(r));
  // 3. 有纪录时失败：标题、死因、主按钮"再来一次"，不显示新纪录
  await p.click('.egg-breach-end [data-a=again]');
  ok('失败进入结算', await play(p, false) === 'over');
  r = await panel(p, 5000);
  ok('失败面板（标题/死因）', r.shown && r.title === '没能逃出' && r.cause === '被岩浆吞没', JSON.stringify(r));
  ok('失败时主按钮是"再来一次"且获得焦点、无新纪录', r.primary === '再来一次' && r.focus === '再来一次' && !r.rec, r.focus);
  ok('失败时"下一张图"仍可用', !r.nextHidden);
  if (p.errs.length) ok('n=29 无报错', false, p.errs.join(' | ')); await p.close();
  // 4. 没有纪录时失败（负数 = 水）：死因"溺水"
  p = await open('&n=-29'); await play(p, false); r = await panel(p, 5000);
  ok('无纪录时失败：死因溺水、最佳为 —', r.shown && r.cause === '溺水' && !r.rec && await p.evaluate(() => /最佳 —/.test(document.querySelector('.egg-breach-best').textContent)), JSON.stringify(r));
  if (p.errs.length) ok('n=-29 无报错', false, p.errs.join(' | ')); await p.close();
  // 5. href 为 null：隐藏"下一张图"，胜利时主按钮回到"再来一次"
  p = await open('&n=29&nohref'); await play(p, true, 5); r = await panel(p, 5000);
  ok('href 为 null 时隐藏"下一张图"', r.shown && r.nextHidden && r.primary === '再来一次' && r.focus === '再来一次', JSON.stringify(r));
  await p.close();
  // 6. 减少动态：立即出现；7. 360 / 390 宽不溢出
  p = await open('&n=29&rm'); await p.evaluate(() => { const t = document.querySelector('#root').__eggTest; t.start(); t.god(true); t.win(); for (let i = 0; i < 5; i++) t.advance(1 / 60); });
  r = await panel(p, 0); ok('减少动态时面板立即出现', r.shown, JSON.stringify(r)); await p.close();
  for (const w of [360, 390]) {
    p = await open('&n=29', { width: w, height: 900 }); await play(p, true, 5); r = await panel(p, 5000);
    ok(`${w} 宽胜利面板不溢出`, r.shown && r.over <= 0 && !r.clip, JSON.stringify({ over: r.over, clip: r.clip }));
    await p.close();
  }
  // 8. 结束时还按着的方向键 / 方向按钮：自动重复与未松开的再次按下都不开新局；松开后再按才开；面板按钮上的回车照常
  p = await open('&n=29');
  const st = () => p.evaluate(() => document.querySelector('#root').__eggTest.snapshot().state);
  const fire = (type, init, sel) => p.evaluate(({ type, init, sel }) => { const el = document.querySelector(sel); el.dispatchEvent(type.startsWith('pointer') ? new PointerEvent(type, Object.assign({ bubbles: true, pointerId: 7 }, init)) : new KeyboardEvent(type, Object.assign({ bubbles: true, cancelable: true }, init))); }, { type, init, sel });
  const winNow = () => p.evaluate(() => { const t = document.querySelector('#root').__eggTest; t.god(true); t.win(); for (let i = 0; i < 30; i++) t.advance(1 / 60); });
  await p.evaluate(() => document.querySelector('#root').__eggTest.start());
  await p.focus('#root canvas.egg-breach-main'); await p.keyboard.down('w'); await winNow();
  ok('按住 W 通关后进入结算', await st() === 'over');
  await fire('keydown', { key: 'w', repeat: true }, '#root canvas.egg-breach-main');
  ok('按住 W 的自动重复不会重开', await st() === 'over');
  await fire('keydown', { key: 'w', repeat: false }, '#root canvas.egg-breach-main');
  ok('没松开过的 W 再次按下（无 repeat 标记）也不会重开', await st() === 'over');
  await p.keyboard.up('w'); await p.focus('#root canvas.egg-breach-main'); await p.keyboard.down('w');
  ok('结束动画播完之前，松开后再按 W 也不开新局', await st() === 'over'); await p.keyboard.up('w');
  await fire('pointerdown', {}, '#root canvas.egg-breach-main');
  ok('结束动画播完之前，点画面不开新局', await st() === 'over');
  await panel(p, 5000); await p.focus('#root canvas.egg-breach-main'); await p.keyboard.down('w');
  ok('结算面板出现后，松开再按 W 开新局', await st() !== 'over'); await p.keyboard.up('w');
  // 方向按钮
  await p.evaluate(() => document.querySelector('#root').__eggTest.start());
  await fire('pointerdown', {}, '.egg-breach-pad [data-d=u]'); await winNow();
  await fire('pointerdown', {}, '.egg-breach-pad [data-d=u]');
  ok('按住方向按钮通关后，未松开再按不会重开', await st() === 'over');
  await fire('pointerup', {}, '.egg-breach-pad [data-d=u]'); await panel(p, 5000); await fire('pointerdown', {}, '.egg-breach-pad [data-d=u]');
  ok('松开方向按钮后再按开新局', await st() !== 'over'); await fire('pointerup', {}, '.egg-breach-pad [data-d=u]');
  // 面板按钮上的回车（按住 W 通关、尚未松开时也可用）
  await p.evaluate(() => document.querySelector('#root').__eggTest.start());
  await p.focus('#root canvas.egg-breach-main'); await p.keyboard.down('w'); await winNow(); await panel(p, 5000);
  await p.focus('.egg-breach-end [data-a=again]'); await p.keyboard.press('Enter');
  ok('结算面板"再来一次"上的回车照常开新局', await st() !== 'over'); await p.keyboard.up('w');
  if (p.errs.length) ok('按键测试无报错', false, p.errs.join(' | ')); await p.close();
  // 9. 出口序列：最后一段竖井近地面是泥土 / 草方块，地面以上是天空远景；爬出后先拉远镜头，结束后面板才出现（焦点在主按钮）
  for (const q of ['', '&egg-2d']) {
    p = await open('&n=29' + q);
    const px = await p.evaluate(() => { const t = document.querySelector('#root').__eggTest; t.god(true); t.start(); t.climbAt(t.maze().levels.length - 1, 0.9); t.advance(1 / 60);
      const cv = document.querySelector('#root canvas.egg-breach-main'), c2 = document.createElement('canvas'); c2.width = cv.width; c2.height = cv.height; const g = c2.getContext('2d'); g.drawImage(cv, 0, 0);
      const d = g.getImageData(0, 0, c2.width, c2.height).data, at = (fx, fy) => { const o = (Math.floor(fy * c2.height) * c2.width + Math.floor(fx * c2.width)) * 4; return [d[o], d[o + 1], d[o + 2]]; };
      let sky = 0, grass = 0, dirt = 0, n = 0;
      for (let fy = 0.02; fy < 0.98; fy += 0.02) for (let fx = 0.05; fx < 0.3; fx += 0.05) { const [r, gg, b] = at(fx, fy); n++; if (b > r + 30 && b > 120) sky++; else if (gg > r + 25 && gg > b + 25) grass++; else if (r > b + 25 && r > 60 && gg < r) dirt++; }
      return { sky, grass, dirt, n }; });
    ok(`最后一段竖井近地面：天空 / 草方块 / 泥土都在画面里${q ? '（2D）' : '（3D）'}`, px.sky > 5 && px.grass > 0 && px.dirt > 10, JSON.stringify(px));
    const seq = await p.evaluate(async () => { const t = document.querySelector('#root').__eggTest, e = document.querySelector('.egg-breach-end'); t.keys('u');
      for (let i = 0; i < 600; i++) { t.advance(1 / 60); if (t.snapshot().state === 'over') break; } t.keys('');
      const st = t.snapshot().state; for (let i = 0; i < 60; i++) t.advance(1 / 60); await new Promise(r => setTimeout(r, 50));
      const mid = !e.hidden || e.classList.contains('on');
      for (let i = 0; i < 100; i++) t.advance(1 / 60); await new Promise(r => setTimeout(r, 80));
      return { st, mid, end: !e.hidden && e.classList.contains('on'), focus: document.activeElement && document.activeElement.textContent }; });
    ok(`爬出后直接进入结局（不黑屏）${q ? '（2D）' : '（3D）'}`, seq.st === 'over');
    ok(`拉远镜头期间面板不出现、拉远结束后出现并聚焦主按钮${q ? '（2D）' : '（3D）'}`, !seq.mid && seq.end && seq.focus === '下一张图', JSON.stringify(seq));
    if (p.errs.length) ok('出口序列无报错', false, p.errs.join(' | ')); await p.close();
  }
  // 10. 计分（测试局默认不计分，这里用 scoring(true) 强制）：总分 + 评级 + 5 行系数；动画中按键只跳过、不开新局；流体落后 > 0.1 s 才显示提示行
  for (const [w, lag] of [[900, 0.05], [360, 0.237]]) {
    p = await open('&n=29', { width: w, height: 900 });
    const r = await p.evaluate(async (lag) => { const t = document.querySelector('#root').__eggTest, e = document.querySelector('.egg-breach-end'); t.scoring(true); t.start(); t.god(true);
      for (let i = 0; i < 60; i++) t.advance(1 / 60); t.setLag(lag); t.win(); for (let i = 0; i < 200; i++) t.advance(1 / 60);
      const t0 = performance.now(); while (!e.classList.contains('on') && performance.now() - t0 < 5000) await new Promise(r => setTimeout(r, 30));
      await new Promise(r => setTimeout(r, 120));
      const mid = { anim: e.classList.contains('anim'), score: e.querySelector('.egg-breach-score') && e.querySelector('.egg-breach-score').textContent };
      // 动画中按方向键 / 点画面：只跳过动画
      const cv = document.querySelector('#root canvas.egg-breach-main'); cv.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', bubbles: true, cancelable: true }));
      const after = { anim: e.classList.contains('anim'), st: t.snapshot().state, score: e.querySelector('.egg-breach-score').textContent, grade: e.querySelector('.egg-breach-grade').textContent,
        rows: [...e.querySelectorAll('.egg-breach-bri')].map(x => x.textContent), lag: (e.querySelector('.egg-breach-lag') || {}).textContent || '', nr: !!e.querySelector('.egg-breach-nr'),
        over: document.documentElement.scrollWidth - document.documentElement.clientWidth, focus: document.activeElement && document.activeElement.textContent };
      cv.dispatchEvent(new KeyboardEvent('keyup', { key: 'w', bubbles: true }));
      return { mid, after }; }, lag);
    ok(`计分面板：动画中按键只跳过动画、不开新局（${w} 宽）`, r.mid.anim && !r.after.anim && r.after.st === 'over', JSON.stringify({ mid: r.mid, st: r.after.st }));
    ok(`计分面板：总分（4 位分组）、评级、5 行系数、首次计分为新纪录（${w} 宽）`, /^[\d,]+$/.test(r.after.score) && r.after.score.length > 4 && /^[SABC]$/.test(r.after.grade) && r.after.rows.length === 5 && /难度/.test(r.after.rows[4]) && r.after.nr, JSON.stringify(r.after));
    ok(`流体落后提示行：${lag} s ${lag > 0.1 ? '显示' : '不显示'}（${w} 宽）`, lag > 0.1 ? r.after.lag === '流体最多落后 0.237 秒' : r.after.lag === '', r.after.lag);
    ok(`计分面板不溢出、跳过后焦点在主按钮（${w} 宽）`, r.after.over <= 0 && r.after.focus === '下一张图', JSON.stringify({ over: r.after.over, focus: r.after.focus }));
    if (p.errs.length) ok('计分面板无报错', false, p.errs.join(' | ')); await p.close();
  }
  // 11. 测试 / 调试局默认不计分；失败面板显示"挖到奇怪的石头"
  { p = await open('&n=29'); await play(p, true, 2); const r = await panel(p, 5000);
    const sc = await p.evaluate(() => !!document.querySelector('.egg-breach-score'));
    ok('调试局（自动驾驶 / 同步）不计分', r.shown && !sc); await p.close();
    p = await open('&n=29'); await play(p, false); const r2 = await panel(p, 5000);
    ok('失败面板列出"挖到奇怪的石头 ×N"、不计分', r2.shown && /挖到奇怪的石头×\d+/.test(await p.evaluate(() => document.querySelector('.egg-breach-st').textContent.replace(/\s/g, ''))) && !(await p.evaluate(() => !!document.querySelector('.egg-breach-score'))));
    await p.close(); }
  // 12. 画面模式标记：结算面板版本行、最佳记录里记下 3D / 2D（不影响计分、不分开存最佳）
  for (const q of ['', '&egg-2d']) {
    p = await open('&n=29' + q);
    const r = await p.evaluate(async () => { const t = document.querySelector('#root').__eggTest, e = document.querySelector('.egg-breach-end'); t.scoring(true); t.start(); t.god(true);
      for (let i = 0; i < 60; i++) t.advance(1 / 60); t.win(); for (let i = 0; i < 260; i++) t.advance(1 / 60);
      const t0 = performance.now(); while (!e.classList.contains('done') && performance.now() - t0 < 9000) await new Promise(r => setTimeout(r, 40));
      return { ver: e.querySelector('.egg-breach-ev').textContent, mark: (e.querySelector('.egg-breach-view') || {}).textContent, text: t.shareText(), rec: t.bestScore() }; });
    const want = q ? '2D' : '3D';
    ok(`画面模式标记（${want}）：结算面板版本行、分享文字、最佳记录`, r.mark === want && r.ver.endsWith(' · ' + want) && r.text.includes('，' + want + '）') && r.rec && r.rec.view === want && r.rec.s > 0, JSON.stringify(r));
    if (p.errs.length) ok('画面模式无报错', false, p.errs.join(' | ')); await p.close();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  await b.close(); process.exit(fail ? 1 : 0);
})();
