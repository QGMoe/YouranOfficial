// 文案（tools/eggs/CONTRACT.md「文案」）：经宿主（通用调试页 tools/eggs/harness.html，与 404 页同一实现）挂载时文字来自 texts/breach.js（ctx.t），
// 与内置文案（模块的 texts）逐字相同；改了文案文件，游戏里跟着变（含游戏名：分享卡片 / 分享标题用宿主给的名字）；文案文件 404 时用内置文案，文字不变、游戏照常
// 在仓库根目录起静态服务器（例如 python3 -m http.server 8137），再运行：node tools/eggs/breach/test/texts.test.cjs（需要 playwright；BASE 可改服务器地址）
const { chromium } = require('playwright');
let pass = 0, fail = 0;
const ok = (name, c, info) => { console.log(c ? 'ok  ' : 'FAIL', name, info || ''); c ? pass++ : fail++; };
const BASE = process.env.BASE || 'http://localhost:8137';
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  // 同一个状态（失败面板 + 各控件）的文字快照
  const SNAP = async (p) => p.evaluate(async () => { const t = document.querySelector('#root').__eggTest, w = document.querySelector('.egg-breach-wrap'), out = {};
    out.ready = { btn: document.querySelector('.egg-breach-btn').textContent, info: document.querySelector('.egg-breach-info').textContent, canvas: document.querySelector('#root canvas.egg-breach-main').getAttribute('aria-label'),
      aria: [...w.querySelectorAll('[aria-label]')].map(e => e.getAttribute('aria-label')), titles: [...w.querySelectorAll('[title]')].map(e => e.title) };
    out.hint = t.tx('prompt.torch_tip_1', { sec: 2.5 }); out.name = t.gameName();
    // 每一条文案经 ctx.t 取出的结果（不带参数时占位符原样保留），与模块内置 texts 的原文逐条比较
    const m = await import('/dist/assets/egg/games/08-breach.js'), flat = []; const walk = (o, pre) => { for (const k in o) { if (typeof o[k] === 'string') flat.push([pre + k, o[k]]); else walk(o[k], pre + k + '.'); } }; walk(m.default.texts, '');
    out.keys = flat.length; out.keyDiff = flat.filter(([k, v]) => t.tx(k) !== v).map(([k]) => k);
    t.start(); t.god(false); t.thermoOn(false); for (let i = 0; i < 600 && t.snapshot().state !== 'over'; i++) { t.flood(Math.floor(t.snapshot().x), Math.floor(t.snapshot().z), 0); t.advance(1 / 60); }
    await new Promise(r => setTimeout(r, 1500)); out.end = document.querySelector('.egg-breach-end').innerText; return out; });
  const viaHost = async (route) => {
    const c = await b.newContext({ viewport: { width: 900, height: 800 } }); const p = await c.newPage(); const errs = [], warns = [];
    p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); if (m.type() === 'warning') warns.push(m.text()); });
    if (route) await p.route('**/assets/egg/texts/breach.js*', route);
    await p.goto(BASE + '/tools/eggs/harness.html?egg-test&egg-sync'); await p.waitForSelector('#game option', { state: 'attached' }); await p.selectOption('#game', '08-breach.js'); await p.fill('#n', '-29'); await p.click('#mount');
    await p.waitForFunction(() => { const r = document.querySelector('#root'); return r.__eggTest && r.__eggTest.ready(); }, null, { timeout: 90000 });
    const s = await SNAP(p); s.errs = errs; s.warns = warns; await c.close(); return s; };
  // 内置文案（breach 自己的调试页不给 ctx.t）
  const p0 = await b.newPage({ viewport: { width: 900, height: 800 } }); await p0.goto(BASE + '/tools/eggs/breach/harness.html?egg-test&egg-sync&n=-29'); await p0.waitForFunction(() => window.__ready);
  await p0.waitForFunction(() => document.querySelector('#root').__eggTest.ready(), null, { timeout: 90000 }); const builtin = await SNAP(p0); await p0.close();
  const host = await viaHost(null);
  ok('经宿主挂载（ctx.t 来自 texts/breach.js）：按钮、状态行、读屏名称、提示与内置文案逐字相同，每一条文案经 ctx.t 取出都与内置原文相同', JSON.stringify(host.ready) === JSON.stringify(builtin.ready) && host.hint === builtin.hint && host.ready.btn === '开始' && host.keys > 100 && !host.keyDiff.length && !builtin.keyDiff.length, JSON.stringify([host.keys, host.keyDiff, builtin.keyDiff, host.ready, builtin.ready]));
  ok('宿主挂载无报错、无缺文案警告', !host.errs.length && !host.warns.some(w => /文案|missing|缺/.test(w)), JSON.stringify([host.errs, host.warns]));
  // 改了文案文件：游戏里跟着变（游戏名、按钮）
  const mod = await viaHost(async (r) => { const res = await r.fetch(); let body = await res.text(); body = body.replace("name: '（待服主填写）'", "name: '测试名'").replace("start: '开始'", "start: '开工'").replace("cause_lava: '被岩浆吞没'", "cause_lava: '被岩浆烫到'"); r.fulfill({ response: res, body }); });
  ok('改文案文件后游戏里跟着变（按钮、死因、游戏名来自宿主）', mod.ready.btn === '开工' && /被岩浆烫到/.test(mod.end) && mod.name === '测试名', JSON.stringify([mod.ready.btn, mod.name, mod.end.slice(0, 40)]));
  // 文案文件 404：宿主用模块内置的 texts，文字与迁移前相同、游戏照常
  const miss = await viaHost((r) => r.fulfill({ status: 404, body: 'not found' }));
  ok('texts/breach.js 404：改用内置文案，文字不变，游戏照常（只有宿主的一条加载警告）', JSON.stringify(miss.ready) === JSON.stringify(builtin.ready) && miss.end === host.end && !miss.keyDiff.length && !miss.errs.filter(e => !/404/.test(e)).length && miss.warns.some(w => /未能加载/.test(w)), JSON.stringify([miss.errs, miss.warns]));
  // 模块的默认导出：title 只作兜底、没有 TODO 标记；texts 与文案文件内容相同
  const same = await (async () => { const p = await b.newPage(); await p.goto(BASE + '/tools/eggs/breach/harness.html?n=29'); const r = await p.evaluate(async () => { const m = await import('/dist/assets/egg/games/08-breach.js?x=' + Date.now()), f = await import('/dist/assets/egg/texts/breach.js?x=' + Date.now()); return { eq: JSON.stringify(m.default.texts) === JSON.stringify(f.default), title: m.default.title }; }); await p.close(); return r; })();
  ok('模块内置 texts 与 texts/breach.js 完全相同；title 只是兜底', same.eq && same.title === '（待服主填写）', JSON.stringify(same));
  console.log(`\n${pass} passed, ${fail} failed`);
  await b.close(); process.exit(fail ? 1 : 0);
})();
