from pathlib import Path

path = Path("src/runtime/router.ts")
text = path.read_text()

old = 'export interface MethodRoutes {\n  readonly staticRoutes: Map<string, RuntimeRouteRecord>;\n\n  trailingParamRoutes: Map<string, TrailingParamRoute> | undefined;\n'
new = 'export interface MethodRoutes {\n  readonly staticRoutes: Map<string, RuntimeRouteRecord>;\n\n  staticPathLengths?: Set<number>;\n\n  trailingParamRoutes: Map<string, TrailingParamRoute> | undefined;\n'
if old not in text:
    raise SystemExit("MethodRoutes anchor missing")
text = text.replace(old, new, 1)

old = '  matchRequestUrl(method: string, url: string): RuntimeRouteMatch | undefined {\n    const table = this.#methods.get(method);\n\n    if (!table) {\n      return undefined;\n    }\n\n    let authorityStart: number;\n'
new = '  matchRequestUrl(method: string, url: string): RuntimeRouteMatch | undefined {\n    const table = this.#methods.get(method);\n\n    if (!table) {\n      return undefined;\n    }\n\n    /*\n     * Generic trie matching already requires a materialized pathname.\n     * Avoid paying the full-URL offset parser before falling back to it.\n     */\n    if (table.usesDynamicTrie) {\n      return this.match(method, pathnameFromRequestUrl(url));\n    }\n\n    let authorityStart: number;\n'
if old not in text:
    raise SystemExit("matchRequestUrl header anchor missing")
text = text.replace(old, new, 1)

old = '    const queryStart = url.indexOf("?", pathStart + 1);\n    const pathEnd = queryStart === -1 ? url.length : queryStart;\n\n    let pathname: string | undefined;\n\n    /*\n     * Preserve exact static precedence before every dynamic path.\n     * Pure-dynamic method tables skip pathname slicing entirely.\n     */\n    if (table.staticRoutes.size !== 0) {\n      pathname = url.slice(pathStart, pathEnd);\n\n      const staticRoute = table.staticRoutes.get(pathname);\n\n      if (staticRoute) {\n        return {\n          route: staticRoute,\n          params: EMPTY_PARAMS,\n        };\n      }\n    }\n\n    if (!table.usesDynamicTrie) {\n'
new = '    const queryStart = url.indexOf("?", pathStart + 1);\n    const pathEnd = queryStart === -1 ? url.length : queryStart;\n    const pathLength = pathEnd - pathStart;\n\n    let pathname: string | undefined;\n\n    /*\n     * Exact static precedence is only possible when at least one installed\n     * static route has the same pathname length. Legacy/prebuilt tables that\n     * do not carry the optional discriminator conservatively take the old\n     * exact-static slice path.\n     */\n    if (table.staticRoutes.size !== 0) {\n      const staticPathLengths = table.staticPathLengths;\n\n      if (\n        staticPathLengths === undefined ||\n        staticPathLengths.has(pathLength)\n      ) {\n        pathname = url.slice(pathStart, pathEnd);\n\n        const staticRoute = table.staticRoutes.get(pathname);\n\n        if (staticRoute) {\n          return {\n            route: staticRoute,\n            params: EMPTY_PARAMS,\n          };\n        }\n      }\n    }\n\n    if (!table.usesDynamicTrie) {\n'
if old not in text:
    raise SystemExit("static precedence anchor missing")
text = text.replace(old, new, 1)

old = 'function createMethodRoutes(): MethodRoutes {\n  return {\n    staticRoutes: new Map(),\n\n    trailingParamRoutes: undefined,\n'
new = 'function createMethodRoutes(): MethodRoutes {\n  return {\n    staticRoutes: new Map(),\n\n    staticPathLengths: new Set(),\n\n    trailingParamRoutes: undefined,\n'
if old not in text:
    raise SystemExit("createMethodRoutes anchor missing")
text = text.replace(old, new, 1)

old = 'function cloneMethodRoutes(table: MethodRoutes): MethodRoutes {\n  return {\n    staticRoutes: new Map(table.staticRoutes),\n\n    trailingParamRoutes:\n'
new = 'function cloneMethodRoutes(table: MethodRoutes): MethodRoutes {\n  return {\n    staticRoutes: new Map(table.staticRoutes),\n\n    ...(table.staticPathLengths === undefined\n      ? {}\n      : { staticPathLengths: new Set(table.staticPathLengths) }),\n\n    trailingParamRoutes:\n'
if old not in text:
    raise SystemExit("cloneMethodRoutes anchor missing")
text = text.replace(old, new, 1)

old = '    table.staticRoutes.set(route.path, route);\n\n    return;\n'
new = '    table.staticRoutes.set(route.path, route);\n    table.staticPathLengths?.add(route.path.length);\n\n    return;\n'
if old not in text:
    raise SystemExit("static registration anchor missing")
text = text.replace(old, new, 1)

path.write_text(text)
