/* ---------- 有限流体引擎（纯函数体，无 DOM；同一份源码既在主线程/Node 调用，也经 toString 放进 Worker） ----------
 * 复刻天圆地方 FINITE 模式对原版水/岩浆的规则（FiniteFluidVanillaFluidTask / FiniteFlowingVanilla / AverageFlow /
 * IFiniteVanillaPressure*Task / FluidPressureSearchManager / BlockLiquidMixin / BlockStaticLiquidMixin）。
 * 格子：i = (y*Z + z)*X + x；mat 为方块类型，q 为层数（0..8），st=1 表示静态液体。世界外壳必须是实心方块（不做越界检查）。 */
function fluidEngine() {
  'use strict';
  var AIR = 0, STONE = 1, LAVA = 2, WATER = 3, GSTONE = 4, COBBLE = 5, OBSID = 6, TORCH = 7;
  var DEF = {
    rate: [0, 0, 30, 5],          // 计划刻间隔：岩浆（主世界）30，水 5
    lavaSlow: true,               // 岩浆在压强流动之后 3/4 概率间隔 ×4
    slope: [0, 0, 2, 4],          // 单层坡度搜寻距离：主世界岩浆 2（原版 getSlopeFindDistance），水 4
    noAvgLevel: 4,                // 无平均选择时的压强范围等级（默认 4 → 511）
    weights: [0, 0, 0, 10, 10, 75, 4, 1], // 静态液体发布任务的范围等级权重（等级 -1..6）
    staticP: 1,                   // 静态液体有结果但没变化时再发布任务的概率（源码 0.4；服主决定：一直发布）
    dispersion: 20,               // 压强回调延迟 rand(20)
    cleanPeriod: 60,              // 每 60 刻清空全部未取走的结果
    batch: 512,                   // 普通（大范围）任务每个压强刻最多搜 512 步
    pressure: true,
    tpEvents: false,              // 记录瞬移事件（画面“涌动”用）
    randomTickP: 3 / 4096,        // 原版 randomTickSpeed=3、每 16³ 区段
    sourcePeriod: 1,              // 源头每几刻补满一次（游戏层面的“无限源”）
    sourceDelay: 0,               // 源头在第几刻之后才开始补给
    sourceLevel: 4,
    sourceStatic: false,          // 源头补满后保持静态并立即“泵”（不等一次动态更新），见报告               // 源头“泵”：每次补给后若空闲就发布一个该等级的压强任务（-1 关闭）
    bfsRotate: true,              // BFS 邻居顺序：先下、水平随机轮转（false = 源码顺序）
    idleDelay: 40,                // 上一次搜索为空时，再次发布的任务推迟的刻数（性能旋钮）
    staticNoResultP: 1            // 静态液体没有结果时发布任务的概率（源码为 0；服主决定：一直发布）
  };
  function mulberry(s) {
    var a = s >>> 0;
    var f = function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var r = a; r = Math.imul(r ^ (r >>> 15), r | 1); r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
    f.get = function () { return a; }; f.set = function (v) { a = v >>> 0; };
    return f;
  }
  function blocked(m) { return m === STONE || m === GSTONE || m === COBBLE || m === OBSID; }
  function airLike(m) { return m === AIR || m === TORCH; }
  function isFluid(m) { return m === LAVA || m === WATER; }

  function create(X, Y, Z, seed, params) {
    var P = {}, k;
    for (k in DEF) P[k] = DEF[k];
    if (params) for (k in params) P[k] = params[k];
    var XZ = X * Z, N = XZ * Y;
    var mat = new Uint8Array(N), q = new Uint8Array(N), st = new Uint8Array(N);
    mat.fill(STONE);
    var due = new Int32Array(N).fill(-1), lock = new Uint8Array(N);
    var vis = new Uint32Array(N), stamp = 0, queue = new Int32Array(N);
    var buckets = new Map(), tasks = [], results = new Map(), sources = [];
    var rand = mulberry(seed);
    var dirty = new Uint8Array(N), dirtyList = [];
    var events = [];              // {t:'mix'|'torch'|'gstone', i}
    var S = { tick: 0, injected: 0, lavaLost: 0, waterLost: 0, teleports: 0, above: 0, updates: 0, pops: 0, tasks: 0, bfs: 0 };
    // N, E, S, W（EnumFacing.Plane.HORIZONTAL 的顺序）
    var H4 = [-X, 1, X, -1];
    var OPP = [2, 3, 0, 1];
    var D6 = [1, -1, X, -X, XZ, -XZ];          // +x,-x,+z,-z,+y,-y（FluidSearchUtil.DIRS6，用于邻居通知）
    // BFS 邻居顺序（偏离）：源码固定 +x,-x,+z,-z,+y,-y。这里先向下，再按每个任务随机轮转的水平顺序，最后向上：
    // 同一 BFS 层里矿坑（更低）先被找到 → “先灌坑”；水平轮转消除 +x 方向的系统性偏置（第 0 层出口在东侧，偏置会不公平）
    var HB = [[1, -1, X, -X], [-X, X, 1, -1], [-1, 1, -X, X], [X, -X, -1, 1]];
    var MIXD = [XZ, -X, X, -1, 1];              // UP, N, S, W, E（EnumFacing.values() 去掉 DOWN）

    function mark(i) { if (!dirty[i]) { dirty[i] = 1; dirtyList.push(i); } }
    function yOf(i) { return (i / XZ) | 0; }
    function schedule(i, d) {
      if (due[i] >= 0) return;
      var t = S.tick + (d > 0 ? d : 0);
      due[i] = t;
      var b = buckets.get(t); if (!b) { b = []; buckets.set(t, b); } b.push(i);
    }
    function rate(f) { return P.rate[f]; }
    // 写方块并通知邻居（setBlockState flag 3）
    function set(i, m, qq, s) { mat[i] = m; q[i] = qq; st[i] = s; mark(i); }
    function setNotify(i, m, qq, s) { set(i, m, qq, s); notify(i); }
    function notify(i) {
      for (var d = 0; d < 6; d++) {
        var n = i + D6[d], m = mat[n];
        if (m === LAVA && checkMix(n)) continue;
        if (isFluid(m) && st[n]) toDynamic(n);          // 静态液体 neighborChanged → updateLiquid
      }
    }
    // 静态 → 动态（flag 2，不通知邻居；onBlockAdded：先检查混合，没混合就计划更新）
    function toDynamic(i) {
      st[i] = 0; mark(i);
      if (mat[i] === LAVA && checkMix(i)) return;
      schedule(i, rate(mat[i]));
    }
    // 在 i 处放置动态液体（若方块类型改变则视为 onBlockAdded）
    function placeDyn(i, f, qq) {
      var was = mat[i], wasSt = st[i];
      if (mat[i] === TORCH) events.push({ t: 'torch', i: i, f: f });
      else if (mat[i] === WATER && f === LAVA) { S.waterLost += q[i]; events.push({ t: 'wash', i: i }); }
      setNotify(i, f, qq, 0);
      if (mat[i] !== f) return;                      // 通知过程中已被混合掉
      if (was !== f || wasSt) {
        if (f === LAVA && checkMix(i)) return;
        schedule(i, rate(f));
      }
    }
    // BlockLiquidMixin.checkForMixing：岩浆的上方或四周有水 → 满格变黑曜石，否则圆石；水减 1 层
    function checkMix(i) {
      for (var d = 0; d < 5; d++) {
        var n = i + MIXD[d];
        if (mat[n] === WATER) {
          S.lavaLost += q[i];
          set(i, q[i] === 8 ? OBSID : COBBLE, 0, 0);
          events.push({ t: 'mix', i: i });
          notify(i);
          var wq = q[n] - 1;
          S.waterLost += 1;
          if (wq <= 0) setNotify(n, AIR, 0, 0);
          else { setNotify(n, WATER, wq, 0); schedule(n, rate(WATER)); }
          return true;
        }
      }
      return false;
    }
    function canFlowDownTo(f, j) {
      var m = mat[j];
      if (m === f) return q[j] < 8;
      if (isFluid(m)) return m === WATER;
      return !blocked(m);
    }
    // 单层坡度（FiniteFlowingVanilla.singleSlopeAlgorithm / getSingleSlopeDistance）
    function slopeDist(p, k, from, f, R) {
      var best = 1000;
      for (var d = 0; d < 4; d++) {
        if (d === from) continue;
        var n = p + H4[d], m = mat[n];
        if (blocked(m) || isFluid(m)) continue;
        if (canFlowDownTo(f, n - XZ)) return k;
        if (k < R) { var r = slopeDist(n, k + 1, OPP[d], f, R); if (r < best) best = r; }
      }
      return best;
    }
    var slopeOut = [];
    function singleSlope(i, f) {
      var diff = 1000; slopeOut.length = 0;
      for (var d = 0; d < 4; d++) {
        var n = i + H4[d], m = mat[n];
        if (blocked(m) || isFluid(m)) continue;
        var s = canFlowDownTo(f, n - XZ) ? 0 : slopeDist(n, 1, OPP[d], f, P.slope[f]);
        if (s < diff) slopeOut.length = 0;
        if (s <= diff) { slopeOut.push(d); diff = s; }
      }
      if (diff === 1000) slopeOut.length = 0;
      return slopeOut;
    }
    // 平均流动的选择（gatherFlowChoices + isLastChoiceAvailable）
    var chDir = [0, 0, 0, 0], chCur = [0, 0, 0, 0], chAdd = [0, 0, 0, 0], chAir = [0, 0, 0, 0];
    function gather(i, f, qq) {
      var c = 0;
      for (var d = 0; d < 4; d++) {
        var n = i + H4[d], m = mat[n];
        if (airLike(m)) { chDir[c] = d; chCur[c] = 0; chAdd[c] = 0; chAir[c] = 1; c++; }
        else if (m === f) {
          if (q[n] >= 8 || q[n] + 1 > qq - 1) continue;
          chDir[c] = d; chCur[c] = q[n]; chAdd[c] = 0; chAir[c] = 0; c++;
        }
      }
      return c;
    }
    // AverageFlow 逐层分配算法（原版 8 层流体最多 28 次，总是走朴素分支）；返回分出去的层数
    function resolve(c, qq) {
      if (c <= 0) return 0;
      var newQ = qq, off = 0;
      for (;;) {
        var best = -1, bh = 1e9;
        for (var k = 0; k < c; k++) {
          var j = (k + off) % c, h = chCur[j] + chAdd[j];
          if (h >= 8) continue;
          if (h + 1 > newQ - 1) continue;
          if (h < bh) { bh = h; best = j; }
        }
        if (best < 0) break;
        chAdd[best]++; newQ--; off++;
      }
      return qq - newQ;
    }
    function canFlow(i) {
      var f = mat[i], qq = q[i];
      if (canFlowDownTo(f, i - XZ)) return true;
      if (qq === 1) {
        if (mat[i - XZ] === f) return false;
        return singleSlope(i, f).length > 0;
      }
      return gather(i, f, qq) > 0;
    }
    // ---------- 压强系统 ----------
    function weighted() {
      var w = P.weights, sum = 0, j;
      for (j = 0; j < w.length; j++) sum += w[j];
      var r = rand() * sum;
      for (j = 0; j < w.length; j++) { r -= w[j]; if (r < 0) return j - 1; }
      return w.length - 2;
    }
    function publish(i, L, extra) {
      if (!P.pressure) return;
      lock[i] = 1;
      var it = L === 4 ? 511 : (1 << (L + 5));
      var single = it <= 511;
      tasks.push({ src: i, f: mat[i], q0: q[i], it: it, single: single, ready: S.tick + (extra || 0) + (single ? 1 : Math.ceil(it / P.batch)) });
      S.tasks++;
    }
    function upFull(i) { var u = i + XZ; return mat[u] === mat[i] && q[u] === 8; }
    function makeStatic(i, mode) {   // mode: 0 NO_MODE/其他, 1 SLOPE_MODE(不发布), 2 AVERAGE_MODE
      st[i] = 1; mark(i);
      if (mode === 1 || !P.pressure) return;
      if (!isFluid(mat[i]) || lock[i] || upFull(i)) return;
      publish(i, mode === 2 ? 0 : P.noAvgLevel);
    }
    function sendQuery(i, direct, p, extra) {   // BlockStaticLiquidMixin.sendPressureQuery
      if (lock[i] || upFull(i)) return;
      if (direct || rand() < (p == null ? P.staticP : p)) publish(i, weighted(), extra);
    }
    // BFS（IFiniteVanillaPressureBFSTask.search_Inner）
    function bfs(t) {
      var src = t.src, f = t.f, q0 = t.q0, y0 = yOf(src), res = [];
      stamp++; if (stamp === 0xffffffff) { vis.fill(0); stamp = 1; }
      vis[src] = stamp; queue[0] = src;
      var h = 0, tl = 1, pops = 0, maxPops = t.single ? t.it + 1 : t.it;
      var hb = P.bfsRotate ? HB[(rand() * 4) | 0] : null;
      var ord = hb ? [-XZ, hb[0], hb[1], hb[2], hb[3], XZ] : D6;
      while (h < tl && pops < maxPops) {
        var p = queue[h++]; pops++;
        var m = mat[p], py = yOf(p);
        if (m === AIR) { if (py !== y0 || q0 > 1) res.push(p); }
        else if (m === f) { var qq = q[p]; if ((py < y0 && qq < 8) || (py === y0 && qq < q0 - 1)) res.push(p); }
        if (res.length > q0 + 2) break;
        if (m === AIR) continue;
        for (var d = 0; d < 6; d++) {
          var o = ord[d], vert = o === XZ || o === -XZ;
          if (o === XZ && py === y0) continue;
          var n = p + o;
          if (vis[n] === stamp) continue;
          vis[n] = stamp;
          var mn = mat[n];
          if (mn === f || (mn === AIR && (vert || q0 > 1 || py < y0))) queue[tl++] = n;
        }
      }
      S.pops += pops; S.bfs++;
      return res;
    }
    function runPressure() {
      if (!tasks.length) return;
      var keep = [];
      for (var k = 0; k < tasks.length; k++) {
        var t = tasks[k];
        if (t.ready > S.tick) { keep.push(t); continue; }
        lock[t.src] = 0;
        if (mat[t.src] !== t.f || q[t.src] !== t.q0) continue;      // 状态变了：丢弃
        results.set(t.src, bfs(t));
        schedule(t.src, (rand() * P.dispersion) | 0);
      }
      tasks = keep;
    }
    // FiniteFlowingVanilla.tryPressureFlow / tryTeleport；返回是否改变了源格
    function applyTeleports(src, list) {
      var f = mat[src], changed = false, ys = yOf(src);
      for (var k = 0; k < list.length; k++) {
        if (mat[src] !== f) break;
        var to = list[k], tm = mat[to], my = q[src], same = yOf(to) === ys, mv;
        if (tm === f) {
          var tq = Math.max(q[to], 1);
          if (same && tq >= my - 1) continue;
          mv = same ? (my - tq) >> 1 : Math.min(8 - tq, my);
          if (mv <= 0) continue;
          my -= mv;
          if (my <= 0) setNotify(src, AIR, 0, 0); else setNotify(src, f, my, st[src]);
          placeDyn(to, f, tq + mv);
        } else if (!blocked(tm)) {
          mv = same ? my >> 1 : my;
          if (mv <= 0) continue;
          my -= mv;
          if (my <= 0) setNotify(src, AIR, 0, 0); else setNotify(src, f, my, st[src]);
          placeDyn(to, f, mv);
        } else continue;
        changed = true; S.teleports++;
        if (P.tpEvents) events.push({ t: 'tp', i: src, j: to, n: mv });
        if (yOf(to) > ys) S.above++;
        if (my <= 0) break;
      }
      return changed;
    }
    function takeResult(i) {
      var r = results.get(i);
      if (r === undefined) return null;
      results.delete(i);
      return r.length ? r : null;
    }
    // ---------- 动态液体一次更新（FiniteFluidVanillaFluidTask.onUpdate） ----------
    function updateDynamic(i) {
      var f = mat[i], qq = q[i], r = rate(f), b = i - XZ, mb = mat[b];
      S.updates++;
      // ① 竖直下落
      if (mb === f) {
        if (q[b] < 8) {
          var tot = qq + Math.max(q[b], 1);
          if (tot <= 8) { setNotify(i, AIR, 0, 0); placeDyn(b, f, tot); }
          else { setNotify(i, f, tot - 8, 0); schedule(i, r); placeDyn(b, f, 8); }
          return;
        }
      } else if (f === LAVA && mb === WATER) {
        S.lavaLost += 1; S.waterLost += q[b];
        if (qq - 1 <= 0) setNotify(i, AIR, 0, 0);
        else { setNotify(i, f, qq - 1, 0); schedule(i, r); }
        setNotify(b, GSTONE, 0, 0); events.push({ t: 'gstone', i: b });
        return;
      } else if (!isFluid(mb) && !blocked(mb)) {
        setNotify(i, AIR, 0, 0); placeDyn(b, f, qq);
        return;
      }
      // ② 压强流动
      var res = takeResult(i);
      if (res && applyTeleports(i, res)) { schedule(i, r); return; }
      if (f === LAVA && P.lavaSlow && ((rand() * 4) | 0) !== 0) r <<= 2;
      // ③ 单层
      if (qq === 1) {
        if (mb === f) { makeStatic(i, 0); return; }        // SLOPE_MODE_ON_WATER：会发布等级 noAvgLevel 的任务
        var dirs = singleSlope(i, f);
        if (!dirs.length) { makeStatic(i, 1); return; }
        var d = dirs[(rand() * dirs.length) | 0];
        setNotify(i, AIR, 0, 0);
        placeDyn(i + H4[d], f, 1);
        return;
      }
      // ④ 平均流动
      var c = gather(i, f, qq);
      if (c === 0) { makeStatic(i, 0); return; }            // NO_MODE
      var moved = resolve(c, qq);
      if (moved === 0) { makeStatic(i, 2); return; }        // AVERAGE_MODE
      for (var k = 0; k < c; k++) {
        if (!chAdd[k]) continue;
        var n = i + H4[chDir[k]];
        if (mat[n] !== f && !airLike(mat[n])) continue;     // 通知链中被改写（极少）
        placeDyn(n, f, (mat[n] === f ? q[n] : 0) + chAdd[k]);
      }
      if (mat[i] !== f) return;
      setNotify(i, f, qq - moved, 0);
      if (mat[i] !== f) return;
      schedule(i, r);
      if (!lock[i]) publish(i, 0);
    }
    // ---------- 静态液体一次更新（BlockStaticLiquidMixin.updateTick） ----------
    function updateStatic(i) {
      S.updates++;
      if (canFlow(i)) { toDynamic(i); return; }
      var res = takeResult(i);
      if (res) {
        var f = mat[i];
        var changed = applyTeleports(i, res);
        if (changed && mat[i] === f) sendQuery(i, true);
        else if (!changed) sendQuery(i, false);
      } else if (P.staticNoResultP) sendQuery(i, false, P.staticNoResultP, P.idleDelay);   // 偏离：源码此处不发布（链条会断）；服主决定一直发布，空结果后的重发推迟 idleDelay 刻
    }
    function refillSources() {
      if (S.tick < P.sourceDelay || S.tick % P.sourcePeriod) return;
      for (var k = 0; k < sources.length; k++) {
        var s = sources[k].i, f = sources[k].f, m = mat[s];
        if (m === f && q[s] >= 8) { pump(s); continue; }
        if (m !== f && !airLike(m)) continue;
        S.injected += 8 - (m === f ? q[s] : 0);
        if (P.sourceStatic) { setNotify(s, f, 8, 1); pump(s); continue; }
        if (m === f) { setNotify(s, f, 8, 0); if (mat[s] === f) schedule(s, rate(f)); }
        else placeDyn(s, f, 8);
        pump(s);
      }
    }
    // 源头泵：源格空闲（静态、无在途任务）时直接发布压强任务，保证“无限源”持续加压
    function pump(s) {
      if (P.sourceLevel < 0 || mat[s] === AIR || lock[s] || !st[s] || due[s] >= 0 || upFull(s)) return;
      publish(s, P.sourceLevel);
    }
    function tick() {
      refillSources();
      runPressure();
      if (S.tick % P.cleanPeriod === 0) results.clear();
      var b = buckets.get(S.tick);
      if (b) {
        buckets.delete(S.tick);
        b.sort(function (a, c) { return a - c; });       // 自下而上：(y, z, x) 升序
        for (var k = 0; k < b.length; k++) {
          var i = b[k];
          if (due[i] !== S.tick) continue;
          due[i] = -1;
          if (!isFluid(mat[i])) continue;
          if (st[i]) updateStatic(i); else updateDynamic(i);
        }
      }
      // 随机刻：只对静态液体有意义
      var e = N * P.randomTickP, cnt = Math.floor(e) + (rand() < e - Math.floor(e) ? 1 : 0);
      for (var r = 0; r < cnt; r++) {
        var j = (rand() * N) | 0;
        if (isFluid(mat[j]) && st[j] && due[j] < 0) updateStatic(j);
      }
      S.tick++;
    }
    function total(f) { var s = 0; for (var i = 0; i < N; i++) if (mat[i] === f) s += q[i]; return s; }
    function takeDirty() { var l = dirtyList; for (var k = 0; k < l.length; k++) dirty[l[k]] = 0; dirtyList = []; return l; }
    function takeEvents() { var e = events; events = []; return e; }
    return {
      X: X, Y: Y, Z: Z, N: N, mat: mat, q: q, st: st, P: P, S: S, rand: rand,
      idx: function (x, y, z) { return (y * Z + z) * X + x; },
      setBlock: function (i, m) { set(i, m, 0, 0); },
      setFluid: function (i, f, qq, isStatic) { set(i, f, qq, isStatic ? 1 : 0); if (!isStatic) schedule(i, rate(f)); },
      open: function (i) { setNotify(i, AIR, 0, 0); },      // 挖开（破口）
      put: function (i, m) { setNotify(i, m, 0, 0); },
      addSource: function (i, f) { sources.push({ i: i, f: f }); },
      sources: sources,
      // 从数组装载（Worker 与同步模式共用同一路径）：所有流体按 st 标志装入，动态的会被计划
      load: function (m, qq, s, src) {
        mat.set(m); q.set(qq); st.set(s);
        for (var i2 = 0; i2 < N; i2++) if (isFluid(mat[i2]) && !st[i2]) schedule(i2, rate(mat[i2]));
        for (var k2 = 0; k2 < src.length; k2++) sources.push({ i: src[k2].i, f: src[k2].f });
      },
      tick: tick, total: total, takeDirty: takeDirty, takeEvents: takeEvents, yOf: yOf,
      pending: function () { return tasks.length; }, scheduledCount: function () { var c = 0; buckets.forEach(function (b) { c += b.length; }); return c; }
    };
  }
  return { create: create, mulberry: mulberry, DEF: DEF,
    M: { AIR: AIR, STONE: STONE, LAVA: LAVA, WATER: WATER, GSTONE: GSTONE, COBBLE: COBBLE, OBSID: OBSID, TORCH: TORCH } };
}
