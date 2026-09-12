# Competitive Performance v0.1 — CP3-Q static-path attribution freeze

## Purpose

CP3-P showed that the fixed-cost trailing-prefix fingerprint is materially faster on request-derived dynamic routing, survives string/JSON pipelines, and keeps forced collisions bounded, but the benchmark-local alternate router regressed mixed static hits by about 7.9%. Production `Router.match()` returns immediately on an exact static hit before any trailing-parameter work.

CP3-Q therefore tests a narrower attribution hypothesis before any production source change:

> If current and fingerprint routing share one identical static fast path and diverge only after an exact-static miss, the fingerprint should retain its dynamic win without taxing static hits.

The production source remains frozen at:

`8e43aad09759d60378b3fc174292850057ccfba3`

No `src/**` changes are allowed in this phase.

## Shared-router mechanics

The benchmark-local shared router stores, per method:

- one exact-static `Map<string, RuntimeRouteRecord>`;
- one current trailing-prefix `Map<string, ...>`;
- one fingerprint trailing index.

Both variants invoke the same `match(mode, method, pathname)` function. The function performs method lookup and exact static lookup once. On a static hit it returns immediately, before inspecting `mode`. Only after a static miss does it branch to either the current `slice(prefix) + Map<string>` algorithm or the fingerprint algorithm.

This intentionally gives both variants the same class, method-table shape, static map, static lookup code, and sidecar memory footprint. It is an attribution harness, not a production design.

## Correctness scope

The shared router must preserve:

- exact static precedence;
- one final path parameter;
- arbitrary final parameter names;
- method isolation;
- percent decoding compatible with production `decodeParam` behavior;
- duplicate trailing-prefix rejection;
- exact verification after a unique fingerprint hit;
- exact string-map fallback for fingerprint collisions.

Generic multi-param routes remain outside this experiment.

## Protocol

- Runtime: Bun `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- Routes: `5,000`
- Samples: `11` mirrored fresh-worker pairs per comparison
- Pair order alternates first/second implementation
- Warmup: `20,000` operations per worker
- Timed target: approximately `120 ms` per worker after calibration
- Production source guard: `src/**` must be byte-equivalent to the frozen production source above
- Worktree must be clean

## Timed cells

1. production mixed static request
2. shared-current mixed static request
3. shared-fingerprint mixed static request
4. production mixed dynamic request
5. shared-current mixed dynamic request
6. shared-fingerprint mixed dynamic request
7. shared-current string pipeline
8. shared-fingerprint string pipeline
9. shared-current JSON pipeline
10. shared-fingerprint JSON pipeline
11. shared-current forced-collision request
12. shared-fingerprint forced-collision request

The mixed topology contains `2,500` exact static routes and `2,500` trailing-parameter routes. The forced-collision topology intentionally maps all `5,000` trailing prefixes to the same fingerprint key shape.

## Frozen attribution gates

These limits are fixed before local timing:

| gate                                         |            limit | rationale                                                                              |
| -------------------------------------------- | ---------------: | -------------------------------------------------------------------------------------- |
| shared fingerprint/current static            |       `<= 1.02x` | with one identical static path, fingerprint sidecar must not materially tax exact hits |
| shared fingerprint/current dynamic           |       `<= 0.90x` | the common request-derived dynamic win must remain material                            |
| shared string/JSON pipeline geomean          |       `<= 0.98x` | dynamic lookup gain must survive response construction                                 |
| shared forced-collision fallback             |       `<= 1.15x` | collision correctness must remain bounded                                              |
| shared-current / production static fidelity  | `0.90x .. 1.10x` | attribution harness must remain close to production static cost                        |
| shared-current / production dynamic fidelity | `0.90x .. 1.10x` | attribution harness must remain close to production dynamic cost                       |

All six gates must pass before CP3-Q can justify engineering a real production fingerprint candidate.

## Interpretation rules

- A valid unfavorable result is preserved and not rerun because a gate fails.
- PASS does not promote code. It only supports the attribution that CP3-P's static regression came from the alternate benchmark router shape rather than work intrinsically required by fingerprint lookup.
- FAIL means a production candidate is not justified from this evidence; the remaining cost must be decomposed further.
- A later production candidate must still pass complete router correctness, `matchingMethods`, generic-trie coexistence, registration/memory checks, route-scale checks, direct runtime benchmarks, HTTP revalidation, and type/package quality gates.
