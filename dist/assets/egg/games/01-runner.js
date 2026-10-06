/* 404 彩蛋游戏「蹦蹦Steve」（runner）：遵守 tools/eggs/README.md 的接口约定，由宿主 /assets/egg/host.js 按需加载。
 * 玩法：Steve 风格的方块小人自动向右跑，按空格 / ↑ / W / 回车或点按画面跳跃，躲开石块堆和岩浆坑；跑得越远分数越高，速度逐渐加快。
 * 全部图形用 Canvas 逐像素自绘（不使用任何官方素材或外部资源），配色跟随站点主题。没有依赖任何库。 */
const CSS = '' +
  // 画布按“逻辑像素 × 整数倍设备像素”定尺寸（由 layout() 设置 width/height），居中；容器更窄时才退回按比例缩小
  '.egg-runner-wrap{margin:0 auto;max-width:100%}' +
  '.egg-runner-canvas{display:block;box-sizing:content-box;margin:0 auto;max-width:calc(100% - 2px);height:auto;aspect-ratio:16/9;image-rendering:pixelated;image-rendering:crisp-edges;' +
  'border-radius:var(--radius,10px);border:1px solid var(--border,#e5e2de);background:var(--surface-2,#f7f5f3);touch-action:none;cursor:pointer}' +
  '.egg-runner-canvas:focus-visible{outline:3px solid var(--accent,#2a7247);outline-offset:2px}' +
  '.egg-runner-bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px 16px;margin-top:12px}' +
  '.egg-runner-btn[hidden]{display:none}' +
  '.egg-runner-score{font-family:var(--mono,monospace);font-variant-numeric:tabular-nums;color:var(--muted,#5d6570);margin-right:auto}' +
  '.egg-runner-score b{color:var(--text,#1f2328)}' +
  '@media (max-width:760px){.egg-runner-bar .button{flex:1 1 100%}}';

