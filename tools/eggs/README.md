# 404 彩蛋游戏

访问根目录下不存在的地址 `/v<n>`（或 `/v<n>/…`）时，若 n 规范化（去掉前导零，`-0` 视为 0）后大于 3 或为负数，404 页会在下方加载一个网页小游戏；0～3 不触发。
其他 404（包括 `/v1/…`、`/v2/…` 的历史版本 404）不受影响，也不会请求任何游戏文件。

## 文件与流程

| 文件 | 作用 |
|---|---|
| `dist/assets/egg/games/NN-id.js` | 每个游戏一个 ES module 文件。NN 是两位序号（决定排序），id 用小写英文 |
| `dist/assets/egg/texts/id.js` | 每个游戏的文字：游戏名 `name`、简介 `intro` 和全部游戏内文字（约定见 `CONTRACT.md`「文案」）。与游戏模块并行加载，加载失败时用模块内置的同一份文案 |
| `dist/assets/egg/texts/common.js` | 宿主的文字：区块标题、版本号小标签、横屏全屏按钮、音效开关 |
| `scripts/eggs.py` | 构建时扫描上面的目录（只认 `NN-id.js`），按文件名排序，清单内联进根目录 404.html；目录为空时 404 页不含任何彩蛋代码 |
| `templates/404.html` | 内联的小段加载器：路径匹配后 `import('/assets/egg/host.js')` |
| `dist/assets/egg/host.js` | 宿主：选游戏、放游戏区块（标题、游戏名、简介取自 `texts/`，显示 vN）、构造 ctx（含文案查询 `ctx.t`）、加载失败时回到普通 404 |
| `tools/eggs/harness.html` | 调试页（不部署）：选任意游戏、改 n、切主题、切 reducedMotion、不加载文案文件（检查内置文案）、反复 mount / unmount |
| `tools/eggs/CONTRACT.md` | 游戏接口约定（必须遵守） |

现有游戏共 8 个（按文件名顺序，下标从 0 开始；/v8 → 0、/v15 → 7、/v-1 → 7）：0 蹦蹦Steve（runner）、1 红石电路之谜（redstone）、2 ！？探矿？！（prospect）、3 Creeper?（creeper）、4 合成大矿物（merge）、5 合成猜谜（craft）、6 钓鱼佬（fishing）、7 矿难（breach）。
矿难（breach）是压缩构建产物，可读源码、构建脚本与测试在 `tools/eggs/breach/`（见其中 `tools/build.mjs` 开头的说明）。

## 新增一个游戏

1. 按 `CONTRACT.md` 写一个模块，`export default { id, title, texts, mount(root, ctx) }`，`mount` 返回 `{ unmount() }`。
2. 文件放到 `dist/assets/egg/games/`，命名 `NN-id.js`（例如 `09-snake.js`）；文字写进 `dist/assets/egg/texts/id.js`（`name: '（待服主填写）', // TODO(服主): 游戏名`、`intro: ''` 加上游戏内文字），代码里用 `ctx.t` 取，模块里的 `texts` 放同一份内容作兜底。
3. 用调试页检查：在仓库根目录运行 `python -m http.server`，打开 `http://localhost:8000/tools/eggs/harness.html`。
4. `python build.py --do` 重新构建，清单会自动更新。不需要改任何代码或配置。

## 选哪个游戏：取余规则

- 设游戏总数为 G（目录里的文件数），访问 `/v<n>` 时加载第 `((n mod G) + G) mod G` 个（下标从 0 开始，按文件名排序），负数也落在 0..G-1。用 BigInt 精确计算，n 可以很长（几千位也只需几毫秒，地址长度本身受浏览器和 Cloudflare 限制）。
- 例：G = 7 时，`/v4` → 下标 4，`/v7` → 下标 0，`/v8` → 下标 1，`/v-1` → 下标 6，`/v-7` → 下标 0。
- `ctx.n` 是规范化后的字符串（`/v04` 与 `/v4` 都是 `"4"`），只用于显示；`ctx.negative` 表示是否为负数；`ctx.cycle = floor(|n| / G)`（超过 `Number.MAX_SAFE_INTEGER` 时取它），可作难度或关卡号；`ctx.seed` 是规范化后 n（含负号）的 32 位 FNV-1a 哈希。
- **注意：新增、删除或重新编号游戏都会改变 G 或顺序，已有的 `/vN` 与游戏的对应关系会随之改变。**

