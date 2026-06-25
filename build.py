import json, os, markdown, importlib, sys, argparse
from jinja2 import Environment, FileSystemLoader
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

DEBUG_PRE = "___";
DEBUG = True;

def load_args():
    global DEBUG
    arg_parse = argparse.ArgumentParser();
    arg_parse.add_argument("--do", action="store_true", help="进行正式构建");
    args = arg_parse.parse_args();
    DEBUG = not args.do

def get_markdown(mdfile:str) -> str:
    with open(mdfile, "r", encoding="utf-8") as f:
        lines = f.readlines()
    if not lines:
        return None
    return markdown.markdown(''.join(lines), extensions=['extra', 'codehilite']);

def load_script(script_module_name: str) -> dict:
    module = importlib.import_module(script_module_name)
    return module.build()

def main():
    load_args()
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
            markdowns[md["id"]] = get_markdown(os.path.join("./markdowns", md["path"]));

        data = {"page":page,"nav_items":navs,"markdowns":markdowns}

        for script in page.get("scripts",[]):
            data[script["id"]] = load_script(f"scripts.{script['path']}")

        if "ext" in page:
            for ext in page["ext"]:
                with open(f"data/{ext}.json",encoding="utf-8") as f:
                    data[ext] = json.load(f)

        template = env.get_template(f"{id}.html")

        output = f"dist/{id}.html"
        output_path = Path(output)
        if DEBUG: output_path = output_path.with_name(DEBUG_PRE+output_path.name)
        output_path.parent.mkdir(parents=True,exist_ok=True) #保证目录存在

        output_path.write_text(template.render(**data),encoding="utf-8")
        print(f"成功构建：{id} --> {output_path}")

if __name__ == '__main__':
    main()