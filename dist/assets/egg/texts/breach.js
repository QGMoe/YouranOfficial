// 404 彩蛋游戏 08-breach（挖穿）的文字。改完保存即可，不需要重新构建。
// 占位符写作 {名字}，由程序填入数字等；不要删掉或改名占位符。说明见 data/README.md「404 彩蛋」。
// 游戏模块里另有一份内容相同的内置文案（构建时从本文件复制），本文件加载失败时才用它。
export default {
  name: '（待服主填写）', // TODO(服主): 游戏名（显示在彩蛋区块标题旁，也写在分享卡片上）
  intro: '',             // 简介：标题下方的一行说明；留空则不显示

  // 画面下方的按钮与状态行
  button: {
    start: '开始',      // 开局前
    resume: '继续',     // 暂停（切走页面）后
    again: '再来一次'   // 一局结束后
  },
  info: {
    time: '用时 {time}s',                  // 画面下方的状态行；{time} 为秒数（1 位小数）
    time_best: '用时 {time}s　最佳 {best}s' // 有最佳用时时
  },
  canvas_label: 'WASD / 方向键', // 游戏画面的读屏名称，也是开局 / 暂停时盖在画面中间的提示

  // 画面左上角 / 右上角的状态（画在画面上）
  hud: {
    time: '{time}s',        // 用时（1 位小数）
    level: '{level}/{total}', // 第几层 / 共几层（多层地图）
    stones: '×{n}',         // 奇怪的石头个数（图标后）
    stone_pop: '+1',        // 挖到奇怪的石头时人物旁边冒出来的字
    buff_left: '{n}s',      // 信标效果剩余秒数
    buff_inf: '∞',          // 在信标光环里（效果持续）
    temp: '{temp}°C'        // 核心体温（1 位小数）
  },

  // 体温阶段名（画面右上角，体温旁）
  stage: {
    cold_1: '轻度失温',
    cold_2: '中度失温',
    cold_3: '重度失温',
    hot_1: '轻度过热',
    hot_2: '中度过热',
    hot_3: '中暑'
  },

  // 画面上的操作提示
  prompt: {
    qte_key: '空格',   // 掉进深坑的快速反应：桌面
    qte_tap: '点击',   // 同上：触屏
    torch_key: 'Shift 用火把取暖', // 中度失温时可以用手里的火把取暖（桌面）
    stand_key: 'Shift 爬起来',     // 重度倒下后回到轻度，可以起身（桌面）
    relight_key: '按住 Shift 取火', // 火把灭着、够得着墙上点着的火把时（桌面）：按住约 1.5 秒点着，松开中断
    warming: '取暖中…别动',        // 站着用火把取暖的引导中（一动就中断）
    warming_rescue: '取暖中…',     // 倒下后用火把急救的引导中
    torch_tip_1: '取暖要原地站约 {sec} 秒，一动就中断、火把照样烧完', // 第一次出现取暖提示时的小提示（第一行）；{sec} 为引导秒数
    torch_tip_2: '火灭了可以在墙上点着的火把旁重新点着'              // 同上（第二行）
  },

  // 触屏的动作按钮（与上面的 Shift 提示对应）
  act: {
    torch: '用火把取暖',
    stand: '爬起来',
    relight: '取火',             // 火把灭着、够得着墙上点着的火把时：按住按钮取火
    warming: '取暖中…别动',
    warming_rescue: '取暖中…'
  },

  // 触屏操作区
  pad: {
    up: '上', down: '下', left: '左', right: '右',   // 方向按钮的读屏名称
    joystick: '摇杆（拖动控制方向）',                // 摇杆的读屏名称
    mode_label: '操作方式：摇杆 / 方向键',           // 切换操作方式的按钮
    mode_joy: '当前：摇杆',                          // 同上，鼠标悬停提示
    mode_pad: '当前：方向键',
    side_label: '操作区：左 / 右',                   // 切换操作区左右的按钮
    side_left: '左',                                 // 同上，按钮上的字
    side_right: '右',
    side_left_title: '当前：左',                     // 同上，鼠标悬停提示
    side_right_title: '当前：右'
  },

  // 结算面板
  end: {
    title_win: '逃出生天',
    title_lose: '没能逃出',
    cause_win: '回到地面',        // 标题右边的小字：逃出来的原因 / 没逃出来的死因
    cause_lava: '被岩浆吞没',
    cause_water: '溺水',          // 地下水没过头顶
    cause_drown: '溺水',          // 气泡用完
    cause_drown_cold: '溺水 · 失温', // 趴着溺水时又失温
    cause_cold: '失温',
    cause_heat: '中暑',
    cause_suffocate: '窒息',      // 头所在的格子凝固成石头
    new_record: '新纪录',
    best_time: '最佳 {best}',     // 没有计分时大号用时旁边；{best} 为最佳用时或 none
    none: '—',                    // 还没有最佳记录
    seconds: '{t}s',              // 秒数（1 位小数）
    time_line: '用时 {time}s · 最佳用时 {best}', // 计分时总分下面一行；{best} 为最佳用时（带 s）或 none
    time_line_score: '用时 {time}s · 最佳用时 {best} · 最高分 {score}', // 同上，没破纪录时附上之前的最高分
    temp_min: '最低体温 {temp}°C', // 计分时的一行；不计分时是统计格（见 stat_temp_min）
    temp_max: '最高体温 {temp}°C',
    lag: '流体最多落后 {sec} 秒',  // 流体模拟落后游戏时间超过 0.1 秒时；{sec} 为 3 位小数
    version: 'v{n} · 难度 {d} / {total} · {view}', // 面板底部；{view} 为 3D 或 2D
    again: '再来一次',
    next: '下一张图',
    share: '分享'
  },
  // 计分明细（胜利且计分时，逐行出现）
  score_row: {
    time: '时间',  time_note: '{time}s / 理想 {ideal}s',
    hp: '生命',    hp_note: '最低 {hearts} 心',
    pits: '掉坑',  pits_none: '没多掉', pits_extra: '多掉 {n} 次', pits_drops: '，掉下 {n} 层', // pits_drops 接在前两者后面
    stones: '奇怪的石头', stones_note: '×{n}',
    diff: '难度',  diff_note: '{d} / {total}',
    factor: '×{f}' // 每行右边的系数（2 位小数）
  },
  // 评级（总分旁的方块里、分享卡片与分享文字里）
  grade: { S: 'S', A: 'A', B: 'B', C: 'C' },
  // 不计分时的统计（失败、调试局）
  stat: {
    levels: '逃出层数', levels_v: '{n} / {total}',
    min_hp: '最低生命', min_hp_v: '{n} 心',
    pits: '掉进矿坑', pits_v: '{n} 次', pits_v_drops: '{n} 次（掉下 {drops} 层）',
    beacons: '经过信标', beacons_v: '{n} 座',
    soaked_water: '泡在水里', soaked_lava: '泡在岩浆里', soaked_v: '{sec} 秒',   // 身体浸在流体里的时间
    nearest_water: '离水最近', nearest_lava: '离岩浆最近', nearest_v: '{d} 格', nearest_never: '没碰面', // 没泡过时：流体离人物最近的距离
    stones: '挖到奇怪的石头', stones_v: '×{n}',
    temp_min: '最低体温', temp_max: '最高体温', temp_v: '{temp}°C'
  },

  // 分享（文字、卡片、提示）
  share: {
    title: '{name} · 悠然MC',  // 系统分享面板里的标题；{name} 为游戏名
    text_score: '我在悠然MC官网 v{n}（难度 {d}/{total}，{view}）逃出了矿井：{score} 分 {grade}，挖到奇怪的石头 ×{stones}',
    text_time: '我在悠然MC官网 v{n}（难度 {d}/{total}，{view}）逃出了矿井：用时 {time} 秒，挖到奇怪的石头 ×{stones}', // 没有分数时（调试局）
    text_url: '{text} {url}', // 带链接时
    card_version: 'v{n} · 难度 {d} / {total} · {view}', // 卡片右上角
    card_time: '用时 {time} 秒',
    card_hp: '最低生命 {hearts} 心',
    card_stones: '奇怪的石头 ×{n}',
    card_lag: '流体最多落后 {sec} 秒',
    toast_image_fail: '生成图片失败',
    toast_fail: '分享没有成功',
    toast_link: '图片已下载，已复制链接',
    toast_text: '图片已下载，已复制战绩',     // 没有链接时复制的是战绩文字
    toast_copy_fail: '图片已下载（复制链接没有成功）'
  }
};
