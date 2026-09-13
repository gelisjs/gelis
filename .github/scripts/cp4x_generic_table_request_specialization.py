from pathlib import Path

path = Path("src/runtime/router.ts")
text = path.read_text()

old = '''    /*
     * Generic trie matching already requires a materialized pathname.
     * Defer fast-map lane discrimination until after URL offsets are known so
     * mixed static hits do not pay the FastMapKind branch chain introduced in
     * CP4-F. Registration metadata remains unchanged for attribution purity.
     */
    if (table.usesDynamicTrie) {
      return this.match(method, pathnameFromRequestUrl(url));
    }
'''

new = '''    /*
     * Generic trie matching already requires a materialized pathname.
     * Reuse the method table resolved above instead of dispatching through
     * match(), which would perform a second method-map lookup and capability
     * branch before entering the generic trie.
     */
    if (table.usesDynamicTrie) {
      return matchGenericMethodTable(table, pathnameFromRequestUrl(url));
    }
'''

if old not in text:
    raise SystemExit("CP4-X generic request anchor not found")

text = text.replace(old, new, 1)

anchor = '''function methodTableMatchesPath(
  table: MethodRoutes,

  pathname: string,
): boolean {
'''

helper = '''function matchGenericMethodTable(
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

  const captures: number[] = [];
  const dynamicRoute = matchDynamicPath(table.dynamicRoot, pathname, captures);

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
}

'''

if anchor not in text:
    raise SystemExit("CP4-X helper insertion anchor not found")

text = text.replace(anchor, helper + anchor, 1)
path.write_text(text)
