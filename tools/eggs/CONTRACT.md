# 404 彩蛋游戏接口约定（所有游戏必须遵守）

## 触发与选择（由宿主 404 页负责，游戏不用管）
- 访问路径匹配 `/^\/v(-?\d+)(?:\/|$)/`，规范化（去前导零，`-0` 视为 0）后 n > 3 或 n < 0 时触发；0～3 不触发。
- 宿主按 `((n mod 总数) + 总数) mod 总数` 选游戏（负数也落在 0..总数-1）（用 BigInt 计算，数字可以很长），游戏列表由构建脚本自动扫描生成，按文件名排序。
- 宿主用 `import()` 动态加载选中的那一个游戏模块，其余游戏不加载。
- 目前共 8 个游戏（01-runner … 08-breach），总数 8。各游戏难度档数尽量与总数及彼此互质，整体周期为 8 × lcm(7, 11, 21, 23, 25, 29) = 30,815,400（清单见 README「难度档数互质」）。

## 文件
- 每个游戏是**一个独立的 ES module 文件**：`dist/assets/egg/games/<NN>-<id>.js`。NN 是两位序号，决定排序；id 用小写英文。
- 不引用任何外部资源（CDN、字体、外链图片都不行），图形全部用 Canvas 或 DOM 自绘，样式由 JS 注入，选择器加 `egg-<id>-` 前缀，不能污染页面。
- 默认不依赖库。确有需要时可以使用**自托管**的第三方库：文件放在 `dist/assets/egg/vendor/`；只用宽松许可证（MIT、BSD、Apache-2.0、ISC、Zlib 之类）；锁定版本，并在报告和 `vendor/` 内记录来源、版本和 SHA-256；只在本游戏被选中时才加载（由游戏模块自己动态 import），不能让其他游戏或其他页面多发请求；在页脚署名（库名、版本、许可证）。
- 不使用 Mojang 官方贴图或素材；可以是 MC 题材的像素风原创绘制。
- 体积目标：未压缩 ≤ 30KB。超出要说明原因。

## 模块导出
```js
export default {
  id: 'redstone',                 // 与文件名中的 id 一致
  title: '（待服主填写）',         // 可选：游戏名的兜底（文案文件加载失败时才用），见「文案」
  texts: TEXTS,                   // 内置文案：与 texts/redstone.js 内容相同的对象，见「文案」
  mount(root, ctx) {              // root：宿主给的空 <div>，游戏只能在里面渲染
    // ...
    return { unmount() { /* 移除监听、停止 rAF、清理 DOM */ } };
  }
};
```

## 文案（用户可见的文字）
游戏里所有给人看的文字（按钮、状态栏、提示、消息、aria-label / title / alt、物品与群系名等）都不写死在游戏代码里，而是集中在文案文件中，服主改文字只需要改这些文件。

### 文件
- `dist/assets/egg/texts/<id>.js`：每个游戏一个（`<id>` 与游戏文件名 `NN-<id>.js` 中的 id 相同，宿主据此自动找到，不需要登记）。
- `dist/assets/egg/texts/common.js`：宿主自己的文字（区块标题、版本号小标签、横屏全屏按钮、音效开关），游戏不要用。
- 格式：ES module，`export default { … }` 一个普通对象，手写、无需构建，可以写 `//` 注释。
  - 顶层固定两项：`name`（游戏名，显示在区块标题旁；占位写 `'（待服主填写）'`，并加注释 `// TODO(服主): 游戏名`，方便服主搜索）、`intro`（一行简介，显示在标题行下方；空字符串不显示）。
  - 其余是游戏内文字，可以分节嵌套（相当于 TOML 的节），键名用英文 snake_case（`hud`、`button.start`、`msg.too_early`……），值只能是字符串。
  - 每一项都要有中文注释，说明这句话出现在哪里、什么时候出现、占位符是什么。
  - 动态部分写占位符 `{名字}`（只能是字母、数字、下划线），由游戏传入，例如 `'第 {level} 关'`、`'{item} +{points}'`。不要在代码里拼接句子：一个完整的句子（含标点、空格、单位）应当是一条文案，让服主能调整语序。
  - 名称表（物品、群系、配方……）用一节，键为英文 id，代码里的数据只保留 id。
- 只在本游戏被选中时，与游戏模块**并行**加载；其他页面、其他游戏都不会请求。
- 游戏模块里另外保留一份内容**完全相同**的内置文案（导出为 `texts`，注释写明“改文字请改 texts/<id>.js”）：文案文件加载失败（404、语法错误）时宿主改用它，游戏照常运行。

