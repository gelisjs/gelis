from pathlib import Path

path = Path("src/runtime/router.ts")
text = path.read_text(encoding="utf-8")

anchor = '''    if (!table) {
      return undefined;
    }

    let authorityStart: number;
'''
replacement = '''    if (!table) {
      return undefined;
    }

    const fastMapKind = table.fastMapKind;

    let authorityStart: number;
'''
if text.count(anchor) != 1:
    raise SystemExit(f"expected one matchRequestUrl table anchor, found {text.count(anchor)}")
text = text.replace(anchor, replacement, 1)

old_static = '''    /*
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
new_static = '''    /*
     * Runtime-created fast-map tables already carry a registration-time kind.
     * Use it only as a read-only specialization hint while preserving CP4-Z's
     * exact-static-before-generic ordering. Legacy/prebuilt tables without
     * the metadata retain the conservative CP4-Z path below.
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
if text.count(old_static) != 1:
    raise SystemExit(f"expected one CP4-Z static dispatch block, found {text.count(old_static)}")
text = text.replace(old_static, new_static, 1)

old_trailing = '''    const trailingParamFingerprints = table.trailingParamFingerprints;
    const trailingParamRoutes = table.trailingParamRoutes;

    if (!table.usesDynamicTrie) {
'''
new_trailing = '''    const trailingParamFingerprints = table.trailingParamFingerprints;
    const trailingParamRoutes = table.trailingParamRoutes;

    if (fastMapKind !== undefined || !table.usesDynamicTrie) {
'''
if text.count(old_trailing) != 1:
    raise SystemExit(f"expected one CP4-Z request trailing discriminator, found {text.count(old_trailing)}")
text = text.replace(old_trailing, new_trailing, 1)

path.write_text(text, encoding="utf-8")
