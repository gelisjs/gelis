from pathlib import Path

path = Path("src/runtime/router.ts")
text = path.read_text(encoding="utf-8")

early = '''    /*
     * Generic trie matching already requires a materialized pathname.
     * Reuse the method table resolved above instead of dispatching through
     * match(), which would perform a second method-map lookup and capability
     * branch before entering the generic trie.
     */
    if (table.usesDynamicTrie) {
      return matchGenericMethodTable(table, pathnameFromRequestUrl(url));
    }

'''

if text.count(early) != 1:
    raise SystemExit(f"expected one CP4-X early generic dispatch block, found {text.count(early)}")
text = text.replace(early, "", 1)

old_tail = '''    pathname ??= url.slice(pathStart, pathEnd);

    const captures: number[] = [];
    const dynamicRoute = matchDynamicPath(
      table.dynamicRoot,
      pathname,
      captures,
    );

    if (!dynamicRoute) {
      return undefined;
    }

    const params: Record<string, string> = {};

    for (let index = 0; index < dynamicRoute.paramNames.length; index++) {
      const name = dynamicRoute.paramNames[index];
      const start = captures[index * 2];
      const end = captures[index * 2 + 1];

      if (name === undefined || start === undefined || end === undefined) {
        continue;
      }

      params[name] = decodeParam(pathname.slice(start, end));
    }

    return {
      route: dynamicRoute.route,
      params,
    };
'''

new_tail = '''    pathname ??= url.slice(pathStart, pathEnd);

    return matchGenericDynamicTable(table, pathname);
'''

if text.count(old_tail) != 1:
    raise SystemExit(f"expected one generic URL tail, found {text.count(old_tail)}")
text = text.replace(old_tail, new_tail, 1)

helper_head = '''function matchGenericMethodTable(
  table: MethodRoutes,
  pathname: string,
): RuntimeRouteMatch | undefined {
  const staticRoute = table.staticRoutes.get(pathname);

  if (staticRoute) {
    return {
      route: staticRoute,
      params: EMPTY_PARAMS,
    };
  }

'''

helper_replacement = '''function matchGenericDynamicTable(
  table: MethodRoutes,
  pathname: string,
): RuntimeRouteMatch | undefined {
'''

if text.count(helper_head) != 1:
    raise SystemExit(f"expected one CP4-X generic helper head, found {text.count(helper_head)}")
text = text.replace(helper_head, helper_replacement, 1)

path.write_text(text, encoding="utf-8")
