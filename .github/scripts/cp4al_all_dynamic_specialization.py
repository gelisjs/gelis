from pathlib import Path

router_path = Path("src/runtime/router.ts")
router_all_path = Path("src/runtime/router-all.ts")

router = router_path.read_text(encoding="utf-8")
router_all = router_all_path.read_text(encoding="utf-8")

method_anchor = '''    return matchGenericDynamicTable(table, pathname);\n  }\n\n  matchingMethods(pathname: string): string[] {\n'''
method_replacement = '''    return matchGenericDynamicTable(table, pathname);\n  }\n\n  matchAllRequestUrl(url: string): RuntimeRouteMatch | undefined {\n    const table = this.#methods.get(ALL_ROUTE_METHOD);\n\n    if (!table) {\n      return undefined;\n    }\n\n    /*\n     * Preserve the canonical CP4-AK matcher whenever the ALL table contains\n     * static routes. The specialization below is only for dynamic-only ALL\n     * tables, where static discrimination is semantically unreachable but its\n     * shared-function code shape still affected the CP4-AK ALL lane.\n     */\n    if (table.staticRoutes.size !== 0) {\n      return this.matchRequestUrl(ALL_ROUTE_METHOD, url);\n    }\n\n    let authorityStart: number;\n\n    if (\n      url.charCodeAt(0) !== 104 ||\n      url.charCodeAt(1) !== 116 ||\n      url.charCodeAt(2) !== 116 ||\n      url.charCodeAt(3) !== 112\n    ) {\n      return this.match(ALL_ROUTE_METHOD, pathnameFromRequestUrl(url));\n    }\n\n    if (\n      url.charCodeAt(4) === 58 &&\n      url.charCodeAt(5) === 47 &&\n      url.charCodeAt(6) === 47\n    ) {\n      authorityStart = 7;\n    } else if (\n      url.charCodeAt(4) === 115 &&\n      url.charCodeAt(5) === 58 &&\n      url.charCodeAt(6) === 47 &&\n      url.charCodeAt(7) === 47\n    ) {\n      authorityStart = 8;\n    } else {\n      return this.match(ALL_ROUTE_METHOD, pathnameFromRequestUrl(url));\n    }\n\n    const pathStart = url.indexOf("/", authorityStart);\n\n    if (pathStart === -1) {\n      return this.match(ALL_ROUTE_METHOD, "/");\n    }\n\n    const queryStart = url.indexOf("?", pathStart + 1);\n    const pathEnd = queryStart === -1 ? url.length : queryStart;\n\n    return matchDynamicOnlyRequestUrlTable(table, url, pathStart, pathEnd);\n  }\n\n  matchingMethods(pathname: string): string[] {\n'''

if router.count(method_anchor) != 1:
    raise SystemExit(f"expected one Router method anchor, found {router.count(method_anchor)}")
router = router.replace(method_anchor, method_replacement, 1)

helper_anchor = '''function matchGenericDynamicTable(\n  table: MethodRoutes,\n  pathname: string,\n): RuntimeRouteMatch | undefined {\n'''
helper = '''function matchDynamicOnlyRequestUrlTable(\n  table: MethodRoutes,\n  url: string,\n  pathStart: number,\n  pathEnd: number,\n): RuntimeRouteMatch | undefined {\n  const trailingParamFingerprints = table.trailingParamFingerprints;\n  const trailingParamRoutes = table.trailingParamRoutes;\n\n  if (!table.usesDynamicTrie) {\n    if (\n      pathEnd - pathStart > 1 &&\n      (trailingParamFingerprints !== undefined ||\n        trailingParamRoutes !== undefined)\n    ) {\n      const slash = url.lastIndexOf("/", pathEnd - 1);\n\n      if (slash >= pathStart) {\n        const prefixEnd = slash + 1;\n        const prefixLength = prefixEnd - pathStart;\n\n        let trailingRoute: TrailingParamRoute | undefined;\n\n        if (trailingParamFingerprints !== undefined) {\n          const entry = trailingParamFingerprints.get(\n            prefixFingerprintRange(url, prefixEnd, prefixLength),\n          );\n\n          if (entry?.kind === "unique") {\n            if (\n              entry.prefix.length === prefixLength &&\n              url.startsWith(entry.prefix, pathStart)\n            ) {\n              trailingRoute = entry.trailingRoute;\n            }\n          } else if (entry !== undefined) {\n            trailingRoute = entry.routes.get(url.slice(pathStart, prefixEnd));\n          }\n        } else if (trailingParamRoutes !== undefined) {\n          trailingRoute = trailingParamRoutes.get(url.slice(pathStart, prefixEnd));\n        }\n\n        if (trailingRoute) {\n          const value = url.slice(prefixEnd, pathEnd);\n\n          return {\n            route: trailingRoute.route,\n            params: {\n              [trailingRoute.paramName]: decodeParam(value),\n            },\n          };\n        }\n      }\n    }\n\n    return undefined;\n  }\n\n  return matchGenericDynamicTable(table, url.slice(pathStart, pathEnd));\n}\n\nfunction matchGenericDynamicTable(\n  table: MethodRoutes,\n  pathname: string,\n): RuntimeRouteMatch | undefined {\n'''

if router.count(helper_anchor) != 1:
    raise SystemExit(f"expected one helper anchor, found {router.count(helper_anchor)}")
router = router.replace(helper_anchor, helper, 1)

capture_anchor = '''const exactMatchRequestUrl = Router.prototype.matchRequestUrl;\n'''
capture_replacement = '''const exactMatchRequestUrl = Router.prototype.matchRequestUrl;\nconst exactMatchAllRequestUrl = Router.prototype.matchAllRequestUrl;\n'''
if router_all.count(capture_anchor) != 1:
    raise SystemExit(f"expected one router-all capture anchor, found {router_all.count(capture_anchor)}")
router_all = router_all.replace(capture_anchor, capture_replacement, 1)

fallback_anchor = '''        return exactMatchRequestUrl.call(router, ALL_ROUTE_METHOD, url);\n'''
fallback_replacement = '''        return exactMatchAllRequestUrl.call(router, url);\n'''
if router_all.count(fallback_anchor) != 1:
    raise SystemExit(f"expected one ALL fallback call, found {router_all.count(fallback_anchor)}")
router_all = router_all.replace(fallback_anchor, fallback_replacement, 1)

router_path.write_text(router, encoding="utf-8")
router_all_path.write_text(router_all, encoding="utf-8")
