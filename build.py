import json, os, re, markdown, importlib, sys, argparse, datetime, urllib.request
from xml.sax.saxutils import escape as xml_escape
from jinja2 import Environment, FileSystemLoader
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

DEBUG_PRE = "___";
DEBUG = True;
FETCH = True;

SITE = "https://youran.qingu.moe"
MANIFEST_URL = "https://dl-yr.qg.mo.cn/server-manifest.json"
USER_AGENT = "YouranOfficial-build (+https://youran.qingu.moe)"

# 历史版本（/v1/、/v2/）的页面 id 前缀与各自的导航数据
ARCHIVES = {"v1/": "v1_navs", "v2/": "v2_navs"}

# 历史版本的模板（v1/*、v2/*）以及它们共用的 partial 按原样输出，不做自动转义；其余模板开启自动转义，
# 可信的 HTML（Markdown、更新日志的渲染结果）在模板中用 |safe 显式标出
LEGACY_TEMPLATES = {
    "_partials/nav.html",
    "_partials/nav_old.html",
    "_partials/changelog_list.html",
    "_partials/info_table.html",
}

def autoescape(template_name) -> bool:
    if template_name is None:
        return True
    return not (template_name.startswith(tuple(ARCHIVES)) or template_name in LEGACY_TEMPLATES)

def load_args():
    global DEBUG, FETCH
    arg_parse = argparse.ArgumentParser();
    arg_parse.add_argument("--do", action="store_true", help="进行正式构建");
    arg_parse.add_argument("--offline", action="store_true", help="不读取下载站的 manifest，整合包版本直接取 data/versions.json 的最新一条");
    args = arg_parse.parse_args();
    DEBUG = not args.do
    FETCH = not args.offline

def get_markdown(mdfile:str) -> str:
    with open(mdfile, "r", encoding="utf-8") as f:
        lines = f.readlines()
    if not lines:
        return None
    return markdown.markdown(''.join(lines), extensions=['extra', 'codehilite']);

def load_script(script_module_name: str) -> dict:
    module = importlib.import_module(script_module_name)
    return module.build()

def load_json(name: str):
    with open(f"data/{name}.json", encoding="utf-8") as f:
        return json.load(f)

def load_pack() -> dict:
    """当前整合包版本：构建时读取下载站的 server-manifest.json，读取失败时退回 data/versions.json 的最新一条。
    首页把它作为默认文字，浏览器端再实时读取 manifest 更新。"""
    newest = load_json("versions")[-1]["id"]
    pack = {"version": newest, "forge": None, "game": None, "source": "versions.json"}
    if FETCH:
        try:
            request = urllib.request.Request(MANIFEST_URL, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(request, timeout=8) as resp:
                manifest = json.load(resp)
            addons = {a.get("id"): a.get("version") for a in manifest.get("addons", [])}
            pack = {"version": str(manifest["version"]), "forge": addons.get("forge"), "game": addons.get("game"), "source": "manifest"}
        except Exception as e:
            print(f"警告：无法读取 {MANIFEST_URL}（{e}），整合包版本改用 data/versions.json 的最新一条 {newest}")
    if pack["source"] == "manifest" and pack["version"] != newest:
        print(f"警告：下载站 manifest 的整合包版本是 {pack['version']}，而 data/versions.json 的最新一条是 {newest}，请检查 versions.json 是否需要更新")
    return pack

def page_path(page: dict) -> str:
    """页面的对外地址：不带 .html（Cloudflare Pages 会把 xxx.html 308 到 xxx）"""
    if "path" in page:
        return page["path"]
    return "/" if page["id"] == "index" else "/" + page["id"]

def is_noindex(page: dict) -> bool:
    return page.get("noindex", False) or page["id"].startswith(tuple(ARCHIVES))

def latest_changelog_date() -> str:
    ids = [f[:8] for f in os.listdir("changelog/server") if re.match(r"\d{8}", f)]
    return datetime.datetime.strptime(max(ids), "%Y%m%d").date().isoformat()

def write_output(name: str, text: str) -> Path:
    output_path = Path("dist") / name
    if DEBUG: output_path = output_path.with_name(DEBUG_PRE+output_path.name)
    output_path.parent.mkdir(parents=True,exist_ok=True) #保证目录存在
    output_path.write_text(text,encoding="utf-8")
    return output_path

def build_sitemap(pages: list):
    """sitemap.xml 与 robots.txt：列出所有可索引的页面（不含历史版本与 404）"""
    lastmod_default = latest_changelog_date()
    urls = []
    for page in pages:
        if is_noindex(page):
            continue
        sitemap = page.get("sitemap", {})
        url = "  <url>\n    <loc>%s</loc>\n    <lastmod>%s</lastmod>\n" % (xml_escape(SITE + page_path(page)), sitemap.get("lastmod", lastmod_default))
        if "priority" in sitemap:
            url += "    <priority>%s</priority>\n" % sitemap["priority"]
        urls.append(url + "  </url>\n")
    xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + "".join(urls) + "</urlset>\n"
    print(f"成功构建：sitemap --> {write_output('sitemap.xml', xml)}")
    robots = ("# 由 build.py 生成\n"
              "User-agent: *\n"
              "# /v1/、/v2/ 不在这里屏蔽：历史版本靠页面内的 noindex 退出索引，屏蔽抓取反而会让搜索引擎看不到 noindex\n"
              f"Disallow: /{DEBUG_PRE}\n"
              "\n"
              f"Sitemap: {SITE}/sitemap.xml\n")
    print(f"成功构建：robots --> {write_output('robots.txt', robots)}")

def main():
    load_args()
    env = Environment(loader=FileSystemLoader("templates"), autoescape=autoescape)

    for name in ["pages", "navs"] + list(ARCHIVES.values()):
        env.globals[name] = load_json(name)

    from scripts import site
    site.setup(env)
    env.globals["site"] = {"url": SITE, "pack": load_pack()}

    os.makedirs("dist", exist_ok=True)

    for page in env.globals["pages"]:
        id = page["id"];
        nav_set = next((n for prefix, n in ARCHIVES.items() if id.startswith(prefix)), "navs")
        navs = env.globals[nav_set] + page.get("navs",[]);
        markdowns = {}
        for md in page.get("markdowns",[]):
            markdowns[md["id"]] = get_markdown(os.path.join("./markdowns", md["path"]));

        data = {"page":page,"nav_items":navs,"markdowns":markdowns}
        data["meta"] = {
            "path": page_path(page),
            "noindex": is_noindex(page),
            "canonical": None if is_noindex(page) else SITE + page_path(page),
        }

        for script in page.get("scripts",[]):
            data[script["id"]] = load_script(f"scripts.{script['path']}")

        if "ext" in page:
            for ext in page["ext"]:
                data[ext] = load_json(ext)

        template = env.get_template(page.get("template", f"{id}.html"))

        output_path = write_output(f"{id}.html", template.render(**data))
        print(f"成功构建：{id} --> {output_path}")

    build_sitemap(env.globals["pages"])

if __name__ == '__main__':
    main()
