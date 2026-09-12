from pathlib import Path

path = Path("src/runtime/router.ts")
text = path.read_text()


def replace_once(old: str, new: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"expected one match, got {count}: {old[:100]!r}")
    text = text.replace(old, new, 1)


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
    """  trailingParamRoutes: Map<string, TrailingParamRoute> | undefined;

  trailingParamFingerprints?: Map<number, TrailingFingerprintEntry>;""",
)

# Replace only the fast-map match block. The exact-static block above it stays untouched.
fast_comment = text.index("     * Fast-map mode.")
fast_start = text.index("    if (!table.usesDynamicTrie) {", fast_comment)
fast_end = text.index("\n\n    /*\n     * Generic mode.", fast_start)
fast_replacement = """    if (!table.usesDynamicTrie) {
      const trailingParamRoutes = table.trailingParamRoutes;

      if (pathname !== "/" && trailingParamRoutes) {
        const slash = pathname.lastIndexOf("/");

        if (slash >= 0) {
          const prefixEnd = slash + 1;

          const trailingParamFingerprints = table.trailingParamFingerprints;

          let trailingRoute: TrailingParamRoute | undefined;

          if (trailingParamFingerprints !== undefined) {
            const entry = trailingParamFingerprints.get(
              prefixFingerprint(pathname, prefixEnd),
            );

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
          } else {
            trailingRoute = trailingParamRoutes.get(pathname.slice(0, prefixEnd));
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

# matchingMethods gets the same optional-sidecar behavior.
method_start = text.index("function methodTableMatchesPath(")
method_dynamic = text.index("  if (!table.usesDynamicTrie) {", method_start)
method_end = text.index("\n\n  return dynamicTableMatchesPath(", method_dynamic)
method_replacement = """  if (!table.usesDynamicTrie) {
    const trailingParamRoutes = table.trailingParamRoutes;

    if (pathname !== "/" && trailingParamRoutes !== undefined) {
      const slash = pathname.lastIndexOf("/");

      if (slash >= 0) {
        const prefixEnd = slash + 1;

        const trailingParamFingerprints = table.trailingParamFingerprints;

        if (trailingParamFingerprints !== undefined) {
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
        } else if (trailingParamRoutes.has(pathname.slice(0, prefixEnd))) {
          return true;
        }
      }
    }

    return false;
  }"""
text = text[:method_dynamic] + method_replacement + text[method_end:]

# New method tables initialize the sidecar. Existing AOT/snapshot table literals remain valid
# because the property is optional and transparently use the canonical string-map fallback.
replace_once(
    """    trailingParamRoutes: undefined,

    dynamicRoot:""",
    """    trailingParamRoutes: undefined,

    trailingParamFingerprints: undefined,

    dynamicRoot:""",
)

# Transactional clones retain both canonical routes and the optional sidecar.
clone_start = text.index("function cloneMethodRoutes(")
clone_anchor = text.index("    dynamicRoot:", clone_start)
text = (
    text[:clone_anchor]
    + """    trailingParamFingerprints: cloneTrailingParamFingerprints(
      table.trailingParamFingerprints,
    ),

"""
    + text[clone_anchor:]
)

# Registration keeps the canonical Map unchanged and adds the sidecar only after duplicate
# detection succeeds.
registration_start = text.index(
    "  if (trailingParamName !== undefined && !table.usesDynamicTrie) {"
)
registration_end = text.index("\n\n  if (!table.usesDynamicTrie) {", registration_start)
registration_replacement = """  if (trailingParamName !== undefined && !table.usesDynamicTrie) {
    const slash = route.path.lastIndexOf("/");

    if (slash >= 0) {
      const prefix = route.path.slice(0, slash + 1);

      let trailingParamRoutes = table.trailingParamRoutes;

      if (!trailingParamRoutes) {
        trailingParamRoutes = new Map();

        table.trailingParamRoutes = trailingParamRoutes;
      }

      if (trailingParamRoutes.has(prefix)) {
        throw duplicateRoute(route);
      }

      const trailingRoute = {
        route,

        paramName: trailingParamName,
      };

      trailingParamRoutes.set(prefix, trailingRoute);

      registerTrailingFingerprint(table, prefix, trailingRoute);

      return;
    }
  }"""
text = text[:registration_start] + registration_replacement + text[registration_end:]

# Canonical migration semantics stay Map-based; only release the sidecar too.
migrate_start = text.index("function migrateTrailingRoutesToTrie(")
migrate_end = text.index("\n\nfunction registerDynamicRoute(", migrate_start)
migrate_block = text[migrate_start:migrate_end]
migrate_block = migrate_block.replace(
    "  table.trailingParamRoutes = undefined;",
    """  table.trailingParamRoutes = undefined;

  table.trailingParamFingerprints = undefined;""",
)
if migrate_block == text[migrate_start:migrate_end]:
    raise SystemExit("failed to patch migration cleanup")
text = text[:migrate_start] + migrate_block + text[migrate_end:]

# Add sidecar helpers immediately before generic-route registration.
helper_anchor = text.index("function registerDynamicRoute(")
helpers = """function registerTrailingFingerprint(
  table: MethodRoutes,

  prefix: string,

  trailingRoute: TrailingParamRoute,
): void {
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

    return;
  }

  if (existing.kind === "unique") {
    fingerprints.set(key, {
      kind: "collision",

      routes: new Map([
        [existing.prefix, existing.trailingRoute],
        [prefix, trailingRoute],
      ]),
    });

    return;
  }

  existing.routes.set(prefix, trailingRoute);
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
}

"""
text = text[:helper_anchor] + helpers + text[helper_anchor:]

if text.count("trailingParamRoutes") < 8:
    raise SystemExit("canonical trailing route map was not preserved")
if text.count("trailingParamFingerprints") < 8:
    raise SystemExit("candidate fingerprint sidecar was not installed")

path.write_text(text)
