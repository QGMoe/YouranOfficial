"""404 彩蛋游戏清单：扫描 dist/assets/egg/games/ 下的 NN-id.js，按文件名排序。
pages.json 的 404 页以 scripts 方式调用 build()，结果内联进 404.html；目录为空时 404 页不包含任何彩蛋代码。
新增游戏只需往目录里放一个文件，说明见 tools/eggs/README.md。"""
import os, re

GAMES_DIR = os.path.join("dist", "assets", "egg", "games")
NAME = re.compile(r"^\d{2}-[a-z0-9-]+\.js$")

def build():
    if not os.path.isdir(GAMES_DIR):
        return []
    return sorted(f for f in os.listdir(GAMES_DIR) if NAME.match(f))
