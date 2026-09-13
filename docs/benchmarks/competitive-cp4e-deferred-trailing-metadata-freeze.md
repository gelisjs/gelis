# Competitive Performance v0.1 — CP4-E deferred trailing-metadata acceptance freeze

## Purpose

CP4-E tests whether CP4-D's static-only regression comes from selecting the pure-static lane by eagerly reading trailing-route metadata before exact static lookup.

CP4-D established that the constant-size min/max static-length range preserves the mixed length-miss and pure-trailing wins while keeping registration and retained memory inside the frozen guards. CP4-D was nevertheless rejected because `static-only raw` regressed to `1.0474x` against a `<= 1.0200x` gate.

CP4-E keeps the CP4-D range representation and routing semantics but defers trailing metadata reads until after the range-gated exact static lookup. This is an acceptance gate for the frozen CP4-E source candidate.

## Frozen identities

- Previous production source: `af4e5102046def1b163435333563b8d08f919bf5`
- CP4-E candidate source: `f18e43623eeafe6356248b174b3ae2112bcc8e82`
- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- Routes per workload: `5,000`
- Samples: `11` mirrored fresh-worker pairs per cell pair

## Candidate shape

Relative to CP4-D, CP4-E changes only hot-path ordering in `matchRequestUrl()`:

1. generic-trie tables retain the established early materialized-pathname fallback;
2. full-request URL offsets are parsed for fast-map tables;
3. the min/max static pathname-length range is evaluated before trailing-route metadata is read;
4. when an exact static match remains possible, the canonical pathname substring + static `Map` lookup runs first and a static hit returns immediately;
5. only after the static lookup/miss does the fast-map lane read `trailingParamFingerprints` and `trailingParamRoutes`;
6. mixed requests whose pathname length lies outside the complete static range still skip static pathname materialization before trailing fingerprint matching;
7. legacy or prebuilt tables without range metadata conservatively retain canonical exact-static lookup;
8. trailing fingerprint matching, collision fallback, ALL semantics, generic routing, registration metadata, and retained-memory representation are otherwise unchanged from CP4-D.

The optimization is intentionally an ordering change, not a semantic shortcut. Exact static precedence remains mandatory whenever an exact static route can exist.

## Frozen cells

The cell set and worker semantics are unchanged from CP4-D. Every request timing cell runs the complete variant-specific `Gelis.fetch()` stack.

1. `static-only-raw`: 5,000 static GET routes; guards the pure-static hit path that CP4-E specifically targets.
2. `mixed-static-raw`: 2,500 static + 2,500 trailing-param GET routes; requests an exact static route.
3. `mixed-dynamic-raw`: same mixed topology; dynamic pathname length lies outside the installed static range.
4. `mixed-dynamic-json`: same mixed length-miss topology returning JSON.
5. `mixed-same-length-dynamic-raw`: static and dynamic request lengths are deliberately equal, forcing canonical exact-static precedence lookup.
6. `trailing-dynamic-raw`: 5,000 trailing-param routes and no static routes.
7. `trailing-dynamic-json`: same pure trailing topology returning JSON.
8. `generic-dynamic-raw`: 5,000 generic multi-param routes.
9. `collision-dynamic-raw`: 5,000 same-length trailing prefixes sharing the fingerprint suffix.
10. `all-dynamic-raw`: 5,000 ALL trailing-param routes requested with PATCH.
11. `static-registration`: registers 5,000 static routes into a fresh Router.
12. `static-memory`: measures retained heap delta for 5,000 static routes after forced GC.

Request URLs include query strings where relevant, preserving `pathEnd` coverage.

## Timing protocol

The CP4-D protocol is retained without relaxation:

- 11 mirrored fresh-worker samples per cell pair;
- production/candidate order alternates by sample;
- one measured cell and variant per worker;
- 20,000 warmup operations for nanosecond request cells;
- calibration floor `20 ms`;
- target measured duration approximately `120 ms`;
- registration and retained-memory cells use one isolated measurement per fresh worker after correctness/warmup setup;
- report median, p25, p75, min and max;
- correctness probe must pass before authoritative timing;
- the exact detached production worktree is removed and `git worktree prune` runs after every invocation.

## Frozen gates

All CP4-D limits are retained exactly. No threshold is loosened for CP4-E.

| gate                          | candidate / production limit | rationale                                                     |
| ----------------------------- | ---------------------------: | ------------------------------------------------------------- |
| static-only raw               |                 `<= 1.0200x` | pure-static routing must not materially regress               |
| mixed static raw              |                 `<= 1.0200x` | mixed-table static exact hits must remain practical           |
| mixed dynamic raw guard       |                 `<= 1.0200x` | no material raw regression                                    |
| mixed dynamic JSON guard      |                 `<= 1.0200x` | no material JSON regression                                   |
| mixed dynamic geomean         |                 `<= 0.9800x` | mixed tables must gain materially on average                  |
| mixed same-length dynamic raw |                 `<= 1.0200x` | exact-static precedence fallback must remain near parity      |
| pure trailing dynamic raw     |                 `<= 0.9400x` | retain a substantial real-app raw offset win                  |
| pure trailing dynamic JSON    |                 `<= 0.9500x` | retain a substantial real-app JSON offset win                 |
| generic dynamic raw           |                 `<= 1.0300x` | generic-trie fallback guard                                   |
| forced collision raw          |                 `<= 1.1500x` | collision fallback guard                                      |
| ALL dynamic raw               |                 `<= 1.0500x` | method-semantics fallback guard                               |
| static registration           |                 `<= 1.0500x` | range maintenance must remain cheap                           |
| static retained heap          |                 `<= 1.0500x` | constant-size metadata must remain memory-neutral in practice |

The mixed dynamic geomean is `sqrt(mixedRawRatio * mixedJsonRatio)`.

No gate may be changed after the first valid authoritative local timing run.

## Classification

- Probe failure before timing: fix correctness/harness and classify the unusable run INVALID.
- Valid timing with every frozen gate PASS: CP4-E ACCEPTED and eligible for HTTP revalidation before promotion.
- Valid timing with any frozen gate FAIL: CP4-E FAIL. Do not rerun merely because the result is unfavorable.
