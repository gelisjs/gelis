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
    '''interface TrailingFingerprintCollisionEntry {
  readonly kind: "collision";

  /*
   * Legacy/AOT/prebuilt collision buckets may still carry the exact prefix
   * map. Runtime-created collision buckets use `secondary` instead, so the
   * optimized representation does not retain two full indexes for the same
   * routes.
   */
  readonly routes?: Map<string, TrailingParamRoute>;

  readonly secondary?: Map<number, TrailingSecondaryFingerprintEntry>;
}
''',
    '''interface TrailingFingerprintCollisionEntry {
  readonly kind: "collision";

  /*
   * Legacy/AOT/prebuilt collision buckets may still carry the exact prefix
   * map. Runtime-created collision buckets use `secondary` instead, so the
   * optimized representation does not retain two full indexes for the same
   * routes.
   */
  readonly routes?: Map<string, TrailingParamRoute>;

  readonly secondary?: Map<number, TrailingSecondaryFingerprintEntry>;

  /*
   * Runtime collision buckets retain one shared parameter name when every
   * route in the bucket uses the same trailing parameter. Mixed-name buckets
   * clear this value and fall back to route-local derivation on match.
   */
  paramName?: string;
}
''',
    "collision entry shared paramName",
)

if text.count(
    '''          let trailingRoute:\n            TrailingParamRoute | TrailingCollisionRoute | undefined;\n'''
) != 2:
    raise SystemExit("trailing route locals: expected exactly two matches")

text = text.replace(
    '''          let trailingRoute:
            TrailingParamRoute | TrailingCollisionRoute | undefined;
''',
    '''          let trailingRoute:
            TrailingParamRoute | TrailingCollisionRoute | undefined;
          let collisionParamName: string | undefined;
''',
)

replace_once(
    '''              } else {
                const secondaryEntry = secondary.get(
                  secondaryPrefixFingerprint(pathname, prefixEnd),
                );
''',
    '''              } else {
                collisionParamName = entry.paramName;

                const secondaryEntry = secondary.get(
                  secondaryPrefixFingerprint(pathname, prefixEnd),
                );
''',
    "pathname collision shared paramName",
)

replace_once(
    '''            const value = pathname.slice(prefixEnd);
            const paramName = trailingRouteParamName(trailingRoute);
''',
    '''            const value = pathname.slice(prefixEnd);
            const paramName =
              collisionParamName ?? trailingRouteParamName(trailingRoute);
''',
    "pathname paramName lookup",
)

replace_once(
    '''              } else {
                const secondaryEntry = secondary.get(
                  secondaryPrefixFingerprintRange(url, prefixEnd, prefixLength),
                );
''',
    '''              } else {
                collisionParamName = entry.paramName;

                const secondaryEntry = secondary.get(
                  secondaryPrefixFingerprintRange(url, prefixEnd, prefixLength),
                );
''',
    "request URL collision shared paramName",
)

replace_once(
    '''            const value = url.slice(prefixEnd, pathEnd);
            const paramName = trailingRouteParamName(trailingRoute);
''',
    '''            const value = url.slice(prefixEnd, pathEnd);
            const paramName =
              collisionParamName ?? trailingRouteParamName(trailingRoute);
''',
    "request URL paramName lookup",
)

replace_once(
    '''    fingerprints.set(key, {
      kind: "collision",

      secondary,
    });
''',
    '''    fingerprints.set(key, {
      kind: "collision",

      secondary,

      ...(existing.trailingRoute.paramName === trailingRoute.paramName
        ? { paramName: trailingRoute.paramName }
        : {}),
    });
''',
    "initial collision shared paramName",
)

replace_once(
    '''  if (secondary !== undefined) {
    return registerTrailingSecondaryFingerprint(
      secondary,
      prefix,
      trailingRoute,
    );
  }
''',
    '''  if (secondary !== undefined) {
    if (
      existing.paramName !== undefined &&
      existing.paramName !== trailingRoute.paramName
    ) {
      delete existing.paramName;
    }

    return registerTrailingSecondaryFingerprint(
      secondary,
      prefix,
      trailingRoute,
    );
  }
''',
    "invalidate mixed collision paramName",
)

replace_once(
    '''      cloned.set(key, {
        kind: "collision",
        ...(entry.routes === undefined
          ? {}
          : { routes: new Map(entry.routes) }),
      });
''',
    '''      cloned.set(key, {
        kind: "collision",
        ...(entry.routes === undefined
          ? {}
          : { routes: new Map(entry.routes) }),
        ...(entry.paramName === undefined ? {} : { paramName: entry.paramName }),
      });
''',
    "clone legacy collision shared paramName",
)

replace_once(
    '''    cloned.set(key, {
      kind: "collision",
      secondary: clonedSecondary,
    });
''',
    '''    cloned.set(key, {
      kind: "collision",
      secondary: clonedSecondary,
      ...(entry.paramName === undefined ? {} : { paramName: entry.paramName }),
    });
''',
    "clone compact collision shared paramName",
)

path.write_text(text)
