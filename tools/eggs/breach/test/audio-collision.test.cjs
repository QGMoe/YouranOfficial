// 音频：静音时零节点、开关/暂停/卸载后全部停止并断开；碰撞：箱子 / 石头 / 信标挡人，自动驾驶全程无穿模
// 在仓库根目录起静态服务器（例如 python3 -m http.server 8137），再运行：node tools/eggs/breach/test/audio-collision.test.cjs（需要 playwright；BASE 可改服务器地址）
const { chromium } = require('playwright');
let pass = 0, fail = 0;
const ok = (name, c, info) => { console.log(c ? 'ok  ' : 'FAIL', name, info || ''); c ? pass++ : fail++; };
const SPY = () => {
  const S = window.__spy = { created: 0, ctxNew: 0, started: 0, stopped: 0, live: new Set() };
  const P = (window.BaseAudioContext || window.AudioContext).prototype;
  for (const k of Object.getOwnPropertyNames(P)) if (/^create/.test(k) && typeof P[k] === 'function') { const f = P[k]; P[k] = function () { S.created++; return f.apply(this, arguments); }; }
  const A = window.AudioContext; window.AudioContext = function () { S.ctxNew++; return new A(...arguments); }; window.AudioContext.prototype = A.prototype;
  const O = window.OfflineAudioContext; window.OfflineAudioContext = function () { S.ctxNew++; return new O(...arguments); }; window.OfflineAudioContext.prototype = O.prototype;
  const SP = AudioScheduledSourceNode.prototype, st = SP.start, sp = SP.stop;
  SP.start = function () { S.started++; S.live.add(this); return st.apply(this, arguments); };
  SP.stop = function () { if (S.live.delete(this)) S.stopped++; return sp.apply(this, arguments); };
};
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const open = async (q) => {
    const p = await b.newPage({ viewport: { width: 1000, height: 800 } }); const errs = [];
    p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.addInitScript(SPY);
    await p.goto((process.env.BASE || 'http://localhost:8137') + '/tools/eggs/breach/harness.html?egg-test' + q); await p.waitForFunction(() => window.__ready);
    await p.waitForFunction(() => document.querySelector('#root').__eggTest.ready(), null, { timeout: 90000 });
    p.errs = errs; return p;
  };
  const run = (p, ms) => p.evaluate(async (ms) => { const t = document.querySelector('#root').__eggTest; t.god(2); t.autopilot(true); document.querySelector('.egg-breach-btn').click(); await new Promise(r => setTimeout(r, ms)); return t.snapshot(); }, ms);
  { const p = await open('&n=75'); await run(p, 6000); const s = await p.evaluate(() => ({ created: __spy.created, ctx: __spy.ctxNew }));
    ok('静音（宿主默认）：不创建 AudioContext、不创建任何节点', s.created === 0 && s.ctx === 0, JSON.stringify(s)); await p.close(); }
  { const p = await open('&n=75&noaudioapi'); await run(p, 3000); ok('宿主没有 ctx.audio 时照常运行', p.errs.length === 0 && (await p.evaluate(() => __spy.created)) === 0, p.errs.join('|')); await p.close(); }
  { const p = await open('&n=75&audio'); await run(p, 6000);
    const a = await p.evaluate(() => ({ created: __spy.created, started: __spy.started, live: __spy.live.size }));
    await p.evaluate(() => window.__audio.set(false)); await p.waitForTimeout(600);
    const bq = await p.evaluate(() => ({ live: __spy.live.size, started: __spy.started, stopped: __spy.stopped }));
    ok('开声音后创建节点；关掉开关后 0.6 s 内全部声源停止', a.created > 0 && a.live > 0 && bq.live === 0, JSON.stringify({ a, bq }));
    await p.evaluate(() => window.__audio.set(true)); await p.waitForTimeout(1500);
    const c = await p.evaluate(() => __spy.live.size);
    await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); }); await p.waitForTimeout(600);
    const d = await p.evaluate(() => ({ live: __spy.live.size, state: document.querySelector('#root').__eggTest.snapshot().state }));
    ok('重新打开后恢复；页面隐藏（暂停）后声床淡出并释放', c > 0 && d.live === 0 && d.state === 'pause', JSON.stringify({ c, d }));
    await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); document.querySelector('.egg-breach-btn').click(); }); await p.waitForTimeout(1500);
    const e = await p.evaluate(() => __spy.live.size);
    await p.evaluate(() => window.__game.unmount()); await p.waitForTimeout(600);
    const f = await p.evaluate(() => __spy.live.size);
    ok('卸载后无残留声源', e > 0 && f === 0 && p.errs.length === 0, JSON.stringify({ e, f, errs: p.errs }));
    await p.close(); }
  // 碰撞：箱子、石头（模拟里生成的圆石）、信标底座
  { const p = await open('&n=75');
    const r = await p.evaluate(async () => {
      const t = document.querySelector('#root').__eggTest, M = t.maze(), W = M.W; t.god(true); t.start();
      const out = {}, lv = M.levels[0];
      const push = async (x, z, dx, dz, n = 90) => { t.teleport(x, z); t.keys(dx > 0 ? 'r' : dx < 0 ? 'l' : dz > 0 ? 'd' : 'u'); for (let i = 0; i < n; i++) t.advance(1 / 60); t.keys(''); const s = t.snapshot(); return [s.x, s.z]; };
      const c = lv.chests[0], cx = c % W, cz = (c / W) | 0, O = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      let from = null; for (const [dx, dz] of O) { const n = (cz - dz) * W + cx - dx; if (lv.t[n] && !lv.chest[n]) { from = [cx - dx, cz - dz, dx, dz]; break; } }
      const e1 = await push(from[0], from[1], from[2], from[3]);
      out.chest = { chest: [cx, cz], end: e1, blocked: !(Math.floor(e1[0]) === cx && Math.floor(e1[1]) === cz) && t.blocked(cx + 0.5, cz + 0.5) };
      // 找一段直巷道：a → b（相邻两格都可走）
      let a = -1, d = null;
      for (let i = 0; i < lv.t.length && a < 0; i++) if (lv.t[i] === 1 && !lv.pit[i]) for (const [dx, dz] of O) { const j = i + dz * W + dx; if (lv.t[j] === 1 && !lv.pit[j] && !lv.puddle[j] && !lv.puddle[i]) { a = i; d = [dx, dz]; break; } }
      const ax = a % W, az = (a / W) | 0, bx = ax + d[0], bz = az + d[1];
      t.stoneAt(bx, bz); const e2 = await push(ax, az, d[0], d[1]);
      out.stone = { at: [bx, bz], end: e2, blocked: !(Math.floor(e2[0]) === bx && Math.floor(e2[1]) === bz) };
      // 信标：另一处直巷道；靠近即进入光环（buff），但不能走进信标格
      let a2 = -1, d2 = null;
      for (let i = lv.t.length - 1; i >= 0 && a2 < 0; i--) if (lv.t[i] === 1 && !lv.pit[i] && Math.abs(i % W - ax) > 4) for (const [dx, dz] of O) { const j = i + dz * W + dx; if (lv.t[j] === 1 && !lv.pit[j] && !lv.puddle[j] && !lv.puddle[i]) { a2 = i; d2 = [dx, dz]; break; } }
      const cx2 = a2 % W + d2[0], cz2 = ((a2 / W) | 0) + d2[1];
      t.beaconAt(cx2, cz2); const e3 = await push(a2 % W, (a2 / W) | 0, d2[0], d2[1], 40);
      out.beacon = { at: [cx2, cz2], end: e3, blocked: !(Math.floor(e3[0]) === cx2 && Math.floor(e3[1]) === cz2), buff: t.buff() };
      return out;
    });
    ok('碰撞：朝箱子走会被挡住（碰撞格 = 画箱子的格）', r.chest.blocked, JSON.stringify(r.chest));
    ok('碰撞：朝生成的石头走会被挡住', r.stone.blocked, JSON.stringify(r.stone));
    ok('碰撞：信标是实心方块，靠近即获得光环', r.beacon.blocked && r.beacon.buff > 0, JSON.stringify(r.beacon));
    await p.close(); }
  for (const q of ['&n=75', '&n=75&egg-2d', '&n=-60', '&n=100']) {
    const p = await open(q);
    await p.evaluate(() => { const t = document.querySelector('#root').__eggTest; t.autopilot(true); document.querySelector('.egg-breach-btn').click(); });
    let s; for (let k = 0; k < 60; k++) { await p.waitForTimeout(2000); s = await p.evaluate(() => document.querySelector('#root').__eggTest.snapshot()); if (s.state === 'over') break; }
    ok(`自动驾驶全程无穿模（逐帧断言）${q}`, s.viol === 0 && s.state === 'over', `viol=${s.viol} ${s.state}/${s.mode} ${s.t.toFixed(1)}s`);
    await p.close();
  }
  console.log(`\n${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
})();
