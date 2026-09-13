from pathlib import Path

router_path = Path("src/runtime/router.ts")
router = router_path.read_text(encoding="utf-8")

anchor = '''    return matchGenericDynamicTable(table, pathname);\n  }\n\n  matchingMethods(pathname: string): string[] {\n'''
replacement = '''    return matchGenericDynamicTable(table, pathname);\n  }\n\n  matchRequestUrlWithAllFallback(\n    method: string,\n    url: string,\n  ): RuntimeRouteMatch | undefined {\n    /*\n     * app.all() activates the only caller of this method. When the ALL table\n     * is the router's sole method table, skip the guaranteed method miss and\n     * dispatch directly through the canonical request-URL matcher for `*`.\n     *\n     * If any concrete method table exists, preserve CP4-U semantics exactly:\n     * exact method first, then ALL fallback. Reading Map.size keeps the mode\n     * self-updating when routes are registered later without adding state or\n     * registration-time work to routers that never use app.all().\n     */\n    if (this.#methods.size === 1) {\n      return this.matchRequestUrl(ALL_ROUTE_METHOD, url);\n    }\n\n    const exact = this.matchRequestUrl(method, url);\n\n    if (exact !== undefined || method === ALL_ROUTE_METHOD) {\n      return exact;\n    }\n\n    return this.matchRequestUrl(ALL_ROUTE_METHOD, url);\n  }\n\n  matchingMethods(pathname: string): string[] {\n'''
if router.count(anchor) != 1:
    raise SystemExit(f"router anchor count: {router.count(anchor)}")
router = router.replace(anchor, replacement, 1)
router_path.write_text(router, encoding="utf-8")

all_path = Path("src/runtime/router-all.ts")
all_text = all_path.read_text(encoding="utf-8")

old_import = 'import { Router, type RuntimeRouteMatch } from "./router";\n\nconst exactMatchRequestUrl = Router.prototype.matchRequestUrl;\n'
new_import = 'import { Router, type RuntimeRouteMatch } from "./router";\n\nconst exactMatchRequestUrlWithAllFallback =\n  Router.prototype.matchRequestUrlWithAllFallback;\n'
if all_text.count(old_import) != 1:
    raise SystemExit(f"router-all import anchor count: {all_text.count(old_import)}")
all_text = all_text.replace(old_import, new_import, 1)

old_wrapper = '''      value: (\n        method: string,\n\n        url: string,\n      ): RuntimeRouteMatch | undefined => {\n        const exact = exactMatchRequestUrl.call(router, method, url);\n\n        if (exact !== undefined || method === ALL_ROUTE_METHOD) {\n          return exact;\n        }\n\n        return exactMatchRequestUrl.call(router, ALL_ROUTE_METHOD, url);\n      },\n'''
new_wrapper = '''      value: (\n        method: string,\n\n        url: string,\n      ): RuntimeRouteMatch | undefined =>\n        exactMatchRequestUrlWithAllFallback.call(router, method, url),\n'''
if all_text.count(old_wrapper) != 1:
    raise SystemExit(f"router-all wrapper anchor count: {all_text.count(old_wrapper)}")
all_text = all_text.replace(old_wrapper, new_wrapper, 1)
all_path.write_text(all_text, encoding="utf-8")
