"""新版页面用到的模板函数与过滤器（build.py 调用 setup 注册）。

- icon：输出内联 SVG 图标（scripts/icons.py）
- md_cons / md_join：把首页 Markdown 的渲染结果整理成页面组件（列表、图文步骤、图片），管理员仍然只改 Markdown
- by_year：把更新日志按年份分组
"""
import os, re, struct
from bs4 import BeautifulSoup
from markupsafe import Markup

from .icons import ICONS

ASSETS_DIR = os.path.join("dist", "assets")
CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩"
CHINESE_NUM = "一二三四五六七八九十"


def icon(name, cls="i"):
    return Markup('<svg class="%s" viewBox="0 0 24 24" aria-hidden="true" focusable="false">%s</svg>' % (cls, ICONS[name]))


def webp_size(path):
    """读取 WebP 图片的宽高（VP8 / VP8L / VP8X），失败时返回 None"""
    try:
        with open(path, "rb") as f:
            data = f.read(30)
    except OSError:
        return None
    if data[:4] != b"RIFF" or data[8:12] != b"WEBP":
        return None
    chunk = data[12:16]
    if chunk == b"VP8 ":
        w, h = struct.unpack("<HH", data[26:30])
        return w & 0x3FFF, h & 0x3FFF
    if chunk == b"VP8L":
        b = data[21:25]
        w = 1 + (((b[1] & 0x3F) << 8) | b[0])
        h = 1 + (((b[3] & 0x0F) << 10) | (b[2] << 2) | ((b[1] & 0xC0) >> 6))
        return w, h
    if chunk == b"VP8X":
        w = 1 + int.from_bytes(data[24:27], "little")
        h = 1 + int.from_bytes(data[27:30], "little")
        return w, h
    return None


def _soup(html):
    return BeautifulSoup(str(html or ""), "html.parser")


def _figure(soup, img):
    """Markdown 图片 ![说明](6.png) → <figure class="shot">，有 dist/assets/6.webp 时改用 WebP 并写明宽高"""
    src = img.get("src", "")
    name = os.path.basename(src)
    stem, ext = os.path.splitext(name)
    local = "/" + src.lstrip("./") if not re.match(r"^[a-z]+:|^/", src) else src
    webp = os.path.join(ASSETS_DIR, stem + ".webp")
    if ext.lower() == ".png" and os.path.exists(webp):
        img["src"] = "/assets/%s.webp" % stem
        size = webp_size(webp)
        if size:
            img["width"], img["height"] = str(size[0]), str(size[1])
    else:
        img["src"] = local
    img["loading"] = "lazy"
    img["decoding"] = "async"
    fig = soup.new_tag("figure", attrs={"class": "shot"})
    img.extract()
    fig.append(img)
    return fig


def _icons(soup):
    for el in soup.select("[data-icon]"):
        name = el["data-icon"]
        del el["data-icon"]
        el.insert(0, BeautifulSoup(str(icon(name)), "html.parser"))


def md_cons(html):
    """“但有这些缺点”：标题加样式；“一、……<br/>二、……”逐行变成有序列表"""
    soup = _soup(html)
    h2 = soup.find("h2")
    if h2:
        h2["class"] = "section-title"
        h2["id"] = "t-cons"
        h2.insert(0, BeautifulSoup(str(icon("frown")), "html.parser"))
    for p in soup.find_all("p"):
        lines = [l.strip() for l in re.split(r"<br\s*/?>", p.decode_contents()) if l.strip()]
        if not lines or not all(re.match("^[%s]+、" % CHINESE_NUM, BeautifulSoup(l, "html.parser").get_text()) for l in lines):
            continue
        ol = soup.new_tag("ol", attrs={"class": "cons"})
        for line in lines:
            num, text = line.split("、", 1)
            li = soup.new_tag("li")
            if "！！！" in text:  # “谁会搞建筑啊啊啊啊啊！！！！！！”这类加重的一条
                li["class"] = "loud"
            li.append(BeautifulSoup('<span class="num" aria-hidden="true">%s</span><span>%s</span>' % (num.strip(), text.strip()), "html.parser"))
            ol.append(li)
        p.replace_with(ol)
    return Markup(str(soup))


def md_join(html):
    """“加入服务器”：
    - #### ①、#### ② …… 开头的一组内容变成图文步骤（文字在左、截图在右）
    - 图片换成 WebP 并写明宽高、懒加载
    - data-icon 属性换成图标；h3 加小标题样式"""
    soup = _soup(html)
    _icons(soup)
    for h3 in soup.find_all("h3"):
        h3["class"] = (h3.get("class") or []) + ["sub-title"]

    def is_step(el):
        return getattr(el, "name", None) == "h4" and el.get_text(strip=True)[:1] in CIRCLED

    for h4 in [h for h in soup.find_all("h4") if is_step(h)]:
        if h4.parent is None:
            continue
        # 收集这一步的内容：直到下一个步骤或更高一级的标题为止
        parts = []
        sib = h4.next_sibling
        while sib is not None and not is_step(sib) and getattr(sib, "name", None) not in ("h2", "h3", "div"):
            nxt = sib.next_sibling
            parts.append(sib.extract())
            sib = nxt
        prev = h4.find_previous_sibling()
        step = soup.new_tag("div", attrs={"class": "howto-step"})
        h4.insert_before(step)
        text = soup.new_tag("div", attrs={"class": "step-text"})
        num = h4.get_text(strip=True)
        h4.clear()
        h4.append(BeautifulSoup('<span class="circ">%s</span>' % num, "html.parser"))
        text.append(h4.extract())
        figures = []
        for part in parts:
            if getattr(part, "name", None) == "p" and part.find("img") and not part.get_text(strip=True):
                figures.extend(_figure(soup, img) for img in part.find_all("img"))
            elif getattr(part, "name", None) is not None:
                text.append(part)
        step.append(text)
        if len(figures) == 1:
            step.append(figures[0])
        elif figures:
            shots = soup.new_tag("div", attrs={"class": "shots"})
            for fig in figures:
                shots.append(fig)
            step.append(shots)
        # 相邻的步骤放进同一个 .howto 容器
        if prev is not None and prev.name == "div" and "howto" in (prev.get("class") or []):
            prev.append(step.extract())
        else:
            box = soup.new_tag("div", attrs={"class": "howto"})
            step.insert_before(box)
            box.append(step.extract())
    for img in soup.find_all("img"):  # 步骤之外的图片
        if img.parent and img.parent.name != "figure":
            p = img.parent
            fig = _figure(soup, img)
            if p.name == "p" and not p.get_text(strip=True):
                p.replace_with(fig)
            else:
                p.append(fig)
    return Markup(str(soup))


def by_year(changelogs):
    """更新日志按年份分组（保持原有的倒序），并给目录准备去掉年份的短标题"""
    years = []
    for entry in changelogs:
        year = entry["id"][:4]
        item = dict(entry, year=year, short=re.sub(r"^\d{4}年", "", entry["title"]).strip())
        if not years or years[-1]["year"] != year:
            years.append({"year": year, "entries": []})
        years[-1]["entries"].append(item)
    return years


def setup(env):
    env.globals["icon"] = icon
    env.filters["md_cons"] = md_cons
    env.filters["md_join"] = md_join
    env.filters["by_year"] = by_year
