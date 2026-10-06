// 分享：卡片（1080×1350、非空）、canShare 时走系统分享（图 + 带链接的文字）、只能分享文字时分享文字并下载图片、都不行时下载 + 复制；
// 用户取消（AbortError）不提示；链接从零拼出（不带 query / hash，非法 N 不带链接，来源校验）；无报错
// 在仓库根目录起静态服务器（例如 python3 -m http.server 8137），再运行：node tools/eggs/breach/test/share.test.cjs（需要 playwright；BASE 可改服务器地址）
const { chromium } = require('playwright');
let pass = 0, fail = 0;
const ok = (name, c, info) => { console.log(c ? 'ok  ' : 'FAIL', name, info || ''); c ? pass++ : fail++; };
const BASE = process.env.BASE || 'http://localhost:8137';
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const open = async (q, mock, opts) => {
    const c = await b.newContext(Object.assign({ viewport: { width: 900, height: 900 }, acceptDownloads: true }, opts || {}));
    if (mock) await c.addInitScript(mock);
    const p = await c.newPage(); const errs = [];
    p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
    await p.goto(BASE + '/tools/eggs/breach/harness.html?egg-test&egg-sync' + q); await p.waitForFunction(() => window.__ready);
    await p.waitForFunction(() => document.querySelector('#root').__eggTest.ready(), null, { timeout: 90000 });
    p.errs = errs; p.ctx = c; return p;
  };
  const WIN = async (p) => { await p.evaluate(async () => { const t = document.querySelector('#root').__eggTest; t.scoring(true); t.start(); t.god(true); for (let i = 0; i < 60; i++) t.advance(1 / 60); t.win(); for (let i = 0; i < 200; i++) t.advance(1 / 60);
    const e = document.querySelector('.egg-breach-end'), t0 = performance.now(); while (!(e.classList.contains('on') && e.classList.contains('done')) && performance.now() - t0 < 8000) await new Promise(r => setTimeout(r, 30)); await new Promise(r => setTimeout(r, 650)); }); };   // 等计分动画播完（动画中点一下只跳过动画）
  // 1. 卡片
  { const p = await open('&n=15'); await WIN(p);
    const r = await p.evaluate(() => { const cv = document.querySelector('#root').__eggTest.shareCard(), g = cv.getContext('2d'), d = g.getImageData(0, 0, cv.width, cv.height).data; let nonBlack = 0;
      for (let i = 0; i < d.length; i += 4 * 97) if (d[i] + d[i + 1] + d[i + 2] > 30) nonBlack++; return { w: cv.width, h: cv.height, nonBlack, btn: !!document.querySelector('.egg-breach-end [data-a=share]') }; });
    ok('分享卡片 1080×1350、画面非空，胜利面板有"分享"按钮', r.w === 1080 && r.h === 1350 && r.nonBlack > 1000 && r.btn, JSON.stringify(r));
    if (p.errs.length) ok('卡片无报错', false, p.errs.join(' | ')); await p.ctx.close(); }
  // 2. canShare(files) → navigator.share({files, title, text 含链接, url})
  { const mock = () => { window.__calls = []; navigator.canShare = (d) => !!(d && d.files && d.files.length); navigator.share = (d) => { window.__calls.push({ files: (d.files || []).map(f => [f.name, f.type, f.size]), title: d.title, text: d.text, url: d.url }); return Promise.resolve(); }; };
    const p = await open('&n=15', mock); await WIN(p);
    await p.click('.egg-breach-end [data-a=share]'); await p.waitForFunction(() => window.__calls.length > 0, null, { timeout: 8000 });
    const r = await p.evaluate(() => ({ c: window.__calls[0], st: document.querySelector('#root').__eggTest.snapshot().state }));
    const url = BASE.replace(/\/$/, '') + '/v15';
    ok('支持分享图片时：系统分享带图片（PNG）', r.c.files.length === 1 && r.c.files[0][1] === 'image/png' && r.c.files[0][2] > 1000, JSON.stringify(r.c.files));
    ok('分享文字里带链接（url 字段同样给出），点分享不影响结算状态', r.c.text.endsWith(' ' + url) && r.c.url === url && /逃出了矿井：[\d,]+ 分 [SABC]，挖到奇怪的石头 ×\d+/.test(r.c.text) && r.c.text.includes('，3D）') && r.st === 'over', r.c.text);
    if (p.errs.length) ok('系统分享无报错', false, p.errs.join(' | ')); await p.ctx.close(); }
  // 3. 只能分享文字：分享 {title, text, url}，图片另外下载
  { const mock = () => { window.__calls = []; navigator.canShare = () => false; navigator.share = (d) => { window.__calls.push(d); return Promise.resolve(); }; };
    const p = await open('&n=15', mock); await WIN(p);
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 8000 }), p.click('.egg-breach-end [data-a=share]')]);
    const r = await p.evaluate(() => window.__calls[0]);
    ok('只能分享文字时：分享文字 + 链接，图片另外下载', r && !r.files && /\/v15$/.test(r.url) && r.text.endsWith(r.url) && dl.suggestedFilename() === 'breach-share.png', JSON.stringify({ r, f: dl.suggestedFilename() })); await p.ctx.close(); }
  // 4. 都不支持：下载图片 + 复制文字（剪贴板 mock）；剪贴板失败时提示但不报错
  for (const clipOk of [true, false]) {
    const mock = `window.__clip = []; delete Navigator.prototype.share; delete Navigator.prototype.canShare; navigator.share = undefined; navigator.canShare = undefined;
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (t) => { window.__clip.push(t); return ${clipOk} ? Promise.resolve() : Promise.reject(new Error('denied')); } } });`;
    const p = await open('&n=15', mock); await WIN(p);
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 8000 }), p.click('.egg-breach-end [data-a=share]')]);
    await p.waitForFunction(() => { const t = document.querySelector('.egg-breach-toast'); return t && !t.hidden; }, null, { timeout: 5000 });
    const r = await p.evaluate(() => ({ clip: window.__clip, toast: document.querySelector('.egg-breach-toast').textContent }));
    ok(`不能系统分享时：下载图片并复制带链接的文字（剪贴板${clipOk ? '成功' : '失败'}）`, dl.suggestedFilename() === 'breach-share.png' && r.clip.length === 1 && /\/v15$/.test(r.clip[0]) && (clipOk ? /已复制链接/.test(r.toast) : /没有成功/.test(r.toast)), JSON.stringify(r));
    if (p.errs.length) ok('回退路径无报错', false, p.errs.join(' | ')); await p.ctx.close();
  }
  // 5. 用户取消（AbortError）不提示
  { const mock = () => { navigator.canShare = () => true; navigator.share = () => Promise.reject(new DOMException('cancel', 'AbortError')); };
    const p = await open('&n=15', mock); await WIN(p); await p.click('.egg-breach-end [data-a=share]'); await p.waitForTimeout(800);
    const t = await p.evaluate(() => document.querySelector('.egg-breach-toast').hidden);
    ok('用户取消分享不提示', t); await p.ctx.close(); }
  // 6. 链接清洗：恶意的路径 / query / hash 不进入链接；非法 N 不带链接；来源校验
  { const p = await open('&n=15&x=%3Cscript%3Ealert(1)%3C%2Fscript%3E%0d%0aSet-Cookie:a=b#javascript:alert(1)'); await WIN(p);
    const r = await p.evaluate(() => { const t = document.querySelector('#root').__eggTest; return { text: t.shareText(),
      a: t.shareLink('15', 'http://127.0.0.1:8138'), b: t.shareLink('15?x=<script>', 'https://youran.qingu.moe'), c: t.shareLink('15#javascript:alert(1)', 'https://youran.qingu.moe'), d: t.shareLink('15\n', 'https://youran.qingu.moe'),
      e: t.shareLink('-15', 'javascript:alert(1)'), f: t.shareLink('15', 'https://evil.example/path'), g: t.shareLink('1'.repeat(3000), 'https://youran.qingu.moe'), h: t.shareLink('15', 'https://youran.qingu.moe') }; });
    ok('页面地址里的 query / hash / 编码换行不会进入分享链接（只有 /v15）', /\/v15$/.test(r.text) && !/[<>#?]|script|Cookie/i.test(r.text), r.text);
    ok('非法 N（带 ?、#、换行）不生成链接', r.b === null && r.c === null && r.d === null, JSON.stringify([r.b, r.c, r.d]));
    ok('来源校验：合法的 http(s)://主机[:端口] 照用，其他一律用正式站点；过长不带链接', r.a === 'http://127.0.0.1:8138/v15' && r.e === 'https://youran.qingu.moe/v-15' && r.f === 'https://youran.qingu.moe/v15' && r.g === null && r.h === 'https://youran.qingu.moe/v15', JSON.stringify([r.a, r.e, r.f, r.h]));
    await p.ctx.close(); }
  // 7. 2D、360 宽：分享按钮在面板内、不溢出
  { const p = await open('&n=15&egg-2d', null, { viewport: { width: 360, height: 900 } }); await WIN(p);
    const r = await p.evaluate(() => { const bt = document.querySelector('.egg-breach-end [data-a=share]').getBoundingClientRect(), e = document.querySelector('.egg-breach-end').getBoundingClientRect(); return { inside: bt.right <= e.right + 0.5 && bt.left >= e.left - 0.5, over: document.documentElement.scrollWidth - document.documentElement.clientWidth, card: document.querySelector('#root').__eggTest.shareCard().width }; });
    ok('360 宽（2D）：分享按钮在面板内、页面不溢出，卡片照常生成', r.inside && r.over <= 0 && r.card === 1080, JSON.stringify(r));
    if (p.errs.length) ok('2D 无报错', false, p.errs.join(' | ')); await p.ctx.close(); }
  console.log(`\n${pass} passed, ${fail} failed`);
  await b.close(); process.exit(fail ? 1 : 0);
})();
