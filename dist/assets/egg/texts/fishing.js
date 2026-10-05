// 404 彩蛋游戏 07-fishing（钓鱼）的文字。改完保存即可，不需要重新构建。
// 占位符写作 {名字}，由程序填入数字等；不要删掉或改名占位符。说明见 data/README.md「404 彩蛋」。
export default {
  name: '（待服主填写）', // TODO(服主): 游戏名（显示在彩蛋区块标题旁）
  intro: '',             // 简介：标题下方的一行说明；留空则不显示

  // 画面上方的状态栏
  hud: {
    score: '分数 {score}',
    cast: '竿 {cast}/{casts}', // 第几竿 / 每轮竿数
    best: '最高 {best}'
  },

  // 盖在画面上的按钮与一轮结束时的成绩
  button: {
    start: '开始',
    again: '再钓一轮' // 一轮钓满后
  },
  result: {
    score: '本轮 {score} 分',
    score_record: '本轮 {score} 分 · 新纪录' // 刷新最高分时
  },

  // 画面下方的状态提示
  msg: {
    ready: '点击或按空格抛竿',
    waiting: '等待咬钩…',
    bite: '上钩了！快收竿',
    too_early: '太早了',      // 咬钩前就收竿
    got_away: '跑掉了',       // 咬钩后没及时收竿
    caught: '{item} +{points}',           // 钓到东西：物品名与得分
    caught_perfect: '{item} +{points}（完美）' // 时机最佳（得分翻倍）
  },

  // 画面下方的图鉴（钓到过的物品图标排成一行）
  dex: {
    count: '图鉴 {found}/{total}',
    label: '图鉴：{items}', // 图鉴图标的读屏名称；{items} 为钓到过的物品名，用 separator 连接
    separator: '、',
    none: '无'               // 一个都没钓到时代替 {items}
  },

  // 物品名：鱼、宝藏、垃圾
  items: {
    cod: '鳕鱼',
    salmon: '鲑鱼',
    puffer: '河豚',
    tropical: '热带鱼',
    tag: '命名牌',
    shell: '鹦鹉螺壳',
    book: '附魔书',
    boot: '旧靴子',
    stick: '木棍'
  },

  // 画面的读屏名称
  canvas_label: '钓鱼小游戏画面'
};