### ctx 里的文案接口
| 字段 | 说明 |
|---|---|
| `t(key, params?, fallback?)` | 取一条文案并填入占位符，返回字符串。`key` 是点分隔的路径（`'hud.score'`、`'items.' + id`）；`params` 是 `{ 名字: 值 }`，值用 `String()` 转换，没有提供的占位符原样保留；`params` 可省略（`t(key, fallback)`）。查找顺序：文案文件 → 模块内置 `texts` → `fallback` → 键名本身。文案文件已加载但缺少这个键（或哪里都找不到）时，每个键只 `console.warn` 一次 |
| `tNodes(key, params, wrap?)` | 同 `t`，但返回 `[字符串 \| 节点]` 数组，每个占位符的值先交给 `wrap(名字, 值)`（返回节点或字符串），可直接 `el.append(...arr)`。用于“分数 **12**”这类数字加粗的句子，不要用 `innerHTML` 拼文案 |
| `texts` | 实际使用的文案对象（文案文件，加载失败时为模块内置 `texts`），一般不需要直接读 |

规则：
- 文案一律作为**文本**插入（`textContent`、`append`、`setAttribute`、Canvas `fillText`），不要放进 `innerHTML`。
- 句子级别取文案：`t('msg.caught', { item: t('items.' + id), points })`，不要 `t('a') + ' ' + n`。
- 负数版本号的镜像玩法只镜像布局 / 画面，不能镜像文字（Canvas 上镜像绘制时，文字要在恢复变换后再画）；镜像时需要不同的符号（如箭头）就单独设一条文案。
- 新游戏：写 `texts/<id>.js`，在模块里放同样内容的 `TEXTS` 并导出为 `texts`，代码里只用 `ctx.t` / `ctx.tNodes`。
- 已有游戏迁移：把每一处可见字符串换成 `ctx.t(...)`，**措辞不变**；迁移后对比迁移前后同一状态下的 DOM 文字、aria 属性与截图应完全相同。

### 宿主对文案的处理
- `name`：区块标题旁的游戏名（文本节点插入，过长自动换行）。取值顺序：文案文件的 `name` → 模块内置 `texts.name` → 模块的 `title`；为空时不显示。
- `intro`：标题行下方的一行简介（站点 muted 色、可换行，浅色 / 深色都跟随站点；横屏全屏时与标题一起隐藏），为空时不显示。

## ctx（宿主传入）
| 字段 | 类型 | 说明 |
|---|---|---|
| `n` | string | 规范化后的版本号字符串（去掉前导零，可能带负号 `-`，可能很长）。**只用于显示**，不要自己解析成 Number |
| `cycle` | number | `floor(abs(n) / 游戏总数)`，≥ 0，超过安全整数时取 `Number.MAX_SAFE_INTEGER`。可用作难度/关卡号；难度建议按 `cycle mod P` 周期化，不要封顶（见下方通用要求） |
| `seed` | number | 由规范化后的 n（含负号）哈希出的 32 位无符号整数，同一个 n 每次相同，用于确定性随机；`-5` 与 `5` 的 seed 不同。只有谜题类游戏用它决定地图；反应类游戏每局用 `crypto.getRandomValues` 取新种子（见 README「种子」一节） |
| `negative` | boolean | n 是否为负数。游戏可以忽略，也可以拿来做点花样（例如镜像/反色），但玩法必须正常 |
| `theme()` | () => 'light' \| 'dark' | 当前实际主题（已考虑手动切换与系统设置） |
| `onThemeChange(cb)` | 注册回调 | 主题改变时调用 `cb(theme)`，`theme` 为新的 `'light'` / `'dark'`（同时跟随顶栏手动切换和系统设置）；unmount 时宿主会自动解除 |
| `color(name)` | (string) => string | 读取站点 CSS 变量，例如 `color('--accent')`、`color('--bg')`、`color('--text')`、`color('--muted')`、`color('--border')`、`color('--surface')`；另有 `--surface-2`（次级底色）、`--accent-soft`、`--on-accent`、`--ok`、`--warn`、`--danger` |
| `storage.get(key)` / `storage.set(key, value)` | | 已加命名空间（`youran-egg:<id>:`）和 try/catch 的 localStorage 包装，存不了时静默失败。`set` 以 JSON 保存任意可序列化的值，`get` 返回 JSON 解析后的同一个值（存字符串读回字符串，存数字读回数字），没有时返回 `null` |
| `reducedMotion` | boolean | 挂载那一刻 `prefers-reduced-motion: reduce` 是否开启；之后系统设置变化不会更新这个值 |
| `signal` | AbortSignal | 宿主卸载游戏（页面 pagehide）或挂载失败时 abort，可直接传给 addEventListener；不要依赖它处理别的事 |
| `audio` | object | 音效接口，见下方「音效」一节 |
| `cycleMod(p)` | (number) => number | 精确的 `cycle mod p`（宿主用 BigInt 按完整的 n 计算，不受上面 `cycle` 的安全整数封顶影响）。周期化难度/关卡号优先用它 |
| `href(delta)` | (number) => string \| null | 同一个游戏、cycle 加 `delta` 之后的地址（`/v<m>`，游戏下标不变）：正数 n 为 `n + delta × 游戏总数`，负数 n 为 `n − delta × 游戏总数`（BigInt 计算）。结果会落到不触发彩蛋的 0～3、或负数越过 0 时返回 `null`；游戏拿到 `null` 时不显示对应链接。用于"下一关"之类的跳转：用真正的 `<a href>`，可以中键/长按在新标签打开、地址可分享 |
| `t(key, params?, fallback?)` / `tNodes(key, params, wrap?)` / `texts` | | 文案接口，见上方「文案」 |

