from pathlib import Path

path = Path("src/runtime/router.ts")
text = path.read_text()


def replace_once(old: str, new: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"expected one match, got {count}: {old[:100]!r}")
    text = text.replace(old, new, 1)


def replace_between(start: str, end: str, replacement: str, search_from: int = 0) -> None:
    global text
    left = text.index(start, search_from)
    right = text.index(end, left)
    text = text[:left] + replacement + text[right:]


replace_once(
    """export interface TrailingParamRoute {
  readonly route: RuntimeRouteRecord;

  readonly paramName: string;
}

export interface MethodRoutes {""",
    """export interface TrailingParamRoute {
  readonly route: RuntimeRouteRecord;

  readonly paramName: string;
}

interface TrailingFingerprintUniqueEntry {
  readonly kind: "unique";

  readonly prefix: string;

  readonly trailingRoute: TrailingParamRoute;
}

interface TrailingFingerprintCollisionEntry {
  readonly kind: "collision";

  readonly routes: Map<string, TrailingParamRoute>;
}

type TrailingFingerprintEntry =
  | TrailingFingerprintUniqueEntry
  | TrailingFingerprintCollisionEntry;

export interface MethodRoutes {""",
)

replace_once(
    "  trailingParamRoutes: Map<string, TrailingParamRoute> | undefined;",
    "  trailingParamFingerprints: Map<number, TrailingFingerprintEntry> | undefined;",
)

fast_comment = text.index("     * Fast-map mode.")
fast_start = text.index("    if (!table.usesDynamicTrie) {", fast_comment)
fast_end = text.index("\n\n    /*\n     * Generic mode.", fast_start)
fast_replacement = """    if (!table.usesDynamicTrie) {
      const trailingParamFingerprints = table.trailingParamFingerprints;

      if (pathname !== "/" && trailingParamFingerprints) {
        const slash = pathname.lastIndexOf("/");

        if (slash >= 0) {
          const prefixEnd = slash + 1;

          const entry = trailingParamFingerprints.get(
            prefixFingerprint(pathname, prefixEnd),
          );

          let trailingRoute: TrailingParamRoute | undefined;

          if (entry?.kind === "unique") {
            if (
              entry.prefix.length === prefixEnd &&
              pathname.startsWith(entry.prefix)
            ) {
              trailingRoute = entry.trailingRoute;
            }
          } else if (entry !== undefined) {
            trailingRoute = entry.routes.get(pathname.slice(0, prefixEnd));
          }

          if (trailingRoute) {
            const value = pathname.slice(prefixEnd);

            return {
              route: trailingRoute.route,

              params: {
                [trailingRoute.paramName]: decodeParam(value),
              },
            };
          }
        }
      }

      return undefined;
    }"""
text = text[:fast_start] + fast_replacement + text[fast_end:]

method_start = text.index("function methodTableMatchesPath(")
method_dynamic = text.index("  if (!table.usesDynamicTrie) {", method_start)
method_end = text.index("\n\n  return dynamicTableMatchesPath(", method_dynamic)
method_replacement = """  if (!table.usesDynamicTrie) {
    const trailingParamFingerprints = table.trailingParamFingerprints;

    if (pathname !== "/" && trailingParamFingerprints !== undefined) {
      const slash = pathname.lastIndexOf("/");

      if (slash >= 0) {
        const prefixEnd = slash + 1;

        const entry = trailingParamFingerprints.get(
          prefixFingerprint(pathname, prefixEnd),
        );

        if (entry?.kind === "unique") {
          return (
            entry.prefix.length === prefixEnd &&
            pathname.startsWith(entry.prefix)
          );
        }

        if (
          entry !== undefined &&
          entry.routes.has(pathname.slice(0, prefixEnd))
        ) {
          return true;
        }
      }
    }

    return false;
  }"""
text = text[:method_dynamic] + method_replacement + text[method_end:]

replace_once("    trailingParamRoutes: undefined,", "    trailingParamFingerprints: undefined,")

clone_start = text.index("function cloneMethodRoutes(")
clone_field_start = text.index("    trailingParamRoutes:", clone_start)
clone_field_end = text.index("\n\n    dynamicRoot:", clone_field_start)
clone_replacement = """    trailingParamFingerprints: cloneTrailingParamFingerprints(
      table.trailingParamFingerprints,
    ),"""
