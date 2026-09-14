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

type TrailingSecondaryFingerprintEntry =
  TrailingCollisionRoute | Map<string, TrailingCollisionRoute>;
''',
    '''type TrailingSecondaryFingerprintEntry =
  | TrailingParamRoute
  | Map<string, TrailingParamRoute>;
''',
    "secondary entry type",
)

replace_once(
    '''                } else if (
                  secondaryEntry !== undefined &&
                  secondaryEntry.prefix.length === prefixEnd &&
                  pathname.startsWith(secondaryEntry.prefix)
                ) {
                  trailingRoute = secondaryEntry;
                }
''',
    '''                } else if (
                  secondaryEntry !== undefined &&
                  trailingRoutePrefixMatches(
                    secondaryEntry,
                    pathname,
                    0,
                    prefixEnd,
                  )
                ) {
                  trailingRoute = secondaryEntry;
                }
''',
    "pathname secondary lookup",
)

replace_once(
    '''                } else if (
                  secondaryEntry !== undefined &&
                  secondaryEntry.prefix.length === prefixLength &&
                  url.startsWith(secondaryEntry.prefix, pathStart)
                ) {
                  trailingRoute = secondaryEntry;
                }
''',
    '''                } else if (
                  secondaryEntry !== undefined &&
                  trailingRoutePrefixMatches(
                    secondaryEntry,
                    url,
                    pathStart,
                    prefixLength,
                  )
                ) {
                  trailingRoute = secondaryEntry;
                }
''',
    "request-url secondary lookup",
)

replace_once(
    '''              } else if (
                secondaryEntry !== undefined &&
                secondaryEntry.prefix.length === prefixEnd &&
                pathname.startsWith(secondaryEntry.prefix)
              ) {
                return true;
              }
''',
    '''              } else if (
                secondaryEntry !== undefined &&
                trailingRoutePrefixMatches(
                  secondaryEntry,
                  pathname,
                  0,
                  prefixEnd,
                )
              ) {
                return true;
              }
''',
    "matching-methods secondary lookup",
)

replace_once(
    '''function registerTrailingSecondaryFingerprint(
  secondary: Map<number, TrailingSecondaryFingerprintEntry>,
  prefix: string,
  trailingRoute: TrailingParamRoute,
): boolean {
  const key = secondaryPrefixFingerprint(prefix, prefix.length);
  const existing = secondary.get(key);
  const collisionRoute: TrailingCollisionRoute = {
    route: trailingRoute.route,
    paramName: trailingRoute.paramName,
    prefix,
  };

  if (existing === undefined) {
    secondary.set(key, collisionRoute);
    return true;
  }

  if (existing instanceof Map) {
    if (existing.has(prefix)) {
      return false;
    }

    existing.set(prefix, collisionRoute);
    return true;
  }

  if (existing.prefix === prefix) {
    return false;
  }

  secondary.set(
    key,
    new Map([
      [existing.prefix, existing],
      [prefix, collisionRoute],
    ]),
  );

  return true;
}
''',
    '''function registerTrailingSecondaryFingerprint(
  secondary: Map<number, TrailingSecondaryFingerprintEntry>,
  prefix: string,
  trailingRoute: TrailingParamRoute,
): boolean {
  const key = secondaryPrefixFingerprint(prefix, prefix.length);
  const existing = secondary.get(key);

  if (existing === undefined) {
    secondary.set(key, trailingRoute);
    return true;
  }

  if (existing instanceof Map) {
    if (existing.has(prefix)) {
      return false;
    }

    existing.set(prefix, trailingRoute);
    return true;
  }

  if (trailingRoutePrefixEquals(existing, prefix)) {
    return false;
  }

  const existingPrefixLength = trailingRoutePrefixLength(existing);
  const existingPrefix = existing.route.path.slice(0, existingPrefixLength);

  secondary.set(
    key,
    new Map([
      [existingPrefix, existing],
      [prefix, trailingRoute],
    ]),
  );

  return true;
}

function trailingRoutePrefixLength(route: TrailingParamRoute): number {
  return route.route.path.length - route.paramName.length - 1;
}

function trailingRoutePrefixEquals(
  route: TrailingParamRoute,
  prefix: string,
): boolean {
  const prefixLength = trailingRoutePrefixLength(route);

  return prefixLength === prefix.length && route.route.path.startsWith(prefix);
}

function trailingRoutePrefixMatches(
  route: TrailingParamRoute,
  value: string,
  start: number,
  prefixLength: number,
): boolean {
  const routePath = route.route.path;

  if (trailingRoutePrefixLength(route) !== prefixLength) {
    return false;
  }

  for (let index = 0; index < prefixLength; index++) {
    if (routePath.charCodeAt(index) !== value.charCodeAt(start + index)) {
      return false;
    }
  }

  return true;
}
''',
    "secondary registration",
)

path.write_text(text)
