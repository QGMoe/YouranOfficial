// 险图在浏览器里：Worker 与主线程预跑一致（含 rT 与指纹）；计分用 T_eff；画面上没有任何险图标记
// 在仓库根目录起静态服务器（例如 python3 -m http.server 8137），再运行：node tools/eggs/breach/test/risky.test.cjs（需要 playwright；BASE 可改服务器地址）
const { chromium } = require('playwright');
let pass = 0, fail = 0;
const ok = (name, c, info) => { console.log(c ? 'ok  ' : 'FAIL', name, info || ''); c ? pass++ : fail++; };
const N = process.env.RISKY_N || '15727';
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 900, height: 800 } }); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
  await p.goto((process.env.BASE || 'http://localhost:8137') + '/tools/eggs/breach/harness.html?egg-test&n=' + N); await p.waitForFunction(() => window.__ready);
  await p.waitForFunction(() => document.querySelector('#root').__eggTest.ready(), null, { timeout: 120000 });
  const r = await p.evaluate(async () => { const t = document.querySelector('#root').__eggTest, a = t.syncPrerun(), w = await t.workerPrerun(0), live = t.prep(), fp = t.fingerprint(), M = t.maze();
    const T0 = window.__core ? 0 : null; t.scoring(true); t.start(); t.god(true); for (let i = 0; i < 30; i++) t.advance(1 / 60); t.win(); for (let i = 0; i < 300; i++) t.advance(1 / 60);
    await new Promise(r => setTimeout(r, 4500)); const panel = document.querySelector('.egg-breach-end').textContent, share = t.shareText(), hud = document.querySelector('.egg-breach-info').textContent;
    return { a, w, live, fp, idealT: t.idealT(), rT: M.rT, risky: M.risky, panel, share, hud }; });
  ok(`n=${N}：是险图，严格测试没通过、保留原图（rT > 1）`, r.risky && r.a.risky && r.a.regen === 0 && r.a.rT > 1.149, JSON.stringify(r.a));
  ok('Worker 与主线程预跑一致（破口、regen、rT、指纹）；主线程的地图带上同一个 rT', r.w.k === r.a.k && r.w.regen === r.a.regen && r.w.rT === r.a.rT && r.w.fp === r.a.fp && r.live.k === r.a.k && r.live.rT === r.a.rT && r.rT === r.a.rT && r.fp === r.a.fp, JSON.stringify({ a: r.a, w: r.w, live: r.live, fp: r.fp }));
  const m = /理想 ([\d.]+)s/.exec(r.panel);
  ok('计分用放宽后的理想时间 T_eff（结算面板的理想时间 = T × rT）', m && Math.abs(+m[1] - r.idealT) < 0.051 && r.idealT > 0, JSON.stringify({ shown: m && m[1], idealT: r.idealT, rT: r.rT }));
  ok('画面上没有任何险图标记（结算面板、分享文字）', !/险/.test(r.panel + r.share + r.hud), r.panel.slice(0, 120));
  if (errs.length) ok('无报错', false, errs.join(' | '));
  console.log(`\n${pass} passed, ${fail} failed`);
  await b.close(); process.exit(fail ? 1 : 0);
})();
