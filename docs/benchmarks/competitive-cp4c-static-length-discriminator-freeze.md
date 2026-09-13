# Competitive Performance v0.1 — CP4-C static path-length discriminator decomposition freeze

## Purpose

CP4-C decomposes the two blockers from authoritative CP4-B without changing the accepted production source.

CP4-B proved that full-request-URL trailing matching is materially faster when a method table has no static routes, but failed because:

1. mixed static + trailing tables materialized the pathname before dynamic matching in order to preserve exact static precedence, eliminating the offset win; and
2. generic dynamic tables paid the full-URL parser and then still materialized pathname for the generic trie.

CP4-C is a diagnostic source experiment, not a promotion candidate and not an acceptance gate.

## Frozen identities

- Previous production source: `af4e5102046def1b163435333563b8d08f919bf5`
- Rejected CP4-B source: `ca7543b46ad68b89a9d2b10d29e052993b216758`
- CP4-C diagnostic source: `f6a1345ca5bee07870fbaa3d42321ed84439bf67`
- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- Routes per workload: `5,000`
- Samples: `11` rotated fresh-worker samples per variant per cell

## Diagnostic source shape

Relative to CP4-B, CP4-C changes only `src/runtime/router.ts`.

### Static path-length discriminator

Runtime-created method tables maintain an optional `Set<number>` containing installed exact-static pathname lengths.

For a request in trailing fast-map mode:

- if no exact-static route has the same pathname length, exact static matching is impossible and the router skips pathname substring materialization;
- if a matching static length exists, the router materializes pathname and performs the canonical exact `Map` lookup before dynamic matching;
- if the optional metadata is absent, as may occur for legacy/prebuilt method tables, the router conservatively takes the CP4-B exact-static slice path.

This is a negative discriminator only. It does not claim a static match and cannot override exact static precedence.

### Generic early fallback

If the method table already uses the generic dynamic trie, CP4-C immediately uses the established `pathnameFromRequestUrl(url)` + `match()` path instead of first paying the CP4-B full-URL offset parser.

## Frozen variants

Every cell is run against three exact source trees:

1. `production` — `af4e510...` in a detached temporary worktree;
2. `cp4b` — `ca7543...` in a detached temporary worktree;
3. `cp4c` — `f6a1345...` from the active tree.

The harness removes both detached worktrees and runs `git worktree prune` after probe or timing, including exceptional exits.

## Frozen cells

1. `static-only-raw`
   - 5,000 exact static GET routes.
   - Measures discriminator overhead on an exact static hit.
2. `mixed-static-raw`
   - 2,500 static + 2,500 trailing-param GET routes.
   - Requests an exact static route.
3. `mixed-dynamic-raw`
   - Same mixed topology.
   - Dynamic request pathname length is absent from the installed static-length set.
   - Returns `params.id` as text.
4. `mixed-dynamic-json`
   - Same length-miss topology returning `{ id: params.id }`.
5. `mixed-same-length-dynamic-raw`
   - Static routes use fixed-length paths `/s/NNNN/abcdefgh`.
   - Dynamic request `/d/NNNN/value-42` has the same pathname length as the static routes.
   - The discriminator therefore must fall through to canonical exact-static substring + `Map` lookup before dynamic matching.
   - This guards against an invalid performance win obtained by bypassing exact static precedence.
6. `trailing-dynamic-raw`
   - 5,000 trailing-param routes and no static routes.
   - Checks that the CP4-B pure-dynamic win remains intact.
7. `trailing-dynamic-json`
   - Same pure trailing topology returning JSON.
8. `generic-dynamic-raw`
   - 5,000 generic multi-param routes.
   - Isolates the generic early-fallback recovery.
9. `static-registration`
   - Registers 5,000 static routes into a fresh Router.
   - Measures added maintenance cost for the discriminator metadata.
10. `static-memory`
    - Measures retained heap delta for a Router containing 5,000 static routes after forced GC.
    - Routes are built before the retained-heap baseline so the metric focuses on router storage.

## Timing protocol

For every cell and each of the three variants:

- `11` fresh-worker samples;
- six rotating/mirrored variant orders are cycled across samples;
- `20,000` warmups for nanosecond operation cells;
- calibration floor `20 ms`;
- target measured duration approximately `120 ms`;
- registration and retained-memory cells use one isolated measurement per fresh worker after a correctness/warmup setup;
- report median, p25, p75, min and max;
- correctness probe must pass before authoritative local timing;
- exact Bun version/revision and frozen source identities are enforced.

## Interpretation targets

CP4-C has **no performance acceptance threshold**. A valid timing run is evidence regardless of direction and must not be repeated merely because the result is unfavorable.

The important comparisons are:

- `CP4-C / CP4-B` on mixed length-miss raw and JSON: discriminator recovery;
- `CP4-C / CP4-B` on mixed same-length raw: cost when the exact-static check remains necessary;
- `CP4-C / CP4-B` on generic raw: generic early-fallback recovery;
- `CP4-C / CP4-B` on static hits: added discriminator lookup overhead;
- `CP4-C / CP4-B` on pure trailing raw/JSON: preservation of the already-proven offset win;
- `CP4-C / CP4-B` on static registration and retained heap: metadata cost.

A later production candidate is justified only if these diagnostics show a useful mixed-table recovery while static, same-length fallback, generic routing, registration, and memory remain practical. CP4-B remains failed regardless of CP4-C results.

## Classification rule

A valid completed timing run is classified:

**CP4-C LOCAL STATIC PATH-LENGTH DISCRIMINATOR: VALID / AUTHORITATIVE / ACCEPTED AS DECOMPOSITION EVIDENCE.**

This classification does not imply promotion or a performance PASS.
