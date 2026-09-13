from pathlib import Path

path = Path("src/runtime/router.ts")
text = path.read_text()

old = '''      if (fastMapKind === FAST_MAP_MIXED) {
        const pathLength = pathEnd - pathStart;
        const staticPathLengthMin = table.staticPathLengthMin!;
        const staticPathLengthMax = table.staticPathLengthMax!;

        if (
          pathLength >= staticPathLengthMin &&
          pathLength <= staticPathLengthMax
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
      } else if (table.staticRoutes.size !== 0) {
'''

new = '''      if (fastMapKind === FAST_MAP_MIXED) {
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
'''

if old not in text:
    raise SystemExit("mixed static range anchor not found")

text = text.replace(old, new, 1)
path.write_text(text)