## 种子：谜题类用版本号，反应类每局随机
- **谜题类**（关卡/谜题，"同一版本号同一关"有分享价值）：地图由 `ctx.seed` 决定，同一个 n 永远是同一关。目前是 02-redstone、03-prospect、06-craft、08-breach（挖穿）。
- **反应类**（跑酷、打怪、钓鱼这类靠反应的，以及 05-merge——固定出块序列可以被背下来）：每一局（包括第一局和每次重开）的随机序列都用 `crypto.getRandomValues` 取新种子，再喂给游戏自己的确定性 PRNG。版本号仍然决定难度档（`cycle mod P`）和外观（生物群系、负数时的下界/镜像等），只是障碍、出怪、咬钩时间、出块这类序列不再由 `ctx.seed` 决定。目前是 01-runner、04-creeper、05-merge、07-fishing。
- 例外：03-prospect（！？探矿？！）的棋盘尺寸随设备不同（手机固定 9×9，桌面 12×10～16×12），同一个 n 在手机和桌面上是不同的图。这样保留：探矿每局本来就不同（雷在第一次挖之后才布置，"再玩一局"也会换种子）。这条例外只适用于探矿；02-redstone 等其他谜题类必须做到同一个 n 在任何设备上都是同一关（红石电路的盘面宽度固定不超过 8 列，只按屏幕缩放格子大小）。
- 反应类的确定性测试：地址带 `?egg-test&egg-seed=<整数>` 时改用由它派生的固定种子（01-runner 用 `root.__eggTest.start(seed)`），正常游玩不受影响。

## 难度档数互质
各游戏的难度档按 `cycle mod 档数` 周期化。档数尽量选成两两互质、并且与游戏总数互质：这样整个彩蛋的"游戏 × 各游戏难度档"组合要到 游戏总数 × lcm(各档数) 之后才重复，周期被拉得很长。以后新增游戏或调整档数时，也尽量保持互质。

当前清单（游戏总数 8）：01-runner 7（主世界生物群系；负数版本号改用下界 5 个群系，5 整除 25，不影响整体周期）、02-redstone 23、03-prospect 11、04-creeper 21、06-craft 25、07-fishing 11、08-breach 29；05-merge 不分档。
其中 prospect 与 fishing 都是 11，彼此不互质：周期按最小公倍数算，重复的因子不会缩短周期，但也不再增加周期。整体周期 = 8 × lcm(7, 11, 21, 23, 25, 29) = 30,815,400。

## 宿主对约定的具体实现

- `ctx.storage`：键名加命名空间 `youran-egg:<id>:`；`set(key, value)` 以 JSON 保存，`get(key)` 返回解析后的值，没有时返回 `null`；不可用时静默失败。
- 测试接口：推荐在地址带 `?egg-test` 时挂到 `root.__eggTest`（见 CONTRACT.md），runner 就是这样做的。
- `ctx.theme()` / `ctx.onThemeChange(cb)`：同时跟随顶栏的手动切换（`html[data-theme]`）和系统深浅色变化；回调参数是新的主题 `'light'` / `'dark'`。
- `ctx.color(name)`：读取 `document.documentElement` 上的 CSS 变量，读不到时返回空字符串。站点还有 `--surface-2`（次级底色）可用。
- `ctx.signal`：页面卸载（pagehide）或挂载失败时 abort。
- `ctx.cycleMod(p)`：精确的 `cycle mod p`（BigInt，不受封顶影响）。`ctx.href(delta)`：同一个游戏 cycle + delta 的地址 `/v<m>`（正数 n 加 `delta × G`，负数 n 减 `delta × G`），落到 0～3 或负数越过 0 时为 `null`。调试页 `harness.html` 也会传入游戏总数，二者可用。
- 横屏全屏：触屏设备上标题行有「横屏全屏」按钮（`fullscreenControl`，样式 `FS_CSS`，均由 host.js 导出，调试页也用它）；有元素全屏 API 时真全屏并尝试锁横屏，否则（iPhone）CSS 伪全屏。全屏期间游戏根带 class `egg-fs`，适配要求见 CONTRACT.md「横屏全屏」。
- 模块加载失败、没有 `mount`、`mount` 抛错时，游戏区块被移除，页面就是普通 404。
- 文案：`start()` 同时发出 `texts/common.js`、游戏模块、`texts/<id>.js` 三个请求，等 `common.js`（失败则用 host.js 里的 `COMMON`）后放出区块；`mountGame()` 由游戏文件名推出文案地址（`games/NN-id.js` → `texts/id.js`），与模块一起加载，失败时 `console.warn` 一次并用模块的 `texts`。`ctx.t` / `ctx.tNodes` 的语义见 CONTRACT.md「文案」，实现为 host.js 导出的 `translator()`（另导出 `fill`、`lookup`、`loadTexts`、`textsUrlFor` 供调试页与测试用）。

## 矿难（08-breach）的文案
矿难的全部游戏内文字已在 `texts/breach.js`（9104285），与其他游戏相同：改 `texts/breach.js` 即可，不需要重新构建。
构建时（`tools/eggs/breach/tools/build.mjs`）会把 `texts/breach.js` 原样内联为模块的内置 `texts`，只在文案文件加载失败时兜底；改了 `texts/breach.js` 后重新构建一次，可让内置兜底与之保持一致。