## 音效（ctx.audio）
所有游戏共用宿主标题旁的一个开关（默认**静音**，状态存 `localStorage` 的 `youran-egg:audio`；页面隐藏时自动静音，回来后恢复）。全部用 Web Audio 实时合成，不使用 MC 原版音频，不加载任何音频文件。
| 方法 | 说明 |
|---|---|
| `audio.enabled()` | 现在能不能出声（开关为开且页面可见） |
| `audio.onChange(cb)` | 开关或页面可见性变化时调用 `cb(enabled)`；unmount 时宿主自动解除 |
| `audio.context()` | 能出声时返回共享的 AudioContext（宿主懒创建，打开开关/用户手势时 resume，静音时 suspend），否则返回 `null` |
| `audio.out()` | 能出声时返回主输出节点（GainNode），否则 `null`。游戏自己合成的声音连到这里；宿主在其后挂压缩器与软限幅（峰值不超过 0 dBFS），并负责静音与淡入淡出 |
| `audio.sfx(name, opts)` | 内置 8-bit 风格通用音效：`click` `place` `ok` `fail` `win` `boom` `pickup` `splash` `step` `tick` `hiss` `hit` `jump`，以及按地表区分的脚步声 `step_grass` `step_sand` `step_snow` `step_stone` `step_soul` `step_nylium`。`opts.pitch`（频率倍数，默认 1）、`opts.vol`（0～2，默认 1）、`opts.pan`（−1～1）。不能出声时什么也不做；同一种音效有并发上限（`boom` 3、`hiss` 2、其他 4，总计 14），超出的直接丢弃 |

规则：
- 静音时游戏不得创建或播放任何声音：自己合成前先检查 `audio.context()` / `audio.out()` 是否为 `null`。
- 音效只是辅助：静音时游戏的全部信息都必须能从画面获得。
- 节奏型的声音（引信、滴答等）在画面所用的同一个模拟时钟里触发（例如在固定步长的 tick 里调用 `sfx`），不要另起 `setTimeout` / `setInterval`。
- 同一时刻声音很多时（连锁爆炸、快速连点）自己也要节流，不要依赖宿主丢弃。
- 持续性的声音（自己用 `out()` 合成的）由游戏在暂停、`onChange(false)` 和 unmount 时淡出并断开；宿主在 unmount 时会停止本游戏通过 `sfx` 发出的全部声音。
- 体积：每个游戏的音效代码约 2～3KB 以内。

