// 404 彩蛋游戏 01-runner（Steve 跑酷）的文字。改完保存即可，不需要重新构建。
// 占位符写作 {名字}，由程序填入数字等；不要删掉或改名占位符。说明见 data/README.md「404 彩蛋」。
export default {
  name: '蹦蹦Steve', // TODO(服主): 游戏名（显示在彩蛋区块标题旁）
  intro: '',             // 简介：标题下方的一行说明；留空则不显示

  // 画布下方的按钮
  button: {
    start: '开始',      // 开局前
    again: '再来一次',  // 游戏结束后
    resume: '继续'      // 切到后台自动暂停后
  },

  // 开始 / 暂停 / 结束画面中间的操作提示；同时是画布的读屏名称
  hint: '空格 / 点按：跳跃',

  // 画布上的覆盖层（未在奔跑时）
  overlay: {
    over: '游戏结束',                   // 撞到障碍或掉进坑后的标题
    paused: '已暂停',                   // 暂停时的标题
    score: '分数 {score}   最高 {best}' // 结束画面的成绩行
  },

  // 画布右上角的分数（奔跑中一直显示）
  hud_score: '分数 {score}  最高 {best}',

  // 画布下方按钮左侧的分数（数字加粗显示）
  bar_score: '分数 {score}　最高 {best}',

  // 画布左上角的生物群系名：正数版本号为主世界，负数为下界
  biomes: {
    plains: '平原',
    desert: '沙漠',
    snowy_plains: '雪原',
    jungle: '丛林',
    badlands: '恶地',
    mushroom_fields: '蘑菇岛',
    twilight_forest: '暮色森林',
    nether_wastes: '下界荒地',
    soul_sand_valley: '灵魂沙峡谷',
    crimson_forest: '绯红森林',
    warped_forest: '诡异森林',
    basalt_deltas: '玄武岩三角洲'
  }
};
