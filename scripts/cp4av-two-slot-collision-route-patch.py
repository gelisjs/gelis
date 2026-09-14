from pathlib import Path

path = Path("src/runtime/router.ts")
text = path.read_text()


def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, got {count}")
    text = text.replace(old, new, 1)


replace_once(
    '''interface TrailingCollisionRoute extends TrailingParamRoute {
  readonly prefix: string;
}
''',
    '''interface TrailingCollisionRoute {
  readonly route: RuntimeRouteRecord;

  readonly prefix: string;
}
''',
    "collision route shape",
)

match_decl = '''          let trailingRoute: TrailingParamRoute | undefined;
'''
if text.count(match_decl) != 2:
    raise SystemExit(
        f"match route declaration: expected exactly two matches, got {text.count(match_decl)}"
    )
text = text.replace(
    match_decl,
    '''          let trailingRoute:
            | TrailingParamRoute
            | TrailingCollisionRoute
            | undefined;
''',
)

replace_once(
    '''          if (trailingRoute) {
            const value = pathname.slice(prefixEnd);

            return {
              route: trailingRoute.route,

              params: {
                [trailingRoute.paramName]: decodeParam(value),
              },
            };
          }
''',
    '''          if (trailingRoute) {
            const value = pathname.slice(prefixEnd);
            const paramName = trailingRouteParamName(trailingRoute);

            return {
              route: trailingRoute.route,

              params: {
                [paramName]: decodeParam(value),
              },
            };
          }
''',
    "pathname param name",
)

replace_once(
    '''          if (trailingRoute) {
            const value = url.slice(prefixEnd, pathEnd);

            return {
              route: trailingRoute.route,
              params: {
                [trailingRoute.paramName]: decodeParam(value),
              },
            };
          }
''',
    '''          if (trailingRoute) {
            const value = url.slice(prefixEnd, pathEnd);
            const paramName = trailingRouteParamName(trailingRoute);

            return {
              route: trailingRoute.route,
              params: {
                [paramName]: decodeParam(value),
              },
            };
          }
''',
    "request-url param name",
)

replace_once(
    '''  const collisionRoute: TrailingCollisionRoute = {
    route: trailingRoute.route,
    paramName: trailingRoute.paramName,
    prefix,
  };
''',
    '''  const collisionRoute: TrailingCollisionRoute = {
    route: trailingRoute.route,
    prefix,
  };
''',
    "collision registration shape",
)

needle = '''function cloneTrailingParamFingerprints(
'''
helper = '''function trailingRouteParamName(
  route: TrailingParamRoute | TrailingCollisionRoute,
): string {
  if ("paramName" in route) {
    return route.paramName;
  }

  return route.route.path.slice(route.prefix.length + 1);
}

'''
if text.count(needle) != 1:
    raise SystemExit(
        f"param helper insertion: expected exactly one match, got {text.count(needle)}"
    )
text = text.replace(needle, helper + needle, 1)

path.write_text(text)
