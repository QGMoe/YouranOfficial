/* 主题切换：跟随系统 / 浅色 / 深色（顶栏按钮 + 弹出层）。
 * 首帧前的应用由 <head> 内联脚本完成（读 localStorage → html[data-theme]），本文件只负责控件交互与同步。
 * 约定：data-theme 只取 light / dark；跟随系统 = 不设该属性（CSS 回落到 prefers-color-scheme），并删除存储的键。 */
(function () {
  var KEY = 'youran-theme', root = document.documentElement;
  var LABEL = { light: '浅色', dark: '深色', system: '跟随系统' };
  var META = { light: '#ffffff', dark: '#1a1d21' };

  function stored() {
    var t = null;
    try { t = window.localStorage.getItem(KEY); } catch (e) {}
    return t === 'light' || t === 'dark' ? t : 'system';
  }
  function save(t) {
    try { if (t === 'system') window.localStorage.removeItem(KEY); else window.localStorage.setItem(KEY, t); } catch (e) {}
  }
  function current() {
    var a = root.getAttribute('data-theme');
    return a === 'light' || a === 'dark' ? a : 'system';
  }
  function each(sel, fn) { Array.prototype.forEach.call(document.querySelectorAll(sel), fn); }

  function apply(t) {
    if (t === 'system') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', t);
    // 浏览器界面色：手动选择时两条 theme-color 都取该主题色；跟随系统时恢复各自的值
    each('meta[name="theme-color"]', function (m) {
      var media = m.getAttribute('media') || '';
      m.setAttribute('content', t === 'system' ? META[/dark/.test(media) ? 'dark' : 'light'] : META[t]);
    });
    sync(t);
  }
  function set(t) { save(t); apply(t); }

  function sync(t) {
    each('[data-theme-trigger]', function (b) { b.setAttribute('aria-label', '切换主题（当前：' + LABEL[t] + '）'); });
    each('[data-theme-group] [role="radio"]', function (r) {
      var on = r.getAttribute('data-value') === t;
      r.setAttribute('aria-checked', String(on));
      r.tabIndex = on ? 0 : -1;
    });
  }

  /* 单选组：方向键移动并选中，Home / End，点按选中 */
  each('[data-theme-group]', function (g) {
    var radios = Array.prototype.slice.call(g.querySelectorAll('[role="radio"]'));
    radios.forEach(function (r, i) {
      r.addEventListener('click', function () {
        set(r.getAttribute('data-value'));
        var pop = g.closest('[data-theme-pop]');
        if (pop) closePop(pop, true);
      });
      r.addEventListener('keydown', function (e) {
        var k = e.key, j = -1;
        if (k === 'ArrowRight' || k === 'ArrowDown') j = (i + 1) % radios.length;
        else if (k === 'ArrowLeft' || k === 'ArrowUp') j = (i - 1 + radios.length) % radios.length;
        else if (k === 'Home') j = 0;
        else if (k === 'End') j = radios.length - 1;
        if (j < 0) return;
        e.preventDefault();
        set(radios[j].getAttribute('data-value'));
        radios[j].focus();
      });
    });
  });

  /* 弹出层（disclosure 模式）：打开时焦点落到当前选项；Esc 关闭并还焦点；点外部或焦点移出即关闭 */
  function openPop(w) {
    var btn = w.querySelector('[data-theme-trigger]'), panel = w.querySelector('.theme-pop');
    panel.hidden = false; btn.setAttribute('aria-expanded', 'true');
    var on = panel.querySelector('[aria-checked="true"]'); if (on) on.focus();
  }
  function closePop(w, refocus) {
    var btn = w.querySelector('[data-theme-trigger]'), panel = w.querySelector('.theme-pop');
    if (panel.hidden) return;
    panel.hidden = true; btn.setAttribute('aria-expanded', 'false');
    if (refocus) btn.focus();
  }
  each('[data-theme-pop]', function (w) {
    var btn = w.querySelector('[data-theme-trigger]');
    btn.addEventListener('click', function () {
      if (btn.getAttribute('aria-expanded') === 'true') closePop(w, false); else openPop(w);
    });
    w.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.stopPropagation(); closePop(w, true); } });
    w.addEventListener('focusout', function (e) { if (e.relatedTarget && !w.contains(e.relatedTarget)) closePop(w, false); });
  });
  document.addEventListener('click', function (e) {
    each('[data-theme-pop]', function (w) { if (!w.contains(e.target)) closePop(w, false); });
  });

  /* 其他标签页改了主题时同步 */
  window.addEventListener('storage', function (e) { if (e.key === KEY || e.key === null) apply(stored()); });

  sync(current());
})();
