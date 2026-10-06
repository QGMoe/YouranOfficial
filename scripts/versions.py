"""整合包版本列表（/list）的数据整理：把 data/versions.json 的新旧字段统一成“按整合包类型分组的下载方式”。

pages.json 中 list 页以 scripts 方式调用 build()。历史版本 /v1/list、/v2/list 仍直接读 versions.json（字段保持向后兼容）。
字段说明见 data/README.md。
"""
import json, os, re
from urllib.parse import urlparse

ERAS = {1: "13Server", 2: "YouranServer"}
DL_BASE = "https://dl-yr.qg.mo.cn/assets/packs/"
# 下载站上不带版本号、每次更新都被覆盖的固定文件，始终是最新版；versions.json 的最后一条就是最新版，所以只挂在最后一条上，不写进数据。
# 普通客户端已有带版本号的文件，固定地址只给 MCBBS 标准客户端（它只有这一个下载方式）
LATEST_FIXED = {"mcbbs": ("YouranServer MCBBS.zip", "https://dl-yr.qg.mo.cn/YouranServer%20MCBBS.zip")}
DEFAULT_BRIEF = "更新信息见“服务器更新日志”"          # 与旧模板的默认文字相同
HOST_NAME = {"share.weiyun.com": "微云网盘", "pan.baidu.com": "百度网盘"}
QQ_GROUP = {"name": "加入服务器QQ群下载", "addr": "https://jq.qq.com/?_wv=1027&k=Hwv4w2NU"}   # 首页原有的链接与文字

# 两种整合包类型。文字取自现有页面：列表页“普通客户端 / MCBBS标准客户端”，首页安装说明
PACKS = {
    "normal": {"label": "普通客户端", "launcher": "HMCL启动器", "desc": "专门使用HMCL启动器制作的服务器自动更新整合包"},
    "mcbbs": {"label": "MCBBS标准客户端", "launcher": "Plain Craft Launcher 2 或其他启动器", "desc": "自1.8.2版本开始尝试制作的MCBBS标准整合包"},
}

# 下载来源：按 URL 主机名识别（链接数据里写 provider 可覆盖），用于装饰性的来源徽标（文字标签总在旁边）
PROVIDER_LABEL = {"dlyr": "下载站", "weiyun": "微云", "baidu": "百度网盘", "lanzou": "蓝奏云", "123pan": "123云盘",
                  "quark": "夸克网盘", "alipan": "阿里云盘", "qq": "QQ群", "generic": ""}
