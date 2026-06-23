import json, os
from jinja2 import Environment, FileSystemLoader

env = Environment(loader=FileSystemLoader("templates"))

for name in ["pages", "navs"]:
    with open(f"data/{name}.json", encoding="utf-8") as f:
        env.globals[name] = json.load(f)

os.makedirs("dist", exist_ok=True)

for page in env.globals["pages"]:
    id = page["id"];
    navs = env.globals["navs"] + page.get("navs",[]);

    data = {"page":page,"nav_items":navs}

    template = env.get_template(f"{id}.html")
    with open(f"dist/{id}.html", "w", encoding="utf-8") as f:
        f.write(template.render(**data))
    print(f"成功构建：{id}.html")