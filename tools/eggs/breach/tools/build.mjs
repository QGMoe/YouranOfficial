// 把 src/*.js 拼成单文件 ES module：可读版写到 tools/eggs/breach/08-breach.src.js（不入库），压缩版写到 dist/assets/egg/games/08-breach.js。
// 用法（仓库根目录）：
//   cd tools/eggs/breach && npm i --no-save terser@5.51.2 && cd -     # 只用于构建，不是站点依赖；也可以设 TERSER=<terser 包目录>
//   node tools/eggs/breach/tools/build.mjs
import fs from 'fs';
const dir = new URL('../', import.meta.url);
const parts = ['engine.js', 'core.js', 'scene.js', 'render2d.js', 'render3d.js', 'audio.js', 'game.js'].filter(f => fs.existsSync(new URL('src/' + f, dir)));
let out = '/* 404 彩蛋游戏「挖穿」（breach）。由 tools/build.mjs 从 src/ 生成，请勿直接编辑。原创像素/体素画，不使用任何官方素材。 */\n';
for (const p of parts) out += fs.readFileSync(new URL('src/' + p, dir), 'utf8') + '\n';
out += 'export const _engine = fluidEngine();\nexport const _core = breachCore(_engine);\n';

// 文案（tools/eggs/CONTRACT.md「文案」）：把 dist/assets/egg/texts/breach.js 原样内联为内置文案 TEXTS（导出为 texts），保证与文案文件一致；
// 改文字请改 texts/breach.js（宿主运行时加载它，不需要重新构建；重新构建只是同步这份兜底）。
// 游戏名以宿主给的文案为准（texts/breach.js 的 name）；GAME_TITLE 只是模块 title 的兜底
if (parts.includes('game.js')) {
  const tsrc = fs.readFileSync(new URL('../../../dist/assets/egg/texts/breach.js', dir), 'utf8');
  if (!/^export default \{/m.test(tsrc)) throw new Error('texts/breach.js: expected "export default {"');
  out += '/* 内置文案：由 tools/build.mjs 从 dist/assets/egg/texts/breach.js 复制，改文字请改那个文件 */\n' + tsrc.replace(/^export default \{/m, 'var TEXTS = {') + '\n';
  out += 'var GAME_TITLE = "（待服主填写）";\nexport default {\n  id: "breach",\n  title: GAME_TITLE,\n  texts: TEXTS,\n  mount\n};\n';
}
fs.writeFileSync(new URL('08-breach.src.js', dir), out);
const DIST = new URL('../../../dist/assets/egg/games/08-breach.js', dir);
// 发布用：terser 压缩（只用于构建，不随站点发布）；Worker 依赖函数 toString，所以这三个函数必须自包含（不引用外层变量）
const { minify } = await import(process.env.TERSER ? new URL('main.js', 'file://' + process.env.TERSER.replace(/\/?$/, '/')).href : new URL('node_modules/terser/main.js', dir).href);
const min = await minify(out, { module: true, compress: { passes: 2, keep_fargs: true }, mangle: true, format: { comments: /^!/, preamble: '/* 404 彩蛋游戏「挖穿」（breach）。由可读源码 src/*.js 经 tools/build.mjs（terser）构建。原创像素/体素画，不使用任何官方素材。 */' } });
fs.writeFileSync(DIST, min.code);
console.log('built', out.length, 'bytes readable,', min.code.length, 'bytes minified', parts.join(' '));
