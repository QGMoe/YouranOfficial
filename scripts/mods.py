from . import changelog

def get_youranvers():
    changelogs = changelog.get_changelogs("./changelog/youranmod")
    vers = [{"id":log["id"],"time":log["title"],"msg":log["content"]} for log in changelogs]
    return vers

def build():
    return {"yr":{"vers":get_youranvers()}}