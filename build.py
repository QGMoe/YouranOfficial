import json, os, markdown
from jinja2 import Environment, FileSystemLoader
from bs4 import BeautifulSoup
from pathlib import Path

debug = False
debug_pre = "___"

def get_changelogs():
    md_files = [f for f in os.listdir("./changelog") if f.endswith('.md')]
    
    changelogs = []
    for md_file in md_files:
        path = os.path.join("./changelog", md_file)
        entry_id = os.path.splitext(md_file)[0]  # 文件名（不含 .md）作为 id
        
        title, body = get_changelog_content(path)
        if body is None:
            continue
        
        content_html = downgrade_headings(markdown.markdown(body, extensions=['extra', 'codehilite']))
        changelogs.append({
            'id': entry_id,
            'title': title,
            'content': content_html
        })
    
    changelogs.sort(key=lambda x: x['id'], reverse=True)
    return changelogs

def get_changelog_content(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    if not lines:
        return None, None
    
    first_line = lines[0].strip()
    if first_line.startswith('# '): # H1 作为标题
        title = first_line[2:].strip()
        body = ''.join(lines[1:]).lstrip() 
    else:
        title = os.path.splitext(os.path.basename(file_path))[0] #没有 H1,用文件名作为标题
        body = ''.join(lines)
    
    return title, body

def downgrade_headings(html_content):
    soup = BeautifulSoup(html_content, 'html.parser')
    for heading in soup.find_all(['h1', 'h2', 'h3', 'h4', 'h5']):
        level = int(heading.name[1])
        new_tag = soup.new_tag(f'h{level + 1}')
        new_tag.attrs = dict(heading.attrs)
        new_tag.extend(list(heading.children))
        heading.replace_with(new_tag)
    return str(soup)

def main():
    env = Environment(loader=FileSystemLoader("templates"))

    for name in ["pages", "navs", "old_navs"]:
        with open(f"data/{name}.json", encoding="utf-8") as f:
            env.globals[name] = json.load(f)

    changelog = get_changelogs();

    os.makedirs("dist", exist_ok=True)

    for page in env.globals["pages"]:
        id = page["id"];
        navs = ( env.globals["old_navs"] if id.startswith("old/") else env.globals["navs"]) + page.get("navs",[]);

        data = {"page":page,"nav_items":navs,"changelogs":changelog}

        if "ext" in page:
            for ext in page["ext"]:
                with open(f"data/{ext}.json",encoding="utf-8") as f:
                    data[ext] = json.load(f)

        template = env.get_template(f"{id}.html")

        output = f"dist/{debug_pre if debug else ''}{id}.html"
        output_path = Path(output)
        output_path.parent.mkdir(parents=True,exist_ok=True) #保证目录存在

        with open(output, "w", encoding="utf-8") as f:
            f.write(template.render(**data))
        print(f"成功构建：{id}.html")

if __name__ == '__main__':
    main()