// 404 彩蛋游戏 06-craft（合成台猜谜，Wordle 变体）的文字。改完保存即可，不需要重新构建。
// 占位符写作 {名字}，由程序填入数字等；不要删掉或改名占位符。说明见 data/README.md「404 彩蛋」。
export default {
  name: '（待服主填写）', // TODO(服主): 游戏名（显示在彩蛋区块标题旁）
  intro: '',             // 简介：标题下方的一行说明；留空则不显示

  // 工作台上方（数字加粗显示）
  top: {
    tries: '次数 {tries}',               // {tries} 为“已用次数/上限”，如 2/6；开局前不显示
    stats: '连胜 {streak} · 最佳 {best}' // 连续猜中的局数与历史最佳
  },

  // 按钮
  button: {
    start: '开始',          // 开局前
    submit: '提交',
    clear: '清空',          // 清空合成格
    clear_feedback: '清除反馈', // 去掉合成格上的颜色反馈（材料不动）
    next: '再来一题',       // 猜中后
    again: '再来一次'       // 次数用完没猜中后
  },

  // 工作台下方的消息
  msg: {
    win: '合成成功',
    lose: '没猜中'
  },

  // 反馈的三种标记：图例文字，以及读屏朗读合成格 / 材料 / 历史时的说明
  marks: {
    correct: '正确',     // 材料对、位置对
    misplaced: '位置不对', // 配方里有这种材料，但不在这个位置
    absent: '错误'       // 配方里没有（或多放了）
  },

  // 按钮下方的操作提示（键盘）
  hint: '方向键移动 · 数字键选材料 · 退格清除 · 回车提交',

  // 合成格与输出格之间的箭头；负数版本号时工作台左右镜像，箭头用 arrow_mirrored
  arrow: '→',
  arrow_mirrored: '←',

  // 输出格：猜中或结束前显示的问号（结束后显示配方名）
  result_unknown: '?',

  // 材料名（材料栏与合成格里显示）
  materials: {
    empty: '空', // 空格子（只用于读屏和材料栏）
    planks: '木板',
    stick: '木棍',
    cobblestone: '圆石',
    iron_ingot: '铁锭',
    gold_ingot: '金锭',
    diamond: '钻石',
    redstone: '红石',
    string: '线'
  },

  // 题目：配方名（结束后显示在输出格）
  recipes: {
    wooden_pickaxe: '木镐',
    stone_pickaxe: '石镐',
    iron_pickaxe: '铁镐',
    golden_pickaxe: '金镐',
    diamond_pickaxe: '钻石镐',
    furnace: '熔炉',
    chest: '箱子',
    bow: '弓',
    fishing_rod: '钓鱼竿',
    piston: '活塞',
    rail: '铁轨',
    powered_rail: '动力铁轨',
    compass: '指南针',
    clock: '时钟',
    iron_chestplate: '铁胸甲',
    iron_leggings: '铁护腿',
    diamond_chestplate: '钻石胸甲',
    golden_leggings: '金护腿',
    iron_block: '铁块',
    diamond_block: '钻石块',
    redstone_block: '红石块',
    ladder: '梯子',
    sign: '告示牌',
    jukebox: '唱片机',
    note_block: '音符盒'
  },

  // 以下只供读屏朗读
  aria: {
    game: '合成台猜谜',     // 整个游戏区域
    grid: '合成格',
    result: '结果',         // 输出格
    palette: '材料',        // 材料栏
    history: '历史',        // 已提交的猜测列表
    cell: '第{row}行第{col}列：{material}',                // 合成格的一格
    cell_marked: '第{row}行第{col}列：{material}，{mark}', // 带反馈时
    material: '{material}（{key}）',                      // 材料按钮；{key} 为对应的数字键
    material_marked: '{material}（{key}），{mark}',       // 已知反馈时
    history_item: '第{n}次：{cells}',  // 一次猜测；{cells} 为 9 格依次用 history_sep 连起来
    history_cell: '{material}{mark}',  // 其中一格
    history_sep: '，'
  }
};
