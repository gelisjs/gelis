from pathlib import Path

path = Path("src/runtime/router.ts")
text = path.read_text(encoding="utf-8")

old = '''  matchRequestUrl(method: string, url: string): RuntimeRouteMatch | undefined {\n    const table = this.#methods.get(method);\n\n    if (!table) {\n      return undefined;\n    }\n'''

new = '''  matchRequestUrl(method: string, url: string): RuntimeRouteMatch | undefined {\n    let table = this.#methods.get(method);\n\n    if (!table) {\n      if (method === "*") {\n        return undefined;\n      }\n\n      table = this.#methods.get("*");\n\n      if (!table) {\n        return undefined;\n      }\n\n      method = "*";\n    }\n'''

if text.count(old) != 1:
    raise SystemExit(f"expected one CP4-AM anchor, found {text.count(old)}")

text = text.replace(old, new, 1)
path.write_text(text, encoding="utf-8")
