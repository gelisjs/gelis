# Competitive Performance v0.1 — CP4-F method-table kind acceptance freeze

## Purpose

CP4-F tests whether the remaining CP4-E static regression comes from making every runtime-created fast-map table pay the same static/range dispatch shape.

CP4-E proved that deferring trailing metadata reads helps but is insufficient: `static-only raw` remained `1.0368x` and `mixed static raw` `1.0222x`, while the mixed dynamic geomean, trailing lanes, registration, and retained heap all passed their frozen gates.

CP4-F introduces a registration-time fast-map kind for runtime-created method tables so capabilities that are not installed do not tax unrelated hot paths.

## Frozen identities

- Previous production source: `af4e5102046def1b163435333563b8d08f919bf5`
- CP4-F candidate source: `1e19a185eafbe271125eb73fc9f389413345ea8b`
- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- Routes per workload: `5,000`
- Samples: `11` mirrored fresh-worker pairs per cell pair

## Candidate shape

Relative to CP4-E, CP4-F changes only runtime-created fast-map method-table specialization in `src/runtime/router.ts`:

1. runtime-created method tables carry one small `fastMapKind` value: static-only, trailing-only, or mixed static+trailing;
2. pure-static tables use the CP4-B-shaped exact pathname slice + static `Map` lookup and return immediately on miss;
3. pure-trailing tables skip static discrimination entirely;
4. mixed static+trailing tables retain CP4-E's frozen min/max static pathname-length range and exact static precedence;
5. generic dynamic tables still take the established early pathname/trie fallback before URL-offset parsing;
6. legacy or prebuilt tables without `fastMapKind` conservatively retain canonical exact-static lookup semantics;
7. trailing fingerprint matching, collision fallback, ALL behavior, response normalization, registration metadata, and retained-memory representation are otherwise unchanged.

The optimization is a registration-time specialization of existing semantics, not a shortcut. Exact static precedence remains mandatory whenever an exact static route can exist.

## Frozen cells

The cell set and worker semantics are unchanged from CP4-E:

1. `static-only-raw`
2. `mixed-static-raw`
3. `mixed-dynamic-raw`
4. `mixed-dynamic-json`
5. `mixed-same-length-dynamic-raw`
6. `trailing-dynamic-raw`
7. `trailing-dynamic-json`
8. `generic-dynamic-raw`
9. `collision-dynamic-raw`
10. `all-dynamic-raw`
11. `static-registration`
12. `static-memory`

## Frozen gates

All CP4-E thresholds are inherited unchanged. No threshold may be edited after the first authoritative timed CP4-F run.

| gate                          | candidate / production limit |
| ----------------------------- | ---------------------------: |
| static-only raw               |                 `<= 1.0200x` |
| mixed static raw              |                 `<= 1.0200x` |
| mixed dynamic raw guard       |                 `<= 1.0200x` |
| mixed dynamic JSON guard      |                 `<= 1.0200x` |
| mixed dynamic geomean         |                 `<= 0.9800x` |
| mixed same-length dynamic raw |                 `<= 1.0200x` |
| pure trailing dynamic raw     |                 `<= 0.9400x` |
| pure trailing dynamic JSON    |                 `<= 0.9500x` |
| generic dynamic raw           |                 `<= 1.0300x` |
| forced collision raw          |                 `<= 1.1500x` |
| ALL dynamic raw               |                 `<= 1.0500x` |
| static registration           |                 `<= 1.0500x` |
| static retained heap          |                 `<= 1.0500x` |

## Acceptance protocol

1. Exact Bun version/revision, source identities, route count, clean worktree, and frozen-source ancestry are preflight requirements.
2. Full repository Quality must pass on the final clean harness HEAD.
3. Correctness probe must pass for all 24 production/candidate cells before local timing.
4. CI timing is not authoritative. The user's local Intel Core i5-10500H machine is authoritative for performance acceptance.
5. The first valid local timed run is evidence. No selective rerun, threshold edit, workload edit, or candidate source edit is allowed after seeing the result.
6. Promotion requires every frozen gate to pass.