function mount(root, host) {
  const signal = host.signal;
  const style = document.createElement('style');
  style.textContent = CSS;
  root.appendChild(style);
  const wrap = document.createElement('div');
  wrap.className = 'egg-runner-wrap';
  wrap.innerHTML =
    '<canvas class="egg-runner-canvas" width="320" height="180" tabindex="0" role="img"></canvas>' +
    '<div class="egg-runner-bar"><span class="egg-runner-score" aria-live="polite"></span>' +
    '<button type="button" class="button primary egg-runner-btn"></button></div>';
  root.appendChild(wrap);
  const canvas = wrap.querySelector('canvas'), ctx = canvas.getContext('2d');
  const btn = wrap.querySelector('button'), scoreEl = wrap.querySelector('.egg-runner-score');
  if (!ctx) return { unmount() { wrap.remove(); style.remove(); } };
  ctx.imageSmoothingEnabled = false;

  /* ---------- 尺寸：后备缓冲 = 320×180 逻辑像素 × 整数 k，CSS 尺寸 = 缓冲 / devicePixelRatio ----------
   * 每个逻辑像素正好是 k×k 个设备像素：滚动时方块不会忽宽忽窄、格子之间不会出现缝隙；文字按设备分辨率绘制，不再被放大糊掉。 */
  function layout() {
    var dpr = window.devicePixelRatio || 1;
    // 横屏手机等矮视口：画布高度不超过视口高度减去顶栏与按钮所需的空间，整块游戏区一屏可见
    var avail = Math.min(720, Math.max(0, (root.clientWidth || 320) - 2), Math.max(180, (window.innerHeight || 800) - (root.classList.contains('egg-fs') ? 72 : 140)) * 16 / 9);   // 宿主横屏全屏（.egg-fs）时没有顶栏，只需给按钮行留位
    var k = Math.max(1, Math.floor(avail * dpr / 320));
    if (canvas.width !== 320 * k) { canvas.width = 320 * k; canvas.height = 180 * k; }
    canvas.style.width = (320 * k / dpr) + 'px';
    wrap.style.width = (320 * k / dpr + 2) + 'px';
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.imageSmoothingEnabled = false;
    draw();
  }

  /* ---------- 文字：由宿主从 texts/runner.js 取（ctx.t），加载失败时用本文件末尾的内置文案 TEXTS ---------- */
  var T = host.t;
  canvas.setAttribute('aria-label', T('hint'));

  /* ---------- 最高分（localStorage 可能不可用） ---------- */
  function loadBest() { return parseInt(host.storage.get('best'), 10) || 0; }
  function saveBest(v) { host.storage.set('best', v); }

  /* ---------- 主题颜色 ---------- */
  var C = {};
  function readTheme() {
    var dark = host.theme() === 'dark';
    var get = function (n, d) { return host.color(n) || d; };
    // 站点变量读不到时各用一套浅色 / 深色兜底配色
    var th = dark ? 1 : 0;
    C.sky = BIOME.sky[th];
    C.ink = BIOME.ink[th];                    // 画布上的文字颜色跟随群系天空，保证对比度
    C.edge = dark ? 'rgba(255,255,255,.28)' : 'rgba(0,0,0,.35)';   // 障碍描边，夜晚也能看清
    C.text = get('--text', dark ? '#e7e9ec' : '#1f2328');
    C.muted = get('--muted', dark ? '#9ea5af' : '#5d6570');
    C.accent = get('--accent', dark ? '#5cbf83' : '#2a7247');
    C.dark = dark;
    PAL.o = dark ? '#8f8780' : '#1d1a17';      // 人物描边：夜晚用浅一些的灰，头发与上衣在暗背景上也看得清
    C.far = BIOME.far[th];
    var f = BIOME.fog; C.fog = f ? ['rgba(' + f[th] + ',' + f[2] + ')', 'rgba(' + f[th] + ',' + f[3] + ')'] : null;
    C.bgD = mix(C.far, C.sky, 0.45); C.bgK = mix(C.sky, '#000000', dark ? 0.45 : 0.4);   // 远处剪影更淡，顶棚 / 树冠更暗
    C.lava = LV.map(function (c) { return mix(c, C.sky, 0.45); });
    C.glow = ['#e9c060', '#fbe39a'].map(function (c) { return mix(c, C.sky, 0.25); });
    C.fc = BIOME.fc ? BIOME.fc.map(function (c) { return mix(c, C.sky, 0.35); }) : null;
    C.overlay = dark ? 'rgba(17,19,21,.72)' : 'rgba(255,255,255,.78)';
    draw();
  }

  /* ---------- 像素图形（自绘） ---------- */
  var W = 320, H = 180, GROUND = 148, TILE = 16;
  // Steve 风格的方块小人（原创像素画，只取配色印象）：12×16，深色描边；棕色短发、肤色脸、青色上衣、蓝色裤子、灰色鞋。
  // 头 7 行 + 上身 4 行 + 腿 5 行；跑动时腿与手臂两帧交替，空中一腿前一腿后
  var PAL = { o: '#1d1a17', h: '#6b4426', H: '#4a2d18', s: '#d29a72', S: '#b07b55', w: '#f4f1ea', e: '#4552b8', m: '#8a5240',
    t: '#2bb3b1', T: '#1d8584', p: '#3d4bb0', P: '#2c3784', k: '#8d9096', K: '#5f6266' };
  var HEAD = [
    '..oooooooo..',
    '.ohhhhhhhho.',
    '.oHhhhhhhHo.',
    '.oswessewso.',
    '.osssSSssso.',
    '.ossmmmmsso.',
    '..oooooooo..'
  ];
  var BODY = [   // 两帧：手臂前后摆
    ['.otttttttto.', 'otTttttttTto', 'otTttttttTto', 'os.TTTTTT.so'],
    ['.otttttttto.', '.oTttttttTo.', '.oTttttttTo.', '.osTTTTTTso.']
  ];
  var LEGS = [   // 站立 / 迈步 / 空中
    ['..oppppppo..', '..oppPPppo..', '..oppooppo..', '..oppooppo..', '..okKookKo..'],
    ['..oppppppo..', '.oppPooPppo.', '.oppo..oppo.', 'oppo....oppo', 'okKo....oKko'],
    ['..oppppppo..', '..oppPPppo..', '.oppo..oppo.', '.oKko..oKko.']
  ];
  function sprite(rows, x, y, pal) {
    for (var r = 0; r < rows.length; r++) {
      var row = rows[r];
      for (var c = 0; c < row.length; c++) {
        var ch = row[c];
        if (ch !== '.') { ctx.fillStyle = pal[ch]; ctx.fillRect(x + c, y + r, 1, 1); }
      }
    }
  }
  function drawMiner(x, y, frame, air) {
    sprite(HEAD, x, y - 16, PAL);
    sprite(BODY[air ? 1 : frame], x, y - 9, PAL);
    sprite(LEGS[air ? 2 : frame], x, y - 5, PAL);
  }
  // 方块：带简单噪点纹理（固定种子，保证每次画得一样）
  function noise(i, j) { var n = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453; return n - Math.floor(n); }
  function block(x, y, base, dark, light) {
    ctx.fillStyle = base; ctx.fillRect(x, y, TILE, TILE);
    for (var i = 0; i < TILE; i += 2) for (var j = 0; j < TILE; j += 2) {
      var n = noise(i + 7, j + 3);
      if (n < 0.18) { ctx.fillStyle = dark; ctx.fillRect(x + i, y + j, 2, 2); }
      else if (n > 0.88) { ctx.fillStyle = light; ctx.fillRect(x + i, y + j, 2, 2); }
    }
  }
  /* ---------- 生物群系（数据驱动：每个群系只是一组调色板和几个图案类型） ----------
   * sky / far / ink：[浅色主题, 深色主题（夜晚）]；top / soil / deep / obs：[底色, 暗点, 亮点]；
   * pit：坑里的液体 [底色, 中间色, 高光]；obsShape：block 方块 / column 柱状（仙人掌、原木、树根）/ cap 蘑菇；
   * far：远景样式；deco：小装饰（snow 雪花 / fly 萤火虫 / spore 孢子 / ash 灰烬 / rise 上升的孢子或魂火），开启“减少动态效果”时保持静止；
   * bg：比 far 更远的环境层（trees / ceil / falls / glow / fungi / ribs / pillars），front：头顶的树冠；
   * step：脚步声 [地表种类, 音高]（草地 / 沙子 / 雪 / 石头与下界岩 / 灵魂沙 / 菌岩）；
   * amb：环境音 [噪声 w/b, 滤波, 频率, Q, 音量, 起伏 Hz, 嗡鸣频率或 0, 嗡鸣音量, 颗粒或 0]；
   * fog：雾 [浅色 RGB, 深色 RGB, 整体浓度, 地平线浓度]。雾只盖在背景上（地面、坑、障碍、小人都画在雾之后），不影响看清障碍。
   * 只改外观：所有群系的障碍尺寸、坑宽、物理与难度完全相同。 */
  var LV = ['#d4471a', '#f07a1e', '#ffb02e'], NR = ['#7a2826', '#5f1e1d', '#93393a'], ND = ['#6a2322', '#511a19', '#823232'], ST = ['#8a8f96', '#6d7278', '#a3a8ae'];   // 岩浆、下界岩、石头
  var OVERWORLD = [
    { id: 'plains', amb: ['w', 'bandpass', 500, 0.7, 0.0201, 0.09, 0, 0, 'bird'], step: ['grass', 1], sky: ['#cfe8f5', '#141c26'], far: ['#b9d8c4', '#1f2c27'], ink: ['#1f2328', '#e7e9ec'],
      top: ['#4c9a3b', '#3c7f2e', '#5fb04a'], soil: ['#8a5a35', '#6e4628', '#a06c43'], deep: ST, ore: '#4fc3c8',
      obs: ST, obsShape: 'block', pit: LV, far2: 'hills' },
    { id: 'desert', amb: ['w', 'bandpass', 950, 1.3, 0.0197, 0.13, 0, 0, 0], step: ['sand', 1], sky: ['#f3e4c0', '#1d1a24'], far: ['#e3cd97', '#2c2620'], ink: ['#3a2c14', '#efe6d6'],
      top: ['#e3d08f', '#cdb874', '#efe0a8'], soil: ['#d9c27e', '#c2aa66', '#e8d595'], deep: ['#c9b06e', '#ad9558', '#dcc485'], ore: '#c46f2b',
      obs: ['#5c9a3a', '#3f7a29', '#79b85a'], obsShape: 'column', pit: ['#b8955a', '#cfae6e', '#e2c88a'], far2: 'dunes' },
    { id: 'snowy_plains', amb: ['w', 'bandpass', 640, 3, 0.0384, 0.07, 0, 0, 0], step: ['snow', 1], sky: ['#dfe9f2', '#121a24'], far: ['#c3d3dd', '#1d2832'], ink: ['#1c2733', '#e8eef4'],
      top: ['#f4f8fb', '#dce6ee', '#ffffff'], soil: ['#7b5b3c', '#634830', '#93704c'], deep: ST, ore: '#2f6fd1',
      obs: ['#dde8f0', '#b9c9d6', '#ffffff'], obsShape: 'block', pit: ['#5d8fc4', '#86b4e0', '#c8e4f6'], far2: 'pines', deco: 'snow' },
    { id: 'jungle', amb: ['w', 'highpass', 3800, 0.7, 0.0068, 0.4, 0, 0, 'insect bird'], step: ['grass', 0.95], sky: ['#cdeccf', '#0f1d17'], far: ['#7fb57a', '#183323'], ink: ['#143018', '#e2f0e3'],
      top: ['#3f9b2f', '#2f7e22', '#58b444'], soil: ['#6e4a2a', '#57391f', '#87603a'], deep: ['#7c8a7a', '#606d5f', '#95a493'], ore: '#e2c13a',
      obs: ['#6b4a2b', '#4f361e', '#86603a'], obsShape: 'column', pit: ['#2e7fb0', '#4d9ccb', '#9fd2ee'], far2: 'canopy' },
    { id: 'badlands', amb: ['w', 'bandpass', 720, 1, 0.0197, 0.11, 0, 0, 0], step: ['sand', 0.85], sky: ['#f4dcc4', '#1f1616'], far: ['#d99a6c', '#3a2620'], ink: ['#3b1e10', '#f2e2d8'],
      top: ['#c9682c', '#a9541f', '#de8248'], soil: ['#b8653a', '#e0c2a2', '#8f4a2a'], deep: ['#d8b08a', '#9c5a36', '#efd2b2'], ore: '#e8c33a',
      obs: ['#a95836', '#874427', '#c27050'], obsShape: 'block', pit: LV, far2: 'mesa' },
    { id: 'mushroom_fields', amb: ['b', 'lowpass', 320, 0.7, 0.0115, 0.05, [110, 165.4], 0.0028, 0], step: ['grass', 0.85], sky: ['#ecdcef', '#1b1424'], far: ['#c9b1cf', '#2c2233'], ink: ['#2e1d33', '#efe4f2'],
      top: ['#8f7a96', '#76627d', '#a893ae'], soil: ['#8a5a35', '#6e4628', '#a06c43'], deep: ST, ore: '#4fc3c8',
      obs: ['#c33b33', '#e9e3dc', '#d8d0c6'], obsShape: 'cap', pit: ['#2e7fb0', '#4d9ccb', '#9fd2ee'], far2: 'hills', deco: 'spore' },
    { id: 'twilight_forest', amb: ['b', 'lowpass', 420, 0.7, 0.0118, 0.06, [73.4, 110.3], 0.0024, 'cricket'], step: ['grass', 0.8], sky: ['#9fb8a8', '#0b1612'], far: ['#4a6b52', '#13261b'], ink: ['#0f1f16', '#d9ece0'],
      top: ['#3e6b33', '#2e5426', '#4f8040'], soil: ['#4a3423', '#38271a', '#5c4230'], deep: ['#5f6a63', '#4a544e', '#77837b'], ore: '#9be36a',
      obs: ['#5a3e26', '#3e2a19', '#78563a'], obsShape: 'column', pit: ['#1f3f4a', '#2f5b66', '#6aa3a8'], far2: 'canopy', deco: 'fly',
      bg: ['trees'], front: 1, fog: ['214,232,220', '120,160,140', 0, 0.3] }
  ];
  var NETHER = [
    { id: 'nether_wastes', amb: ['b', 'lowpass', 170, 0.8, 0.0132, 0.04, [41, 61.8], 0.0028, 'bubble'], step: ['stone', 0.8], sky: ['#5a1f1c', '#1e0b0b'], far: ['#7a2b24', '#331310'], ink: ['#fbe7df', '#fbe7df'],
      top: ['#8b2f2c', '#6e2321', '#a64240'], soil: NR, deep: ND, ore: '#e8dcc0',
      obs: ['#3b1a1d', '#2a1114', '#55282c'], obsShape: 'block', pit: LV, far2: 'mesa', deco: 'ash', bg: ['ceil', 'falls', 'glow'] },
    { id: 'soul_sand_valley', amb: ['w', 'bandpass', 380, 4, 0.0451, 0.08, [196, 293.9], 0.0023, 'whisper'], step: ['soul', 1], sky: ['#2c3a3f', '#0d1416'], far: ['#3e5157', '#1a2427'], ink: ['#e3f1f3', '#e3f1f3'],
      top: ['#5b4a3d', '#46392f', '#6f5c4c'], soil: ['#4f4036', '#3d3129', '#625046'], deep: ['#3a3633', '#2b2826', '#4b4642'], ore: '#e8dcc0',
      obs: ['#d9d3c4', '#b8b1a1', '#f0ebdf'], obsShape: 'column', pit: LV, far2: 'dunes', deco: 'rise', bg: ['ceil', 'ribs'],
      fog: ['96,176,200', '60,130,156', 0.28, 0.42] },
    { id: 'crimson_forest', amb: ['b', 'lowpass', 230, 0.8, 0.0116, 0.05, [55, 82.6, 110.3], 0.0023, 0], step: ['nylium', 1], sky: ['#4a1414', '#1a0707'], far: ['#6e1d22', '#2e0c0e'], ink: ['#fde6e6', '#fde6e6'],
      top: ['#b02a2a', '#8c1f1f', '#c84040'], soil: NR, deep: ND, ore: '#e8dcc0',
      obs: ['#7a2a3a', '#5c1f2c', '#963a4c'], obsShape: 'column', pit: LV, far2: 'canopy', deco: 'spore', bg: ['ceil', 'glow', 'fungi'], fc: ['#9a2230', '#4a1c2c'] },
    { id: 'warped_forest', amb: ['b', 'lowpass', 280, 0.8, 0.0128, 0.07, [123.5, 185.2], 0.0016, 'chime'], step: ['nylium', 1.08], sky: ['#123b3a', '#071716'], far: ['#1d5552', '#0e2a29'], ink: ['#e2f6f3', '#e2f6f3'],
      top: ['#17807a', '#11635e', '#2aa198'], soil: NR, deep: ND, ore: '#e8dcc0',
      obs: ['#4fd6c4', '#24988a', '#a4f2e6'], obsShape: 'block', pit: LV, far2: 'canopy', deco: 'rise', bg: ['ceil', 'fungi'], fc: ['#1f8a80', '#3c2a5a'],
      fog: ['48,160,150', '34,120,112', 0.26, 0.4] },
    { id: 'basalt_deltas', amb: ['b', 'lowpass', 190, 0.8, 0.0136, 0.05, [46, 69.1], 0.0023, 'crackle bubble'], step: ['stone', 0.7], sky: ['#4d4a4e', '#19181a'], far: ['#6a666b', '#2e2c30'], ink: ['#f4f1f1', '#f4f1f1'],
      top: ['#68666c', '#535157', '#807e85'], soil: ['#4f4d52', '#3e3c41', '#615f65'], deep: ['#2c282c', '#1f1c1f', '#3b363b'], ore: '#e8c33a',
      obs: ['#7a2c12', '#55190a', '#f07a1e'], obsShape: 'block', pit: LV, far2: 'dunes', deco: 'ash', bg: ['ceil', 'pillars', 'falls'],
      fog: ['170,166,170', '120,116,122', 0.3, 0.42] }
  ];
  var BIOME = OVERWORLD[0];
  function pickBiome(cycle, negative) {
    var list = negative ? NETHER : OVERWORLD;
    BIOME = list[Math.max(0, Math.floor(cycle)) % list.length];
  }
  // 正数用主世界 7 个群系，负数用下界 5 个；优先用宿主精确的 cycleMod
  pickBiome(host.cycleMod ? host.cycleMod(host.negative ? NETHER.length : OVERWORLD.length) : (host.cycle || 0), !!host.negative);
  // 音效（静音时 sfx 什么也不做）：下界整体低一点，雪原高一点；坑是岩浆还是水按群系的坑色区分
  var AU = host.audio, snd = function (n, o) { if (AU) AU.sfx(n, o); };
  var PITCH = host.negative ? 0.8 : (BIOME.deco === 'snow' ? 1.15 : 1), LAVA = BIOME.pit === LV;

  // 脚步：落地一声，跑动时每 40px 一声轻的（在 tick 里触发）
  function step(v) { snd('step_' + BIOME.step[0], { pitch: BIOME.step[1], vol: v }); }

  /* ---------- 环境音：循环噪声 → 滤波 → 缓慢起伏的音量 + 可选低音嗡鸣 + 按模拟时钟触发的颗粒（鸟叫、虫鸣、冒泡…）
   * 只在进行中且开关打开时存在，结束 / 暂停 / 静音 / 隐藏 / 卸载时淡出并停止、断开全部节点；声床一次建好，每帧不新建节点，颗粒同时最多 10 个。 */
  var AMB = null, NB = null;
  function hs(a, b) { var h = Math.imul(a * 374761393 + b * 668265263, 1274126177); h ^= h >>> 13; h = Math.imul(h, 1103515245); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function ambStart() {
    if (AMB || state !== 'run' || !AU || !AU.context) return;
    var ac = AU.context(), out = AU.out(); if (!ac || !out) return;
    if (!NB || NB.ac !== ac) {                 // 2 秒白 / 褐噪声，每个 AudioContext 只生成一次
      NB = { ac: ac };
      ['w', 'b'].forEach(function (k) {
        var n = ac.sampleRate * 2, b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0), r = 1, last = 0;
        for (var i = 0; i < n; i++) { r = (Math.imul(r, 1103515245) + 12345) >>> 0; var w = r / 2147483648 - 1; d[i] = k === 'w' ? w : (last = (last + 0.02 * w) / 1.02) * 3.5; }
        NB[k] = b;
      });
    }
    var a = BIOME.amb, t0 = ac.currentTime, A = AMB = { ac: ac, srcs: [], nodes: [], live: new Set(), slot: {} };
    function node(x) { A.nodes.push(x); return x; }
    function src(x) { A.srcs.push(x); return node(x); }
    var m = A.master = node(ac.createGain()); m.gain.setValueAtTime(0, t0); m.gain.linearRampToValueAtTime(1, t0 + 0.4); m.connect(out);
    var s = src(ac.createBufferSource()), f = node(ac.createBiquadFilter()), g = node(ac.createGain());
    s.buffer = NB[a[0]]; s.loop = true; f.type = a[1]; f.frequency.value = a[2]; f.Q.value = a[3]; g.gain.value = a[4];
    s.connect(f); f.connect(g); g.connect(m); s.start(t0);
    var lfo = src(ac.createOscillator()), lg = node(ac.createGain());
    lfo.frequency.value = a[5]; lg.gain.value = a[4] * 0.6; lfo.connect(lg); lg.connect(g.gain); lfo.start(t0);
    if (a[6]) {
      var dl = node(ac.createBiquadFilter()), dg = node(ac.createGain());
      dl.type = 'lowpass'; dl.frequency.value = 400; dg.gain.value = a[7]; dl.connect(dg); dg.connect(m);
      a[6].forEach(function (hz) { var o = src(ac.createOscillator()); o.type = 'triangle'; o.frequency.value = hz; o.connect(dl); o.start(t0); });
    }
  }
  function ambStop() {
    var A = AMB; AMB = null; if (!A) return;
    // 静音 / 隐藏时宿主随即挂起 AudioContext，时钟停走：立刻停止
    var t0 = A.ac.currentTime, at = AU.enabled() ? t0 + 0.18 : 0;
    try { A.master.gain.cancelScheduledValues(t0); A.master.gain.setValueAtTime(A.master.gain.value, t0); A.master.gain.linearRampToValueAtTime(0, t0 + 0.15); } catch (e) {}
    A.srcs.forEach(function (x) { try { x.stop(at); } catch (e) {} });
    A.live.forEach(function (x) { try { x.stop(at); } catch (e) {} });
    setTimeout(function () {
      A.nodes.forEach(function (x) { try { x.disconnect(); } catch (e) {} });
      A.live.forEach(function (x) { try { x.disconnect(); } catch (e) {} });
      A.nodes.length = A.srcs.length = 0; A.live.clear();
    }, 260);
  }
  // 一个颗粒：振荡器（f0→f1 滑音）或带通噪声（f0 中心频率，f1 起音时间）→ 包络 → master；结束时断开
  function grain(osc, f0, f1, at, dur, vol, q) {
    var A = AMB; if (!A || A.live.size >= 10) return;
    var ac = A.ac, s0 = ac.currentTime + 0.01 + at, e = s0 + dur, x, fl, env = ac.createGain();
    if (osc) { x = ac.createOscillator(); x.type = 'sine'; x.frequency.setValueAtTime(f0, s0); x.frequency.exponentialRampToValueAtTime(f1, e); x.connect(env); }
    else { x = ac.createBufferSource(); x.buffer = NB.w; x.loop = true; fl = ac.createBiquadFilter(); fl.type = 'bandpass'; fl.frequency.value = f0; fl.Q.value = q; x.connect(fl); fl.connect(env); }
    env.gain.setValueAtTime(0.0001, s0); env.gain.exponentialRampToValueAtTime(vol, s0 + Math.min(dur / 2, osc ? 0.01 : f1 || 0.01)); env.gain.exponentialRampToValueAtTime(0.0001, e);
    env.connect(A.master); A.live.add(x);
    x.onended = function () { A.live.delete(x); try { x.disconnect(); env.disconnect(); if (fl) fl.disconnect(); } catch (er) {} };
    x.start(s0, osc ? undefined : hs(at * 100, 3)); x.stop(e + 0.02);
  }
  var GR = {   // [每秒几个时间槽, 槽号 k → 发声]，随机量由槽号哈希决定
    bird: [0.7, function (k) { if (hs(k, 1) < 0.5) for (var f = 2300 + hs(k, 2) * 1500, i = 0; i < 2 + (hs(k, 3) * 3 | 0); i++) grain(1, f, f * 1.3, i * 0.09, 0.06, 0.02); }],
    insect: [3, function (k) { if (hs(k, 4) < 0.5) for (var i = 0; i < 3; i++) grain(1, 4700, 4500, i * 0.04, 0.025, 0.006); }],
    cricket: [1.2, function (k) { if (hs(k, 5) < 0.6) for (var i = 0; i < 3; i++) grain(1, 4300, 4250, i * 0.05, 0.03, 0.008); }],
    bubble: [4, function (k) { if (hs(k, 6) < 0.35) grain(1, 90 + hs(k, 7) * 120, 220 + hs(k, 8) * 240, 0, 0.06 + hs(k, 9) * 0.06, 0.018); }],
    whisper: [0.5, function (k) { if (hs(k, 10) < 0.5) grain(0, 1200 + hs(k, 11) * 1200, 0.3, 0, 0.8, 0.03, 9); }],
    crackle: [8, function (k) { if (hs(k, 12) < 0.3) grain(0, 3000, 0, 0, 0.015, 0.025, 0.7); }],
    chime: [0.35, function (k) { if (hs(k, 13) < 0.45) { var f = 660 * [1, 1.25, 1.5][hs(k, 14) * 3 | 0]; grain(1, f, f, 0, 0.6, 0.006); } }]
  };
  function ambTick() {
    var A = AMB, g = BIOME.amb[8]; if (!A || !g) return;
    g.split(' ').forEach(function (n) { var r = GR[n], k = Math.floor(t * r[0]); if (A.slot[n] !== undefined && A.slot[n] !== k) r[1](k); A.slot[n] = k; });
  }

  function tile(x, y, p) { block(x, y, p[0], p[1], p[2]); }
  function topTile(x, y) {
    tile(x, y, BIOME.soil);
    ctx.fillStyle = BIOME.top[0]; ctx.fillRect(x, y, TILE, 4);
    ctx.fillStyle = BIOME.top[1];
    for (var i = 0; i < TILE; i += 2) if (noise(i, 1) > 0.45) ctx.fillRect(x + i, y + 4, 2, 2);
  }
  function oreTile(x, y) {
    tile(x, y, BIOME.deep);
    ctx.fillStyle = BIOME.ore; ctx.fillRect(x + 4, y + 5, 3, 2); ctx.fillRect(x + 9, y + 9, 3, 2); ctx.fillRect(x + 6, y + 11, 2, 2);
  }
  // 障碍的一格（碰撞盒始终是整格 16×16，只换外观）
  function obstacle(x, y, top, ore) {
    var c = BIOME.obs, shape = BIOME.obsShape;
    if (shape === 'column') {                 // 仙人掌 / 原木 / 树根：内缩 2px 的柱子，竖条纹
      ctx.fillStyle = C.edge; ctx.fillRect(x + 1, y, TILE - 2, TILE);
      ctx.fillStyle = c[0]; ctx.fillRect(x + 2, y + (top ? 1 : 0), TILE - 4, TILE - (top ? 1 : 0));
      ctx.fillStyle = c[1]; for (var i = 4; i < TILE - 3; i += 4) ctx.fillRect(x + i, y + (top ? 1 : 0), 1, TILE - (top ? 1 : 0));
      ctx.fillStyle = c[2]; ctx.fillRect(x + 3, y + (top ? 1 : 0), 1, TILE - (top ? 1 : 0));
      if (top) { ctx.fillStyle = c[1]; ctx.fillRect(x + 2, y + 1, TILE - 4, 1); }
    } else if (shape === 'cap') {             // 蘑菇：上半是菌盖（带斑点），下半是菌柄
      ctx.fillStyle = C.edge; ctx.fillRect(x, y, TILE, 8); ctx.fillRect(x + 4, y + 8, 8, 8);
      ctx.fillStyle = c[0]; ctx.fillRect(x + 1, y + 1, TILE - 2, 6);
      ctx.fillStyle = c[1]; ctx.fillRect(x + 3, y + 2, 2, 2); ctx.fillRect(x + 9, y + 3, 2, 2); ctx.fillRect(x + 12, y + 1, 2, 2);
      ctx.fillStyle = c[2]; ctx.fillRect(x + 5, y + 8, 6, 8);
    } else {                                  // 方块：噪点纹理 + 1px 描边
      tile(x, y, c);
      ctx.fillStyle = C.edge; ctx.fillRect(x, y, TILE, 1); ctx.fillRect(x, y, 1, TILE); ctx.fillRect(x + TILE - 1, y, 1, TILE);
      if (ore) { ctx.fillStyle = BIOME.ore; ctx.fillRect(x + 4, y + 5, 3, 2); ctx.fillRect(x + 9, y + 9, 3, 2); }
    }
  }
  // 坑里的液体：位置只由调用方给出的整数坐标决定；表面动画只在原地变色，不改变位置
  function liquid(x, y, w, t) {
    var p = BIOME.pit;
    ctx.fillStyle = p[0]; ctx.fillRect(x, y, w, H - y);
    var phase = Math.floor(t * 4);
    for (var i = 0; i < w; i += 2) {
      var n = noise(i, phase);
      ctx.fillStyle = n > 0.7 ? p[2] : (n > 0.4 ? p[1] : p[0]);
      ctx.fillRect(x + i, y + 2, 2, 2);
    }
  }
  // 远景（视差，偏移只取整一次）
  function drawFar(off) {
    var type = BIOME.far2;
    for (var x = -off; x < W + 64; x += 64) {
      if (type === 'pines') { for (var k = 0; k < 2; k++) { var px = x + k * 30; for (var r = 0; r < 5; r++) ctx.fillRect(px + 8 - r * 2, 100 + r * 8, 4 + r * 4, 8); ctx.fillRect(px + 9, 140, 2, 8); } }
      else if (type === 'dunes') { ctx.fillRect(x, 128, 48, 20); ctx.fillRect(x + 8, 120, 28, 8); ctx.fillRect(x + 44, 134, 20, 14); }
      else if (type === 'mesa') { ctx.fillRect(x, 104, 40, 44); ctx.fillRect(x - 4, 100, 48, 6); ctx.fillRect(x + 46, 124, 14, 24); }
      else if (type === 'canopy') { ctx.fillRect(x, 92, 34, 20); ctx.fillRect(x + 14, 112, 6, 36); ctx.fillRect(x + 36, 102, 26, 16); ctx.fillRect(x + 47, 118, 4, 30); }
      else { ctx.fillRect(x, 108, 32, 40); ctx.fillRect(x + 8, 96, 16, 12); ctx.fillRect(x + 40, 120, 24, 28); }
    }
  }
  // 小装饰：屏幕空间里的固定点位；动画只改变亮度/竖直位置，开启“减少动态效果”时完全静止
  function drawDeco(time) {
    var d = BIOME.deco; if (!d) return;
    var tt = host.reducedMotion ? 0 : time;
    for (var i = 0; i < 18; i++) {
      var x = Math.floor(noise(i, 31) * W), y0 = Math.floor(noise(i, 47) * (GROUND - 20));
      if (d === 'snow' || d === 'ash') {
        var y = Math.floor((y0 + tt * (d === 'snow' ? 12 : 8)) % (GROUND - 4));
        ctx.fillStyle = d === 'snow' ? (C.dark ? '#dfe9f2' : '#ffffff') : (BIOME === NETHER[4] ? '#e4e0dc' : '#c9b8a8');
        ctx.fillRect(x, y, d === 'snow' ? 2 : 1, d === 'snow' ? 2 : 1);
      } else if (d === 'rise') {               // 上升的魂火 / 孢子：慢慢上飘、略微左右摆
        var ry = Math.floor(GROUND - 4 - (y0 + tt * 6) % (GROUND - 8)), rx = Math.floor(x + Math.sin(tt * 0.8 + i) * 2);
        ctx.fillStyle = BIOME === NETHER[1] ? '#9fe4f5' : '#62ecd6';
        ctx.fillRect(rx, ry, 1, 1); if (i % 3 === 0) ctx.fillRect(rx, ry - 1, 1, 1);
      } else {
        var on = host.reducedMotion || noise(i, Math.floor(tt * 2)) > 0.35;
        if (!on) continue;
        ctx.fillStyle = d === 'fly' ? '#d8f56a' : (BIOME === NETHER[2] ? '#ff7a5c' : '#e6d6ee');
        ctx.fillRect(x, 40 + (y0 % 90), 2, 2);
      }
    }
  }

  // 地平线上起伏的雾带（整体的一层在 draw 里）；只盖背景
  function drawFog(cam) {
    if (!C.fog) return;
    ctx.fillStyle = C.fog[1];
    var o = Math.floor(cam * 0.3);
    for (var i = Math.floor(o / 8); i * 8 - o < W; i++) { var h = 14 + Math.floor(noise(i, 77) * 12); ctx.fillRect(i * 8 - o, GROUND - h, 8, h); }
    ctx.fillRect(0, GROUND - 8, W, 8);
  }

  function mix(a, b, k) {     // 两个 #rrggbb 按比例混合
    var r = '#';
    for (var i = 1; i < 7; i += 2) { var x = parseInt(a.substr(i, 2), 16), y = parseInt(b.substr(i, 2), 16); r += ('0' + Math.round(x + (y - x) * k).toString(16)).slice(-2); }
    return r;
  }
  function R(x, y, w, h, c) { if (c) ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }
  // 远处的环境层：每层按视差系数取整一次偏移，周期 P 内图形固定；动画只在原地变色
  function layer(f, P, fn) { var o = Math.floor(dist * f) % P; for (var x = -o; x < W; x += P) fn(x); }
  function drawBg(tt) {
    var L = BIOME.bg; if (!L) return;
    var ph = Math.floor(tt * 6);
    for (var n = 0; n < L.length; n++) {
      var k = L[n];
      if (k === 'trees') layer(0.06, 120, function (x) {         // 巨树：粗树干、板根、连成一片的树冠
        R(x + 24, 20, 14, GROUND - 20, C.bgD); R(x + 18, GROUND - 8, 26, 8); R(x + 84, 30, 8, GROUND - 30); R(x + 80, GROUND - 5, 16, 5);
        R(x, 0, 120, 14); R(x + 2, 14, 60, 14); R(x + 66, 14, 44, 22); R(x + 12, 28, 34, 6); R(x + 72, 36, 30, 5);
      });
      else if (k === 'ceil') layer(0.08, 64, function (x) {      // 下界顶棚
        R(x, 0, 64, 5, C.bgK);
        for (var i = 0; i < 64; i += 4) R(x + i, 5, 4, Math.floor(noise(i, 72) * 9));
        R(x + 22, 5, 2, 16); R(x + 50, 5, 2, 12);
      });
      else if (k === 'falls') layer(0.1, 160, function (x) {     // 岩浆瀑布：颜色向下流动，位置不变
        for (var m = 0; m < 2; m++) {
          var fx = x + (m ? 118 : 36), yb = m ? 84 : 116;
          for (var y = 8; y < yb; y += 3) R(fx, y, 3, 3, C.lava[Math.floor(noise(y / 3 - ph, 73 + m) * 2.99)]);
          R(fx - 4, yb, 11, 2, C.lava[1]); R(fx - 2, yb - 1, 7, 1, C.lava[2]);
        }
      });
      else if (k === 'glow') layer(0.08, 96, function (x) {      // 荧石簇
        R(x + 59, 5, 1, 12, C.bgK); R(x + 15, 5, 1, 16);
        R(x + 56, 16, 7, 4, C.glow[0]); R(x + 58, 20, 4, 3); R(x + 13, 20, 5, 3);
        R(x + 57, 17, 2, 2, C.glow[1]); R(x + 60, 21, 1, 1); R(x + 14, 21, 1, 1);
      });
      else if (k === 'fungi') layer(0.14, 104, function (x) {    // 巨型菌
        R(x + 20, 60, 6, GROUND - 60, C.fc[1]); R(x + 72, 92, 4, GROUND - 92);
        R(x + 4, 46, 38, 14, C.fc[0]); R(x + 10, 40, 26, 6); R(x + 6, 60, 2, 6); R(x + 37, 60, 2, 4); R(x + 15, 60, 1, 3);
        R(x + 60, 82, 28, 10); R(x + 65, 78, 18, 4); R(x + 62, 92, 1, 4); R(x + 85, 92, 1, 3);
      });
      else if (k === 'ribs') layer(0.12, 150, function (x) {     // 化石：脊椎 + 肋骨
        var c = C.bgD; R(x + 20, 96, 74, 3, c);
        for (var r = 0; r < 6; r++) { var h = 30 - r * 3; R(x + 26 + r * 11, 99, 2, h); R(x + 24 + r * 11, 99 + h, 2, 3); }
      });
      else if (k === 'pillars') layer(0.15, 56, function (x) {   // 玄武岩柱
        var hs = [44, 74, 58], xs = [2, 20, 38], ws = [9, 7, 11];
        for (var i = 0; i < 3; i++) { R(x + xs[i], GROUND - hs[i], ws[i], hs[i], C.bgD); R(x + xs[i], GROUND - hs[i], ws[i], 2, C.far); R(x + xs[i] + 2, GROUND - hs[i] + 2, 1, hs[i] - 2, C.bgK); }
      });
    }
  }
  // 暮色森林头顶的树冠与藤蔓（近景，视差更快）
  function drawFront() {
    if (!BIOME.front) return;
    layer(0.35, 48, function (x) {
      R(x, 0, 48, 4, C.bgK);
      for (var i = 0; i < 48; i += 4) { var h = 2 + Math.floor(noise(i, 70) * 8); R(x + i, 4, 4, h); if (noise(i, 71) > 0.7) R(x + i + 1, 4 + h, 1, 6 + Math.floor(noise(i, 74) * 8)); }
    });
  }

  /* ---------- 游戏状态（世界坐标） ----------
   * 所有世界物体（地面格、矿石、岩浆坑、石块）都用世界坐标 wx 表示，而且都对齐到 16px 的格子；
   * 每帧只算一次整数镜头偏移 cam = floor(dist)，屏幕坐标一律是 wx - cam，所以它们一起平滑移动、彼此不会错位。
   * 物理用固定时间步长（1/120 秒）推进，帧间隔再长也不会穿过障碍。 */
  var STEP = 1 / 120, MAX_FRAME = 0.1, PX = 40;          // PX：小人在屏幕上的固定 x
  var state = 'ready';        // ready / run / pause / over
  var best = loadBest();
  // 每局真随机（种子状态在局与局之间延续）；版本号只决定难度与生物群系外观。确定性测试用 ?egg-test 下的 __eggTest.start(seed)
  var seed;
  try { seed = crypto.getRandomValues(new Uint32Array(1))[0]; } catch (e) { seed = (Math.random() * 4294967296) >>> 0; }
  function rand() {            // mulberry32：可设定种子的随机数，便于自动测试
    seed = (seed + 0x6D2B79F5) >>> 0;
    var r = seed;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  }
  var t, speed, dist, nextAt, obs, py, vy, onGround, lastTs, acc, raf = 0, scoreNow = 0, stepK = 0;

  function reset() {
    t = 0; speed = 90; dist = 0; obs = []; py = GROUND; vy = 0; onGround = true; acc = 0; scoreNow = 0;
    nextAt = 16 * 22;          // 第一个障碍在开局约 1.5 屏之后
  }
  reset();

  function spawn() {
    // 生成在屏幕右侧之外（留 2 格余量），并对齐到格子
    var wx = Math.ceil((Math.floor(dist) + W + 32) / TILE) * TILE;
    if (wx < nextAt) wx = nextAt;
    var r = rand();
    if (r < 0.38) obs.push({ k: 'pit', wx: wx, w: TILE * (speed > 150 ? 3 : 2) });
    else obs.push({ k: 'block', wx: wx, w: TILE, h: (r > 0.75 && speed > 120) ? 2 : 1, ore: rand() < 0.3 });
    var last = obs[obs.length - 1];
    nextAt = last.wx + last.w + Math.ceil((110 + rand() * 140 + speed * 0.35) / TILE) * TILE;
  }
  function inPit(wx) {          // 世界坐标 wx 处是否是岩浆坑
    for (var i = 0; i < obs.length; i++) { var o = obs[i]; if (o.k === 'pit' && wx >= o.wx && wx < o.wx + o.w) return true; }
    return false;
  }

  function jump() {
    if (state !== 'run') return;
    if (onGround) { vy = -215; onGround = false; snd('jump', { pitch: PITCH }); }
  }

  function tick(dt) {           // 固定步长推进一步
    t += dt;
    speed = Math.min(230, 90 + t * 3.2);
    dist += speed * dt;
    while (Math.floor(dist) + W + 32 >= nextAt) spawn();
    // 回收：完全离开屏幕左侧 2 格以外才删除
    while (obs.length && obs[0].wx + obs[0].w < Math.floor(dist) - 32) obs.shift();
    // 物理
    var feetL = dist + PX + 3, feetR = dist + PX + 9;   // 脚的左右边缘（世界坐标）
    var support = !(inPit(feetL) && inPit(feetR));       // 两只脚都在坑上方才会掉下去
    vy += 620 * dt;
    var prev = py, air = !onGround;
    py += vy * dt;
    if (support && prev <= GROUND && py >= GROUND) { py = GROUND; vy = 0; onGround = true; }   // 落地并吸附
    else if (!(support && py === GROUND)) onGround = false;
    if (onGround) { py = GROUND; vy = 0; }
    ambTick();
    if (air && onGround) step(0.8);
    else if (onGround && Math.floor(dist / 40) !== stepK) step(0.3);
    stepK = Math.floor(dist / 40);
    // 碰撞（世界坐标的矩形相交）
    var pl = dist + PX + 2, pr = dist + PX + 10;
    for (var j = 0; j < obs.length; j++) {
      var o = obs[j];
      if (o.k === 'block' && pr > o.wx + 1 && pl < o.wx + o.w - 1 && py > GROUND - o.h * TILE + 1) { snd('hit', { pitch: PITCH }); return die(); }
    }
    if (py > GROUND + 10) { snd(LAVA ? 'hiss' : 'splash', { pitch: PITCH, vol: 1.4 }); return die(); }
    scoreNow = Math.floor(dist / 10);
  }

  function die() {
    state = 'over'; ambStop(); snd('fail', { pitch: PITCH });
    if (scoreNow > best) { best = scoreNow; saveBest(best); }
    stopLoop(); draw(); ui();
  }

  /* ---------- 绘制（固定顺序：背景 → 远景 → 装饰 → 地面 → 坑 → 障碍 → 小人 → 文字） ---------- */
  function draw() {
    if (!C.sky) return;
    var cam = Math.floor(dist);
    ctx.fillStyle = C.sky; ctx.fillRect(0, 0, W, H);
    drawBg(host.reducedMotion ? 0 : t);
    if (C.fog && BIOME.fog[2]) { ctx.fillStyle = C.fog[0]; ctx.fillRect(0, 0, W, GROUND); }
    ctx.fillStyle = C.far;
    drawFar(Math.floor(dist * 0.2) % 64);
    drawFog(cam);
    drawFront();
    drawDeco(t);
    // 地面格：按世界格编号绘制，坑处不画
    var first = Math.floor(cam / TILE);
    for (var k = first; k * TILE - cam < W; k++) {
      var wx = k * TILE, sx = wx - cam;
      if (inPit(wx)) continue;
      topTile(sx, GROUND);
      if (noise(k, 9) > 0.8) oreTile(sx, GROUND + TILE); else tile(sx, GROUND + TILE, BIOME.soil);
      tile(sx, GROUND + TILE * 2 - 4, BIOME.deep);
    }
    var o, n;
    for (n = 0; n < obs.length; n++) { o = obs[n]; if (o.k === 'pit') liquid(o.wx - cam, GROUND + 6, o.w, t); }
    for (n = 0; n < obs.length; n++) {
      o = obs[n];
      if (o.k === 'block') for (var b = 0; b < o.h; b++) obstacle(o.wx - cam, GROUND - (b + 1) * TILE, b === o.h - 1, o.ore && b === o.h - 1);
    }
    drawMiner(PX, Math.round(py), Math.floor(dist / 10) % 2, !onGround);
    // 分数（右上）与群系名（左上）
    ctx.font = '9px ui-monospace, Menlo, Consolas, monospace';
    ctx.textBaseline = 'top'; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.strokeStyle = C.sky;   // 天空色描边：背景再花也看得清
    hud(T('biomes.' + BIOME.id), 6, 'left');
    hud(T('hud_score', { score: scoreNow, best: best }), W - 6, 'right');
    // 覆盖层
    if (state !== 'run') {
      ctx.fillStyle = C.overlay; ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = C.text;
      ctx.font = 'bold 14px system-ui, sans-serif';
      var title = state === 'over' ? T('overlay.over') : (state === 'pause' ? T('overlay.paused') : '');
      if (title) ctx.fillText(title, W / 2, 70);
      ctx.font = 'bold 12px system-ui, sans-serif'; ctx.fillStyle = C.accent;
      ctx.fillText(T('hint'), W / 2, title ? 94 : 82);
      if (state === 'over') { ctx.fillStyle = C.text; ctx.fillText(T('overlay.score', { score: scoreNow, best: best }), W / 2, 112); }
    }
  }

  function hud(s, x, al) { ctx.textAlign = al; ctx.strokeText(s, x, 6); ctx.fillStyle = C.ink; ctx.fillText(s, x, 6); }

  function ui() {
    btn.textContent = T(state === 'over' ? 'button.again' : (state === 'pause' ? 'button.resume' : 'button.start'));
    btn.hidden = state === 'run';
    scoreEl.innerHTML = '';
    scoreEl.append.apply(scoreEl, T.nodes('bar_score', { score: scoreNow, best: best }, function (k, v) { var e = document.createElement('b'); e.textContent = String(v); return e; }));
  }

  /* ---------- 主循环：只在游戏进行中、页面可见时运行；固定步长 + 累加器 ---------- */
  function advance(frameDt) {
    acc += Math.min(MAX_FRAME, Math.max(0, frameDt));
    var lastScoreTick = Math.floor(t * 4);
    while (acc >= STEP && state === 'run') { tick(STEP); acc -= STEP; }
    if (state !== 'run') return;
    draw();
    if (Math.floor(t * 4) !== lastScoreTick) ui();
  }
  function frame(ts) {
    raf = 0;
    if (state !== 'run') return;
    advance(lastTs ? (ts - lastTs) / 1000 : 0);
    lastTs = ts;
    if (state === 'run') raf = requestAnimationFrame(frame);
  }
  function startLoop() { if (!raf) { lastTs = 0; raf = requestAnimationFrame(frame); } }
  function stopLoop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }

  function play() {
    if (state === 'over' || state === 'ready') reset();
    state = 'run'; ui(); startLoop(); ambStart();
    try { canvas.focus({ preventScroll: true }); } catch (e) { canvas.focus(); }
  }
  function action() { if (state === 'run') jump(); else play(); }

  // 自动测试用：地址带 ?egg-test 时提供确定性的推进接口（不影响正常游玩）
  if (/[?&]egg-test\b/.test(location.search)) {
    root.__eggTest = {
      start: function (s) { seed = s >>> 0; reset(); state = 'run'; stopLoop(); ui(); ambStart(); },
      amb: function () { return AMB ? { on: true, nodes: AMB.nodes.length, grains: AMB.live.size } : { on: false }; },
      advance: function (dt) { advance(dt); },
      jump: jump,
      biomes: function () { var nm = function (b) { return T('biomes.' + b.id); }; return { overworld: OVERWORLD.map(nm), nether: NETHER.map(nm) }; },
      setBiome: function (cycle, negative) { ambStop(); pickBiome(cycle, negative); readTheme(); },
      snapshot: function () {
        var cam = Math.floor(dist);
        return { state: state, cam: cam, py: py, onGround: onGround,
          obs: obs.map(function (o) { return { id: o.k + ':' + o.wx, k: o.k, sx: o.wx - cam, w: o.w }; }) };
      }
    };
  }

  btn.addEventListener('click', play, { signal });
  canvas.addEventListener('pointerdown', function (e) { e.preventDefault(); action(); }, { signal });
  canvas.addEventListener('keydown', function (e) {
    if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W' || e.key === 'Enter') { e.preventDefault(); action(); }
  }, { signal });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && state === 'run') { state = 'pause'; ambStop(); stopLoop(); draw(); ui(); }
  }, { signal });
  if (AU && AU.onChange) AU.onChange(function (on) { if (on) ambStart(); else ambStop(); });   // 开关、页面可见性
  host.onThemeChange(readTheme);      // 系统深浅色、顶栏手动切换

  // 任何情况下都不自动开始（因此也满足“减少动态效果”的偏好）：只画一帧静态的开始画面，等玩家点“开始”
  var ro = null;
  if (typeof ResizeObserver === 'function') { ro = new ResizeObserver(function () { layout(); }); ro.observe(root); }
  window.addEventListener('resize', layout, { signal });   // 缩放页面时 devicePixelRatio 变化，容器宽度可能不变
  readTheme(); layout(); ui();
  return {
    unmount() { stopLoop(); state = 'over'; ambStop(); if (ro) ro.disconnect(); delete root.__eggTest; wrap.remove(); style.remove(); }
  };
}

/* 内置文案：与 dist/assets/egg/texts/runner.js 相同，只在文案文件加载失败时使用。改文字请改 texts/runner.js */
const TEXTS = {
  name: '（待服主填写）',
  intro: '',
  button: { start: '开始', again: '再来一次', resume: '继续' },
  hint: '空格 / 点按：跳跃',
  overlay: { over: '游戏结束', paused: '已暂停', score: '分数 {score}   最高 {best}' },
  hud_score: '分数 {score}  最高 {best}',
  bar_score: '分数 {score}　最高 {best}',
  biomes: {
    plains: '平原', desert: '沙漠', snowy_plains: '雪原', jungle: '丛林', badlands: '恶地', mushroom_fields: '蘑菇岛', twilight_forest: '暮色森林',
    nether_wastes: '下界荒地', soul_sand_valley: '灵魂沙峡谷', crimson_forest: '绯红森林', warped_forest: '诡异森林', basalt_deltas: '玄武岩三角洲'
  }
};

export default {
  id: 'runner',
  title: '（待服主填写）', // 游戏名的兜底；实际显示 texts/runner.js 的 name
  texts: TEXTS,
  mount
};