PROVIDER_RULES = [
    (lambda h: h == "dl-yr.qg.mo.cn", "dlyr"),
    (lambda h: h == "share.weiyun.com" or h.endswith(".weiyun.com"), "weiyun"),
    (lambda h: h == "pan.baidu.com", "baidu"),
    (lambda h: re.search(r"(^|\.)lanzou[a-z]*\.com$", h), "lanzou"),
    (lambda h: h.endswith("123pan.com") or h.endswith("123684.com") or h.endswith("123pan.cn"), "123pan"),
    (lambda h: h == "pan.quark.cn", "quark"),
    (lambda h: h.endswith("aliyundrive.com") or h.endswith("alipan.com"), "alipan"),
    (lambda h: h in ("jq.qq.com", "qm.qq.com"), "qq"),
]
# 百度、QQ 的图形取自 Simple Icons（simple-icons@16.33.0，CC0-1.0）；商标归各自所有者，仅用于标明链接去向。
# 其他网盘没有自由授权的标志，用通用云朵图形加品牌色（见 dist/assets/list.css）。
SIMPLE_ICONS = {
    "baidu": "M9.154 0C7.71 0 6.54 1.658 6.54 3.707c0 2.051 1.171 3.71 2.615 3.71 1.446 0 2.614-1.659 2.614-3.71C11.768 1.658 10.6 0 9.154 0zm7.025.594C14.86.58 13.347 2.589 13.2 3.927c-.187 1.745.25 3.487 2.179 3.735 1.933.25 3.175-1.806 3.422-3.364.252-1.555-.995-3.364-2.362-3.674a1.218 1.218 0 0 0-.261-.03zM3.582 5.535a2.811 2.811 0 0 0-.156.008c-2.118.19-2.428 3.24-2.428 3.24-.287 1.41.686 4.425 3.297 3.864 2.617-.561 2.262-3.68 2.183-4.362-.125-1.018-1.292-2.773-2.896-2.75zm16.534 1.753c-2.308 0-2.617 2.119-2.617 3.616 0 1.43.121 3.425 2.988 3.362 2.867-.063 2.553-3.238 2.553-3.988 0-.745-.62-2.99-2.924-2.99zm-8.264 2.478c-1.424.014-2.708.925-3.323 1.947-1.118 1.868-2.863 3.05-3.112 3.363-.25.309-3.61 2.116-2.864 5.42.746 3.301 3.365 3.237 3.365 3.237s1.93.19 4.171-.31c2.24-.495 4.17.123 4.17.123s5.233 1.748 6.665-1.616c1.43-3.364-.808-5.109-.808-5.109s-2.99-2.306-4.736-4.798c-1.072-1.665-2.348-2.268-3.528-2.257zm-2.234 3.84l1.542.024v8.197H7.758c-1.47-.291-2.055-1.292-2.13-1.462-.072-.173-.488-.976-.268-2.343.635-2.049 2.447-2.196 2.447-2.196h1.81zm3.964 2.39v3.881c.096.413.612.488.612.488h1.614v-4.343h1.689v5.782h-3.915c-1.517-.39-1.59-1.465-1.59-1.465v-4.317zm-5.458 1.147c-.66.197-.978.708-1.05.928-.076.22-.247.78-.1 1.269.294 1.095 1.248 1.144 1.248 1.144h1.37v-3.34z",
    "qq": "M21.395 15.035a40 40 0 0 0-.803-2.264l-1.079-2.695c.001-.032.014-.562.014-.836C19.526 4.632 17.351 0 12 0S4.474 4.632 4.474 9.241c0 .274.013.804.014.836l-1.08 2.695a39 39 0 0 0-.802 2.264c-1.021 3.283-.69 4.643-.438 4.673.54.065 2.103-2.472 2.103-2.472 0 1.469.756 3.387 2.394 4.771-.612.188-1.363.479-1.845.835-.434.32-.379.646-.301.778.343.578 5.883.369 7.482.189 1.6.18 7.14.389 7.483-.189.078-.132.132-.458-.301-.778-.483-.356-1.233-.646-1.846-.836 1.637-1.384 2.393-3.302 2.393-4.771 0 0 1.563 2.537 2.103 2.472.251-.03.581-1.39-.438-4.673",
}


def detect_provider(url, explicit=None):
    if explicit in PROVIDER_LABEL:
        return explicit
    host = (urlparse(url).hostname or "") if url else ""
    return next((k for test, k in PROVIDER_RULES if host and test(host)), "generic")


def split_code(name):
    """'百度网盘（提取码：yran）' -> ('百度网盘', 'yran', '提取码')"""
    m = re.match(r"^(.*?)（(提取码|访问密码)[：:]\s*([^）]+)）$", name)
    return (m.group(1), m.group(3), m.group(2)) if m else (name, None, None)


def entry(kind, pack, name, url, provider=None):
    name, code, code_label = split_code(name)
    p = detect_provider(url, provider)
    label = PROVIDER_LABEL[p]
    return {"type": kind, "pack": pack, "name": name, "url": url, "code": code, "code_label": code_label or "提取码",
            "provider": p, "prov_label": label, "show_prov_label": bool(label) and label not in name}


