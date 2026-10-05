/* ---------- 2D 兜底渲染（无 WebGL2 时）：俯视，液面按层数抬升 + 台阶立面 + 北墙水位线（方案 B），色阶取方案 A ---------- */
var TS = 16, VW = 320, VH = 240;
function hash2(x, z, s) { var h = Math.imul(x * 374761393 + z * 668265263 + (s | 0) * 2246822519, 1274126177); h ^= h >>> 13; h = Math.imul(h, 1103515245); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function rgb(h) { var n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
function mixc(a, b, t) { return 'rgb(' + ((a[0] + (b[0] - a[0]) * t) | 0) + ',' + ((a[1] + (b[1] - a[1]) * t) | 0) + ',' + ((a[2] + (b[2] - a[2]) * t) | 0) + ')'; }
function ramp(stops, v) {
  if (v <= stops[0][0]) return mixc(stops[0][1], stops[0][1], 0);
  for (var k = 1; k < stops.length; k++) if (v <= stops[k][0]) { var a = stops[k - 1], b = stops[k]; return mixc(a[1], b[1], (v - a[0]) / (b[0] - a[0])); }
  var l = stops[stops.length - 1][1]; return mixc(l, l, 0);
}
var LAVA_RAMP = [[0, rgb('#3d0f07')], [2, rgb('#7a1c08')], [5, rgb('#c8400f')], [8, rgb('#ee6d1c')], [11, rgb('#ff9a2c')], [14, rgb('#ffc844')], [16, rgb('#fff0a6')]];
var WATER_RAMP = [[0, rgb('#7cc4ee')], [3, rgb('#4f9ad8')], [8, rgb('#2f69b8')], [12, rgb('#22488e')], [16, rgb('#162f66')]];
var ORE_C = [null, '#5fe0d8', '#f2c94c', '#e8413c', '#3b5fd6', '#d8b48a', '#2b2b2b'];
function make2D(canvas) {
  var g = canvas.getContext('2d'), terr = [], cell = {}, Dm = new Float32Array(32 * 24);
  var Lw = new Float32Array(64 * 48), Ll = new Float32Array(64 * 48), Op = new Uint8Array(64 * 48), lcv = null, lbuf = null;
  g.imageSmoothingEnabled = false;
  function prerender(lv, W, H) {
    var cv = document.createElement('canvas'); cv.width = W * TS; cv.height = H * TS;
    var c = cv.getContext('2d'), open = function (i) { return lv.t[i] !== 0; }, k;
    for (var z = 0; z < H; z++) for (var x = 0; x < W; x++) {
      var i = z * W + x, px = x * TS, py = z * TS, t = lv.t[i];
      if (t === 0) {
        c.fillStyle = '#5b5d63'; c.fillRect(px, py, TS, TS);
        for (k = 0; k < 10; k++) { c.fillStyle = hash2(x * 7 + k, z * 3, 1) < 0.5 ? '#4a4c51' : '#6c6f75'; c.fillRect(px + ((hash2(x, z, k + 9) * 7) | 0) * 2, py + ((hash2(z, x, k + 3) * 7) | 0) * 2, 2, 2); }
        if (lv.ore[i]) { c.fillStyle = ORE_C[lv.ore[i]]; for (k = 0; k < 4; k++) c.fillRect(px + 3 + ((hash2(x, z, 40 + k) * 9) | 0), py + 2 + ((hash2(x, z, 50 + k) * 6) | 0), 2, 2); }
        if (z + 1 < H && open(i + W)) {
          c.fillStyle = '#3a3b40'; c.fillRect(px, py + 10, TS, 6);
          c.fillStyle = '#2e2f33'; for (k = 0; k < TS; k += 4) c.fillRect(px + k + ((z & 1) * 2), py + 12, 1, 4);
          if (lv.ore[i]) { c.fillStyle = ORE_C[lv.ore[i]]; c.fillRect(px + 5, py + 12, 2, 2); }
        }
        c.fillStyle = 'rgba(0,0,0,.28)';
        if (x > 0 && open(i - 1)) c.fillRect(px, py, 1, TS);
        if (x + 1 < W && open(i + 1)) c.fillRect(px + TS - 1, py, 1, TS);
        continue;
      }
      var room = t === 2 || t === 3, hl = lv.hall && lv.hall[i];
      c.fillStyle = room ? '#9a6b3c' : hl ? '#a3a3a8' : '#8a8379'; c.fillRect(px, py, TS, TS);
      if (hl) { c.fillStyle = '#86868c'; c.fillRect(px, py + 7, TS, 1); c.fillRect(px, py + 15, TS, 1); c.fillRect(px + ((z & 1) ? 3 : 11), py, 1, 7); c.fillRect(px + ((z & 1) ? 11 : 3), py + 8, 1, 7); }   // 信标厅：石砖地面
      else if (room) { c.fillStyle = '#7d5530'; for (k = 0; k < TS; k += 4) c.fillRect(px, py + k + 3, TS, 1); }
      else for (k = 0; k < 7; k++) { c.fillStyle = hash2(x, z, k + 20) < 0.5 ? '#7a7369' : '#9a9389'; c.fillRect(px + ((hash2(x, z, k) * 8) | 0) * 2, py + ((hash2(z, x, k + 5) * 8) | 0) * 2, 2, 1); }
      if (z > 0 && !open(i - W)) { c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(px, py, TS, 2); }
      if (lv.item[i]) { c.fillStyle = ['', '#9aa3ad', '#6b4a2b', '#5d6570', '#b8b1a1', '#9aa3ad'][lv.item[i]]; c.fillRect(px + 5, py + 7, 6, 3); }
    }
    // 出口小厅的告示牌：北墙的牌子画在墙的立面（岩石格下沿那条）上；南墙的牌子从墙顶探出一点（俯视看得到）
    if (lv.signs) lv.signs.forEach(function (sg) { var sx = sg.x * TS, sz = sg.z * TS + (sg.face > 0 ? 5 : 1);   // 北墙：立面的上半（头部高度）
      c.fillStyle = '#4a3220'; c.fillRect(sx + 2, sz - 1, 12, 7); c.fillStyle = '#b98a52'; c.fillRect(sx + 3, sz, 10, 5); c.fillStyle = '#8a6036'; c.fillRect(sx + 3, sz + 2, 10, 1);
      c.fillStyle = '#55565c'; c.fillRect(sx + 4, sz - 2, 1, 2); c.fillRect(sx + 11, sz - 2, 1, 2); });
    for (k = 0; k < lv.chests.length; k++) {
      var ci = lv.chests[k], cx = (ci % W) * TS, cz = ((ci / W) | 0) * TS;
      c.fillStyle = '#3b2412'; c.fillRect(cx + 2, cz + 3, 12, 11); c.fillStyle = '#9a6328'; c.fillRect(cx + 3, cz + 4, 10, 9);
      c.fillStyle = '#7a4a1c'; c.fillRect(cx + 3, cz + 8, 10, 1); c.fillStyle = '#d8d0c0'; c.fillRect(cx + 7, cz + 7, 2, 3);
    }
    return cv;
  }
  function ladder(px, py, a) { g.fillStyle = 'rgba(107,74,43,' + a + ')'; g.fillRect(px + 3, py, 2, TS); g.fillRect(px + 11, py, 2, TS); g.fillStyle = 'rgba(139,99,56,' + a + ')'; for (var k = 1; k < TS; k += 4) g.fillRect(px + 3, py + k, 10, 2); }
  function stone(m, px, py) {
    var c = m === M_OBSID ? ['#1c1426', '#2e2140', '#4b3a6b'] : m === M_COBBLE ? ['#6f7177', '#55575c', '#8d9096'] : ['#8e9196', '#7b7e83', '#a3a6ab'];
    g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(px + 1, py + 3, 15, 13);
    g.fillStyle = c[0]; g.fillRect(px, py, TS, TS - 3);
    g.fillStyle = c[1]; g.fillRect(px, py + 4, TS, 1); g.fillRect(px, py + 9, TS, 1); g.fillRect(px + 5, py, 1, 4); g.fillRect(px + 11, py + 5, 1, 4);
    g.fillStyle = c[2]; g.fillRect(px + 1, py + 1, 3, 2); g.fillRect(px + 8, py + 6, 2, 2);
    g.fillStyle = c[1]; g.fillRect(px, py + TS - 3, TS, 3);
  }
  function fluidTile(f, D, hq, px, py, x, z, time, rm, wallN, southD, surge) {
    var lava = f === M_LAVA, e = Math.round(D * 0.5);
    var top = lava ? ramp(LAVA_RAMP, 6 + D * 0.6) : ramp(WATER_RAMP, D), side = lava ? ramp(LAVA_RAMP, 2 + D * 0.35) : ramp(WATER_RAMP, Math.min(16, D + 4));
    if (!lava) g.globalAlpha = Math.min(1, 0.45 + D / 14);
    g.fillStyle = top; g.fillRect(px, py - e, TS, TS);
    if (lava && D < 4 && !hq) { g.fillStyle = '#2a0b05'; var cr = 1 - D / 4; for (var k = 0; k < 16; k++) if (hash2(x * 4 + (k & 3), z * 4 + (k >> 2), 7) < cr * 0.9) g.fillRect(px + (k & 3) * 4, py - e + (k >> 2) * 4, 4, 4); }
    if (wallN && e > 0) { g.fillStyle = side; g.fillRect(px, py - e, TS, 1); }
    var step = e - Math.round(southD * 0.5);
    if (step > 0) { g.fillStyle = side; g.fillRect(px, py + TS - step, TS, step); }
    g.globalAlpha = 1;
    if (lava) { g.fillStyle = hq > 0 ? '#fff3c0' : '#ffb440'; for (k = 0; k < (hq > 0 ? 5 : 3); k++) { if (rm ? hash2(x, z, k) > 0.4 : ((time * 1.5 + hash2(x, z, k + 60) * 7) % 2) < 1) g.fillRect(px + ((hash2(x, z, k + 70) * 13) | 0), py - e + ((hash2(x, z, k + 80) * 11) | 0), 2, 1); } }
    else { g.fillStyle = 'rgba(225,242,255,.6)'; var wv = rm ? 0 : Math.floor(time * 3); g.fillRect(px + ((hash2(x, z, wv) * 10) | 0), py - e + 3 + ((hash2(z, x, wv) * 8) | 0), 4, 1); }
    if (surge > 0 && !rm) { var s = surge / 0.4, r = Math.round(2 + (1 - s) * 6); g.fillStyle = (lava ? 'rgba(255,240,170,' : 'rgba(210,240,255,') + (0.7 * s).toFixed(2) + ')';
      g.fillRect(px + 8 - r, py - e + 8 - r, r * 2, 1); g.fillRect(px + 8 - r, py - e + 8 + r - 1, r * 2, 1); g.fillRect(px + 8 - r, py - e + 8 - r, 1, r * 2); g.fillRect(px + 8 + r - 1, py - e + 8 - r, 1, r * 2); }
  }
  // 坑 / 深坑 / 竖井口：坑内流体从坑底升到坑口；深坑与竖井口额外显示下方上涨流体的预警
  function pit(kind, pf, pq, px, py, time, rm, col, nN, nE, nS, nW) {
    var deep = kind >= 2, x0 = px + (nW ? 0 : 1), x1 = px + TS - (nE ? 0 : 1), y0 = py + (nN ? 0 : 1), y1 = py + TS - (nS ? 0 : 1);
    g.fillStyle = deep ? '#060608' : '#1d1b1a'; g.fillRect(x0, y0, x1 - x0, y1 - y0);
    if (!nN) { g.fillStyle = deep ? '#141218' : '#3a3633'; g.fillRect(x0, py + 1, x1 - x0, 4); }   // 坑沿的阴影只在朝向地面的北边
    if (deep && col.p > 0) {
      var p = col.p, cx = px + 8, cy = py + 9;
      if (col.f === M_LAVA) {
        var lv = Math.round(1 + p * 5), pulse = rm ? 0 : Math.sin(time * (2 + p * 6)) * 0.5 + 0.5;
        g.fillStyle = mixc(rgb('#3a0a04'), rgb('#ff8a20'), p); g.fillRect(cx - lv, cy - lv + 1, lv * 2, lv * 2 - 2);
        if (p > 0.45) { g.fillStyle = mixc(rgb('#ff8a20'), rgb('#fff0a0'), Math.min(1, (p - 0.45) * 2 + pulse * 0.2)); g.fillRect(cx - (lv >> 1), cy - (lv >> 1), lv, lv); }
      } else {
        var r2 = Math.round(1 + p * 6), ring = rm ? Math.round(p * 3) : Math.floor((time * 2) % 3) + 1;
        g.fillStyle = mixc(rgb('#0b1a33'), rgb('#4f9ad8'), p); g.fillRect(cx - r2, cy - r2 + 1, r2 * 2, r2 * 2 - 2);
        g.fillStyle = 'rgba(200,232,255,' + (0.25 + 0.5 * p).toFixed(2) + ')';
        for (var rr = 1; rr <= Math.min(ring, r2); rr += 2) { g.fillRect(cx - rr, cy - rr, rr * 2, 1); g.fillRect(cx - rr, cy + rr - 1, rr * 2, 1); }
      }
    }
    if (pq > 0) {
      var lava = pf === M_LAVA, h = Math.round(pq / 8 * 4);
      if (!lava) g.globalAlpha = 0.85;
      g.fillStyle = lava ? ramp(LAVA_RAMP, 3 + pq * 0.6) : ramp(WATER_RAMP, 8 + pq / 2);
      var fy = nN ? py : py + 6 - h; g.fillRect(x0, fy, x1 - x0, y1 - fy);
      g.globalAlpha = 1;
    }
    if (kind === 3) ladder(px, py, 0.9);
  }
  function secTile(lava, px, py, time, rm) {
    var k, x, y;
    if (lava) { g.fillStyle = '#c9420c'; g.fillRect(px, py, TS, TS); for (k = 0; k < 9; k++) { var ph = rm ? 0 : Math.floor(time * 2 + k) % 3; g.fillStyle = ph === 0 ? '#ff9a2a' : ph === 1 ? '#f06a14' : '#ffc24a'; g.fillRect(px + ((k * 5 + 3) % 14), py + ((k * 7 + 1) % 14), 3, 2); } return; }
    g.fillStyle = '#1c4d96'; g.fillRect(px, py, TS, TS);
    g.fillStyle = 'rgba(8,24,60,.55)'; for (y = 0; y < TS; y++) for (x = 0; x < TS; x++) if (((x + y) % 6) === 0) g.fillRect(px + x, py + y, 1, 1);
  }
  var SPK2 = [[3, 3, '#fcebd6'], [4, 3, '#fcb7da'], [10, 4, '#3ac5fd'], [7, 7, '#ffffff'], [8, 7, '#fcb7da'], [12, 10, '#fcebd6'], [5, 11, '#3ac5fd'], [9, 12, '#fcb7da'], [2, 8, '#3ac5fd']];
  function oreInfo(lv, i) { for (var k = 0; k < lv.weirdList.length; k++) if (lv.weirdList[k].i === i) return lv.weirdList[k]; return null; }
  function view(sc, lv, cpx, cpz, time, rm, theme, ex) {
    var M = sc.M, W = M.W, H = M.H, C = sc.C, b = C.levelBase(sc.level), X = sc.X, XZ = sc.XZ;
    var tx0 = Math.max(0, Math.floor(cpx / TS)), tz0 = Math.max(0, Math.floor(cpz / TS)), tx1 = Math.min(W - 1, tx0 + VW / TS + 1), tz1 = Math.min(H - 1, tz0 + VH / TS + 1);
    var tr = terr[sc.level]; if (!tr || tr.lv !== lv) { tr = terr[sc.level] = prerender(lv, W, H); tr.lv = lv; }
    g.fillStyle = '#1a1a1d'; g.fillRect(0, 0, VW, VH);
    g.drawImage(tr, cpx, cpz, VW, VH, 0, 0, VW, VH);
    var nx = tx1 - tx0 + 1, x, z, i;
    for (z = tz0; z <= Math.min(H - 1, tz1 + 1); z++) for (x = tx0; x <= tx1; x++) {
      var c0 = sc.idx(x, b + 1, z); Dm[(z - tz0) * nx + (x - tx0)] = lv.t[z * W + x] === 0 ? 0 : sc.fq(c0) + sc.fq(c0 + XZ);
    }
    for (z = tz0; z <= tz1; z++) for (x = tx0; x <= tx1; x++) {
      i = z * W + x; var t = lv.t[i];
      if (t === 0 && lv.weird && lv.weird[i] && ex.minedBits) {   // 奇怪的矿石：挖穿的薄墙画成巷道地面（借旁边巷道格的贴图）；只挖掉一个高度的在朝巷道那条边画出缺口
        var mb = ex.minedBits(i), wo = oreInfo(lv, i);
        if (mb === lv.weird[i] && lv.weird[i] === 3 && wo) g.drawImage(tr, (wo.from % W) * TS, ((wo.from / W) | 0) * TS, TS, TS, x * TS - cpx, z * TS - cpz, TS, TS);
        else if (mb && wo) { var ex0 = x * TS - cpx, ez0 = z * TS - cpz, fx0 = wo.from % W - x, fz0 = ((wo.from / W) | 0) - z; g.fillStyle = '#14110f'; g.fillRect(ex0 + (fx0 > 0 ? 12 : 0), ez0 + (fz0 > 0 ? 12 : 0), fx0 ? 4 : TS, fz0 ? 4 : TS); }
        continue;
      }
      if (t === 0) {   // 岩石格里的流体（破口外的湖 / 水库）在剖切高度以上还有流体 → 画剖面（岩浆：整块岩浆；水：深色 + 斜剖面线，不画水面高光）
        var ch = sc.idx(x, b + 2, z); if (sc.fq(ch) && sc.fq(ch + XZ)) secTile(sc.dm[ch] === M_LAVA, x * TS - cpx, z * TS - cpz, time, rm);
        continue;
      }
      var px = x * TS - cpx, py = z * TS - cpz, ip = sc.idx(x, b, z), fi = ip + XZ, hi = fi + XZ;
      var pk = t === 4 ? 3 : lv.pit[i], col = sc.col; col.p = 0;
      if (pk === 2) sc.column(x, z, b - C.LEVEL_G + 1, b - 1);   // 深坑：从下层脚部算起，下层刚进流体就能看到
      else if (pk === 3) sc.column(x, z, Math.max(1, b - C.LEVEL_G + 1), b);
      if (pk && !isSolidM(sc.mat[ip])) {   // 相邻的坑连成一片（与 3D 一致）：朝向坑的那几条边不留地面缝、不画坑沿；深坑只与深坑相连，保持可区分
        var pj = function (dx, dz) { var x2 = x + dx, z2 = z + dz; if (x2 < 0 || z2 < 0 || x2 >= W || z2 >= H) return false; var q = lv.t[z2 * W + x2] === 4 ? 3 : lv.pit[z2 * W + x2]; return pk === 1 ? q === 1 || q === 2 : q === pk; };
        pit(pk, sc.dm[ip], sc.fq(ip), px, py, time, rm, col, pj(0, -1), pj(1, 0), pj(0, 1), pj(-1, 0));
      }
      else if (pk) stone(sc.mat[ip], px, py);
      if (sc.mat[fi] === M_TORCH) { var ox = (x + z) & 1 ? 11 : 3; g.fillStyle = '#6b4a2b'; g.fillRect(px + ox, py + 5, 2, 6); g.fillStyle = (rm || ((time * 9 + px) % 2) < 1) ? '#ffd25a' : '#ffb03a'; g.fillRect(px + ox, py + 3, 2, 2); }
      if (isSolidM(sc.mat[fi])) { stone(sc.mat[fi], px, py); continue; }
      var fq = sc.fq(fi), hq = sc.fq(hi), D = fq + hq;
      if (t === 3) ladder(px, py, 1);
      if (D > 0) fluidTile(sc.dm[fi] || sc.dm[hi], D, hq, px, py, x, z, time, rm, z > 0 && lv.t[i - W] === 0, Dm[(z + 1 - tz0) * nx + (x - tx0)] || 0, Math.max(sc.surge[fi], sc.surge[hi]));
      if (t === 3 && D > 0) ladder(px, py - Math.round(D * 0.5), 0.55);   // 含水梯子：梯子在液面里，淡淡露出
      if ((pk === 1 || pk === 2) && fq > 0.3) { g.fillStyle = 'rgba(0,0,0,.35)'; var oy = -Math.round(D * 0.5); for (var dd = 2; dd < 14; dd += 3) { g.fillRect(px + dd, py + 2 + oy, 2, 1); g.fillRect(px + dd, py + 13 + oy, 2, 1); g.fillRect(px + 2, py + dd + oy, 1, 2); g.fillRect(px + 13, py + dd + oy, 1, 2); } }
    }
    for (var m = 0; m < sc.mix.length; m++) { var e = sc.mix[m], exx = e.i % X, ez = ((e.i / X) | 0) % sc.Z, a = 1 - e.t / 0.9, up = rm ? 0 : Math.round(e.t * 10);
      g.fillStyle = 'rgba(235,235,235,' + (0.7 * a).toFixed(2) + ')'; g.fillRect(exx * TS - cpx + 3, ez * TS - cpz + 4 - up, 4, 3); g.fillRect(exx * TS - cpx + 8, ez * TS - cpz + 2 - up, 5, 4); }
    if (ex.beforeLight) ex.beforeLight(g);
    light(sc, lv, cpx, cpz, tx0, tz0, tx1, tz1, theme, ex);
    // 告示牌在暗处也认得出：光照之后再描一圈暗暖色的边
    if (lv.signs) for (var sk2 = 0; sk2 < lv.signs.length; sk2++) { var sg2 = lv.signs[sk2], gx2 = sg2.x * TS - cpx, gz2 = sg2.z * TS - cpz + (sg2.face > 0 ? 5 : 1);
      g.fillStyle = 'rgba(214,150,80,.55)'; g.fillRect(gx2 + 2, gz2 - 1, 12, 1); g.fillRect(gx2 + 2, gz2 + 5, 12, 1); g.fillRect(gx2 + 2, gz2 - 1, 1, 7); g.fillRect(gx2 + 13, gz2 - 1, 1, 7); }
    // 奇怪的矿石的晶粒画在光照之后（自发光，暗处也醒目）：整格稀疏的晶粒 + 朝巷道那条边一排更密的晶粒；减少动态时不闪
    if (lv.weirdList && ex.minedBits) for (var wk = 0; wk < lv.weirdList.length; wk++) {
      var wo2 = lv.weirdList[wk], wx = wo2.i % W, wz = (wo2.i / W) | 0; if (wx < tx0 - 1 || wx > tx1 + 1 || wz < tz0 - 1 || wz > tz1 + 1) continue;
      var left = lv.weird[wo2.i] & ~ex.minedBits(wo2.i); if (!left) continue;
      var bx2 = wx * TS - cpx, bz2 = wz * TS - cpz, sides = wo2.other != null ? [wo2.from, wo2.other] : [wo2.from];
      for (var sk = 0; sk < SPK2.length; sk++) { var q2 = SPK2[sk], tw2 = rm ? 0 : ((Math.floor(time * 2.2 + sk * 1.7 + wk) % 7) === 0 ? 1 : 0); g.fillStyle = tw2 ? '#ffffff' : q2[2]; g.fillRect(bx2 + q2[0], bz2 + q2[1], 1, 1); }
      for (var sd = 0; sd < sides.length; sd++) { var fx1 = sides[sd] % W - wx, fz1 = ((sides[sd] / W) | 0) - wz;
        for (var e2 = 1; e2 < 15; e2 += 2) { var ccol = ['#fcebd6', '#fcb7da', '#3ac5fd'][(e2 + wk) % 3], ox2 = fx1 ? (fx1 > 0 ? 14 : 1) : e2, oz2 = fz1 ? (fz1 > 0 ? 14 : 1) : e2; g.fillStyle = ccol; g.fillRect(bx2 + ox2, bz2 + oz2, 1, (left & 2) ? 1 : 1); if (left === 3 || left === 2) g.fillRect(bx2 + ox2 - (fx1 ? fx1 : 0), bz2 + oz2 - (fz1 ? fz1 : 0), 1, 1); } }
    }
  }
  // 光照：格级光照（火把/小厅/信标 = 白光，岩浆 = 暖光，只在巷道中传播）+ 手持火把；岩壁只取邻格白光的一半（避免暖色色块）
  function light(sc, lv, cpx, cpz, tx0, tz0, tx1, tz1, theme, ex) {
    var M = sc.M, W = M.W, H = M.H, PAD = 6, b = sc.C.levelBase(sc.level), XZ = sc.XZ;
    var ax0 = Math.max(0, tx0 - PAD), az0 = Math.max(0, tz0 - PAD), ax1 = Math.min(W - 1, tx1 + PAD), az1 = Math.min(H - 1, tz1 + PAD);
    var aw = ax1 - ax0 + 1, ah = az1 - az0 + 1, n = aw * ah, x, z, k;
    if (Lw.length < n) { Lw = new Float32Array(n); Ll = new Float32Array(n); Op = new Uint8Array(n); }
    Lw.fill(0, 0, n); Ll.fill(0, 0, n);
    for (z = 0; z < ah; z++) for (x = 0; x < aw; x++) {
      var ti = (z + az0) * W + x + ax0, t = lv.t[ti]; k = z * aw + x; Op[k] = t !== 0 ? 1 : 0;
      if (!t) continue;
      var c0 = sc.idx(x + ax0, b, z + az0);
      if (sc.mat[c0 + XZ] === M_TORCH) Lw[k] = 1;
      if (t === 2 || t === 3) Lw[k] = Math.max(Lw[k], lv.grad[ti] > 0.9 ? 0.95 : 0.6);
      if (sc.fluid === M_LAVA) { var D = sc.fq(c0 + XZ) + sc.fq(c0 + 2 * XZ) + (sc.dm[c0] === M_LAVA ? sc.fq(c0) * 0.6 : 0); if (D > 0.05) Ll[k] = 0.55 + 0.45 * Math.min(1, D / 8); }
    }
    if (ex.lights) for (var e = 0; e < ex.lights.length; e++) { var L = ex.lights[e], lx = L.x - ax0, lz = L.z - az0; if (lx >= 0 && lz >= 0 && lx < aw && lz < ah) { var kk = lz * aw + lx; if (L.warm) Ll[kk] = Math.max(Ll[kk], L.v); else Lw[kk] = Math.max(Lw[kk], L.v); } }
    var dec = 0.17;
    function relax(k3, m3) { if (!Op[m3]) return; var v = Lw[m3] - dec; if (v > Lw[k3]) Lw[k3] = v; v = Ll[m3] - dec; if (v > Ll[k3]) Ll[k3] = v; }
    for (var it = 0; it < 2; it++) {
      for (z = 0; z < ah; z++) for (x = 0; x < aw; x++) { k = z * aw + x; if (!Op[k]) continue; if (x > 0) relax(k, k - 1); if (z > 0) relax(k, k - aw); }
      for (z = ah - 1; z >= 0; z--) for (x = aw - 1; x >= 0; x--) { k = z * aw + x; if (!Op[k]) continue; if (x + 1 < aw) relax(k, k + 1); if (z + 1 < ah) relax(k, k + aw); }
    }
    for (z = 0; z < ah; z++) for (x = 0; x < aw; x++) {
      k = z * aw + x; if (Op[k]) continue;
      var bw = 0;
      if (x > 0 && Op[k - 1]) bw = Math.max(bw, Lw[k - 1], Ll[k - 1]); if (x + 1 < aw && Op[k + 1]) bw = Math.max(bw, Lw[k + 1], Ll[k + 1]);
      if (z > 0 && Op[k - aw]) bw = Math.max(bw, Lw[k - aw], Ll[k - aw]); if (z + 1 < ah && Op[k + aw]) bw = Math.max(bw, Lw[k + aw], Ll[k + aw]);
      Lw[k] = bw * 0.5; Ll[k] = 0;
    }
    var bw4 = (tx1 - tx0 + 1) * 4, bh4 = (tz1 - tz0 + 1) * 4;
    if (!lcv || lcv.width !== bw4 || lcv.height !== bh4) { lcv = document.createElement('canvas'); lcv.width = bw4; lcv.height = bh4; lbuf = lcv.getContext('2d').createImageData(bw4, bh4); }
    var data = lbuf.data, amb = theme.amb2d, dk = theme.dark2d, pl = ex.player;
    for (var py = 0; py < bh4; py++) {
      var fz = tz0 + (py + 0.5) / 4 - 0.5 - az0, z0 = Math.max(0, Math.min(ah - 1, Math.floor(fz))), z1 = Math.min(ah - 1, z0 + 1), wz = Math.max(0, Math.min(1, fz - z0));
      for (var px = 0; px < bw4; px++) {
        var fx = tx0 + (px + 0.5) / 4 - 0.5 - ax0, x0 = Math.max(0, Math.min(aw - 1, Math.floor(fx))), x1 = Math.min(aw - 1, x0 + 1), wx = Math.max(0, Math.min(1, fx - x0));
        var a00 = z0 * aw + x0, a10 = z0 * aw + x1, a01 = z1 * aw + x0, a11 = z1 * aw + x1;
        var lw = (Lw[a00] * (1 - wx) + Lw[a10] * wx) * (1 - wz) + (Lw[a01] * (1 - wx) + Lw[a11] * wx) * wz;
        var ll = (Ll[a00] * (1 - wx) + Ll[a10] * wx) * (1 - wz) + (Ll[a01] * (1 - wx) + Ll[a11] * wx) * wz;
        var dx = tx0 + (px + 0.5) / 4 - pl.x, dz = tz0 + (py + 0.5) / 4 - pl.z, lp = Math.max(0, 1 - Math.sqrt(dx * dx + dz * dz) / pl.r); lp = lp * (2 - lp);
        var tot = Math.min(1, amb + lw + ll + lp), wr = ll / (lw + ll + lp + 0.001), o4 = (py * bw4 + px) * 4;
        data[o4] = dk[0] + (70 - dk[0]) * wr; data[o4 + 1] = dk[1] + (14 - dk[1]) * wr; data[o4 + 2] = dk[2] + (2 - dk[2]) * wr; data[o4 + 3] = (1 - tot) * 245;
      }
    }
    lcv.getContext('2d').putImageData(lbuf, 0, 0);
    g.imageSmoothingEnabled = true; g.drawImage(lcv, tx0 * TS - cpx, tz0 * TS - cpz, bw4 * 4, bh4 * 4); g.imageSmoothingEnabled = false;
  }
  // 竖井侧视的岩壁纹理（40×26 可平铺，2px 噪点 + 裂缝；与世界坐标对齐，随镜头上下滚动）
  var rockT = null;
  function rockTile() {
    if (rockT) return rockT;
    var c = document.createElement('canvas'); c.width = 40; c.height = 26; var r = c.getContext('2d'), s = 11;
    var rnd = function () { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (var y = 0; y < 26; y += 2) for (var x = 0; x < 40; x += 2) { var v = 92 + ((rnd() * 26) | 0); r.fillStyle = 'rgb(' + v + ',' + v + ',' + (v + 4) + ')'; r.fillRect(x, y, 2, 2); }
    r.fillStyle = 'rgba(0,0,0,.28)'; r.fillRect(0, 25, 40, 1); r.fillRect(19, 0, 1, 13); r.fillRect(6, 13, 1, 12); r.fillRect(31, 13, 1, 12); r.fillRect(0, 12, 40, 1);
    return (rockT = c);
  }
  // 竖井侧视：中间梯子，液面在梯子前（半透明）；镜头随玩家上升
  function climb(sc, lv, P, theme, time, rm) {
    var C = sc.C, b = C.levelBase(sc.level), lx = lv.ladder.x, lz = lv.ladder.z, top = sc.level + 1 < sc.M.levels.length ? C.levelBase(sc.level + 1) + 1 : b + 7;
    var ph = 26, py = b + 1 + P.climb * (top - b - 1), camY = Math.round(VH * 0.62 + py * ph);
    // 两侧岩壁 + 竖井内壁：同一张纹理，侧壁压暗；整列随高度滚动
    var rt = rockTile(), oy = ((camY % 26) + 26) % 26;
    for (var ty = oy - 26; ty < VH; ty += 26) for (var tx = 0; tx < VW; tx += 40) g.drawImage(rt, tx, ty);
    g.fillStyle = 'rgba(8,8,12,.55)'; g.fillRect(0, 0, VW / 2 - 40, VH); g.fillRect(VW / 2 + 40, 0, VW / 2 - 40, VH);
    g.fillStyle = 'rgba(8,8,12,.18)'; g.fillRect(VW / 2 - 40, 0, 80, VH);
    var lg = g.createLinearGradient(0, 0, 0, VH); lg.addColorStop(0, 'rgba(0,0,0,.25)'); lg.addColorStop(0.62, 'rgba(255,214,150,.10)'); lg.addColorStop(1, 'rgba(0,0,0,.3)');
    g.fillStyle = lg; g.fillRect(VW / 2 - 40, 0, 80, VH);   // 手里火把的光：人物附近略亮，上下渐暗
    for (var y = 0; y < sc.Y; y++) {
      var sy = camY - (y + 1) * ph; if (sy > VH || sy < -ph) continue;
      g.fillStyle = (y & 1) ? '#45474c' : '#4f5156'; g.fillRect(VW / 2 - 40, sy, 80, 1);
      var ry = (y - 1) % C.LEVEL_G; if (y >= 1 && (ry === 1 || ry === 2) && y <= top + 2) { g.fillStyle = '#6b6560'; g.fillRect(VW / 2 - 120, sy, 80, ph); g.fillRect(VW / 2 + 40, sy, 80, ph); if (ry === 1) { g.fillStyle = '#57514c'; g.fillRect(VW / 2 - 120, sy + ph - 3, 240, 3); } }
    }
    // 最后一段竖井：地表下 3 格泥土、最上面一格草方块，地面以上是天空与远景（与结局同一张背景）
    var ytop = 0;
    if (sc.level + 1 >= sc.M.levels.length) {
      var vs = b + 9, sys = camY - vs * ph;
      for (y = vs - 4; y < vs; y++) { var syd = camY - (y + 1) * ph; if (syd > VH || syd < -ph) continue;
        g.fillStyle = '#6e4f33'; g.fillRect(0, syd, VW, ph); g.fillStyle = '#5a3f28'; g.fillRect(VW / 2 - 40, syd, 80, ph);
        g.fillStyle = 'rgba(40,26,14,.5)'; for (var dk = 0; dk < 12; dk++) g.fillRect(((dk * 53 + y * 31) % VW), syd + ((dk * 7 + y) % (ph - 2)), 3, 2);
        if (y === vs - 1) { g.fillStyle = '#5f9a3a'; g.fillRect(0, syd, VW / 2 - 40, 5); g.fillRect(VW / 2 + 40, syd, VW / 2 - 40, 5); g.fillStyle = '#4d8530'; for (var gx = 0; gx < VW; gx += 3) if (gx < VW / 2 - 40 || gx >= VW / 2 + 40) g.fillRect(gx, syd + 5, 1, (gx * 7) % 3 + 1); } }
      if (sys > 0) { if (ex2d.sky) ex2d.sky(g, sys); else { g.fillStyle = '#9fd0ee'; g.fillRect(0, 0, VW, sys); } }
      ytop = Math.max(0, sys);
    }
    // 竖井这一列按世界里的方块画（不是固定长度）：竖井（含梯子）只到上一层的地面——上一层地面以上是该层巷道的入口（两格空气），再往上是岩石。
    // 只有最上层的竖井一直通到地表（上面已画泥土 / 草方块 / 天空）
    var last2 = sc.level + 1 >= sc.M.levels.length, vs2 = b + 9, ladTop = last2 ? vs2 : C.levelBase(sc.level + 1) + 1;   // 梯子顶（世界高度）：上一层坑底那格的上沿 = 上一层地面
    for (y = b + 1; y < (last2 ? vs2 : sc.Y); y++) {
      var syc = camY - (y + 1) * ph; if (syc > VH || syc < -ph) continue;
      var air = last2 ? true : !isSolidM(sc.mat[sc.idx(lx, y, lz)]);
      if (!air) { g.drawImage(rt, VW / 2 - 40, syc, 40, ph); g.drawImage(rt, VW / 2, syc, 40, ph); g.fillStyle = 'rgba(8,8,12,.55)'; g.fillRect(VW / 2 - 40, syc, 80, ph); }
      else if (y >= ladTop) { g.fillStyle = '#6b6560'; g.fillRect(VW / 2 - 40, syc, 80, ph); if ((y - 1) % C.LEVEL_G === 1) { g.fillStyle = '#57514c'; g.fillRect(VW / 2 - 40, syc + ph - 3, 80, 3); } }   // 上一层巷道的入口
    }
    var ladY = Math.max(ytop, camY - ladTop * ph);
    if (ladY < VH) {
      g.fillStyle = '#6b4a2b'; g.fillRect(VW / 2 - 14, ladY, 3, VH - ladY); g.fillRect(VW / 2 + 11, ladY, 3, VH - ladY);
      g.fillStyle = '#8b6338'; for (y = (camY % 10 + 10) % 10; y < VH; y += 10) if (y >= ladY) g.fillRect(VW / 2 - 14, y, 28, 2);
    }
    ex2d.player(g, VW / 2 - 6, Math.round(VH * 0.62) + 8);
    for (y = b - 1; y < sc.Y; y++) {
      var i = sc.idx(lx, y, lz), v = sc.fq(i); if (!v) continue;
      var sy2 = camY - y * ph, h = Math.round(v / 8 * ph), lava = sc.dm[i] === M_LAVA;
      g.fillStyle = lava ? 'rgba(238,109,28,.82)' : 'rgba(47,105,184,.55)'; g.fillRect(VW / 2 - 40, sy2 - h, 80, h);
      if (!sc.fq(i + sc.XZ)) { g.fillStyle = lava ? '#ffd860' : '#bfe4ff'; g.fillRect(VW / 2 - 40, sy2 - h, 80, 1); }
    }
  }
  var ex2d = {};
  return { kind: '2d', g: g, view: view, climb: climb, ex: ex2d, resize: function () {}, reset: function () { terr = []; } };
}
