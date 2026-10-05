/* ---------- 主线程的世界镜像（渲染器无关）：差量应用 + 显示插值 + 气流场 + 光照体 ---------- */
var M_AIR = 0, M_STONE = 1, M_LAVA = 2, M_WATER = 3, M_GSTONE = 4, M_COBBLE = 5, M_OBSID = 6, M_TORCH = 7;
function isSolidM(m) { return m >= 4 ? m <= 6 : m === 1; }
function isFluidM(m) { return m === 2 || m === 3; }
function Scene(C, M, opts) {
  var B = C.buildWorld(M, opts), w = B.w;
  this.C = C; this.M = M; this.B = B; this.fluid = B.fluid; this.lakeTop = B.lakeTop;
  this.X = w.X; this.Y = w.Y; this.Z = w.Z; this.N = w.N; this.XZ = w.X * w.Z;
  this.mat = new Uint8Array(w.mat); this.q = new Uint8Array(w.q);
  this.init = { mat: new Uint8Array(w.mat), q: new Uint8Array(w.q), st: new Uint8Array(w.st), sources: w.sources.map(function (s) { return { i: s.i, f: s.f }; }),
    seed: (M.seed ^ 0x5bd1e995 ^ Math.imul(M.k + 1, 0x27d4eb2d)) >>> 0, params: opts.params || null, breach: B.breach };
  this.dq = new Float32Array(this.N);          // 显示层数（向真实层数缓动）
  this.dm = new Uint8Array(this.mat);          // 显示材质（淡出时保留流体类型）
  for (var i = 0; i < this.N; i++) this.dq[i] = this.q[i];
  this.surge = new Float32Array(this.N);       // 瞬移“涌动”计时（秒）：目标格上升闪光
  this.tick = 0; this.level = 0; this.solidVer = 0; this.torchVer = 0; this.mix = []; this.field = null; this.sndEv = [];
  this.col = { p: 0, f: 0 };
}
Scene.prototype.idx = function (x, y, z) { return (y * this.Z + z) * this.X + x; };
Scene.prototype.apply = function (idx, mat, q, ev, tick) {
  for (var k = 0; k < idx.length; k++) {
    var i = idx[k], m = mat[k], was = this.mat[i];
    this.mat[i] = m; this.q[i] = q[k];
    if (isFluidM(m)) this.dm[i] = m;
    else if (m !== M_AIR) { this.dm[i] = m; this.dq[i] = 0; }
    if (m !== was) { if (isSolidM(m) || isSolidM(was)) this.solidVer++; else if (m === M_TORCH || was === M_TORCH) this.torchVer++; }
  }
  if (ev) for (k = 0; k + 3 < ev.length; k += 4) {
    if (ev[k] !== 5 && this.sndEv.length < 64) this.sndEv.push(ev[k], ev[k] === 1 ? ev[k + 2] : ev[k + 1]);   // 给音效用：类型 + 格
    if (ev[k] === 1) this.surge[ev[k + 2]] = 0.4;
    else if (ev[k] === 2 || ev[k] === 4 || ev[k] === 3) this.mix.push({ i: ev[k + 1], t: 0 });   // 混合成石 / 落水成石的蒸汽；火把被水浇灭冒一小股烟
  }
  if (tick != null) this.tick = tick;
};
// 每帧把一个长方体范围内的显示层数向真实值缓动（τ≈0.11 s）
Scene.prototype.ease = function (x0, x1, y0, y1, z0, z1, dt) {
  var k = 1 - Math.exp(-dt / 0.11), X = this.X, Z = this.Z;
  x0 = Math.max(0, x0); z0 = Math.max(0, z0); y0 = Math.max(0, y0); x1 = Math.min(X - 1, x1); z1 = Math.min(Z - 1, z1); y1 = Math.min(this.Y - 1, y1);
  for (var y = y0; y <= y1; y++) for (var z = z0; z <= z1; z++) {
    var i = (y * Z + z) * X + x0;
    for (var x = x0; x <= x1; x++, i++) {
      var tq = isFluidM(this.mat[i]) ? this.q[i] : 0, d = this.dq[i];
      if (d !== tq) { d += (tq - d) * k; if (Math.abs(tq - d) < 0.02) d = tq; this.dq[i] = d; }
      if (this.surge[i] > 0) this.surge[i] = Math.max(0, this.surge[i] - dt);
    }
  }
  for (var m = this.mix.length - 1; m >= 0; m--) { this.mix[m].t += dt; if (this.mix[m].t > 0.9) this.mix.splice(m, 1); }
};
Scene.prototype.fq = function (i) { return isFluidM(this.dm[i]) && this.dq[i] > 0.02 ? this.dq[i] : 0; };
// 竖直列（深坑 / 竖井）里流体顶面接近列顶的程度 0..1
Scene.prototype.column = function (x, z, yFrom, yTo) {
  var o = this.col, sum = 0; o.p = 0; o.f = 0;
  for (var y = yFrom; y <= yTo; y++) { var i = this.idx(x, y, z), v = this.fq(i); if (v > 0) { o.f = this.dm[i]; sum = (y - yFrom) + v / 8; } }
  o.p = Math.min(1, sum / (yTo - yFrom + 1));
  return o;
};
/* 气流场：以出口为根在“还有空气的巷道格”上建最短路树，按驱动源累加风量。
 *   岩浆：热量 = 本格与相邻格的岩浆量，带余温（τ≈6 s，岩浆停住后仍在吹）
 *   水：  排气量 = 本格新增的水层数（只计正增量，τ≈1.5 s），水面稳定后风停 */
