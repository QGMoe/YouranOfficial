# data/ 字段说明

## versions.json（整合包版本列表）

按时间顺序排列，**最后一条就是最新版本**，新版本追加在末尾。新版 `/list` 由 `scripts/versions.py` 整理后渲染，历史版本 `/v1/list`、`/v2/list`（模板 `templates/v2/list.html`）直接读取本文件，所以字段只增不改。

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | 是 | 版本号，如 `2.1.0`。新版 `/list` 的页内锚点是 `#v<版本号>`（如 `/list#v1.8.2`） |
| `title` | 是 | 更新名 |
| `size` | 是 | 普通客户端文件大小，写成 `197301KB`；未知时写 `待补` |
| `time` | 是 | 发布日期 `YYYY-M-D`；同一天有更新日志 `changelog/server/YYYYMMDD.md` 时自动链接过去 |
| `era` | 是 | `1` = 13Server，`2` = YouranServer（决定文件名前缀） |
| `brief` | 否 | 更新信息（可含 `<br/>`）；缺省显示“更新信息见“服务器更新日志”” |
| `link` | 否 | 普通客户端只在网盘提供时，填网盘地址（文件名指向它，不再使用下载站默认路径） |
| `links` | 否 | 普通客户端的其他下载方式 `[{"name": "百度网盘（提取码：yran）", "addr": "…"}]`，名称里的“（提取码：…）”会自动拆出 |
| `mcbbs_links` | 否 | MCBBS标准客户端的下载方式，格式同 `links`；可以是下载站直链 |
| `mcbbs_size` | 否 | MCBBS标准客户端文件大小（写法同 `size`）；没有时不显示大小 |
| `file_available` | 否 | `false` = 文件已不再提供，不显示下载链接（13Server 的版本都是 `false`） |
| `pending` | 否 | `true` = 详情待补，下载处显示“待补” |

没有 `link` 时，普通客户端的下载地址是下载站默认路径 `https://dl-yr.qg.mo.cn/assets/packs/<YouranServer|13Server><版本号>.zip`。

### 固定指向最新版的地址（`latest_alias`）

下载站上不带版本号的文件（如 `https://dl-yr.qg.mo.cn/YouranServer%20MCBBS.zip`）每次更新都会被覆盖，始终是最新版。
这类链接在 `links` / `mcbbs_links` 的那一项里加 `"latest_alias": true`：

```json
"mcbbs_links": [
    {"name": "YouranServer MCBBS.zip", "addr": "https://dl-yr.qg.mo.cn/YouranServer%20MCBBS.zip", "latest_alias": true}
]
```

规则：**带 `latest_alias` 的链接只在该版本是 versions.json 最后一条（最新版本）时显示**。发布新版本、在末尾追加新条目后，旧版本上的这条链接自动隐藏，不会误指向新包；
如果新版本也提供同一个固定地址，在新条目里再写一次即可。历史版本的列表页遵守同样的规则。
用显式字段而不是根据文件名猜测，是因为文件名里有没有版本号并不可靠（例如 `YouranServer2.1.0.zip` 与 `YouranServer.zip`）。

### 下载来源图标

`/list` 会按地址的域名自动识别下载来源并显示小图标（下载站、微云、百度网盘、蓝奏云、123云盘、夸克网盘、阿里云盘、QQ群，其他显示通用链接图标）；
需要时可在链接项里写 `"provider": "weiyun"` 等指定。百度、QQ 的图形来自 Simple Icons（CC0-1.0），其余为通用图形加品牌色。

## 上线前待办（服主）

- **页面 description**：在 `data/pages.json` 对应页面里加 `"description": "…"`。没有填写的页面不输出 `<meta name="description">` 和 `og:description`。
- **整合包数据**：2.0.0.1 的更新名、大小、文件；MCBBS 包的 `mcbbs_size`（见上文 versions.json）。
- **首页加入流程（服主自己写）**：曾经起草过一版改动，已按服主意见撤回，首页仍是原文。供参考，草稿改了这几处：
  1. `markdowns/index/join.md`：开头两段之后、下载框之前，加小标题“加入流程”和四步卡片（HTML 写在 Markdown 里，类名 `join-steps` / `join-step`，图标用 `data-icon`，样式已在 `site.css` 中）：
     - 注册网页帐号：“在网页面板（链接 https://portal-youran.qingu.moe）注册网页帐号，通过审核后即可登记游戏角色、设置游戏密码。”
     - 登记游戏角色：“审核通过后，在网页面板中登记你的游戏角色。”
     - 安装整合包：“下载客户端，用 HMCL 启动器安装整合包，见下方安装（链接 #install）。”
     - 进入服务器：“服务器地址 serv.youran.qingu.moe:23103”
  2. `markdowns/index/join.md`：删除“### 获取白名单”一节（原文：“加入服务器QQ群：953168624，申请白名单！”）。
  3. `markdowns/index/intro.md`：“2024 年 7 月底，悠然 MC 服务器暂时关闭至今，但现在正准备于近期（2026 年 6 ~ 7 月）重新开启！” 改为 “2024 年 7 月底，悠然 MC 服务器暂时关闭，2026 年 6 月重新开启。”
  4. `templates/index.html` “离线模式”卡片：“通过开启白名单、加装登录插件等方式” 改为 “通过网页帐号审核、加装登录插件等方式”。
- **404 彩蛋小游戏的文字**：访问 `/v<大于 3 的数字>` 时出现；所有文字都在 `dist/assets/egg/texts/` 下，改完保存即可生效，不需要改代码或重新构建：
  - `common.js`：彩蛋区块标题、全屏与音效按钮的文字。
  - `runner.js`、`redstone.js`、`prospect.js`、`creeper.js`、`merge.js`、`craft.js`、`fishing.js`、`breach.js`：每个游戏一个文件。开头的 `name` 是游戏名（显示在区块标题旁），`intro` 是一行简介（显示在标题下方，留空 `''` 则不显示）；其余是游戏内的按钮、提示、物品名等，每一项旁边都有注释说明出现在哪里。
  - 写法：文字放在英文单引号 `'…'` 里，文字中本身有单引号时写成 `\'`；`{score}` 这类花括号是程序填入的数字或名称，可以挪位置，但不要删掉或改名；行尾的逗号要保留。改坏了（文件无法加载）时游戏会改用内置文字，不会出错。
  - 新增游戏的方法、接口约定和取余规则见 `tools/eggs/README.md`。
