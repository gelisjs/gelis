from pathlib import Path

path = Path("src/runtime/router.ts")
text = path.read_text()

old = '''    /*
     * Runtime-created fast-map tables carry a registration-time kind.
     * Treat that kind as the primary capability discriminator so fast-map
     * requests do not pay a separate usesDynamicTrie property read/branch.
     * Legacy/prebuilt tables without a kind retain the conservative check.
     */
    const fastMapKind = table.fastMapKind;

    if (fastMapKind === undefined && table.usesDynamicTrie) {
      return this.match(method, pathnameFromRequestUrl(url));
    }
'''
new = '''    /*
     * Generic trie matching already requires a materialized pathname.
     * Defer fast-map lane discrimination until after URL offsets are known so
     * mixed static hits do not pay the FastMapKind branch chain introduced in
     * CP4-F. Registration metadata remains unchanged for attribution purity.
     */
    if (table.usesDynamicTrie) {
      return this.match(method, pathnameFromRequestUrl(url));
    }
'''
if old not in text:
    raise SystemExit("CP4-Q early-dispatch anchor not found")
text = text.replace(old, new, 1)

old = '''    /*
     * Runtime-created fast-map tables carry a registration-time kind so
     * capabilities that are not installed do not tax the hot path.
     *
     * - pure static: use the CP4-B-shaped exact lookup and return on miss;
     * - pure trailing: skip static discrimination entirely;
     * - mixed static + trailing: use the frozen min/max length range;
     * - legacy/prebuilt tables: conservatively retain exact static lookup.
     */
    if (fastMapKind !== FAST_MAP_TRAILING_ONLY) {
      if (fastMapKind === FAST_MAP_STATIC_ONLY) {
        const staticRoute = table.staticRoutes.get(
          url.slice(pathStart, pathEnd),
        );

        if (staticRoute) {
          return {
            route: staticRoute,
            params: EMPTY_PARAMS,
          };
        }

        return undefined;
      }

      if (fastMapKind === FAST_MAP_MIXED) {
        const staticPathLengthMax = table.staticPathLengthMax!;

        if (pathEnd - pathStart <= staticPathLengthMax) {
          pathname = url.slice(pathStart, pathEnd);

          const staticRoute = table.staticRoutes.get(pathname);

          if (staticRoute) {
            return {
              route: staticRoute,
              params: EMPTY_PARAMS,
            };
          }
        }
      } else if (table.staticRoutes.size !== 0) {
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
new = '''    /*
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
if old not in text:
    raise SystemExit("CP4-Q static-dispatch anchor not found")
text = text.replace(old, new, 1)

old = '''    if (fastMapKind !== undefined || !table.usesDynamicTrie) {
'''
new = '''    if (!table.usesDynamicTrie) {
'''
if old not in text:
    raise SystemExit("CP4-Q trailing-dispatch anchor not found")
text = text.replace(old, new, 1)

path.write_text(text)
