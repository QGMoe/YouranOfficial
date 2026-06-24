import json, os, markdown, importlib.util
from jinja2 import Environment, FileSystemLoader
from pathlib import Path

debug = True
debug_pre = "___"

def get_markdown(mdfile:str):
    with open(os.path.join("./markdowns", mdfile), "r", encoding="utf-8") as f:
        lines = f.readlines()
    if not lines:
        return None
    return markdown.markdown(''.join(lines), extensions=['extra', 'codehilite']);

def load_script(script_path: str):
    module_name = Path(script_path).stem
    spec = importlib.util.spec_from_file_location(module_name, script_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.build()

def main():
    env = Environment(loader=FileSystemLoader("templates"))

    for name in ["pages", "navs", "old_navs"]:
        with open(f"data/{name}.json", encoding="utf-8") as f:
            env.globals[name] = json.load(f)

    os.makedirs("dist", exist_ok=True)

    for page in env.globals["pages"]:
        id = page["id"];
        navs = ( env.globals["old_navs"] if id.startswith("old/") else env.globals["navs"]) + page.get("navs",[]);
        markdowns = {}
        for md in page.get("markdowns",[]):
            markdowns[md["id"]] = get_markdown(md["path"]);

        data = {"page":page,"nav_items":navs,"markdowns":markdowns}

        for script in page.get("scripts",[]):
            data[script["id"]] = load_script(os.path.join("./scripts",script["path"]))

        if "ext" in page:
            for ext in page["ext"]:
                with open(f"data/{ext}.json",encoding="utf-8") as f:
                    data[ext] = json.load(f)

        template = env.get_template(f"{id}.html")

        output = f"dist/{id}.html"
        output_path = Path(output)
        if debug: output_path = output_path.with_name(debug_pre+output_path.name)
        output_path.parent.mkdir(parents=True,exist_ok=True) #保证目录存在

        output_path.write_text(template.render(**data),encoding="utf-8")
        print(f"成功构建：{id} --> {output_path}")
            
        

if __name__ == '__main__':
    main()