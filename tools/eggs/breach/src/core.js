/* ---------- 纯逻辑核心：难度表 / 迷宫 / 三维世界 / 开局预跑（无 DOM；主线程与 Worker 共用同一份源码） ----------
 * 迷宫：每层 W×H 平面格。东西向主巷道 + 每隔 3 格一条南北支巷（贯通成环 / 死胡同），站点小厅在一端。
 * 竖井 = 梯子格所在的单列：从本层脚部一直通到上一层脚部（最上层通到地表）。梯子是“含水方块”，不挡流体。
 * 第 0 层：北侧若干条支巷（破口候选）通到 z=4；选中的那条北面是岩浆湖 / 地下水库。 */
function breachCore(E) {
  var T_ROCK = 0, T_TUN = 1, T_ROOM = 2, T_LADDER = 3, T_SHAFT = 4;
  var LEVEL_G = 6, P_D = 29;
  var MM = E.M;
  function levelBase(k) { return 1 + LEVEL_G * k; }
  // 难度按 d = cycle mod 29 周期取值（种子仍由完整 n 决定）
  function diffOf(cycle) { var c = Math.floor(Number(cycle)) || 0; if (c < 0) c = -c; return c % P_D; }
  /* 档位表：29 档的全部参数集中在这里（mazeDifficulty / pacing 只是从这里取）。
   * 原则：第 0 档 = 原 13 档版的第 0 档；第 12～14 档 ≈ 原第 12 档；之后继续加难到第 28 档。
   * 每一维随档位单调（只会变难或持平），相邻两档至少有一维变难；阶梯参数的跳变点错开，避免几维在同一档一起跳。 */
  function stepAt(c, pts) { var v = pts[0][1]; for (var i = 1; i < pts.length; i++) if (c >= pts[i][0]) v = pts[i][1]; return v; }
  function r2(v) { return Math.round(v * 100) / 100; }
  function tier(d) {
    var c = Math.max(0, Math.min(P_D - 1, d | 0)), hi = Math.max(0, c - 13);
    return {
      c: c,
      // 迷宫
      levels: stepAt(c, [[0, 1], [5, 2], [10, 3]]),
      nb: stepAt(c, [[0, 8], [1, 9], [3, 10], [5, 11], [7, 12], [9, 13], [11, 14]]),     // 支巷列数 → 宽 W = 3*nb + 8（最大 50；再大开局预跑超时，见设计 §25）
      ns: c < 2 ? 2 : 3,                                                                  // 主巷道条数 → 深 H = 6*ns + 6
      breachDist: c <= 14 ? Math.round(14 - c * 0.5) : Math.round(7 - (c - 14) * 0.2),  // 起点到破口的路径距离
      pitP: r2(c <= 13 ? 0.05 + 0.011 * c : 0.193 + 0.004 * hi),
      deep: stepAt(c, [[0, 1], [12, 2], [23, 3]]),                                       // 每对相邻层之间的深矿坑数
      darkZones: Math.floor(c / 2),
      puddles: c <= 13 ? 1 + Math.min(4, Math.floor(c / 2)) : 5 + Math.floor(hi / 5),
      climb: r2(c <= 13 ? 0.8 + 0.046 * c : 1.4 + 0.02 * hi),                            // 爬出矿坑的长按秒数
      qte: r2(1 - 0.5 * c / 28),                                                          // 掉进深坑后接住坑沿的反应时限（秒）：1.0 → 0.5
      halls: c < 7 ? 2 : 1,                                                               // 每层信标厅数
      // 奇怪的矿石（墙里可挖的矿，挖到得"奇怪的石头"）：每层个数，第 1 层（破口层）最多、越往上越少；小数部分 = 再多 1 个的概率
      weird: [c < 10 ? 2 : c < 20 ? 3 : 4, c < 5 ? 0 : c < 10 ? 1 : 2, c < 10 ? 0 : c < 20 ? 0.5 : 1.3],
      thinP: c < 5 ? 0 : 0.25,                                                            // 薄墙矿（脚 + 头一对，挖穿是近路）出现的概率（每张图至多 1 处）
      hall7: r2(c <= 13 ? Math.max(0.12, 0.32 - 0.0154 * c) : Math.max(0.05, 0.12 - 0.005 * hi)),   // 信标厅为 7×7（更强）的概率
      beacon: c <= 14 ? 1 : r2(1 - (c - 14) * 0.035),                                    // 信标效果时长倍数（5×5 基准 6 s、7×7 基准 12 s）
      loopP: r2(0.34 - 0.01 * hi),                                                        // 支巷贯通成环的概率（其余多为死胡同）
      crossP: r2(0.12 - 0.004 * hi),                                                      // 相邻支巷之间横向连通的概率
      torchGap: stepAt(c, [[0, 0], [18, 1], [24, 2]]),                                    // 火把最小间距加大（越大越稀）
      cands: stepAt(c, [[0, 4], [16, 5]]),                                       // 破口候选数（公平预跑用，不算难度）
      // 流体
      tps: 20 * stepAt(c, [[0, 1], [3, 1.1], [6, 1.2], [9, 1.3], [19, 1.35], [26, 1.4]]),
      lakeW: stepAt(c, [[0, 2], [4, 3], [7, 4], [22, 5]]),                                // 湖宽
      headAbove: stepAt(c, [[0, 3], [24, 4]]),                                          // 静压面高出最上层坑底的格数
      sourceStatic: c >= 4,
      sourceLevel: stepAt(c, [[0, 3], [5, 4], [11, 5], [20, 6]]),                         // 源头泵出的压强等级
      dispersion: stepAt(c, [[0, 20], [3, 16], [7, 12], [10, 10], [17, 8], [25, 6]]),    // 压强回调延迟 rand(N) 刻
      slack: r2(c <= 13 ? 1.7 - 0.0346 * c : 1.25 - 0.01 * hi),                            // 预跑公平条件：路程时间放宽倍数
      // 体温（见设计 §32）：全部随档位单调变难，高档（24–28）在水图上理想路线也常到中度失温
      waterT: r2(14 - 7 * c / 28),                                                        // 地下水水温 ℃：14 → 7（岩浆图的积水是温水，见 thermoEnv）
      heatK: r2(0.7 + 0.5 * c / 28),                                                      // 岩浆热辐射强度
      heatR: r2(3.2 + 1.0 * c / 28),                                                      // 热辐射作用距离（格）：约 4 格以外可忽略
      torchW: r2(2.4 - 1.0 * c / 28),                                                     // 火把取暖的升温速度 ℃/s
      crawl: r2(7 - 2 * c / 28),                                                          // 倒下后能爬的时间窗（秒）
      slow2: r2(0.9 - 0.08 * c / 28),                                                     // 中度失温 / 中度过热时走路速度倍数（0.9 → 0.82）
      climb2: r2(1.15 + 0.1 * c / 28),                                                    // 同上，爬出矿坑的长按时间倍数（1.15 → 1.25，另封顶多 1 s）
      risky: c < 22 ? 0 : r2(0.05 + 0.2 * (c - 22) / 6)                                   // 险图的概率（设计 §34，不对玩家显示）：第 22 档 5% → 第 28 档 25%
    };
  }
  function mazeDifficulty(d) {
    var t = tier(d);
    return { c: t.c, levels: t.levels, nb: t.nb, ns: t.ns, breachDist: t.breachDist, pitP: t.pitP, deep: t.deep, darkZones: t.darkZones, puddles: t.puddles,
      climb: t.climb, qte: t.qte, weird: t.weird, thinP: t.thinP, halls: t.halls, hall7: t.hall7, beacon: t.beacon, loopP: t.loopP, crossP: t.crossP, torchGap: t.torchGap, cands: t.cands };
  }
  // 地下水（负数版本）：水流得比岩浆快得多（计划刻间隔 5 vs 30），每刻模拟也贵得多。流体参数（TPS、湖宽、源头压强等级、
  // 压强回调延迟）封顶在第 13 档的值，第 13 档以后只靠迷宫、破口距离和公平放宽倍数加难：
  // 否则高档的水几乎总在下层就追上理想路线，预跑要反复换图，单次预跑也要 1 s 以上（Node，未降速）
  var WATER_CAP = 13;
  function pacing(d, negative) {
    var t = tier(d), f = negative && t.c > WATER_CAP ? tier(WATER_CAP) : t;
    return { tps: f.tps, lakeW: f.lakeW, headAbove: f.headAbove, slack: t.slack,
      params: { sourceStatic: f.sourceStatic, sourceLevel: f.sourceLevel, dispersion: f.dispersion } };
  }
  var ORE_SETS = [[1, 2, 3, 4, 5], [2, 3, 5, 5, 6], [5, 6, 6]];   // 1 钻石 2 金 3 红石 4 青金石 5 铁 6 煤
  // regen：重生成序号（预跑在所有破口候选都不公平时换一张图，见 chooseMap）；0 即原图
  function genMaze(seed, d, negative, regen) {
    var D = mazeDifficulty(d); regen = regen | 0;
    var rng = E.mulberry((seed ^ Math.imul(D.c + 1, 0x9E3779B1) ^ Math.imul(regen, 0x85EBCA6B)) >>> 0);
    var nb = D.nb, ns = D.ns, S = 6, W = 3 * nb + 8, Z0 = 7;
    var zs = []; for (var k = 0; k < ns; k++) zs.push(Z0 + k * S);
    // 出口（梯子小厅）在哪一端：第 1 层由种子决定（独立的随机数流，不扰动迷宫本身；抽到东边时与旧版完全相同），
    // 破口候选放在另一端；往上每层的出口都在与入口（下层竖井口）相对的一端——同一端的话入口和出口只隔一两条主巷道，这一层就没有路可走了
    var side0 = E.mulberry((seed ^ 0x51de5eed ^ Math.imul(D.c + 1, 0x632BE5AB) ^ Math.imul(regen + 1, 0x85EBCA77)) >>> 0)() < 0.5 ? 0 : 1;
    var H = zs[ns - 1] + 5, levels = [], exitSide = side0, prev = null, cands = [];
    for (var L = 0; L < D.levels; L++) {
      var lv = genLevel(L, prev, exitSide);
      levels.push(lv);
      prev = { lx: lv.ladder.x, lz: lv.ladder.z, spine: lv.exitSpine, side: exitSide };
      exitSide = 1 - exitSide;
    }
    // 深矿坑（第 2、3 层）：上下两层同一格都是普通巷道，远离本层入口与积水
    for (L = 1; L < levels.length; L++) {
      var up = levels[L], dn = levels[L - 1], cand = [];
      for (var i = 0; i < W * H; i++) {
        if (up.t[i] !== T_TUN || dn.t[i] !== T_TUN || up.special[i] || dn.special[i]) continue;
        if (up.distIn[i] < 12 || up.distExit[i] < 6 || up.puddle[i] || dn.puddle[i]) continue;
        var near = false;
        for (var j = 0; j < W * H && !near; j++) if ((up.puddle[j] || dn.puddle[j]) && Math.abs(j % W - i % W) + Math.abs(((j / W) | 0) - ((i / W) | 0)) < 7) near = true;
        if (!near) cand.push(i);
      }
      var want = D.deep;
      for (k = 0; k < want && cand.length; k++) {
        var pick = cand.splice((rng() * cand.length) | 0, 1)[0];
        up.pit[pick] = 2; up.torch[pick] = 0;
        // 周围 8 格的浅矿坑填平：浅坑与深坑相邻时坑底侧面是通的，看起来像一个能望见下层的大坑，掉进去却只是浅坑
        for (var nz = -1; nz <= 1; nz++) for (var nx = -1; nx <= 1; nx++) { var q = pick + nz * W + nx; if (q !== pick && up.pit[q] === 1) up.pit[q] = 0; }
        cand = cand.filter(function (q) { return Math.abs(q % W - pick % W) + Math.abs(((q / W) | 0) - ((pick / W) | 0)) > 8; });
      }
    }
    placeWeird();
    var M = { W: W, H: H, zs: zs, levels: levels, D: D, side0: side0, negative: !!negative, seed: seed >>> 0, d: D.c, regen: regen, cands: cands, lake: null, k: -1 };
    selectBreach(M, 0);
    return M;

    /* 奇怪的矿石：只在巷道侧壁的脚部（b+1）或头部（b+2）高度，从不在地面/顶板。lv.weird 按位：1 = 脚、2 = 头（3 = 薄墙的一对）。
     * 普通的：墙格只有一面朝巷道、背后是实心岩石，离理想路线 1–8 格；约 60% 在头部高度。
     * 薄墙的：第 5 档起、每张图至多 1 处（25%）、只在第 1–2 层；墙格两侧各是一条巷道、绕路比挖穿多走 4–12 步；总是脚 + 头一对。
     * 用独立的随机数流（不影响迷宫本身），由 seed、d、regen 决定。 */
    function placeWeird() {
      var wr = E.mulberry((seed ^ 0x7e1a5ca7 ^ Math.imul(D.c + 1, 0x2545F491) ^ Math.imul(regen + 1, 0x9E3779B1)) >>> 0), N = W * H, O4 = [1, -1, W, -W];
      var thinOn = D.thinP > 0 && wr() < D.thinP, thinFirst = levels.length > 1 && wr() < 0.5 ? 1 : 0, thinDone = false;
      levels.forEach(function (lv, L) {
        var weird = lv.weird = new Uint8Array(N), list = lv.weirdList = [];
        var want = L < 3 ? D.weird[L] : 0; want = Math.floor(want) + (wr() < want - Math.floor(want) ? 1 : 0);
        if (!want) return;
        var walk = function (i) { return lv.t[i] !== T_ROCK && !lv.chest[i]; };
        var signAt = function (i) { return lv.signs && lv.signs.some(function (sg) { return sg.z * W + sg.x === i; }); };
        var okT = function (i) { return lv.t[i] === T_TUN && !lv.special[i] && !lv.hall[i] && !lv.pit[i] && !lv.puddle[i] && !lv.torch[i] && !lv.item[i]; };
        // 理想路线：起点（第 1 层为所有破口候选的起点）/ 入口 → 梯子，沿出口距离下降
        var onR = new Uint8Array(N), origins = L === 0 ? cands.map(function (c) { return c.start; }) : [lv.entrance];
        origins.forEach(function (o) { var i = o, g = 0; onR[i] = 1; while (lv.distExit[i] > 0 && g++ < N) { var nx = -1; for (var k = 0; k < 4 && nx < 0; k++) { var n = i + O4[k]; if (lv.distExit[n] >= 0 && lv.distExit[n] < lv.distExit[i]) nx = n; } if (nx < 0) break; i = nx; onR[i] = 1; } });
        var dR = new Int32Array(N).fill(-1), qq = []; for (var i = 0; i < N; i++) if (onR[i]) { dR[i] = 0; qq.push(i); }
        for (var h = 0; h < qq.length; h++) { var p = qq[h]; for (var k = 0; k < 4; k++) { var n = p + O4[k]; if (dR[n] < 0 && walk(n)) { dR[n] = dR[p] + 1; qq.push(n); } } }
        var rock = function (i, x, z) { return x < 0 || z < 0 || x >= W || z >= H || lv.t[i] === T_ROCK; };
        var far = function (i) { for (var k = 0; k < list.length; k++) if (Math.abs(list[k].i % W - i % W) + Math.abs(((list[k].i / W) | 0) - ((i / W) | 0)) < 5) return false; return true; };
        // 薄墙一对
        if (thinOn && !thinDone && L <= 1 && want >= 2 && (L === thinFirst || L === 1)) {   // 先试抽中的那层，没有合适的墙再试另一层（第 1–2 层）
          var thin = [];
          for (i = W; i < N - W; i++) {
            var x = i % W, z = (i / W) | 0; if (x < 1 || x >= W - 1 || lv.t[i] !== T_ROCK || lv.ore[i] < 0) continue;
            for (var ax = 0; ax < 2; ax++) {
              var a = ax ? i - 1 : i - W, c2 = ax ? i + 1 : i + W, s1 = ax ? i - W : i - 1, s2 = ax ? i + W : i + 1;
              if (!okT(a) || !okT(c2) || lv.t[s1] !== T_ROCK || lv.t[s2] !== T_ROCK) continue;
              var dd = new Int32Array(N).fill(-1), q2 = [a]; dd[a] = 0;
              for (h = 0; h < q2.length && dd[c2] < 0; h++) { p = q2[h]; for (k = 0; k < 4; k++) { n = p + O4[k]; if (dd[n] < 0 && walk(n)) { dd[n] = dd[p] + 1; q2.push(n); } } }
              var save = dd[c2] - 2; if (save >= 4 && save <= 12) thin.push({ i: i, a: a, c: c2 });
            }
          }
          if (thin.length) { thinDone = true; var tw = thin[(wr() * thin.length) | 0]; weird[tw.i] = 3; lv.ore[tw.i] = 0; list.push({ i: tw.i, h: 3, from: tw.a, thin: true, other: tw.c }); want = Math.max(0, want - 2); }
        }
        var cand = [];
        for (i = W; i < N - W; i++) {
          if (lv.t[i] !== T_ROCK || weird[i] || signAt(i)) continue;
          x = i % W; z = (i / W) | 0; var open = [];
          for (k = 0; k < 4; k++) { n = i + O4[k]; if (walk(n)) open.push(n); }
          if (open.length !== 1) continue;
          var T = open[0]; if (!okT(T) || dR[T] < 0 || dR[T] > 7) continue;
          var bx = x * 2 - T % W, bz = z * 2 - ((T / W) | 0); if (!rock(bz * W + bx, bx, bz)) continue;
          cand.push({ i: i, T: T });
        }
        for (k = cand.length - 1; k > 0; k--) { var sw = (wr() * (k + 1)) | 0, tmp = cand[k]; cand[k] = cand[sw]; cand[sw] = tmp; }
        for (k = 0; k < cand.length && want > 0; k++) {
          if (!far(cand[k].i)) continue;
          var hh = wr() < 0.6 ? 2 : 1; weird[cand[k].i] = hh; lv.ore[cand[k].i] = 0; list.push({ i: cand[k].i, h: hh, from: cand[k].T }); want--;
        }
      });
    }
    function genLevel(L, below, side) {
      var N = W * H, t = new Uint8Array(N), x, z, s, i, e;
      var at = function (x2, z2) { return z2 * W + x2; };
      var carve = function (x2, z2) { if (x2 > 0 && z2 > 0 && x2 < W - 1 && z2 < H - 1 && t[at(x2, z2)] === T_ROCK) t[at(x2, z2)] = T_TUN; };
      var cols = []; for (j = 0; j < nb; j++) cols.push(5 + 3 * j);
      for (s = 0; s < ns; s++) for (x = 2; x <= W - 3; x++) carve(x, zs[s]);
      for (j = 0; j < cols.length; j++) {
        var cx = cols[j];
        if (rng() < 0.55) { var ln = 1 + ((rng() * 3) | 0); for (z = Z0 - 1; z >= Z0 - ln; z--) carve(cx, z); }
        for (s = 0; s + 1 < ns; s++) {
          var a = zs[s], b = zs[s + 1], r = rng();
          if (r < D.loopP) for (z = a; z <= b; z++) carve(cx, z);
          else if (r < D.loopP + 0.5) {
            var l1 = 1 + ((rng() * 4) | 0), l2 = 1 + ((rng() * 4) | 0);
            if (l1 + l2 > S - 2) l2 = S - 2 - l1;
            if (rng() < 0.75) for (z = a + 1; z <= a + l1; z++) carve(cx, z);
            if (rng() < 0.75) for (z = b - 1; z >= b - l2; z--) carve(cx, z);
          }
        }
        if (rng() < 0.55) { ln = 1 + ((rng() * 3) | 0); for (z = zs[ns - 1] + 1; z <= zs[ns - 1] + ln; z++) carve(cx, z); }
      }
      for (s = 0; s + 1 < ns; s++) {          // 每对相邻主巷道之间至少 2 条贯通支巷
        var thr = cols.filter(function (c) { for (var z5 = zs[s]; z5 <= zs[s + 1]; z5++) if (t[at(c, z5)] !== T_TUN) return false; return true; });
        while (thr.length < 2) { var cc = cols[(rng() * cols.length) | 0]; if (thr.indexOf(cc) >= 0) continue; for (z = zs[s]; z <= zs[s + 1]; z++) carve(cc, z); thr.push(cc); }
      }
      for (s = 0; s + 1 < ns; s++) for (j = 0; j + 1 < cols.length; j++) {
        if (rng() > D.crossP) continue;
        var zz = zs[s] + 2 + ((rng() * (S - 3)) | 0);
        if (t[at(cols[j], zz)] === T_TUN && t[at(cols[j + 1], zz)] === T_TUN) { carve(cols[j] + 1, zz); carve(cols[j] + 2, zz); }
      }
      // 小厅：出口（梯子）与入口（下层梯子顶 = 竖井口）
      var exitSpine = (rng() * ns) | 0;
      if (below && below.spine === exitSpine && below.side === side) exitSpine = (exitSpine + 1) % ns;
      var room = function (sd, zc) {
        var x0 = sd ? W - 4 : 1;
        for (var xx = x0; xx < x0 + 3; xx++) for (var z2 = zc - 1; z2 <= zc + 1; z2++) t[at(xx, z2)] = T_ROOM;
        return at(sd ? W - 2 : 1, zc - 1);
      };
      var lad = room(side, zs[exitSpine]);
      t[lad] = T_LADDER;
      // 告示牌（服主追加）：出口小厅的北墙、南墙正中各挂一块（挂在岩石的墙面上、面朝小厅），挂在头部高度（h = 2，b + 2 那格的墙面；
      // 脚部高度会和靠墙的箱子穿插），不占格、不挡路，流体照常流过（像含水的梯子一样不会被冲掉）。这两格墙不放奇怪的矿石
      var sx0 = (side ? W - 4 : 1) + 1, signs = [{ x: sx0, z: zs[exitSpine] - 2, face: 1, h: 2 }, { x: sx0, z: zs[exitSpine] + 2, face: -1, h: 2 }];
      var entrance = -1;
      if (below) { room(below.side, zs[below.spine]); entrance = at(below.lx, below.lz); t[entrance] = T_SHAFT; }
      // 主巷道断口（保持全连通）
      var gaps = 1 + ((rng() * (ns + 1)) | 0);
      for (var g = 0; g < gaps * 3 && gaps > 0; g++) {
        s = (rng() * ns) | 0; j = (rng() * (cols.length - 1)) | 0;
        var seg = [at(cols[j] + 1, zs[s]), at(cols[j] + 2, zs[s])];
        if (t[seg[0]] !== T_TUN || t[seg[1]] !== T_TUN) continue;
        t[seg[0]] = t[seg[1]] = T_ROCK;
        if (components() !== 1) { t[seg[0]] = t[seg[1]] = T_TUN; continue; }
        gaps--;
      }
      // 第 0 层：破口候选 = 远离出口那一侧（出口在东 → 西侧 60%；出口在西 → 东侧 60%）的若干支巷，向北挖到 z=4
      var bcols = [];
      if (L === 0) {
        var west = cols.filter(function (c) { return side ? c < W * 0.6 : c > W * 0.4; });
        for (j = west.length - 1; j > 0; j--) { var sw = (rng() * (j + 1)) | 0, tmp = west[j]; west[j] = west[sw]; west[sw] = tmp; }
        bcols = west.slice(0, D.cands);
        for (j = 0; j < bcols.length; j++) for (z = Z0 - 1; z >= 4; z--) carve(bcols[j], z);
      }
      // 信标厅：两条相邻主巷道之间扩出 5×5（7×7 跨到两条主巷道上）的厅，横向避开两端的小厅；厅之间至少隔 8 格
      var hall = new Uint8Array(N), halls = [];
      for (var hk = 0, htry = 0; hk < D.halls && htry < 60 && ns > 1; htry++) {
        var big = rng() < D.hall7, hs = big ? 7 : 5, hh = hs >> 1, sp = (rng() * (ns - 1)) | 0;
        var hcx = 6 + hh + ((rng() * Math.max(1, W - 13 - 2 * hh)) | 0), hcz = zs[sp] + 3;
        if (hcx - hh < 6 || hcx + hh > W - 7) continue;
        if (halls.some(function (o) { return Math.abs(o.x - hcx) < o.size / 2 + hh + 6 && Math.abs(o.z - hcz) < o.size / 2 + hh + 2; })) continue;
        for (z = hcz - hh; z <= hcz + hh; z++) for (x = hcx - hh; x <= hcx + hh; x++) { t[at(x, z)] = T_TUN; hall[at(x, z)] = 1; }
        hall[at(hcx, hcz)] = 2;
        halls.push({ i: at(hcx, hcz), x: hcx, z: hcz, size: hs, r: hh + 1, dur: Math.round((big ? 12 : 6) * D.beacon * 2) / 2 });
        hk++;
      }
      var chest = null;
      var main = flood(L === 0 ? at(bcols[0], 4) : entrance);
      for (i = 0; i < N; i++) if (t[i] !== T_ROCK && !main[i]) t[i] = T_ROCK;
      // 装饰箱子（实心）：只放在小厅里靠墙、不挨着门口（门口格及其内侧一格）的格子；放后小厅与全层仍连通、梯子可达
      chest = new Uint8Array(N); var chests = [], door = new Uint8Array(N), O4 = [1, -1, W, -W];
      for (k = 0; k < halls.length; k++) chest[halls[k].i] = 1;   // 信标本身是实心方块（与箱子一样挡路、不画箱子）
      for (i = 0; i < N; i++) if (t[i] === T_ROOM) for (k = 0; k < 4; k++) if (t[i + O4[k]] === T_TUN) { door[i] = 1; for (var k2 = 0; k2 < 4; k2++) door[i + O4[k2]] = 1; }
      var ccand = [];
      for (i = 0; i < N; i++) {
        if (t[i] !== T_ROOM || door[i] || i === lad || i === entrance) continue;
        var wallN = 0; for (k = 0; k < 4; k++) if (t[i + O4[k]] === T_ROCK) wallN++;
        if (wallN && Math.abs(i % W - lad % W) + Math.abs(((i / W) | 0) - ((lad / W) | 0)) > 1) ccand.push(i);
      }
      for (k = ccand.length - 1; k > 0; k--) { var sw3 = (rng() * (k + 1)) | 0, tmp3 = ccand[k]; ccand[k] = ccand[sw3]; ccand[sw3] = tmp3; }
      var walk = function (i2) { return t[i2] !== T_ROCK && !chest[i2]; };
      for (k = 0; k < ccand.length && chests.length < 3; k++) {
        chest[ccand[k]] = 1;
        if (components() !== 1 || (entrance >= 0 && bfsDist(entrance, walk)[lad] < 0)) { chest[ccand[k]] = 0; continue; }
        chests.push(ccand[k]);
      }
      var distExit = bfsDist(lad, walk);
      var special = new Uint8Array(N), starts = [];
      if (L === 0) {
        for (j = 0; j < bcols.length; j++) {
          var dB = bfsDist(at(bcols[j], 4), walk), best = -1, bd = 1e9;
          for (i = 0; i < N; i++) {
            if (t[i] !== T_TUN || dB[i] < 0 || ((i / W) | 0) < Z0) continue;
            var sc = Math.abs(dB[i] - D.breachDist) * 4 + distExit[i] * 0.05 + rng();
            if (distExit[i] < dB[i]) sc += 50;
            if (sc < bd) { bd = sc; best = i; }
          }
          starts.push(best);
          cands.push({ bx: bcols[j], start: best });
          for (z = 4; z <= Z0 - 1; z++) special[at(bcols[j], z)] = 1;
        }
      }
      var origins = L === 0 ? starts : [entrance];
      var distIn = bfsDist(origins[0], walk);
      var maxD = 1; for (i = 0; i < N; i++) if (distExit[i] > maxD) maxD = distExit[i];
      for (i = 0; i < N; i++) {
        if (t[i] === T_ROOM || t[i] === T_LADDER || t[i] === T_SHAFT || hall[i]) special[i] = 1;
      }
      for (j = 0; j < origins.length; j++) { var dO = bfsDist(origins[j], walk); for (i = 0; i < N; i++) if (dO[i] >= 0 && dO[i] <= 3) special[i] = 1; }
      var grad = new Float32Array(N);
      for (i = 0; i < N; i++) grad[i] = distExit[i] < 0 ? 0 : 1 - distExit[i] / maxD;
      var pit = new Uint8Array(N);
      for (i = 0; i < N; i++) if (t[i] === T_TUN && !special[i] && rng() < D.pitP * (0.4 + 1.6 * grad[i] * grad[i])) pit[i] = 1;
      // 积水（只有岩浆场景）：离矿坑 ≥ 6 步；积水格及相邻格都当作会变石头后，每个起点候选/入口 → 梯子仍连通
      var puddle = new Uint8Array(N);
      if (!negative) {
        var dPit = multiDist(pit, walk), tries = 0, placed = 0;
        while (placed < D.puddles && tries++ < 200) {
          i = (rng() * N) | 0;
          if (t[i] !== T_TUN || special[i] || pit[i] || puddle[i] || (dPit[i] >= 0 && dPit[i] < 6)) continue;
          var cells = [i], dir = rng() < 0.5 ? 1 : W, len = 1 + ((rng() * 3) | 0);
          for (e = 1; e < len; e++) { var n2 = i + dir * e; if (t[n2] === T_TUN && !special[n2] && !pit[n2] && !(dPit[n2] >= 0 && dPit[n2] < 6)) cells.push(n2); else break; }
          for (e = 0; e < cells.length; e++) puddle[cells[e]] = 1;
          var ok = true;
          for (j = 0; j < origins.length && ok; j++) ok = pathAvoiding(origins[j], lad, puddle);
          if (!ok) { for (e = 0; e < cells.length; e++) puddle[cells[e]] = 0; continue; }
          placed++;
        }
      }
      // 火把（越靠近出口越密；无火把区）
      var torch = new Uint8Array(N), dark = new Uint8Array(N);
      for (var dz = 0; dz < D.darkZones; dz++) {
        var c0 = -1;
        for (var tr = 0; tr < 50; tr++) { var ci = (rng() * N) | 0; if (t[ci] === T_TUN && grad[ci] < 0.7) { c0 = ci; break; } }
        if (c0 < 0) continue;
        var dd = bfsDist(c0, walk), rad = 4 + ((rng() * 4) | 0);
        for (i = 0; i < N; i++) if (dd[i] >= 0 && dd[i] <= rad) dark[i] = 1;
      }
      var order = []; for (i = 0; i < N; i++) if (t[i] === T_TUN && !pit[i] && !puddle[i] && !dark[i] && !hall[i]) order.push(i);
      order.sort(function (a2, b2) { return distExit[a2] - distExit[b2] || a2 - b2; });
      for (k = 0; k < order.length; k++) {
        i = order[k];
        var rr = Math.round(5 - 3 * grad[i]) + D.torchGap, okT = true;
        for (var dz2 = -rr; dz2 <= rr && okT; dz2++) for (var dx2 = -rr; dx2 <= rr && okT; dx2++) {
          if (Math.abs(dx2) + Math.abs(dz2) > rr) continue;
          var xx2 = i % W + dx2, zz2 = ((i / W) | 0) + dz2;
          if (xx2 >= 0 && zz2 >= 0 && xx2 < W && zz2 < H && torch[at(xx2, zz2)]) okT = false;
        }
        if (okT) torch[i] = 1;
      }
      var ore = new Uint8Array(N), item = new Uint8Array(N), oreSet = ORE_SETS[Math.min(2, L)];
      for (i = 0; i < N; i++) {
        if (t[i] !== T_ROCK) continue;
        x = i % W; z = (i / W) | 0;
        if (x < 1 || z < 1 || x >= W - 1 || z >= H - 1) continue;
        var nearG = -1;
        if (t[i + 1] !== T_ROCK) nearG = Math.max(nearG, grad[i + 1]); if (t[i - 1] !== T_ROCK) nearG = Math.max(nearG, grad[i - 1]);
        if (t[i + W] !== T_ROCK) nearG = Math.max(nearG, grad[i + W]); if (t[i - W] !== T_ROCK) nearG = Math.max(nearG, grad[i - W]);
        if (nearG < 0) continue;
        if (rng() < 0.16 * (1 - nearG) * (1 - nearG)) ore[i] = oreSet[(rng() * oreSet.length) | 0];
      }
      for (i = 0; i < N; i++) if (t[i] === T_TUN && !pit[i] && !puddle[i] && !special[i] && rng() < 0.025) item[i] = 1 + ((rng() * 5) | 0);
      var beacons = halls;
      return { L: L, t: t, pit: pit, puddle: puddle, torch: torch, dark: dark, ore: ore, item: item, grad: grad,
        distExit: distExit, distIn: distIn, special: special, start: L === 0 ? starts[0] : -1, entrance: entrance,
        ladder: { x: lad % W, z: (lad / W) | 0, i: lad }, exitSpine: exitSpine, exitSide: side, signs: signs, beacons: beacons, hall: hall, chests: chests, chest: chest };

      function flood(src) {
        var seen = new Uint8Array(N), st = [src]; seen[src] = 1;
        while (st.length) { var p = st.pop(); for (var o = 0; o < 4; o++) { var n = p + [1, -1, W, -W][o]; if (!seen[n] && t[n] !== T_ROCK) { seen[n] = 1; st.push(n); } } }
        return seen;
      }
      function components() {
        var seen = new Uint8Array(N), c = 0;
        for (var i2 = 0; i2 < N; i2++) if (t[i2] !== T_ROCK && !(chest && chest[i2]) && !seen[i2]) {
          c++; var st = [i2]; seen[i2] = 1;
          while (st.length) { var p = st.pop(); for (var o = 0; o < 4; o++) { var n = p + [1, -1, W, -W][o]; if (!seen[n] && t[n] !== T_ROCK && !(chest && chest[n])) { seen[n] = 1; st.push(n); } } }
        }
        return c;
      }
      function bfsDist(src, okf) {
        var d2 = new Int32Array(N).fill(-1); if (src < 0) return d2;
        var qq = [src]; d2[src] = 0;
        for (var h = 0; h < qq.length; h++) { var p = qq[h]; for (var o = 0; o < 4; o++) { var n = p + [1, -1, W, -W][o]; if (d2[n] < 0 && okf(n)) { d2[n] = d2[p] + 1; qq.push(n); } } }
        return d2;
      }
      function multiDist(mask, okf) {
        var d2 = new Int32Array(N).fill(-1), qq = [];
        for (var i2 = 0; i2 < N; i2++) if (mask[i2]) { d2[i2] = 0; qq.push(i2); }
        for (var h = 0; h < qq.length; h++) { var p = qq[h]; for (var o = 0; o < 4; o++) { var n = p + [1, -1, W, -W][o]; if (d2[n] < 0 && okf(n)) { d2[n] = d2[p] + 1; qq.push(n); } } }
        return d2;
      }
      function pathAvoiding(a, b, pud) {
        var bad = new Uint8Array(N);
        for (var i2 = 0; i2 < N; i2++) if (pud[i2]) { bad[i2] = 1; bad[i2 + 1] = bad[i2 - 1] = bad[i2 + W] = bad[i2 - W] = 1; }
        if (bad[a] || bad[b]) return false;
        return bfsDist(a, function (n) { return walk(n) && !bad[n]; })[b] >= 0;
      }
    }
  }
  // 选定第 k 个破口候选：湖在该支巷北面（z=1..2），起点与 distIn 随之确定
  function selectBreach(M, k) {
    var c = M.cands[k], lv = M.levels[0], W = M.W, N = W * M.H;
    M.k = k; lv.start = c.start;
    M.lake = { x0: c.bx, z0: 1, w: 2, d: 2, bx: c.bx, bz: 3 };
    var d = new Int32Array(N).fill(-1), q = [c.start]; d[c.start] = 0;
    for (var h = 0; h < q.length; h++) { var p = q[h]; for (var o = 0; o < 4; o++) { var n = p + [1, -1, W, -W][o]; if (d[n] < 0 && lv.t[n] !== T_ROCK && !lv.chest[n]) { d[n] = d[p] + 1; q.push(n); } } }
    lv.distIn = d;
    return M;
  }
  /* 三维世界：每层 6 格（坑 / 脚 / 头 / 顶板 ×3），层 k 的坑在 y = 1 + 6k。 */
  function buildWorld(M, opts) {
    opts = opts || {};
    var f = M.negative ? MM.WATER : MM.LAVA, nL = M.levels.length, top = levelBase(nL - 1);
    var lakeTop = opts.lakeTop != null ? opts.lakeTop : top + (opts.headAbove != null ? opts.headAbove : 3);
    var Y = Math.max(top + 6, lakeTop + 2), W = M.W;
    var w = E.create(W, Y, M.H, (M.seed ^ 0x5bd1e995 ^ Math.imul(M.k + 1, 0x27d4eb2d)) >>> 0, opts.params);
    var idx = w.idx, x, y, z;
    for (var k = 0; k < nL; k++) {
      var lv = M.levels[k], b = levelBase(k);
      for (z = 0; z < M.H; z++) for (x = 0; x < W; x++) {
        var i = z * W + x, tt = lv.t[i];
        if (tt === T_ROCK) continue;
        w.setBlock(idx(x, b + 1, z), MM.AIR); w.setBlock(idx(x, b + 2, z), MM.AIR);
        if (tt === T_SHAFT) w.setBlock(idx(x, b, z), MM.AIR);
        if (lv.pit[i]) w.setBlock(idx(x, b, z), MM.AIR);
        if (lv.pit[i] === 2) for (y = b - 1; y >= levelBase(k - 1) + 3; y--) w.setBlock(idx(x, y, z), MM.AIR);
        if (lv.torch[i]) w.setBlock(idx(x, b + 1, z), MM.TORCH);
        if (lv.puddle[i]) w.setFluid(idx(x, b + 1, z), MM.WATER, opts.puddleQ || 1, true);
      }
      // 竖井：梯子列从本层脚部通到上一层的坑（与上一层的 T_SHAFT 格相接）；最上层通到世界顶部下一格
      var lx = lv.ladder.x, lz = lv.ladder.z, yTop = k + 1 < nL ? levelBase(k + 1) : Y - 2;
      for (y = b + 1; y <= yTop; y++) w.setBlock(idx(lx, y, lz), MM.AIR);
    }
    var lk = M.lake, b0 = levelBase(0), src = [], lw = Math.min(opts.lakeW || lk.w, W - 1 - lk.x0);
    for (z = lk.z0; z < lk.z0 + lk.d; z++) for (x = lk.x0; x < lk.x0 + lw; x++) {
      for (y = b0; y <= lakeTop; y++) w.setFluid(idx(x, y, z), f, 8, true);
      w.addSource(idx(x, lakeTop, z), f); src.push(idx(x, lakeTop, z));
    }
    var breach = [idx(lk.bx, b0 + 1, lk.bz), idx(lk.bx, b0 + 2, lk.bz)];
    return { w: w, fluid: f, lakeTop: lakeTop, breach: breach, sources: src,
      openBreach: function () { for (var j = 0; j < breach.length; j++) w.open(breach[j]); } };
  }
  /* ---------- 体温（服主设计，见设计 §32）：两室模型，按游戏节奏压缩时间，曲线形状接近真实 ----------
   * 核心温度 Tc（显示，正常 37.0）与外壳温度 Ts（不显示，正常 34）。外壳与环境交换热量，核心只与外壳交换 → 有滞后：
   * 出水以后核心还会继续降一阵（后降 afterdrop），到最低点后再回升。单位：℃ 与秒。
   *   dTs = KCS(Tc − Ts) + (1 − f)·空气项 + HW·f·(水温 − Ts) + 热辐射 − 出汗
   *   dTc = RC·(产热 + 寒战 − KCS(Tc − Ts))
   * 空气项按"热中性"写：Ts = 34 时正好带走基础产热；湿身（最近一次最深的浸没，随时间变干）在空气里继续蒸发降温。
   * 寒战产热在 Tc < 36.5 时出现，到中度失温（< 32）停止 → 降温加快。出汗在 Tc > 37.5 时出现。
   * 标定：中档（第 14 档，水温 9 ℃）稳定齐腰深约 20 s 到中度失温、约 40 s 到重度失温（完全淹没会先溺水）。 */
  var TH = { KCS: 0.1, RC: 0.3, HW: 0.3, SHIV: 0.1, HAIR: 0.03, EVAP: 0.25, BASE: 0.3, SWEAT: 0.5, RAD: 1.3, WALL: 0.0045, WCAP: 44, CONTACT: 2.5,
    S1c: 35, S2c: 32, S3c: 28, S1h: 38.5, S2h: 39.5, S3h: 40.5, WARM_TO: 33.5 };
  // 环境参数：水图水温随档位；岩浆图的积水是温水（33 ℃，只能把人降到正常，不会因此失温），空气热、湿身干得快
  function thermoEnv(d, negative) { var t = tier(d); return { lava: !negative, Tw: negative ? t.waterT : 33, dry: negative ? 30 : 5, heatK: t.heatK, heatR: t.heatR, torchW: t.torchW }; }
  function thermoNew() { return { Tc: 37, Ts: 34, wet: 0, shiv: 0, min: 37, max: 37 }; }
  // 站立时的浸没比例（散热面积的权重，躯干比腿重要）：水深 d 格 → f；脚踝 / 膝 / 腰 / 胸 / 没顶
  var IMM = [[0, 0], [0.2, 0.08], [0.55, 0.2], [1, 0.45], [1.4, 0.55], [1.75, 0.65]];
  function immersion(depth) { if (depth <= 0) return 0; for (var k = 1; k < IMM.length; k++) if (depth <= IMM[k][0]) { var a = IMM[k - 1], b = IMM[k]; return a[1] + (b[1] - a[1]) * (depth - a[0]) / (b[0] - a[0]); } return 1; }
  function depthName(depth) { return depth <= 0 ? '' : depth <= 0.2 ? '脚踝' : depth <= 0.55 ? '膝' : depth <= 1 ? '腰' : depth <= 1.4 ? '胸' : '没顶'; }
  // 身体所在格的流体层数（脚格 lo、头格 hi，8 = 满格）→ 浸没比例；躺着时整个人贴在脚格里
  function immersionOf(lo, hi, prone) { return prone ? (lo > 0 ? Math.min(1, 0.45 + lo / 8 * 1.1) : 0) : immersion(lo / 8 + (lo >= 8 ? hi / 8 : 0)); }
  // 阶段：0 正常；−1/−2/−3 轻度 / 中度 / 重度失温；1/2/3 轻度过热 / 中度过热 / 中暑
  function stageOf(Tc) { return Tc < TH.S3c ? -3 : Tc < TH.S2c ? -2 : Tc < TH.S1c ? -1 : Tc > TH.S3h ? 3 : Tc > TH.S2h ? 2 : Tc > TH.S1h ? 1 : 0; }
  /* 推进 dt 秒。e = {f 浸没比例, prone, rad 热辐射量（0..1，按距离衰减）, contact 碰到岩浆, torch 0 / 1 手里火把取暖 / 2 只止住降温, wall 挨着墙上的火把}；env 来自 thermoEnv */
  function thermoStep(S, e, dt, env) {
    var f = e.f || 0, Tc = S.Tc, Ts = S.Ts;
    S.wet = Math.max(S.wet - dt / env.dry, f);
    var shiv = Tc < 36.5 && Tc >= TH.S2c ? TH.SHIV * Math.min(1, (36.5 - Tc) / 1.5) : 0; S.shiv = shiv;
    var sweat = Tc > 37.5 ? TH.SWEAT * (Tc - 37.5) : 0;
    var qs = TH.KCS * (Tc - Ts) + (1 - f) * (-TH.BASE + TH.HAIR * (34 - Ts) - TH.EVAP * Math.max(0, S.wet - f)) + TH.HW * f * (env.Tw - Ts)
      + TH.RAD * env.heatK * (e.rad || 0) + (e.contact ? TH.CONTACT : 0) - sweat;
    var qc = TH.RC * (TH.BASE + shiv - TH.KCS * (Tc - Ts));
    // 墙上的火把（服主：水图、岩浆图相同，巷道里闷热）：挨着点着的墙上火把慢慢加热，越接近 / 高于正常越慢（∝ (WCAP − Tc)²，WCAP = 44 ℃ 高于中暑线，
    // 一直待着也能慢慢热到过热）；冷的时候回暖快得多。从旁边正常走过（约 0.7 s）只升约 0.1 ℃
    if (e.wall) qc += TH.WALL * Math.pow(Math.max(0, TH.WCAP - Tc), 2);
    if (e.prone && f > 0) qc += TH.RC * 0.4 * f * ((env.lava ? Math.max(env.Tw, 37) : env.Tw) - Tc);   // 躺在水里：整个人泡着，核心也直接降温（岩浆图的中暑急救：只降到正常）
    var nTs = Math.max(Math.min(env.Tw, Ts), Math.min(46, Ts + qs * dt)), nTc = Math.max(15, Math.min(44, Tc + qc * dt));
    if (e.torch === 1) { var w = env.torchW * dt, to = TH.WARM_TO; if (nTc < to) nTc = Math.min(to, Math.max(nTc, Tc) + w); nTs = Math.max(nTs, Math.min(nTc - 1.5, Ts + w * 1.5)); }
    else if (e.torch === 2) { nTc = Math.max(nTc, Tc); nTs = Math.max(nTs, Ts); }
    S.Tc = nTc; S.Ts = nTs;
    if (nTc < S.min) S.min = nTc; if (nTc > S.max) S.max = nTc;
    return stageOf(nTc);
  }
  /* 热辐射：本层（脚 / 头高度，以及坑底）离人最近的岩浆，按距离衰减；约 heatR 格外为 0。get(x, y, z) → 岩浆层数（0 = 无） */
  function radiant(get, px, pz, b, R) {
    var r = Math.ceil(R), best = 0, x0 = Math.floor(px), z0 = Math.floor(pz);
    for (var dz = -r; dz <= r; dz++) for (var dx = -r; dx <= r; dx++) {
      var x = x0 + dx, z = z0 + dz, q = Math.max(get(x, b + 1, z), get(x, b + 2, z), get(x, b, z) * 0.7);
      if (!q) continue;
      var dd = Math.max(0, Math.hypot(x + 0.5 - px, z + 0.5 - pz) - 0.5), v = Math.min(1, q / 6) * Math.pow(Math.max(0, 1 - dd / R), 2);
      if (v > best) best = v;
    }
    return best;
  }
  /* 理想路线：起点/入口 → 梯子（按出口距离下降），每格到达时刻（秒）。速度与游戏一致。 */
  var SPEED = 4.3;
  /* 竖井的时间（游戏与路线共用这些常量，免得两边对不上）：走进梯子格后按住方向 LAD_HOLD 秒才开始爬；转场淡出 FADE_T 秒（期间不能操作，淡入可以）；
   * 爬 h 格高的竖井用 climbTime(h) 秒。中间的竖井：按住 + 淡出 + 爬 + 到上一层的淡出；最后一段竖井：按住 + 淡出 + 爬（爬出地面就结束计时，不再转场） */
  var LAD_HOLD = 0.3, FADE_T = 0.3;
  function climbTime(h) { return 2.4 + 0.3 * h / 6; }
  function shaftTime(last) { return LAD_HOLD + FADE_T + climbTime(LEVEL_G) + (last ? 0 : FADE_T); }
  function route(M) {
    var W = M.W, out = [], t = 0;
    M.levels.forEach(function (lv, L) {
      var i = L === 0 ? lv.start : lv.entrance;
      out.push({ L: L, i: i, t: t, w: 0, h: 0, x: L ? shaftTime(false) : 0, shaft: L > 0 });
      while (lv.distExit[i] > 0) {
        var nx = -1;
        for (var o = 0; o < 4 && nx < 0; o++) { var n = i + [1, -1, W, -W][o]; if (lv.distExit[n] >= 0 && lv.distExit[n] < lv.distExit[i]) nx = n; }
        var pp = lv.pit[i]; i = nx;
        // 每一步拆成 走路 w / 长按爬坑 h / 固定动画 x 三段（体温预跑按状态给各段不同的速度倍数；t 仍是三段之和）
        var sw = 1 / SPEED * (lv.puddle[i] ? 1 / 0.55 : 1), sh = 0, sx = 0;
        t += sw;
        // 与游戏一致：掉进坑 0.18 s；相邻浅坑之间在坑底照常走；从坑里到坑外要长按 climb（深坑 ×2）再 0.3 s 爬出
        if (lv.pit[i] && !pp) { t += 0.18; sx = 0.18; }
        if (pp && !lv.pit[i]) { sh = M.D.climb * (pp === 2 ? 2 : 1); sx = 0.3; t += sh + 0.3; }
        out.push({ L: L, i: i, t: t, w: sw, h: sh, x: sx });
      }
      t += shaftTime(L + 1 >= M.levels.length);
    });
    return out;
  }
  /* 公平性预跑：同步、按刻计数、与设备无关。返回 {ok, margin, ticks}。
   * 条件：路线上每一格在“到达时刻 × slack + 2 s”之前都没有危险（岩浆：身体两格合计 ≥ 3 层；水：头部 ≥ 5 层）。 */
  /* 体温预跑：理想玩家按路线走（与游戏同样的速度规则：涉水减速、中度失温 / 过热减速、爬坑变慢），每步读模拟世界里身体两格的流体，
   * 推进体温模型。slowK：整条路线的时间倍数（1 = 理想玩家；节奏分析用 1.3 等）。step(dt, now) 返回阶段；
   * extra = 中度失温 / 过热减速累计多花的时间，late(j) = 到第 j 格时这部分延误是否超出放宽（t × slack）。 */
  function thermoRoute(M, PC, w, slowK) {
    var R = route(M), env = thermoEnv(M.d, M.negative), T = tier(M.d), W = M.W, S = thermoNew(), K = slowK || 1;
    var j = 0, ph = 3, rem = 0, extra = 0, st = 0, done = false, arrived = 0, ext = [0], s2t = 0;
    var mat = w.mat, q = w.q, LAVA = MM.LAVA, WATER = MM.WATER;
    var get = function (x, y, z) { if (x < 0 || z < 0 || x >= W || z >= M.H) return 0; var c = w.idx(x, y, z); return mat[c] === LAVA ? q[c] : 0; };
    function next() { j++; if (j >= R.length) { done = true; return; } ph = 0; rem = R[j].h * K; }
    function cellOf() { var r = ph < 2 || (ph === 2 && rem > R[j].w * K / 2) ? R[j - 1] : R[j]; return r; }
    var o = { R: R, S: S, env: env, get extra() { return extra; }, get done() { return done; }, get j() { return j; }, get s2t() { return s2t; }, ext: ext,
      step: function (dt) {
        if (done) return 0;
        var r = j > 0 ? cellOf() : R[0], inShaft = j > 0 && R[j].shaft && ph < 2, b = levelBase(r.L), x = r.i % W, z = (r.i / W) | 0, lv = M.levels[r.L];
        var e = { f: 0, rad: 0, contact: false }, lo = 0, hi = 0;
        if (!inShaft) {
          var y0 = lv.pit[r.i] ? b : b + 1, c0 = w.idx(x, y0, z), c1 = c0 + w.X * w.Z;
          var wl = (mat[c0] === WATER ? q[c0] : 0), wh = (mat[c1] === WATER ? q[c1] : 0);
          var SF = M.negative ? WATER : LAVA; lo = mat[c0] === SF ? q[c0] : 0; hi = mat[c1] === SF ? q[c1] : 0;   // 涉水减速只算本场景的流体（与游戏一致）
          e.f = immersionOf(wl, wh, false); e.contact = (mat[c0] === LAVA && q[c0] > 0) || (mat[c1] === LAVA && q[c1] > 0);
          if (env.lava) e.rad = radiant(get, x + 0.5, z + 0.5, b, env.heatR);
        }
        st = thermoStep(S, e, dt, env);
        var s2 = st <= -2 || st >= 2; if (s2) s2t += dt;
        // 推进路线：h（坑里长按）→ x（固定动画 / 竖井）→ w（走到下一格）
        var left = dt;
        if (j === 0) { next(); }
        while (left > 1e-9 && !done) {
          if (ph === 0) { var m = s2 ? Math.min(T.climb2, 1 + 1 / Math.max(0.01, R[j].h)) : 1, need = rem * m;
            if (need <= left) { left -= need; if (s2) extra += need - rem; ph = 1; rem = R[j].x * K; } else { rem -= left / m; if (s2) extra += left - left / m; left = 0; } }
          else if (ph === 1) { if (rem <= left) { left -= rem; ph = 2; rem = R[j].w * K; } else { rem -= left; left = 0; } }
          else { var v = Math.max(0.35, 1 - 0.05 * (lo + hi)) * (s2 ? T.slow2 : 1), need2 = rem / v;
            if (s2) extra += Math.min(left, need2) * (1 - T.slow2);
            if (need2 <= left) { left -= need2; ext[j] = extra; next(); } else { rem -= left * v; left = 0; } }
        }
        return st;
      } };
    return o;
  }
  function fairness(M, k, PC, hook) {
    selectBreach(M, k);
    var B = buildWorld(M, { headAbove: PC.headAbove, lakeW: PC.lakeW, params: PC.params }), w = B.w, f = B.fluid, W = M.W;
    var R = route(M), need = new Float64Array(R.length), cells = new Int32Array(R.length * 2), maxT = 0, MARGIN = 2;
    for (var j = 0; j < R.length; j++) {
      need[j] = R[j].t * PC.slack + MARGIN;
      if (need[j] > maxT) maxT = need[j];
      var b = levelBase(R[j].L), x = R[j].i % W, z = (R[j].i / W) | 0;
      cells[j * 2] = w.idx(x, b + 1, z); cells[j * 2 + 1] = w.idx(x, b + 2, z);
    }
    B.openBreach();
    var maxTick = Math.ceil(maxT * PC.tps), margin = 1e9, X = thermoRoute(M, PC, w, 1), seen = 0;
    var fin = function (r) { r.tmin = X.S.min; r.tmax = X.S.max; r.extra = X.extra; r.s2t = X.s2t; return r; };
    for (var tick = 1; tick <= maxTick; tick++) {
      w.tick();
      if (hook) hook(tick);
      if (tick & 1) continue;
      var now = tick / PC.tps;
      // 体温：理想玩家（不用火把）全程不能到重度失温 / 中暑；中度阶段的减速累计延误不能超出放宽
      if (!X.done) {
        var stg = X.step(2 / PC.tps);
        if (stg <= -3 || stg >= 3) return fin({ ok: false, margin: -1, ticks: tick, L: R[Math.min(X.j, R.length - 1)].L, full: maxTick, why: 'temp' });
        for (; seen < X.ext.length; seen++) if (X.ext[seen] !== undefined && R[seen].t + X.ext[seen] > need[seen] + 1e-9) return fin({ ok: false, margin: need[seen] - R[seen].t - X.ext[seen], ticks: tick, L: R[seen].L, full: maxTick, why: 'slow' });
      }
      for (j = 0; j < R.length; j++) {
        if (now > need[j]) continue;
        var lo = cells[j * 2], hi = cells[j * 2 + 1];
        var bad = f === MM.LAVA ? (w.mat[lo] === f ? w.q[lo] : 0) + (w.mat[hi] === f ? w.q[hi] : 0) >= 3 : (w.mat[hi] === f && w.q[hi] >= 5);
        if (bad) { var m = now - (need[j] - MARGIN); if (m < margin) margin = m; if (m < 0) return fin({ ok: false, margin: m, ticks: tick, L: R[j].L, full: maxTick, why: 'fluid' }); }
      }
    }
    return fin({ ok: true, margin: margin, ticks: maxTick, L: -1, full: maxTick });
  }
  // 候选按种子决定的顺序依次尝试，取第一个满足公平条件的；全不满足取余量最大的。
  // quick：某个候选的失败代价大（在上层 L ≥ 1 才出危险，或模拟超过 20 s 才出危险）时不再试本图其余候选、直接换图：
  // 各候选上层路线相同，换破口多半无济于事；这种失败又要跑很长的模拟（地下水尤甚）。早早失败的候选很便宜，照常往下试
  function chooseBreach(M, PC, hook, quick) {
    var best = 0, bm = -1e9, total = 0, log = [];
    for (var k = 0; k < M.cands.length; k++) {
      var r = fairness(M, k, PC, hook); total += r.ticks; log.push(r);
      if (r.ok) { best = k; break; }
      if (r.margin > bm) { bm = r.margin; best = k; }
      if (quick && (r.L >= 1 || r.ticks > 20 * PC.tps)) break;
    }
    selectBreach(M, best);
    return { k: best, ticks: total, log: log, ok: log[log.length - 1].ok, margin: log[best].margin };
  }
  /* 选图：先在原图的破口候选里找公平的；都不公平就按 regen = 1, 2… 换图重来（确定性：只由 seed、d 决定）。
   * 最多 REGEN 张图都不公平时（实测各档 24 个种子里没有出现过），取余量最大的那张的最佳候选。返回 {M, k, regen, ticks, ok, tries}。 */
  var REGEN = 8;
  /* 险图（服主，设计 §34；不对玩家显示）：高档（d ≥ 22）按种子决定的一部分版本，严格公平测试不通过时也不换图，只要"底线"成立就保留原图（regen 0）：
   * 按理想路线走（与体温预跑同样的速度规则），被流体追上（或到重度）之前完成了 ≥ 60% 的路线时间，且开头几秒起点一带没被淹。底线也不成立就照常换图。
   * 计分的理想时间放宽：T_eff = T × rT，rT = 1 + 0.5 × (1 − f) / 0.4，夹在 [1.15, 1.5]；严格测试通过时 rT = 1。 */
  function riskyOf(seed, d) { var t = tier(d); return t.risky > 0 && E.mulberry((seed ^ 0x2157c0de ^ Math.imul(t.c + 1, 0x7FEB352D)) >>> 0)() < t.risky; }
  function riskyR(f) { return Math.max(1.15, Math.min(1.5, 1 + 0.5 * (1 - f) / 0.4)); }
  var FLOOR_F = 0.6, FLOOR_START = 1;   // 起点那一格在开头 1 s 内（人还没走开）就被淹 = 底线不成立
  function floorTest(M, k, PC, hook) {
    selectBreach(M, k);
    var B = buildWorld(M, { headAbove: PC.headAbove, lakeW: PC.lakeW, params: PC.params }), w = B.w, fl = B.fluid, W = M.W, R = route(M), Tend = R[R.length - 1].t + shaftTime(true);   // 整条路线的时间含最后一段竖井
    var bad = function (j) { var b = levelBase(R[j].L), x = R[j].i % W, z = (R[j].i / W) | 0, lo = w.idx(x, b + 1, z), hi = w.idx(x, b + 2, z);
      return fl === MM.LAVA ? (w.mat[lo] === fl ? w.q[lo] : 0) + (w.mat[hi] === fl ? w.q[hi] : 0) >= 3 : (w.mat[hi] === fl && w.q[hi] >= 5); };
    B.openBreach();
    var X = thermoRoute(M, PC, w, 1), maxTick = Math.ceil((Tend * 2 + 10) * PC.tps), nS = 1;   // 起点那一格
    for (var tick = 1; tick <= maxTick; tick++) {
      w.tick(); if (hook) hook(tick); if (tick & 1) continue;
      var now = tick / PC.tps;
      if (now <= FLOOR_START) for (var s = 0; s < nS; s++) if (bad(s)) return { f: 0, startOk: false, ticks: tick };
      if (X.done) return { f: 1, startOk: true, ticks: tick };
      var stg = X.step(2 / PC.tps), jj = Math.max(0, Math.min(R.length - 1, X.j - 1));
      if (stg <= -3 || stg >= 3 || bad(jj)) return { f: R[jj].t / Tend, startOk: true, ticks: tick };
    }
    return { f: 1, startOk: true, ticks: maxTick };
  }
  function chooseMap(seed, d, negative, PC, hook) {
    var total = 0, best = null, g0 = 0, risky = riskyOf(seed, d), M, r;
    var out = function (o) { o.M.risky = risky; o.M.rT = o.rT = o.rT || 1; o.risky = risky; return o; };
    if (risky) {
      M = genMaze(seed, d, negative, 0); r = chooseBreach(M, PC, hook, true); total += r.ticks;
      if (r.ok) return out({ M: M, k: r.k, regen: 0, ticks: total, ok: true, tries: 1, rT: 1 });
      var bf = null;
      for (var k = 0; k < r.log.length; k++) { var fl = floorTest(M, k, PC, hook); total += fl.ticks; if (fl.startOk && fl.f >= FLOOR_F && (!bf || fl.f > bf.f)) bf = { k: k, f: fl.f }; }
      if (bf) { selectBreach(M, bf.k); return out({ M: M, k: bf.k, regen: 0, ticks: total, ok: false, tries: 1, rT: riskyR(bf.f), floor: bf.f }); }
      best = { regen: 0, k: r.k, margin: r.margin }; g0 = 1;   // 底线也不成立：照常换图
    }
    for (var g = g0; g < REGEN; g++) {
      M = genMaze(seed, d, negative, g); r = chooseBreach(M, PC, hook, true); total += r.ticks;
      if (r.ok) return out({ M: M, k: r.k, regen: g, ticks: total, ok: true, tries: g + 1 });
      if (!best || r.margin > best.margin) best = { regen: g, k: r.k, margin: r.margin };
    }
    M = genMaze(seed, d, negative, best.regen); selectBreach(M, best.k);
    return out({ M: M, k: best.k, regen: best.regen, ticks: total, ok: false, tries: REGEN });
  }
  /* 计分（服主定稿；只有胜利才计分）：
   * S = 3,000,000 × 1.1^d × Ft × Fh × Fp × Fo（向下取整）
   *   r  = max(0.9, (t + 10) / (T + 10))；T = 所选地图的理想路线时间（route 最后一格的 t），t = 通关用时
   *   Ft = 0.25 + 0.75 × 2^(−(r − 1) / 0.5)        Fh = 0.4 + 0.6 × 最低生命 / 20
   *   Fp = 0.9^( max(0, 进坑次数 − 理想路线进坑次数) + 3 × 掉层次数 )        Fo = 1 + 0.10 × 奇怪的石头
   * 评级只看 Q = Ft × Fh × Fp（不含难度与奇怪的石头）：S ≥ 0.75、A ≥ 0.55、B ≥ 0.3，否则 C。 */
  function scoreOf(o) {
    var r = Math.max(0.9, (o.t + 10) / (o.T + 10)), Ft = 0.25 + 0.75 * Math.pow(2, -(r - 1) / 0.5);
    var Fh = 0.4 + 0.6 * Math.max(0, Math.min(20, o.minHp)) / 20;
    var Fp = Math.pow(0.9, Math.max(0, o.pits - o.idealPits) + 3 * o.drops), Fo = 1 + 0.1 * o.stones, Fd = Math.pow(1.1, o.d);
    var Q = Ft * Fh * Fp;
    return { S: Math.floor(3000000 * Fd * Ft * Fh * Fp * Fo), Q: Q, grade: Q >= 0.75 ? 'S' : Q >= 0.55 ? 'A' : Q >= 0.3 ? 'B' : 'C', r: r, Ft: Ft, Fh: Fh, Fp: Fp, Fo: Fo, Fd: Fd };
  }
  // 4 位一组的分隔：1234,5678（向下取整、不为负；不用 toLocaleString，避免各地区格式不同）
  function fmtScore(n) { n = Math.max(0, Math.floor(+n || 0)); var s2 = String(n), out = ''; while (s2.length > 4) { out = ',' + s2.slice(-4) + out; s2 = s2.slice(0, -4); } return s2 + out; }
  // 理想路线：总时间与进坑次数（从坑外进到坑里算一次）
  // 理想时间 T = 走到最上层梯子格的时刻 + 最后一段竖井（爬出地面才结束计时）
  function idealStats(M) { var R = route(M), pits = 0; for (var j = 1; j < R.length; j++) { var lv = M.levels[R[j].L]; if (R[j].L === R[j - 1].L && lv.pit[R[j].i] && !lv.pit[R[j - 1].i]) pits++; } return { T: R[R.length - 1].t + shaftTime(true), pits: pits }; }
  // 同分时：用时短者优先，再比最低生命高，再比奇怪的石头多
  function betterScore(a, b) { if (!b) return true; if (a.s !== b.s) return a.s > b.s; if (a.t !== b.t) return a.t < b.t; if (a.hp !== b.hp) return a.hp > b.hp; return a.stones > b.stones; }
  // 地图指纹（测试用）：迷宫各数组 + 破口 + 初始世界
  function fingerprint(M, PC) {
    var h = 2166136261, mix = function (v) { h = Math.imul(h ^ (v & 255), 16777619); };
    M.levels.forEach(function (lv) { ['t', 'pit', 'puddle', 'torch', 'ore', 'weird'].forEach(function (key) { for (var i = 0; i < lv[key].length; i++) mix(lv[key][i]); }); mix(lv.start); });
    mix(M.k); mix(M.lake.bx); mix(M.regen); var rq = Math.round((M.rT || 1) * 1000); mix(rq); mix(rq >> 8); mix(M.risky ? 1 : 0);
    var B = buildWorld(M, { headAbove: PC.headAbove, lakeW: PC.lakeW, params: PC.params });
    for (var i = 0; i < B.w.N; i++) { mix(B.w.mat[i]); mix(B.w.q[i]); }
    return h >>> 0;
  }
  return { T: { ROCK: T_ROCK, TUN: T_TUN, ROOM: T_ROOM, LADDER: T_LADDER, SHAFT: T_SHAFT }, LEVEL_G: LEVEL_G, P_D: P_D,
    levelBase: levelBase, diffOf: diffOf, mazeDifficulty: mazeDifficulty, pacing: pacing, genMaze: genMaze, selectBreach: selectBreach,
    buildWorld: buildWorld, route: route, shaftTime: shaftTime, climbTime: climbTime, LAD_HOLD: LAD_HOLD, FADE_T: FADE_T, fairness: fairness, thermoRoute: thermoRoute, TH: TH, thermoEnv: thermoEnv, thermoNew: thermoNew, thermoStep: thermoStep, immersion: immersion, immersionOf: immersionOf, depthName: depthName, stageOf: stageOf, radiant: radiant, chooseBreach: chooseBreach, chooseMap: chooseMap, riskyOf: riskyOf, riskyR: riskyR, floorTest: floorTest, FLOOR_F: FLOOR_F, tier: tier, fingerprint: fingerprint, SPEED: SPEED, scoreOf: scoreOf, fmtScore: fmtScore, idealStats: idealStats, betterScore: betterScore };
}
