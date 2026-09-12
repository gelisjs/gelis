# Competitive Performance v0.1 — CP3-R production-shape fingerprint freeze

## Purpose

CP3-P showed a material request-derived dynamic win from a fixed-cost trailing-prefix fingerprint, but its alternate router class regressed mixed static hits. CP3-Q then showed that when current and fingerprint variants share one identical static lookup path, fingerprint adds effectively no static-hit cost (`1.0012x`) and retains the dynamic/pipeline win. CP3-Q nevertheless failed because its shared-current abstraction was about `12.9%` slower than the actual production router on static hits.

CP3-R removes that attribution weakness completely: the baseline is the exact frozen production source checked out into a temporary detached Git worktree, while the candidate is the actual production-shaped `src/runtime/router.ts` on the CP3-R branch.

Frozen production source:

`8e43aad09759d60378b3fc174292850057ccfba3`

Frozen candidate source:

`bda7c0668c38b45bb37afaea72f0b923eb37d64b`

No further `src/**` changes are allowed after the candidate source SHA above.

## Candidate mechanics

The candidate keeps the canonical `trailingParamRoutes: Map<string, ...>` for compatibility, migration, AOT/snapshot construction, and fallback semantics. It adds an optional fingerprint sidecar populated by ordinary route registration.

The exact-static lookup remains first and unchanged. Fingerprint work executes only after an exact-static miss.

For the trailing-parameter fast path:

1. find the final slash;
2. compute a fixed-cost integer fingerprint from prefix length plus four nearby character codes;
3. look up the integer key;
4. on a unique key, verify exact prefix length and `pathname.startsWith(prefix)`;
5. on a collided key, fall back to an exact `Map<string, ...>` lookup;
6. slice/decode the final parameter exactly as production does.

If a method table was created by an AOT/snapshot path without a fingerprint sidecar, routing falls back to the canonical trailing-prefix string `Map`.

Generic multi-parameter routes remain on the existing production trie. Migration remains canonical-Map driven and releases the fingerprint sidecar when generic-trie mode takes over.

## Exact baseline methodology

The acceptance harness must create one temporary detached worktree from production SHA `8e43aad09759d60378b3fc174292850057ccfba3` outside the active repository directory.

Fresh worker processes dynamically import:

- baseline router: `<temporary-production-worktree>/src/runtime/router.ts`;
- candidate router: active CP3-R branch `src/runtime/router.ts`.

This means the baseline is not a reimplementation, clone, or benchmark-local router abstraction. It is the exact production router source.

The acceptance harness must remove the exact temporary worktree in `finally`, run `git worktree prune`, and must not leave benchmark worktrees behind after probe, successful timing, or failure.

## Correctness scope

Before timing, baseline and candidate probes must verify:

- exact static precedence over a trailing parameter;
- trailing parameter extraction;
- arbitrary final parameter names;
- percent decoding;
- method isolation;
- duplicate trailing-prefix rejection;
- generic multi-parameter routing;
- migration from trailing-only mode to generic trie mode;
- `matchingMethods()` behavior;
- transactional `registerBatchAtomic()` success and duplicate rollback behavior;
- forced fingerprint-collision topology remains exact;
- string and JSON response pipeline correctness.

The repository `bun run check` must also pass on the frozen candidate source, covering package/type/runtime/AOT integration.

## Protocol

- Runtime: Bun `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- Routes: `5,000`
- Samples: `11` mirrored fresh-worker samples per baseline/candidate pair
- Pair order alternates baseline-first and candidate-first
- Warmup for hot-path cells: `20,000` operations per worker
- Timed target for hot-path cells: approximately `120 ms` after calibration
- Mixed topology: `2,500` exact static routes + `2,500` trailing-parameter routes
- Worktree must be clean before the harness creates its temporary baseline worktree
- `src/**` must be byte-equivalent to frozen candidate SHA `bda7c0668c38b45bb37afaea72f0b923eb37d64b`

## Timed pairs

1. mixed static request
2. mixed trailing-dynamic request
3. generic multi-parameter dynamic request
4. trailing string pipeline
5. trailing JSON pipeline
6. forced fingerprint-collision request
7. registration of `5,000` trailing-parameter routes
8. retained router heap delta after registering `5,000` trailing-parameter routes

Registration timing excludes construction of the route-record array. Memory measurement keeps the same prebuilt route array alive before and after router construction, invokes `Bun.gc(true)` when available, and measures `process.memoryUsage().heapUsed` delta so route-record payload memory is not attributed to the router index.

## Frozen gates

These limits are fixed before local timing:

| gate                                | candidate / production limit | purpose                                                             |
| ----------------------------------- | ---------------------------: | ------------------------------------------------------------------- |
| mixed static request                |                   `<= 1.02x` | dynamic optimization must preserve exact-static hot path            |
| mixed trailing-dynamic request      |                   `<= 0.90x` | dynamic win must remain material in actual production-shaped source |
| generic multi-param dynamic request |                   `<= 1.03x` | trailing optimization must not materially regress the generic trie  |
| string/JSON pipeline geomean        |                   `<= 0.98x` | routing win must survive response construction                      |
| forced-collision fallback           |                   `<= 1.15x` | exact collision handling must remain bounded                        |
| trailing-route registration         |                   `<= 1.75x` | startup/registration overhead must remain bounded                   |
| retained router heap delta          |                   `<= 1.50x` | sidecar memory overhead must remain bounded                         |

All seven gates must pass for CP3-R to justify HTTP revalidation of this candidate. Passing CP3-R does not promote the source.

## Interpretation rules

- A valid unfavorable result is preserved and not rerun merely because a gate fails.
- A probe/harness/worktree failure before valid timing is `INVALID`, not a performance FAIL.
- PASS permits the next phase to perform HTTP competitive revalidation of the exact candidate source.
- FAIL rejects this exact candidate under the frozen gates; favorable sub-results may still guide a narrower redesign.
- No universal framework-performance claim follows from this direct-runtime gate.
