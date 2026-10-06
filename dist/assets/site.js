/* 顶栏：手机菜单按钮、“更多”等下拉（<details>，没有脚本时也能用） */
(function () {
  var header = document.querySelector('.site-header');
  if (!header) return;
  var btn = header.querySelector('.nav-toggle');
  var menus = header.querySelectorAll('details.menu');
  function closeNav() {
    if (!btn) return;
    btn.setAttribute('aria-expanded', 'false');
    header.classList.remove('nav-open');
  }
  if (btn) {
    btn.addEventListener('click', function () {
      var open = btn.getAttribute('aria-expanded') !== 'true';
      btn.setAttribute('aria-expanded', String(open));
      header.classList.toggle('nav-open', open);
    });
    header.querySelectorAll('.site-nav a[href^="#"]').forEach(function (a) { a.addEventListener('click', closeNav); });
  }
  menus.forEach(function (d) {
    d.addEventListener('toggle', function () {
      if (d.open) menus.forEach(function (o) { if (o !== d) o.open = false; });
    });
  });
  document.addEventListener('click', function (e) {
    menus.forEach(function (d) { if (d.open && !d.contains(e.target)) d.open = false; });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var focused = null;
    menus.forEach(function (d) { if (d.open) { d.open = false; focused = d.querySelector('summary'); } });
    if (header.classList.contains('nav-open')) { closeNav(); btn.focus(); }
    else if (focused) focused.focus();
  });
})();
