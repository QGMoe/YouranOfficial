// 404 彩蛋游戏 03-prospect（探矿，扫雷变体）的文字。改完保存即可，不需要重新构建。
// 占位符写作 {名字}，由程序填入数字等；不要删掉或改名占位符。说明见 data/README.md「404 彩蛋」。
export default {
  name: '（待服主填写）', // TODO(服主): 游戏名（显示在彩蛋区块标题旁）
  intro: '',             // 简介：标题下方的一行说明；留空则不显示

  // 棋盘上方的状态栏：每项是“名称 + 空格 + 加粗的数字”
  hud: {
    score: '分数',
    time: '时间', // 秒
    tnt: 'TNT',   // 剩余（未标记）的 TNT 数
    best: '最高'
  },

  // 按钮
  button: {
    start: '开始',         // 盖在棋盘上的开局按钮
    again: '再来一次',     // 踩到 TNT 后
    play_again: '再玩一局' // 通关后
  },

  // 触屏的点按模式切换按钮（进行中显示在棋盘下方）
  mode: {
    dig: '点按：挖掘',
    flag: '点按：标记'
  },

  // 模式按钮旁的操作提示
  hint: {
    flag: '右键/长按：标记', // 点按为挖掘时
    dig: '长按：挖掘'        // 点按为标记时
  },

  // 棋盘下方的消息
  msg: {
    ore: '{ore} +{points}',      // 挖到矿石：矿物名与得分
    won: '通关',
    lost: '爆炸了',
    new_record: '{result} · 新纪录' // 刷新最高分时，{result} 为上面的“通关”或“爆炸了”
  },

  // 矿物名（用于上面的 msg.ore）
  ores: {
    coal: '煤',
    iron: '铁',
    gold: '金',
    diamond: '钻石'
  },

  // 以下只供读屏朗读
  canvas_label: '探矿棋盘（方向键移动，空格挖掘，F 标记）', // 棋盘画布的名称
  cell: {
    position: '第{row}行第{col}列 {state}', // 键盘移动光标时朗读当前格；{state} 为下面几项之一或周围 TNT 数
    flagged: '已标记',
    unopened: '未挖',
    tnt: 'TNT',
    empty: '空'
  }
};
