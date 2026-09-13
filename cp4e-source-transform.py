from pathlib import Path

path = Path("src/runtime/router.ts")
text = path.read_text()

old = '''    const trailingParamFingerprints = table.trailingParamFingerprints;
    const trailingParamRoutes = table.trailingParamRoutes;

    let authorityStart: number;
'''
new = '''    let authorityStart: number;
'''
if text.count(old) != 1:
    raise SystemExit(f"CP4-E first anchor count: {text.count(old)}")
text = text.replace(old, new, 1)

old = '''    /*
     * A pure-static method table does not need the dynamic discriminator at
     * all. Preserve the direct CP4-B static lookup path.
     */
    if (
      trailingParamFingerprints === undefined &&
      trailingParamRoutes === undefined
    ) {
      pathname = url.slice(pathStart, pathEnd);

      const staticRoute = table.staticRoutes.get(pathname);

      if (staticRoute) {
        return {
          route: staticRoute,
          params: EMPTY_PARAMS,
        };
      }

      return undefined;
    }

'''
if text.count(old) != 1:
    raise SystemExit(f"CP4-E pure-static anchor count: {text.count(old)}")
text = text.replace(old, "", 1)

old = '''    if (!table.usesDynamicTrie) {
      if (
        pathEnd - pathStart > 1 &&
'''
new = '''    const trailingParamFingerprints = table.trailingParamFingerprints;
    const trailingParamRoutes = table.trailingParamRoutes;

    if (!table.usesDynamicTrie) {
      if (
        pathEnd - pathStart > 1 &&
'''
if text.count(old) != 1:
    raise SystemExit(f"CP4-E deferred-metadata anchor count: {text.count(old)}")
text = text.replace(old, new, 1)

path.write_text(text)
