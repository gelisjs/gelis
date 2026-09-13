# Competitive Performance v0.1 — CP4-B production URL-offset acceptance freeze

## Purpose

CP4-B tests whether the CP4-A full-request-URL offset idea survives a production-shaped `Gelis.fetch()` implementation while preserving exact static precedence, ALL semantics, generic dynamic fallback, collision exactness, query bounding, parameter decoding, AOT/prebuilt compatibility, and custom-router fallback.

This is an acceptance gate for the frozen candidate source, not a decomposition-only run.

## Frozen identities

- Previous production source: `af4e5102046def1b163435333563b8d08f919bf5`
- CP4-B candidate source: `ca7543b46ad68b89a9d2b10d29e052993b216758`
- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- Routes per workload: `5,000`
- Samples: `11` mirrored fresh-worker pairs per cell pair

## Candidate shape

The candidate adds an optional internal `matchRequestUrl(method, url)` path to the built-in Router and lets `Gelis.fetch()` use it when available.

The production-shaped implementation must preserve:

1. exact static-route precedence before dynamic routing;
2. exact-method precedence before the ALL pseudo-method;
3. implicit HEAD, automatic OPTIONS, 404 and 405 behavior;
4. generic multi-param trie fallback;
5. legacy/prebuilt trailing-route compatibility;
6. forced fingerprint collision exactness;
7. query-string exclusion from pathname and parameter values;
8. encoded parameter decoding;
9. fallback to ordinary `pathnameFromRequestUrl()` + `match()` for routers without `matchRequestUrl`.

The candidate does not add per-route storage or a new registration-time index. Therefore this gate does not repeat retained-heap or registration-time acceptance cells; those dimensions are structurally unchanged from production.

## Frozen cells

Every timing cell runs the complete variant-specific `Gelis.fetch()` stack. Production workers import `src/app.ts` from a detached exact `af4e510...` worktree; candidate workers import candidate `src/app.ts` from the active tree. This prevents production workers from accidentally using candidate application, router, URL, or response code.

1. `static-only-raw`
   - 5,000 static GET routes.
   - Requests the last route with a query string.
   - Guards overhead on a purely static method table.
2. `mixed-static-raw`
   - 2,500 static + 2,500 trailing-param GET routes.
   - Requests the last static route.
   - Guards static exact-first behavior in a mixed method table.
3. `mixed-dynamic-raw`
   - Same mixed table.
   - Requests the last trailing-param route and returns `params.id` as text.
4. `mixed-dynamic-json`
   - Same mixed topology.
   - Returns `{ id: params.id }`.
5. `trailing-dynamic-raw`
   - 5,000 trailing-param GET routes, no static routes.
   - Returns `params.id` as text.
   - Measures translation of the CP4-A ceiling into real `Gelis.fetch()`.
6. `trailing-dynamic-json`
   - Same pure trailing topology returning `{ id: params.id }`.
7. `generic-dynamic-raw`
   - 5,000 generic multi-param routes `/g/<index>/:left/x/:right`.
   - Returns `params.right`.
   - Guards generic-trie fallback.
8. `collision-dynamic-raw`
   - 5,000 same-length trailing prefixes deliberately sharing the current four-character fingerprint suffix.
   - Requests the final route.
   - Guards collision fallback on the full-URL path.
9. `all-dynamic-raw`
   - 5,000 ALL trailing-param routes.
   - Sends a PATCH request to the final route.
   - Guards the exact-method-miss -> ALL URL fallback.

All request URLs include a query string where applicable so the candidate must honor `pathEnd` rather than accidentally including the query in matching or params.

## Timing protocol

For each cell pair:

- 11 mirrored fresh-worker samples;
- production/candidate order alternates by sample;
- one measured cell and one variant per worker;
- 20,000 warmup operations;
- calibration floor: 20 ms;
- target measured duration: 120 ms;
- report median, p25, p75, min and max;
- correctness probe must pass before authoritative timing;
- exact detached production worktree is removed and `git worktree prune` is run after every acceptance invocation.

## Frozen gates

All gates are required.

| gate                       | candidate / production limit | rationale                                                 |
| -------------------------- | ---------------------------: | --------------------------------------------------------- |
| static-only raw            |                 `<= 1.0200x` | no material regression on pure static routing             |
| mixed static raw           |                 `<= 1.0200x` | preserve exact static-first performance in mixed tables   |
| mixed dynamic raw guard    |                 `<= 1.0200x` | no material raw regression                                |
| mixed dynamic JSON guard   |                 `<= 1.0200x` | no material JSON regression                               |
| mixed dynamic geomean      |                 `<= 0.9800x` | mixed tables must gain materially on average              |
| pure trailing dynamic raw  |                 `<= 0.9400x` | CP4-A must translate into a substantial real-app raw win  |
| pure trailing dynamic JSON |                 `<= 0.9500x` | CP4-A must translate into a substantial real-app JSON win |
| generic dynamic raw        |                 `<= 1.0300x` | generic-trie fallback guard                               |
| forced collision raw       |                 `<= 1.1500x` | collision fallback guard                                  |
| ALL dynamic raw            |                 `<= 1.0500x` | method-semantics fallback guard                           |

The mixed-dynamic geomean is `sqrt(mixedRawRatio * mixedJsonRatio)`.

No gate may be changed after the first valid authoritative local timing run.

## Classification

- Probe failure before timing: fix harness/correctness and classify the unusable run INVALID.
- Valid timing with every frozen gate PASS: CP4-B ACCEPTED and eligible for HTTP revalidation before promotion.
- Valid timing with any frozen gate FAIL: CP4-B FAIL. Do not rerun merely because the result is unfavorable.
