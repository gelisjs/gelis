from pathlib import Path

path = Path("src/runtime/router.ts")
text = path.read_text()

text = text.replace(
    "type TrailingFingerprintEntry =\n  TrailingFingerprintUniqueEntry | TrailingFingerprintCollisionEntry;\n",
    "type TrailingFingerprintEntry =\n  TrailingFingerprintUniqueEntry | TrailingFingerprintCollisionEntry;\n\ntype FastMapKind = 0 | 1 | 2;\n\nconst FAST_MAP_STATIC_ONLY: FastMapKind = 0;\nconst FAST_MAP_TRAILING_ONLY: FastMapKind = 1;\nconst FAST_MAP_MIXED: FastMapKind = 2;\n",
    1,
)

text = text.replace(
    "export interface MethodRoutes {\n  readonly staticRoutes: Map<string, RuntimeRouteRecord>;\n\n  staticPathLengthMin?: number;",
    "export interface MethodRoutes {\n  readonly staticRoutes: Map<string, RuntimeRouteRecord>;\n\n  fastMapKind?: FastMapKind;\n\n  staticPathLengthMin?: number;",
    1,
)

old_static_block = '''    const pathLength = pathEnd - pathStart;\n\n    let pathname: string | undefined;\n\n    /*\n     * Exact static precedence can be skipped only when the request pathname\n     * length lies outside the complete runtime-created static length range.\n     * Legacy/prebuilt tables without this metadata conservatively perform the\n     * canonical substring + Map lookup.\n     */\n    if (table.staticRoutes.size !== 0) {\n      const staticPathLengthMin = table.staticPathLengthMin;\n      const staticPathLengthMax = table.staticPathLengthMax;\n\n      if (\n        staticPathLengthMin === undefined ||\n        staticPathLengthMax === undefined ||\n        (pathLength >= staticPathLengthMin && pathLength <= staticPathLengthMax)\n      ) {\n        pathname = url.slice(pathStart, pathEnd);\n\n        const staticRoute = table.staticRoutes.get(pathname);\n\n        if (staticRoute) {\n          return {\n            route: staticRoute,\n            params: EMPTY_PARAMS,\n          };\n        }\n      }\n    }\n'''

new_static_block = '''    let pathname: string | undefined;\n\n    /*\n     * Runtime-created fast-map tables carry a registration-time kind so\n     * capabilities that are not installed do not tax the hot path.\n     *\n     * - pure static: use the CP4-B-shaped exact lookup and return on miss;\n     * - pure trailing: skip static discrimination entirely;\n     * - mixed static + trailing: use the frozen min/max length range;\n     * - legacy/prebuilt tables: conservatively retain exact static lookup.\n     */\n    const fastMapKind = table.fastMapKind;\n\n    if (fastMapKind !== FAST_MAP_TRAILING_ONLY) {\n      if (fastMapKind === FAST_MAP_STATIC_ONLY) {\n        const staticRoute = table.staticRoutes.get(url.slice(pathStart, pathEnd));\n\n        if (staticRoute) {\n          return {\n            route: staticRoute,\n            params: EMPTY_PARAMS,\n          };\n        }\n\n        return undefined;\n      }\n\n      if (fastMapKind === FAST_MAP_MIXED) {\n        const pathLength = pathEnd - pathStart;\n        const staticPathLengthMin = table.staticPathLengthMin!;\n        const staticPathLengthMax = table.staticPathLengthMax!;\n\n        if (\n          pathLength >= staticPathLengthMin &&\n          pathLength <= staticPathLengthMax\n        ) {\n          pathname = url.slice(pathStart, pathEnd);\n\n          const staticRoute = table.staticRoutes.get(pathname);\n\n          if (staticRoute) {\n            return {\n              route: staticRoute,\n              params: EMPTY_PARAMS,\n            };\n          }\n        }\n      } else if (table.staticRoutes.size !== 0) {\n        pathname = url.slice(pathStart, pathEnd);\n\n        const staticRoute = table.staticRoutes.get(pathname);\n\n        if (staticRoute) {\n          return {\n            route: staticRoute,\n            params: EMPTY_PARAMS,\n          };\n        }\n      }\n    }\n'''

if old_static_block not in text:
    raise SystemExit("static block anchor not found")
text = text.replace(old_static_block, new_static_block, 1)

text = text.replace(
    "  return {\n    staticRoutes: new Map(),\n\n    staticPathLengthMin: Number.POSITIVE_INFINITY,",
    "  return {\n    staticRoutes: new Map(),\n\n    fastMapKind: FAST_MAP_STATIC_ONLY,\n\n    staticPathLengthMin: Number.POSITIVE_INFINITY,",
    1,
)

text = text.replace(
    "  return {\n    staticRoutes: new Map(table.staticRoutes),\n\n    ...(table.staticPathLengthMin === undefined",
    "  return {\n    staticRoutes: new Map(table.staticRoutes),\n\n    ...(table.fastMapKind === undefined\n      ? {}\n      : { fastMapKind: table.fastMapKind }),\n\n    ...(table.staticPathLengthMin === undefined",
    1,
)

text = text.replace(
    "    table.staticRoutes.set(route.path, route);\n\n    const pathLength = route.path.length;",
    "    table.staticRoutes.set(route.path, route);\n\n    if (table.fastMapKind === FAST_MAP_TRAILING_ONLY) {\n      table.fastMapKind = FAST_MAP_MIXED;\n    }\n\n    const pathLength = route.path.length;",
    1,
)

text = text.replace(
    "  if (trailingParamName !== undefined && !table.usesDynamicTrie) {\n    const slash = route.path.lastIndexOf(\"/\");",
    "  if (trailingParamName !== undefined && !table.usesDynamicTrie) {\n    if (table.fastMapKind === FAST_MAP_STATIC_ONLY) {\n      table.fastMapKind =\n        table.staticRoutes.size === 0\n          ? FAST_MAP_TRAILING_ONLY\n          : FAST_MAP_MIXED;\n    }\n\n    const slash = route.path.lastIndexOf(\"/\");",
    1,
)

path.write_text(text)
