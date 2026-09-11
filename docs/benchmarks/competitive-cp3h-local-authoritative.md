# Competitive Performance v0.1 — CP3-H Local Authoritative Result

Date: 2026-09-11

## Classification

**CP3-H LOCAL FRESH-PATH BOUNDARY RUN: VALID / ACCEPTED AS DECOMPOSITION EVIDENCE**

This run is decomposition evidence used to select the next optimization target. It is not a production-code acceptance gate.

## Frozen identity

- Harness SHA: `0ae9a11ae593dcc31d2e512df29f1fc62f80fa83`
- Frozen Gelis production source: `98d8c00bfda8913a951bdf8780e136672646a90c`
- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- CPU: Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz
- Routes: 5,000
- Samples: 11 fresh worker processes per cell
- Correctness probe before timing: 18/18 PASS
- GitHub Quality on harness SHA: SUCCESS

## Authoritative medians

- `request-url-static`: 3.9 ns/op
- `request-url-dynamic`: 3.8 ns/op
- `pathname-constant-static`: 8.2 ns/op
- `pathname-constant-dynamic`: 8.9 ns/op
- `pathname-request-static`: 66.6 ns/op
- `pathname-request-dynamic`: 72.8 ns/op
- `map-static-stable`: 2.8 ns/op
- `map-static-request`: 123.3 ns/op
- `map-trailing-stable`: 2.7 ns/op
- `map-trailing-request`: 161.4 ns/op
- `router-static-stable`: 2.8 ns/op
- `router-dynamic-stable`: 26.3 ns/op
- `router-static-request`: 138.3 ns/op
- `router-dynamic-request`: 253.7 ns/op
- `dispatch-prepath-static`: 37.7 ns/op
- `dispatch-prepath-dynamic`: 73.6 ns/op
- `dispatch-request-static`: 161.9 ns/op
- `dispatch-request-dynamic`: 297.1 ns/op

## Derived diagnostics

- Request URL dynamic minus static: -0.1 ns.
- Constant pathname dynamic minus static: 0.7 ns.
- Request-derived pathname dynamic minus static: 6.2 ns.
- Static Map request-derived minus stable: 120.5 ns.
- Trailing Map request-derived minus stable: 158.7 ns.
- Static router request-derived minus stable: 135.5 ns.
- Dynamic router request-derived minus stable: 227.4 ns.
- Pre-extracted dispatch dynamic minus static: 35.9 ns.
- Request-derived dispatch dynamic minus static: 135.3 ns.
- Static dispatch request-derived minus pre-extracted: 124.2 ns.
- Dynamic dispatch request-derived minus pre-extracted: 223.6 ns.
- Dynamic-specific fresh-path penalty, calculated as `(223.6 - 124.2)`: about 99.4 ns. This is non-additive engineering direction only.

## Interpretation

1. Direct `Request.url` property access is cheap. The cost appears when string operations are performed on that request-derived URL and when the resulting pathname participates in lookup.
2. `pathnameFromUrl(request.url)` is roughly eight times slower than the same extraction from a stable URL constant in this harness. The difference is about 58 to 64 ns depending on path shape.
3. Static and trailing-prefix lookups become much more expensive when the lookup key is materialized from `request.url` inside the measured operation.
4. The controlled dispatch cells reproduce the residual seen in CP3-G: pre-extracted dynamic dispatch is only 35.9 ns slower than static, while request-derived dynamic dispatch is 135.3 ns slower.
5. The extra dynamic-specific fresh-path penalty is about 99.4 ns. This explains most of the unexplained CP3-G dynamic residual.
6. This run does not prove that string hashing alone accounts for the entire cost. Path extraction, substring representation, hashing, lookup, and trailing-value materialization can interact non-additively.

## Competitor mechanism study

Hono 4.13.7 extracts a pathname from `request.url` and uses `RegExpRouter` by default through `SmartRouter`. Its regexp router first checks a static string-keyed lookup and falls back to a regexp matcher for dynamic routes.

Elysia 2.0.0-beta.14 declares `memoirist@1.2.2` as its routing dependency. Memoirist 1.2.2 uses a compressed radix structure and matches path characters directly using `charCodeAt`, `indexOf`, and substring extraction for captured parameters rather than hashing a complete trailing-route prefix through a JavaScript `Map`.

The exact Elysia 2.0.0-beta.14 npm release is not mapped to a public GitHub tag or provenance source commit, so framework-glue claims must remain limited to published package metadata. The exact Memoirist 1.2.2 tag is available and was inspected directly.

## Next direction

Freeze CP3-I as a no-production-change decomposition that compares:

- current `pathnameFromUrl(request.url)` against narrower request-URL extraction variants;
- current trailing-parameter fast-map routing against Gelis's existing generic dynamic trie under request-derived pathname input;
- stable-key and request-derived lookup behavior using `Map` and null-prototype object dictionaries;
- index-only URL parsing that avoids pathname substring materialization as a lower bound.

Only after CP3-I should a production routing candidate be selected. If existing structures cannot remove most of the fresh-path penalty, the next architectural prototype should route directly over the full request URL or a compact radix representation without materializing and hashing a complete pathname key.