text = text[:clone_field_start] + clone_replacement + text[clone_field_end:]

registration_start = text.index(
    "  if (trailingParamName !== undefined && !table.usesDynamicTrie) {"
)
registration_end = text.index("\n\n  if (!table.usesDynamicTrie) {", registration_start)
registration_replacement = """  if (trailingParamName !== undefined && !table.usesDynamicTrie) {
    const slash = route.path.lastIndexOf("/");

    if (slash >= 0) {
      const prefix = route.path.slice(0, slash + 1);

      if (
        !registerTrailingFingerprint(table, prefix, {
          route,

          paramName: trailingParamName,
        })
      ) {
        throw duplicateRoute(route);
      }

      return;
    }
  }"""
text = text[:registration_start] + registration_replacement + text[registration_end:]

migrate_start = text.index("function migrateTrailingRoutesToTrie(")
migrate_end = text.index("\n\nfunction registerDynamicRoute(", migrate_start)
migrate_replacement = """function migrateTrailingRoutesToTrie(table: MethodRoutes): void {
  const trailingParamFingerprints = table.trailingParamFingerprints;

  if (!trailingParamFingerprints) {
    return;
  }

  for (const entry of trailingParamFingerprints.values()) {
    if (entry.kind === "unique") {
      registerDynamicRoute(table.dynamicRoot, entry.trailingRoute.route);

      continue;
    }

    for (const trailingRoute of entry.routes.values()) {
      registerDynamicRoute(table.dynamicRoot, trailingRoute.route);
    }
  }

  /*
   * Generic mode never consults this structure.
   * Release it after migration.
   */
  table.trailingParamFingerprints = undefined;
}

function registerTrailingFingerprint(
  table: MethodRoutes,

  prefix: string,

  trailingRoute: TrailingParamRoute,
): boolean {
  let fingerprints = table.trailingParamFingerprints;

  if (fingerprints === undefined) {
    fingerprints = new Map();

    table.trailingParamFingerprints = fingerprints;
  }

  const key = prefixFingerprint(prefix, prefix.length);

  const existing = fingerprints.get(key);

  if (existing === undefined) {
    fingerprints.set(key, {
      kind: "unique",

      prefix,

      trailingRoute,
    });

    return true;
  }

  if (existing.kind === "unique") {
    if (existing.prefix === prefix) {
      return false;
    }

    fingerprints.set(key, {
      kind: "collision",

      routes: new Map([
        [existing.prefix, existing.trailingRoute],
        [prefix, trailingRoute],
      ]),
    });

    return true;
  }

  if (existing.routes.has(prefix)) {
    return false;
  }

  existing.routes.set(prefix, trailingRoute);

  return true;
}

function cloneTrailingParamFingerprints(
  fingerprints: Map<number, TrailingFingerprintEntry> | undefined,
): Map<number, TrailingFingerprintEntry> | undefined {
  if (fingerprints === undefined) {
    return undefined;
  }

  const cloned = new Map<number, TrailingFingerprintEntry>();

  for (const [key, entry] of fingerprints) {
    cloned.set(
      key,

      entry.kind === "unique"
        ? entry
        : {
            kind: "collision",

            routes: new Map(entry.routes),
          },
    );
  }

  return cloned;
}

function prefixFingerprint(value: string, end: number): number {
  let hash = Math.imul(end, -1640531527);

  hash = Math.imul(hash ^ codeBefore(value, end, 2), -2048144789);

  hash = Math.imul(hash ^ codeBefore(value, end, 3), -1028477387);

  hash = Math.imul(hash ^ codeBefore(value, end, 4), 668265263);

  hash = Math.imul(hash ^ codeBefore(value, end, 5), 374761393);

  return hash | 0;
}

function codeBefore(value: string, end: number, distance: number): number {
  const index = end - distance;

  return index >= 0 ? value.charCodeAt(index) : 0;
}"""
text = text[:migrate_start] + migrate_replacement + text[migrate_end:]

if "trailingParamRoutes" in text:
    raise SystemExit("unexpected trailingParamRoutes reference remains")
if text.count("trailingParamFingerprints") < 8:
    raise SystemExit("candidate fingerprint structure was not installed")

path.write_text(text)
