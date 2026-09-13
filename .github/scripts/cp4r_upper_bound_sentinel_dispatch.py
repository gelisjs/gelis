from pathlib import Path

path = Path("src/runtime/router.ts")
text = path.read_text()

old = '''    if (table.staticRoutes.size !== 0) {
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

new = '''    const staticPathLengthMax = table.staticPathLengthMax;

    if (
      staticPathLengthMax === undefined
        ? table.staticRoutes.size !== 0
        : pathEnd - pathStart <= staticPathLengthMax
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
'''

if old not in text:
    raise SystemExit("CP4-R static discriminator anchor not found")

path.write_text(text.replace(old, new, 1))
