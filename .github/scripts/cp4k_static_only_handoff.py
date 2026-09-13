from pathlib import Path

path = Path("src/runtime/router.ts")
text = path.read_text()

needle = '''    const fastMapKind = table.fastMapKind;\n\n    if (fastMapKind === undefined && table.usesDynamicTrie) {\n'''
replacement = '''    const fastMapKind = table.fastMapKind;\n\n    if (fastMapKind === FAST_MAP_STATIC_ONLY) {\n      const staticRoute = table.staticRoutes.get(pathnameFromRequestUrl(url));\n\n      if (staticRoute) {\n        return {\n          route: staticRoute,\n          params: EMPTY_PARAMS,\n        };\n      }\n\n      return undefined;\n    }\n\n    if (fastMapKind === undefined && table.usesDynamicTrie) {\n'''

if needle not in text:
    raise SystemExit("CP4-K insertion anchor not found")
text = text.replace(needle, replacement, 1)

old = '''    if (fastMapKind !== FAST_MAP_TRAILING_ONLY) {\n      if (fastMapKind === FAST_MAP_STATIC_ONLY) {\n        const staticRoute = table.staticRoutes.get(\n          url.slice(pathStart, pathEnd),\n        );\n\n        if (staticRoute) {\n          return {\n            route: staticRoute,\n            params: EMPTY_PARAMS,\n          };\n        }\n\n        return undefined;\n      }\n\n      if (fastMapKind === FAST_MAP_MIXED) {\n'''
new = '''    if (fastMapKind !== FAST_MAP_TRAILING_ONLY) {\n      if (fastMapKind === FAST_MAP_MIXED) {\n'''

if old not in text:
    raise SystemExit("CP4-K removal anchor not found")
text = text.replace(old, new, 1)

path.write_text(text)
