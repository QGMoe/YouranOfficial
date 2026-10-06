// 出口：小厅在哪一端由种子决定（东西都会出现）；出口小厅南北墙上的两块告示牌（3D / 2D 都画得出来、默认镜头下看得见、被水淹过以后还在）
// 在仓库根目录起静态服务器（例如 python3 -m http.server 8137），再运行：node tools/eggs/breach/test/exit.test.cjs（需要 playwright；BASE 可改服务器地址）
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
  const sides = new Set();
  for (const n of ['29', '45', '-29', '-37', '13', '-9']) for (const q of ['', '&egg-2d']) {
    const tag = `n=${n}${q ? '（2D）' : '（3D）'}`, p = await open('&n=' + n + q);
    const r = await p.evaluate(() => { const t = document.querySelector('#root').__eggTest, M = t.maze(), lv = M.levels[0], W = M.W, cv = document.querySelector('#root canvas.egg-breach-main');
      t.start(); t.god(true); t.thermoOn(false);
      const zc = lv.ladder.z + 1, xc = lv.signs[0].x; t.teleport(xc, zc); for (let i = 0; i < 40; i++) t.advance(1 / 60);
      const sample = () => { t.advance(1 / 60); const c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(cv, 0, 0);
        const k = cv.clientWidth ? 1 : 1; return t.signPx().map(s => { const px = (dx, dy) => Array.from(g.getImageData(Math.round(s.x + dx), Math.round(s.y + dy), 1, 1).data); return { face: s.face, c: px(0, 0), wall: px(s.face > 0 ? 0 : 0, -(cv.height / 240) * 9 * (s.face > 0 ? 1 : -1)) }; }); };
      const dry = sample();
      // 灌水：把小厅灌满（同步后端），模拟一阵
      const flooded = []; if (M.negative) { for (let z = zc - 1; z <= zc + 1; z++) for (let x = xc - 1; x <= xc + 1; x++) t.flood(x, z, 0); t.simFull(80); for (let i = 0; i < 30; i++) t.advance(1 / 60); }
      const wet = M.negative ? sample() : null;
      const rock = lv.signs.map(sg => t.matAt(sg.x, 2, sg.z));
      return { side: lv.exitSide, ladderX: lv.ladder.x, W, signs: lv.signs, dry, wet, rock, fluid: M.negative ? t.fluidCells(0) : 0 }; });
    sides.add(r.side);
    const brown = (c) => c[0] > c[2] + 25 && c[0] >= c[1] - 5 && c[0] > 60;
    const vis = r.dry.filter(s => !q ? s.face > 0 : true);
    ok(`告示牌：出口小厅（出口在${r.side ? '东' : '西'}）北墙、南墙各一块${tag}`, r.signs.length === 2 && r.signs[0].face === 1 && r.signs[1].face === -1 && r.rock.every(m => m === 1), JSON.stringify(r.signs));
    ok(`默认镜头下看得见告示牌（木色）${q ? '：两块都在' : '：北墙那块（面朝镜头）'}${tag}`, vis.length && vis.every(s => brown(s.c)), JSON.stringify(vis));
    if (r.wet) ok(`小厅被水淹过以后告示牌还在（不被冲掉、墙仍是岩石）${tag}`, r.fluid > 0 && r.rock.every(m => m === 1) && r.wet.filter(s => !q ? s.face > 0 : true).every(s => Math.abs(s.c[0] - s.wall[0]) + Math.abs(s.c[1] - s.wall[1]) + Math.abs(s.c[2] - s.wall[2]) > 30), JSON.stringify(r.wet));
    if (p.errs.length) ok('无报错', false, p.errs.join(' | ')); await p.close();
  }
  // 竖井时间与路线一致（理想时间含最后一段竖井）：自动驾驶从走进梯子格到爬出地面 = 按住 + 淡出 + 爬（最后一段）；中间的竖井另加一次淡出
  for (const n of ['-1283425', '-41']) { const p = await open('&n=' + n + '&egg-2d');
    const r = await p.evaluate(() => { const t = document.querySelector('#root').__eggTest, M = t.maze(), W = M.W; t.start(); t.god(true); t.thermoOn(false); t.autopilot(true); const ev = []; let onLad = false, lastLv = 0, ladAt = 0;
      for (let i = 0; i < 60 * 200; i++) { t.advance(1 / 60); const s = t.snapshot(), lv = M.levels[s.level], on = s.mode === 'top' && lv.t[Math.floor(s.z) * W + Math.floor(s.x)] === 3;
        if (on && !onLad) ladAt = s.t; onLad = on; if (s.level !== lastLv) { ev.push(['mid', s.t - ladAt]); lastLv = s.level; } if (s.state === 'over') { ev.push(['end', s.t - ladAt]); break; } }
      return { ev, idealT: t.idealT(), levels: M.levels.length }; });
    const C = await p.evaluate(async () => (await import('/dist/assets/egg/games/08-breach.js'))._core.shaftTime(true));
    const end = r.ev.find(e => e[0] === 'end'), mids = r.ev.filter(e => e[0] === 'mid');
    ok(`n=${n}：最后一段竖井（走进梯子格 → 爬出地面）≈ ${C.toFixed(1)} s，与理想时间里的一致；中间的竖井到上一层 ≈ 再加一次淡出`, end && Math.abs(end[1] - C) < 0.08 && mids.every(m => Math.abs(m[1] - (C + 0.3)) < 0.08), JSON.stringify(r));
    await p.close(); }
  ok('这几张图里东西两侧的出口都出现了', sides.size === 2, [...sides].join());
  console.log(`\n${pass} passed, ${fail} failed`);
  await b.close(); process.exit(fail ? 1 : 0);
})();
