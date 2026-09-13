from pathlib import Path

path = Path("src/runtime/router.ts")
text = path.read_text()

old = '''  matchRequestUrl(method: string, url: string): RuntimeRouteMatch | undefined {
    const table = this.#methods.get(method);

    if (!table) {
      return undefined;
    }
'''

new = '''  matchRequestUrl(method: string, url: string): RuntimeRouteMatch | undefined {
    let table = this.#methods.get(method);

    if (!table) {
      if (method === "*") {
        return undefined;
      }

      table = this.#methods.get("*");

      if (!table) {
        return undefined;
      }

      method = "*";
    }
'''

if old not in text:
    raise SystemExit("CP4-T matchRequestUrl anchor not found")

text = text.replace(old, new, 1)
path.write_text(text)
