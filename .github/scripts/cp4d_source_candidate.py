from pathlib import Path

path = Path("src/runtime/router.ts")
text = path.read_text()

replacements = [
    (
        "  staticPathLengths?: Set<number>;\n",
        "  staticPathLengthMin?: number;\n\n  staticPathLengthMax?: number;\n",
    ),
    (
        '''    /*\n     * Generic trie matching already requires a materialized pathname.\n     * Avoid paying the full-URL offset parser before falling back to it.\n     */\n    if (table.usesDynamicTrie) {\n      return this.match(method, pathnameFromRequestUrl(url));\n    }\n\n    let authorityStart: number;\n''',
        '''    /*\n     * Generic trie matching already requires a materialized pathname.\n     * Avoid paying the full-URL offset parser before falling back to it.\n     */\n    if (table.usesDynamicTrie) {\n      return this.match(method, pathnameFromRequestUrl(url));\n    }\n\n    const trailingParamFingerprints = table.trailingParamFingerprints;\n    const trailingParamRoutes = table.trailingParamRoutes;\n\n    let authorityStart: number;\n''',
    ),
    (
        '''    const queryStart = url.indexOf("?", pathStart + 1);\n    const pathEnd = queryStart === -1 ? url.length : queryStart;\n    const pathLength = pathEnd - pathStart;\n\n    let pathname: string | undefined;\n\n    /*\n     * Exact static precedence is only possible when at least one installed\n     * static route has the same pathname length. Legacy/prebuilt tables that\n     * do not carry the optional discriminator conservatively take the old\n     * exact-static slice path.\n     */\n    if (table.staticRoutes.size !== 0) {\n      const staticPathLengths = table.staticPathLengths;\n\n      if (\n        staticPathLengths === undefined ||\n        staticPathLengths.has(pathLength)\n      ) {\n        pathname = url.slice(pathStart, pathEnd);\n\n        const staticRoute = table.staticRoutes.get(pathname);\n\n        if (staticRoute) {\n          return {\n            route: staticRoute,\n            params: EMPTY_PARAMS,\n          };\n        }\n      }\n    }\n\n    if (!table.usesDynamicTrie) {\n      const trailingParamFingerprints = table.trailingParamFingerprints;\n      const trailingParamRoutes = table.trailingParamRoutes;\n''',
        '''    const queryStart = url.indexOf("?", pathStart + 1);\n    const pathEnd = queryStart === -1 ? url.length : queryStart;\n    const pathLength = pathEnd - pathStart;\n\n    let pathname: string | undefined;\n\n    /*\n     * A pure-static method table does not need the dynamic discriminator at\n     * all. Preserve the direct CP4-B static lookup path.\n     */\n    if (\n      trailingParamFingerprints === undefined &&\n      trailingParamRoutes === undefined\n    ) {\n      pathname = url.slice(pathStart, pathEnd);\n\n      const staticRoute = table.staticRoutes.get(pathname);\n\n      if (staticRoute) {\n        return {\n          route: staticRoute,\n          params: EMPTY_PARAMS,\n        };\n      }\n\n      return undefined;\n    }\n\n    /*\n     * Exact static precedence can be skipped only when the request pathname\n     * length lies outside the complete runtime-created static length range.\n     * Legacy/prebuilt tables without this metadata conservatively perform the\n     * canonical substring + Map lookup.\n     */\n    if (table.staticRoutes.size !== 0) {\n      const staticPathLengthMin = table.staticPathLengthMin;\n      const staticPathLengthMax = table.staticPathLengthMax;\n\n      if (\n        staticPathLengthMin === undefined ||\n        staticPathLengthMax === undefined ||\n        (pathLength >= staticPathLengthMin &&\n          pathLength <= staticPathLengthMax)\n      ) {\n        pathname = url.slice(pathStart, pathEnd);\n\n        const staticRoute = table.staticRoutes.get(pathname);\n\n        if (staticRoute) {\n          return {\n            route: staticRoute,\n            params: EMPTY_PARAMS,\n          };\n        }\n      }\n    }\n\n    if (!table.usesDynamicTrie) {\n''',
    ),
    (
        '''    staticPathLengths: new Set(),\n''',
        '''    staticPathLengthMin: Number.POSITIVE_INFINITY,\n\n    staticPathLengthMax: Number.NEGATIVE_INFINITY,\n''',
    ),
    (
        '''    ...(table.staticPathLengths === undefined\n      ? {}\n      : { staticPathLengths: new Set(table.staticPathLengths) }),\n''',
        '''    ...(table.staticPathLengthMin === undefined\n      ? {}\n      : { staticPathLengthMin: table.staticPathLengthMin }),\n\n    ...(table.staticPathLengthMax === undefined\n      ? {}\n      : { staticPathLengthMax: table.staticPathLengthMax }),\n''',
    ),
    (
        '''    table.staticRoutes.set(route.path, route);\n    table.staticPathLengths?.add(route.path.length);\n\n    return;\n''',
        '''    table.staticRoutes.set(route.path, route);\n\n    const pathLength = route.path.length;\n    const staticPathLengthMin = table.staticPathLengthMin;\n    const staticPathLengthMax = table.staticPathLengthMax;\n\n    if (\n      staticPathLengthMin !== undefined &&\n      pathLength < staticPathLengthMin\n    ) {\n      table.staticPathLengthMin = pathLength;\n    }\n\n    if (\n      staticPathLengthMax !== undefined &&\n      pathLength > staticPathLengthMax\n    ) {\n      table.staticPathLengthMax = pathLength;\n    }\n\n    return;\n''',
    ),
]

for old, new in replacements:
    if old not in text:
        raise SystemExit(f"CP4-D source anchor missing:\n{old[:160]}")
    text = text.replace(old, new, 1)

path.write_text(text)
