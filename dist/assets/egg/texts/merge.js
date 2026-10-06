// 404 彩蛋游戏 05-merge「合成大矿物」（2048 变体）的文字。改完保存即可，不需要重新构建。
// 占位符写作 {名字}，由程序填入数字等；不要删掉或改名占位符。说明见 data/README.md「404 彩蛋」。
export default {
  name: '合成大矿物', // 游戏名（显示在彩蛋区块标题旁）
  intro: '',             // 简介：标题下方的一行说明；留空则不显示

  // 棋盘上方
  hud: {
    score: '分数 {score}',
    best: '最高分 {best}'
  },

  // 棋盘下方的按钮
  button: {
    start: '开始',       // 开局前
    new_game: '新的一局', // 进行中（次要样式）
    again: '再来一次'    // 无路可走后
  },

  // 按钮左侧的消息
  msg: {
    controls: '方向键 / WASD / 滑动', // 开局前的操作提示
    unlocked: '已解锁：{tier}',       // 开局时与合成出更高级的方块时；{tier} 为下面的方块名
    diamond: '钻石！可继续合成',      // 第一次合成出钻石
    over: '无路可走'
  },

  // 方块名，从低到高（数值依次为 1、2、4……2048）
  tiers: {
    cobblestone: '圆石',
    coal: '煤炭',
    iron_ingot: '铁锭',
    gold_ingot: '金锭',
    redstone: '红石',
    lapis_lazuli: '青金石',
    emerald: '绿宝石',
    diamond: '钻石',
    netherite_ingot: '下界合金锭',
    nether_star: '下界之星',
    beacon: '信标',
    dragon_egg: '龙蛋'
  },

  // 棋盘画布的读屏名称；有方块后用第二条（{tier} 为已解锁的最高方块，{value} 为它的数值）
  canvas_label: '矿物合成 4×4 棋盘',
  canvas_label_unlocked: '矿物合成 4×4 棋盘，已解锁：{tier}（{value}）'
};