## 横屏全屏（宿主提供，游戏只需适配）
- 触屏设备上（`(any-pointer: coarse)` 或 `navigator.maxTouchPoints > 0`），宿主在区块标题行音效开关旁放一个「横屏全屏」按钮，全屏中变为「退出全屏」。桌面不显示。
- 有元素全屏 API 时（Android Chrome、iPad 等，含 webkit 前缀）对整个游戏区块调用 `requestFullscreen`，成功后尝试 `screen.orientation.lock('landscape')`（不支持或被拒时忽略）；没有或被拒时（iPhone Safari）改用 CSS 伪全屏：区块 `position: fixed` 铺满 `100dvh`、锁住页面滚动，竖屏时顶部显示「请把手机横过来」小提示（竖屏仍可玩）。
- **全屏期间（真全屏或伪全屏）游戏根元素 `root` 带 class `egg-fs`**，退出时移除。此时：
  - `root` 铺满整个屏幕（扣除安全区 safe-area），`display: flex; flex-direction: column`，上下有等分的弹性留白：内容放得下时垂直居中，放不下时 `root` 内部可滚动（顶部不会被裁掉）。游戏自己的内容宽度通常小于屏幕，左右两侧是空白边距，底色是站点 `--bg`（浅色近白、深色近黑，随主题实时变化）。
  - 游戏可以用 `.egg-fs` 选择器（例如 `.egg-fs .egg-<id>-xxx { … }`）把触屏按键放到左右边距里，或者改用更适合横屏的布局。
  - 宿主的「退出全屏」与音效按钮竖排浮在**右上角**（距安全区边缘 8px，约 110 × 96 px 的区域），游戏不要把必需的操作放在那里。
  - 进入和退出后宿主都会派发一次 `window` 的 `resize` 事件，`root` 尺寸也会变化（ResizeObserver 会收到）。按 `root.clientWidth` 与 `window.innerHeight` 重新计算画布尺寸的游戏无需额外处理。
- 退出途径：按钮、Esc / 系统返回（真全屏由 `fullscreenchange` 得知；伪全屏监听 Esc 与 `popstate`，进入时 `pushState` 一条同地址记录）、页面卸载。退出时解除方向锁定并恢复页面滚动位置。
- 调试页 `harness.html` 也有同样的按钮（任何设备都显示），可以在桌面检查 `.egg-fs` 下的布局。

## 通用要求
- 电脑和手机都能玩：键盘 + 鼠标 + 触屏；手机竖屏 390px 宽可以玩，不出现横向溢出；画布按容器宽度自适应，按 devicePixelRatio 保持像素锐利（`imageSmoothingEnabled = false`）。
- 触屏操作不能引发页面滚动/缩放（在游戏区域内用 `touch-action: none` 或必要的 preventDefault），但游戏区域外页面要能正常滚动。
- 有"开始 / 再来一次"，有分数或进度；最高分/进度用 `ctx.storage`。
- 难度建议按 `cycle mod P` 周期化，不要封顶：P 取难度曲线到顶所需的档数，难度档 = `cycle mod P`（0 … P−1），这样每个难度档都对应无限多个 n，地图仍由完整的 n（seed）决定。同一局内的递进（如过关后关卡号 +1）不受此限。
- 不自动开始，要玩家主动点开始。
- 有持续动画的游戏：只在进行中且页面可见时运行 rAF，`visibilitychange` 隐藏时暂停；用固定时间步长 + dt 上限，避免抖动和穿模。纯回合制/解谜类不需要 rAF 空转。
- 跟随主题：`onThemeChange` 时重绘。
- 可访问性：画布有 `role="img"` 或合适的 aria-label；按钮是真正的 `<button>`；键盘可以完成全部操作。
- 文字：游戏内只允许必需的极短提示（分数、开始、再来一次、操作提示等），全部放进文案文件（见「文案」）并列入报告交服主审核；标题、说明性文案一律不写（宿主区块标题、游戏名、简介由服主写）。
- 不能 console 报错；不能有全局变量泄漏（模块作用域即可）。

## 开发与自测（每个游戏自带）
- 在自己的工作目录里提供 `harness.html`：模拟宿主，提供 ctx（含浅/深主题切换、改 n、改 reducedMotion），用 `<script type="module">` 动态 import 游戏文件并 mount/unmount。
- 用 Playwright（Chromium 在 /opt/pw-browsers，已配置）截图：开始前、进行中、结束/通关 × 桌面 1280 / 手机 390 × 浅色 / 深色；并做至少一次 mount → unmount → 再 mount 的检查，确认没有残留监听或报错。
- 需要的话可以加一个确定性的自动测试（固定 seed 推进若干步断言状态）。

## 测试接口（可选，新游戏的推荐做法）
- 需要确定性测试时，在地址带 `?egg-test` 的情况下把测试接口挂到 `root` 元素上（例如 `root.__eggTest = { start, advance, snapshot }`），不要挂到全局；unmount 时删除。
- 已有游戏的具名导出（`_core`、`_internals`、`generate` 等）和返回对象里的 `debug` 字段可以保留：宿主只读取 `default` 和 `unmount`。

## 备注
- `ctx.color()` 读取的变量名以实际站点为准，读不到时返回空字符串。游戏必须为浅色和深色各自准备一套兜底配色，不能因为变量缺失而显示异常。
- 宿主 404 页面会在游戏区块外保留回首页链接和 404 信息，游戏不必自己提供。
