from pathlib import Path

path = Path("src/runtime/router.ts")
text = path.read_text()

old_hot = '''    if (fastMapState !== FAST_MAP_TRAILING_ONLY) {
      if (fastMapState !== undefined && fastMapState > FAST_MAP_EMPTY) {
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

      if (fastMapState !== undefined && fastMapState < FAST_MAP_TRAILING_ONLY) {
        if (pathEnd - pathStart <= -fastMapState - 1) {
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
    }'''

new_hot = '''    if (fastMapState !== undefined && fastMapState > FAST_MAP_EMPTY) {
      if (pathEnd - pathStart <= fastMapState) {
        pathname = url.slice(pathStart, pathEnd);

        const staticRoute = table.staticRoutes.get(pathname);

        if (staticRoute) {
          return {
            route: staticRoute,
            params: EMPTY_PARAMS,
          };
        }
      }
    } else if (
      fastMapState !== undefined &&
      fastMapState < FAST_MAP_TRAILING_ONLY
    ) {
      const staticRoute = table.staticRoutes.get(url.slice(pathStart, pathEnd));

      if (staticRoute) {
        return {
          route: staticRoute,
          params: EMPTY_PARAMS,
        };
      }

      return undefined;
    } else if (fastMapState === undefined && table.staticRoutes.size !== 0) {
      pathname = url.slice(pathStart, pathEnd);

      const staticRoute = table.staticRoutes.get(pathname);

      if (staticRoute) {
        return {
          route: staticRoute,
          params: EMPTY_PARAMS,
        };
      }
    }'''

old_static_reg = '''    if (fastMapState === FAST_MAP_TRAILING_ONLY) {
      table.fastMapState = -(pathLength + 1);
    } else if (fastMapState !== undefined) {
      if (
        fastMapState === FAST_MAP_EMPTY ||
        (fastMapState > FAST_MAP_EMPTY && pathLength > fastMapState)
      ) {
        table.fastMapState = pathLength;
      } else if (fastMapState < FAST_MAP_TRAILING_ONLY) {
        const staticPathLengthMax = -fastMapState - 1;

        if (pathLength > staticPathLengthMax) {
          table.fastMapState = -(pathLength + 1);
        }
      }
    }'''

new_static_reg = '''    if (fastMapState === FAST_MAP_TRAILING_ONLY) {
      table.fastMapState = pathLength;
    } else if (fastMapState !== undefined) {
      if (fastMapState === FAST_MAP_EMPTY) {
        table.fastMapState = -(pathLength + 1);
      } else if (fastMapState < FAST_MAP_TRAILING_ONLY) {
        const staticPathLengthMax = -fastMapState - 1;

        if (pathLength > staticPathLengthMax) {
          table.fastMapState = -(pathLength + 1);
        }
      } else if (pathLength > fastMapState) {
        table.fastMapState = pathLength;
      }
    }'''

old_trailing_reg = '''    if (fastMapState === FAST_MAP_EMPTY) {
      table.fastMapState = FAST_MAP_TRAILING_ONLY;
    } else if (fastMapState !== undefined && fastMapState > FAST_MAP_EMPTY) {
      table.fastMapState = -(fastMapState + 1);
    }'''

new_trailing_reg = '''    if (fastMapState === FAST_MAP_EMPTY) {
      table.fastMapState = FAST_MAP_TRAILING_ONLY;
    } else if (
      fastMapState !== undefined &&
      fastMapState < FAST_MAP_TRAILING_ONLY
    ) {
      table.fastMapState = -fastMapState - 1;
    }'''

for old, new in [
    (old_hot, new_hot),
    (old_static_reg, new_static_reg),
    (old_trailing_reg, new_trailing_reg),
]:
    if old not in text:
        raise SystemExit(f"missing replacement pattern:\n{old}")
    text = text.replace(old, new, 1)

path.write_text(text)