def normalize(ver, changelog_ids, is_newest):
    era = ERAS[ver["era"]]
    year, mouth, date = (int(x) for x in ver["time"].split("-"))
    normalized_ver = dict(ver)
    normalized_ver["era_name"] = era
    normalized_ver["date"] = "%04d-%02d-%02d" % (year, mouth, date)
    ymd = "%04d%02d%02d" % (year, mouth, date)
    normalized_ver["changelog"] = ymd if ymd in changelog_ids else None
    normalized_ver["anchor"] = "v" + ver["id"]
    normalized_ver["file_name"] = "%s%s.zip" % (era, ver["id"])
    normalized_ver["size_text"] = size_text(ver.get("size"))
    normalized_ver["mcbbs_size_text"] = size_text(ver.get("mcbbs_size")) if ver.get("mcbbs_size") else None
    brief = ver.get("brief")
    plain = re.sub(r"<[^>]+>", " ", brief) if brief else DEFAULT_BRIEF
    normalized_ver["brief_html"] = brief or DEFAULT_BRIEF          # 现有数据中有 <br/>，模板里按可信 HTML 输出
    normalized_ver["brief_long"] = len(plain) > 56
    normalized_ver["brief_short"] = plain[:40].rstrip() + "…" if normalized_ver["brief_long"] else plain
    normalized_ver["available"] = ver.get("file_available", ver["era"] != 1)
    normalized_ver["pending"] = ver.get("pending", False)

    dls = []
    if normalized_ver["available"]:
        legacy = ver.get("link")
        if legacy is None:
            dls.append(entry("direct", "normal", normalized_ver["file_name"], DL_BASE + normalized_ver["file_name"]))
        else:
            # 旧模板：有 link 时文件名指向它（这几个版本只在网盘提供），作为普通客户端的第一个下载方式
            dls.append(entry("netdisk", "normal", HOST_NAME.get(urlparse(legacy).hostname, "网盘"), legacy))
        for l in ver.get("links", []):
            if l["addr"] != legacy:
                dls.append(entry("netdisk", "normal", l["name"], l["addr"], l.get("provider")))
        for l in ver.get("mcbbs_links", []):
            dls.append(entry("mcbbs", "mcbbs", l["name"], l["addr"], l.get("provider")))
        if is_newest:
            for pack, (name, addr) in LATEST_FIXED.items():
                dls.append(entry("direct" if pack == "normal" else "mcbbs", pack, name, addr))

    packs = []
    for key, meta in PACKS.items():
        items = [e for e in dls if e["pack"] == key]
        if not items:
            continue
        prim = next((e for e in items if e["provider"] == "dlyr"), None) or items[0]
        packs.append(dict(meta, key=key, primary=prim, others=[e for e in items if e is not prim],
                          file_label=normalized_ver["file_name"] if key == "normal" else prim["name"]))
    normalized_ver["packs"] = packs
    normalized_ver["pack_map"] = {p["key"]: p for p in packs}
    return normalized_ver


def size_text(size):
    """'197302KB' -> '192.7 MB'；其他写法（如“待补”）原样显示"""
    if not size:
        return None
    kb = re.match(r"^(\d+)KB$", size)
    return "%.1f MB" % (int(kb.group(1)) / 1024) if kb else size


def build():
    with open("data/versions.json", encoding="utf-8") as f:
        raw = json.load(f)
    changelog_ids = {f[:-3] for f in os.listdir("changelog/server") if f.endswith(".md")}
    vs = [normalize(v, changelog_ids, i == len(raw) - 1) for i, v in enumerate(raw)]
    vs.reverse()                                            # 新的在上
    latest = next((v for v in vs if v["packs"]), None)      # 最新的、有下载方式的版本
    rows = [v for v in vs if v["era"] != 1 and v is not latest]
    gone = [v for v in vs if v["era"] == 1]
    qq = entry("netdisk", "normal", QQ_GROUP["name"], QQ_GROUP["addr"])
    return {"latest": latest, "rows": rows, "gone": gone, "era_names": ERAS, "qq": qq, "simple_icons": SIMPLE_ICONS, "packs": PACKS}
