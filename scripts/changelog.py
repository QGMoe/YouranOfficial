import os, markdown
from bs4 import BeautifulSoup

def get_changelogs(dir:str):
    md_files = [f for f in os.listdir(dir) if f.endswith('.md')]
    
    changelogs = []
    for md_file in md_files:
        path = os.path.join(dir, md_file)
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

def build():
    return get_changelogs("./changelog/server");