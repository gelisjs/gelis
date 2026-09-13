from pathlib import Path

path = Path("src/runtime/router.ts")
text = path.read_text(encoding="utf-8")
marker = "  matchRequestUrl(method: string, url: string): RuntimeRouteMatch | undefined {"
if text.count(marker) != 1:
    raise SystemExit(f"expected one matchRequestUrl marker, found {text.count(marker)}")
prefix, body = text.split(marker, 1)

anchor = '''
    const table = this.#methods.get(method);

    if (!table) {
      return undefined;
    }

    let authorityStart: number;
'''
replacement = '''
    const table = this.#methods.get(method);

    if (!table) {
      return undefined;
    }

    const fastMapKind = table.fastMapKind;

    let authorityStart: number;
'''
if body.count(anchor) != 1:
    raise SystemExit(f"expected one table anchor in matchRequestUrl, found {body.count(anchor)}")
body = body.replace(anchor, replacement, 1)

old_static = '''
    /*
     * Preserve CP4-I's upper-bound negative discrimination, but restore the
     * CP4-E ordering for the exact-static lane. This isolates request-dispatch
     * control flow from the already-frozen registration metadata shape.
     */
    if (table.staticRoutes.size !== 0) {
      const staticPathLengthMax = table.staticPathLengthMax;

      if (
        staticPathLengthMax === undefined ||
        pathEnd - pathStart <= staticPathLengthMax
      ) {
        pathname = url.slice(pathStart, pathEnd);

        const staticRoute = table.staticRoutes.get(pathname);

        if (staticRoute) {
          return {
            route: staticRoute,
            params: EMPTY_PARAMS,
          };
        }
      }
    }
'''
new_static = '''
    /*
     * CP4-AJ composes CP4-AI's lazy request-URL capability with CP4-AH's
     * read-only fast-map kind specialization. Static-only applications never
     * enter this method; mixed/dynamic tables retain exact-static precedence.
     * Legacy/prebuilt tables without fastMapKind keep the conservative path.
     */
    if (fastMapKind === FAST_MAP_STATIC_ONLY) {
      const staticRoute = table.staticRoutes.get(url.slice(pathStart, pathEnd));

      if (staticRoute) {
        return {
          route: staticRoute,
          params: EMPTY_PARAMS,
        };
      }

      return undefined;
    }

    if (
      fastMapKind !== FAST_MAP_TRAILING_ONLY &&
      table.staticRoutes.size !== 0
    ) {
      const staticPathLengthMax = table.staticPathLengthMax;

      if (
        staticPathLengthMax === undefined ||
        pathEnd - pathStart <= staticPathLengthMax
      ) {
        pathname = url.slice(pathStart, pathEnd);

        const staticRoute = table.staticRoutes.get(pathname);

        if (staticRoute) {
          return {
            route: staticRoute,
            params: EMPTY_PARAMS,
          };
        }
      }
    }
'''
if body.count(old_static) != 1:
    raise SystemExit(f"expected one CP4-AI static block, found {body.count(old_static)}")
body = body.replace(old_static, new_static, 1)

old_trailing = '''
    const trailingParamFingerprints = table.trailingParamFingerprints;
    const trailingParamRoutes = table.trailingParamRoutes;

    if (!table.usesDynamicTrie) {
'''
new_trailing = '''
    const trailingParamFingerprints = table.trailingParamFingerprints;
    const trailingParamRoutes = table.trailingParamRoutes;

    if (fastMapKind !== undefined || !table.usesDynamicTrie) {
'''
if body.count(old_trailing) != 1:
    raise SystemExit(f"expected one request trailing discriminator, found {body.count(old_trailing)}")
body = body.replace(old_trailing, new_trailing, 1)

path.write_text(prefix + marker + body, encoding="utf-8")
