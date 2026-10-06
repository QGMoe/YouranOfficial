/* 首页“服务器状态”卡片：读取网页面板的公开状态接口与下载站的整合包 manifest。
 * 页面上已有静态内容（服务器地址、构建时的整合包版本、“实时状态暂不可用”），读取失败时保持不变，不报错。
 * 页面可见时每 45 秒刷新一次，切到后台时暂停。所有文字都用 textContent 写入。 */
(function () {
  var card = document.getElementById('server-status');
  if (!card || !window.fetch) return;
  var INTERVAL = 45000, TIMEOUT = 8000;
  var pill = card.querySelector('.status-pill'), pillText = card.querySelector('.status-text');
  function field(name) { return card.querySelector('[data-field="' + name + '"]'); }
  var STATES = {
    loading: '正在获取实时状态…',
    running: '运行中',
    stopped: '已关闭',
    crashed: '可能异常中断',
    unknown: '状态未知',
    unavailable: '实时状态暂不可用'
  };
  var timer = null, lastFetch = 0;

  function getJSON(url) {
    var ctrl = window.AbortController ? new AbortController() : null;
    var t = ctrl ? setTimeout(function () { ctrl.abort(); }, TIMEOUT) : null;
    return fetch(url, { mode: 'cors', credentials: 'omit', signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .finally(function () { if (t) clearTimeout(t); });
  }
  function ms(v) { v = Number(v); if (!isFinite(v) || v <= 0) return null; return v < 1e12 ? v * 1000 : v; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function fmtTime(v) {
    var t = ms(v); if (t === null) return '—';
    var d = new Date(t), now = new Date();
    var hm = pad(d.getHours()) + ':' + pad(d.getMinutes());
    if (d.toDateString() === now.toDateString()) return '今天 ' + hm;
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + hm;
  }
  function fmtDuration(sec) {
    sec = Math.floor(Number(sec)); if (!isFinite(sec) || sec < 0) return '—';
    var d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60);
    if (d) return d + ' 天 ' + h + ' 小时';
    if (h) return h + ' 小时 ' + m + ' 分';
    return m + ' 分钟';
  }
  function setState(state) {
    if (!STATES.hasOwnProperty(state)) state = 'unknown';
    pill.setAttribute('data-state', state);
    pillText.textContent = STATES[state];
  }
  function setPlayers(names, emptyText) {
    var ul = field('players');
    while (ul.firstChild) ul.removeChild(ul.firstChild);
    if (!names || !names.length) {
      var li = document.createElement('li'); li.className = 'none'; li.textContent = emptyText; ul.appendChild(li); return;
    }
    names.forEach(function (n) { var li = document.createElement('li'); li.textContent = String(n); ul.appendChild(li); });
  }
  function clear() {
    field('online').textContent = '—';
    field('time-label').textContent = '运行时长';
    field('time').textContent = '—';
    field('updated').textContent = '';
    setPlayers(null, '—');
  }
  function render(s) {
    var state = s && typeof s.status === 'string' ? s.status : 'unknown';
    setState(state);
    if (state === 'unavailable') { clear(); return; }
    var online = Number(s.online), max = Number(s.max);
    field('online').textContent = state === 'running' && isFinite(online) ? online + (isFinite(max) && max > 0 ? ' / ' + max : '') : '—';
    if (state === 'running') {
      field('time-label').textContent = '已运行';
      field('time').textContent = s.uptime_seconds != null ? fmtDuration(s.uptime_seconds)
        : (ms(s.started_at) ? fmtDuration((Date.now() - ms(s.started_at)) / 1000) : '—');
      setPlayers(Array.isArray(s.players) ? s.players : null, '暂无玩家在线');
    } else if (state === 'stopped') {
      field('time-label').textContent = '关闭于';
      field('time').textContent = fmtTime(s.stopped_at);
      setPlayers(null, '—');
    } else if (state === 'crashed') {
      field('time-label').textContent = '最后心跳';
      field('time').textContent = fmtTime(s.last_heartbeat_at);
      setPlayers(null, '—');
    } else {
      field('time-label').textContent = '运行时长';
      field('time').textContent = '—';
      setPlayers(null, '—');
    }
    var updated = ms(s.updated_at);
    field('updated').textContent = updated ? '更新于 ' + fmtTime(updated) : '';
  }
  function refresh() {
    lastFetch = Date.now();
    getJSON(card.getAttribute('data-api')).then(function (s) {
      render(s);
    }).catch(function () {
      // 读取失败：回到静态内容
      setState('unavailable'); clear();
    });
  }
  function schedule() {
    if (timer) clearInterval(timer);
    timer = document.hidden ? null : setInterval(refresh, INTERVAL);
  }
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && Date.now() - lastFetch >= INTERVAL) refresh();
    schedule();
  });

  setState('loading');
  refresh();
  schedule();

  // 整合包版本：页面上是构建时的值，这里只在读取成功时更新
  getJSON(card.getAttribute('data-manifest')).then(function (m) {
    if (!m || !m.version) return;
    field('pack').textContent = String(m.version);
    var addons = {};
    (Array.isArray(m.addons) ? m.addons : []).forEach(function (a) { if (a && a.id) addons[a.id] = a.version; });
    var parts = [];
    if (addons.game) parts.push('Minecraft ' + addons.game);
    if (addons.forge) parts.push('Forge ' + addons.forge);
    if (parts.length) field('pack-detail').textContent = parts.join(' · ');
  }).catch(function () {});
})();