function airField(sc, lv, prev, dt) {
  var M = sc.M, W = M.W, H = M.H, N = W * H, X = sc.X, base = sc.C.levelBase(sc.level), fl = sc.fluid, i, k, d;
  var st = prev || { heat: new Float32Array(N), last: new Float32Array(N), wind: new Float32Array(N), dir: new Int8Array(N), par: new Int32Array(N), open: new Uint8Array(N), src: new Float32Array(N), order: new Int32Array(N), max: 0 };
  var OFF = [1, -1, W, -W], open = st.open, par = st.par, order = st.order, src = st.src, n = 0;
  for (i = 0; i < N; i++) {
    open[i] = 0; if (lv.t[i] === 0) continue;
    var hc = ((base + 2) * H + ((i / W) | 0)) * X + i % W, hm = sc.mat[hc];
    if ((isFluidM(hm) && sc.q[hc] >= 8) || isSolidM(hm)) continue;
    open[i] = 1;
  }
  par.fill(-2); par[lv.ladder.i] = -1; order[n++] = lv.ladder.i;
  for (k = 0; k < n; k++) { var p = order[k]; for (d = 0; d < 4; d++) { var nb = p + OFF[d]; if (par[nb] === -2 && open[nb]) { par[nb] = p; order[n++] = nb; } } }
  var decay = fl === M_LAVA ? Math.exp(-dt / 6) : Math.exp(-dt / 1.5);
  src.fill(0);
  for (i = 0; i < N; i++) {
    if (lv.t[i] === 0) continue;
    var x = i % W, z = (i / W) | 0, vol = 0;
    for (var y = base; y <= base + 2; y++) { var c = (y * H + z) * X + x; if (sc.mat[c] === fl) vol += sc.q[c]; }
    if (fl === M_LAVA) {
      var s = vol / 8;
      for (d = 0; d < 4; d++) { var j = i + OFF[d]; for (y = base; y <= base + 2; y++) { var c2 = (y * H + ((j / W) | 0)) * X + j % W; if (sc.mat[c2] === M_LAVA) s += sc.q[c2] / 8; } }
      st.heat[i] = Math.max(st.heat[i] * decay, s);
    } else { var inc = vol - st.last[i]; st.heat[i] = st.heat[i] * decay + (inc > 0 ? inc : 0); st.last[i] = vol; }
    if (!st.heat[i]) continue;
    if (open[i] && par[i] !== -2) src[i] += st.heat[i];
    else for (d = 0; d < 4; d++) { var m2 = i + OFF[d]; if (open[m2] && par[m2] !== -2) src[m2] += st.heat[i] / 2; }
  }
  var wind = st.wind, mx = 0; wind.fill(0); st.dir.fill(-1);
  for (k = n - 1; k >= 0; k--) {
    var a = order[k]; wind[a] += src[a];
    if (par[a] >= 0) { wind[par[a]] += wind[a]; var dd = par[a] - a; st.dir[a] = dd === 1 ? 0 : dd === -1 ? 1 : dd === W ? 2 : 3; }
    if (wind[a] > mx) mx = wind[a];
  }
  st.max = mx;
  return st;
}
