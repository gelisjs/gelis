# Competitive Performance v0.1 — CP4-D static path-length range acceptance freeze

## Purpose

CP4-D tests whether the CP4-C negative static-length discriminator can be translated into a production-shaped candidate with lower metadata and static-hit cost.

CP4-C proved that static-length discrimination restores the full-request-URL offset win for mixed static + trailing-param tables, but its exact `Set<number>` representation added measurable static-hit and registration overhead. CP4-D replaces that exact set with a conservative static-length range while preserving exact static precedence.

This is an acceptance gate for the frozen CP4-D source candidate.

## Frozen identities

- Previous production source: `af4e5102046def1b163435333563b8d08f919bf5`
- CP4-D candidate source: `5d9e5672031ff0ec468052f1d82c55e10b5387d7`
- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- Routes per workload: `5,000`
- Samples: `11` mirrored fresh-worker pairs per cell pair

## Candidate shape

Relative to the accepted production baseline, CP4-D contains the CP4-B full-request-URL trailing matcher plus the following corrections derived from CP4-C:

1. runtime-created method tables maintain only two optional static-path metadata values: minimum and maximum installed static pathname length;
2. if a mixed trailing request pathname length lies outside that complete range, an exact static match is impossible and the router skips pathname substring materialization before trailing fingerprint matching;
3. if the request length lies inside the range, the router still materializes the pathname and performs the canonical exact `Map` lookup before dynamic matching;
4. pure-static method tables bypass the range discriminator and use the direct exact-static path;
5. generic-trie tables immediately use the established materialized-pathname route;
6. legacy or prebuilt method tables without range metadata conservatively perform the exact-static substring + `Map` lookup.

The range is intentionally conservative. A length inside `[min, max]` does not imply that a static route of that exact length exists; it only means the exact-static lookup may not be skipped. This preserves correctness while replacing the CP4-C per-length `Set<number>` with constant-size metadata.

## Frozen cells

Every request timing cell runs the complete variant-specific `Gelis.fetch()` stack.

1. `static-only-raw`
   - 5,000 static GET routes.
   - Guards pure-static overhead after bypassing the discriminator.
2. `mixed-static-raw`
   - 2,500 static + 2,500 trailing-param GET routes.
   - Requests an exact static route.
3. `mixed-dynamic-raw`
   - Same mixed topology.
   - Dynamic request length lies outside the installed static range.
   - Returns `params.id` as text.
4. `mixed-dynamic-json`
   - Same mixed length-miss topology returning `{ id: params.id }`.
5. `mixed-same-length-dynamic-raw`
   - Static and dynamic request path lengths are deliberately equal.
   - The candidate must therefore retain canonical exact-static lookup before dynamic matching.
6. `trailing-dynamic-raw`
   - 5,000 trailing-param routes and no static routes.
   - Guards the already-proven full-URL offset raw win.
7. `trailing-dynamic-json`
   - Same pure trailing topology returning JSON.
8. `generic-dynamic-raw`
   - 5,000 generic multi-param routes.
   - Guards generic-trie fallback.
9. `collision-dynamic-raw`
   - 5,000 same-length trailing prefixes sharing the four-character fingerprint suffix.
   - Guards collision exactness.
10. `all-dynamic-raw`
    - 5,000 ALL trailing-param routes requested with PATCH.
    - Guards exact-method miss -> ALL semantics.
11. `static-registration`
    - Registers 5,000 static routes into a fresh Router.
    - Measures range-maintenance registration cost.
12. `static-memory`
    - Measures retained heap delta for 5,000 static routes after forced GC.
    - Route objects are built before the baseline measurement.

Request URLs include query strings where relevant, so `pathEnd` handling remains exercised.

## Timing protocol

For each cell pair:

- 11 mirrored fresh-worker samples;
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

All gates are required.

| gate | candidate / production limit | rationale |
| --- | ---: | --- |
| static-only raw | `<= 1.0200x` | pure-static routing must not materially regress |
| mixed static raw | `<= 1.0200x` | mixed-table static exact hits must remain practical |
| mixed dynamic raw guard | `<= 1.0200x` | no material raw regression |
| mixed dynamic JSON guard | `<= 1.0200x` | no material JSON regression |
| mixed dynamic geomean | `<= 0.9800x` | mixed tables must gain materially on average |
| mixed same-length dynamic raw | `<= 1.0200x` | exact-static precedence fallback must remain near parity |
| pure trailing dynamic raw | `<= 0.9400x` | retain a substantial real-app raw offset win |
| pure trailing dynamic JSON | `<= 0.9500x` | retain a substantial real-app JSON offset win |
| generic dynamic raw | `<= 1.0300x` | generic-trie fallback guard |
| forced collision raw | `<= 1.1500x` | collision fallback guard |
| ALL dynamic raw | `<= 1.0500x` | method-semantics fallback guard |
| static registration | `<= 1.0500x` | constant-size range maintenance must stay cheap |
| static retained heap | `<= 1.0500x` | new method-table metadata must stay memory-neutral in practice |

The mixed dynamic geomean is `sqrt(mixedRawRatio * mixedJsonRatio)`.

No gate may be changed after the first valid authoritative local timing run.

## Classification

- Probe failure before timing: fix correctness/harness and classify the unusable run INVALID.
- Valid timing with every frozen gate PASS: CP4-D ACCEPTED and eligible for HTTP revalidation before promotion.
- Valid timing with any frozen gate FAIL: CP4-D FAIL. Do not rerun merely because the result is unfavorable.
