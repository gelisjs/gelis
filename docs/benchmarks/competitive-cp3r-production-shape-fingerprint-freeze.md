# Competitive Performance v0.1 — CP3-R production-shape fingerprint freeze

## Purpose

CP3-P showed a material request-derived dynamic win from a fixed-cost trailing-prefix fingerprint, but its alternate router class regressed mixed static hits. CP3-Q then showed that when current and fingerprint variants share one identical static lookup path, fingerprint adds effectively no static-hit cost (`1.0012x`) and retains the dynamic/pipeline win. CP3-Q nevertheless failed because its shared-current abstraction was about `12.9%` slower than the actual production router on static hits.

CP3-R removes that attribution weakness by comparing the actual production `Router` with a benchmark-local baseline clone whose `router.ts` source is copied byte-for-byte from the frozen production source, plus a candidate clone created by the smallest practical trailing-fingerprint changes to that production-shape implementation.

The frozen production source is:

`8e43aad09759d60378b3fc174292850057ccfba3`

No `src/**` changes are allowed in CP3-R.

## Source-shape rules

The CP3-R preparation step must create:

- `bench/runtime/cp3r/baseline/router.ts`: byte-for-byte copy of frozen `src/runtime/router.ts`;
- `bench/runtime/cp3r/baseline/types.ts`: a type re-export shim only, so the baseline router implementation itself is unchanged;
- `bench/runtime/cp3r/candidate/router.ts`: production-shape clone differing only where necessary to replace the trailing-prefix string `Map` fast path with the fingerprint index;
- `bench/runtime/cp3r/candidate/types.ts`: the same type re-export shim.

The candidate must keep the exact-static lookup block logically and textually unchanged from production. Fingerprint work may execute only after an exact-static miss.

The fingerprint candidate must remain exact, not probabilistic:

1. find the final slash;
2. compute the frozen fixed-cost integer fingerprint from prefix length plus four nearby character codes;
3. look up the integer key;
4. on a unique key, verify prefix length and `pathname.startsWith(prefix)`;
5. on a collided key, fall back to an exact `Map<string, ...>`;
6. slice/decode the final parameter exactly as production does.

Generic multi-parameter routes remain on the existing production trie semantics.

## Correctness scope

Before timing, the probe must verify for production, baseline clone, and candidate where applicable:

- exact static precedence over a trailing parameter;
- trailing parameter extraction;
- arbitrary final parameter names;
- percent decoding;
- method isolation;
- duplicate trailing-prefix rejection;
- generic multi-parameter routing;
- migration from trailing-only mode to generic trie mode;
- `matchingMethods()` behavior;
- batch registration behavior used by `registerBatchAtomic()`;
- forced fingerprint collision exactness.

The baseline clone must also be source-identical to frozen production `router.ts` apart from the adjacent type-shim resolution environment.

## Protocol

- Runtime: Bun `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- Routes: `5,000`
- Samples: `11` fresh-worker samples per cell with rotated order
- Warmup: `20,000` operations per worker
- Timed target: approximately `120 ms` after calibration
- Worktree must be clean
- `src/**` must be byte-equivalent to frozen production source `8e43aad09759d60378b3fc174292850057ccfba3`

## Timed cells

Mixed topology contains `2,500` exact static and `2,500` trailing-parameter routes.

1. production mixed static request
2. baseline-clone mixed static request
3. candidate mixed static request
4. production mixed dynamic request
5. baseline-clone mixed dynamic request
6. candidate mixed dynamic request
7. baseline-clone string pipeline
8. candidate string pipeline
9. baseline-clone JSON pipeline
10. candidate JSON pipeline
11. baseline-clone forced-collision request
12. candidate forced-collision request

## Frozen gates

These limits are fixed before local timing:

| gate                                         |            limit | purpose                                                                    |
| -------------------------------------------- | ---------------: | -------------------------------------------------------------------------- |
| baseline clone / production static fidelity  | `0.95x .. 1.05x` | copied production source must faithfully reproduce production static cost  |
| baseline clone / production dynamic fidelity | `0.95x .. 1.05x` | copied production source must faithfully reproduce production dynamic cost |
| candidate / baseline static                  |       `<= 1.02x` | fingerprint candidate must preserve static hot path                        |
| candidate / baseline dynamic                 |       `<= 0.90x` | dynamic win must remain material in production-shaped code                 |
| candidate string/JSON pipeline geomean       |       `<= 0.98x` | routing gain must survive response construction                            |
| candidate forced-collision fallback          |       `<= 1.15x` | exact collision handling must remain bounded                               |

All six gates must pass before engineering the fingerprint mechanism into actual `src/runtime/router.ts` is justified.

## Interpretation rules

- A valid unfavorable result is retained and not rerun because a gate fails.
- If either baseline-clone fidelity gate fails, performance comparisons against the candidate are not sufficient to justify a production source candidate even if candidate ratios are favorable.
- PASS does not promote any code. It only permits the next phase to implement the mechanism in actual production source and run full correctness, registration/memory, runtime, HTTP, package/type, and competitive revalidation gates.
- FAIL means the source-shape hypothesis is not sufficiently established and the remaining discrepancy must be decomposed further.
