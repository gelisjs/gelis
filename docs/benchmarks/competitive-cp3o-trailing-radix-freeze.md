# Competitive Performance v0.1 — CP3-O trailing-prefix radix viability freeze

## Purpose

CP3-N showed that the dominant remaining dynamic penalty is already present at the request-derived pathname plus router-match boundary. Stable handler invocation preserves essentially the same dynamic/static gap as request-router, while reading `params.id` itself adds only a few nanoseconds.

CP3-O therefore tests one structural hypothesis before any production router rewrite:

> Replace the trailing-parameter prefix `Map<string, ...>` lookup with a compressed character-prefix radix matcher that does not allocate/hash a fresh prefix substring during matching.

The production source remains frozen at:

`8e43aad09759d60378b3fc174292850057ccfba3`

No `src/**` changes are allowed in this phase.

## Candidate scope

The benchmark-local candidate intentionally supports only the topology currently handled by Gelis' trailing-parameter fast path:

- exact static routes,
- one final path parameter,
- static precedence over the trailing parameter,
- per-method isolation,
- arbitrary final parameter names,
- percent decoding compatible with production `decodeParam`,
- duplicate trailing-prefix rejection.

Generic multi-segment/multi-param dynamic routes remain out of scope. If the candidate is viable, production integration must preserve the existing generic trie fallback unchanged unless later evidence justifies a broader redesign.

## Protocol

- Runtime: Bun `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- Routes: `5,000`
- Samples: `11` mirrored fresh-worker pairs per current/candidate cell pair
- Pair order alternates current-first and candidate-first
- Warmup: `20,000` operations per worker
- Timed target: approximately `120 ms` per worker after calibration
- Production source guard: `src/**` must be byte-equivalent to the frozen production source above
- Worktree must be clean

## Timed pairs

1. current trailing matcher, stable pathname
2. radix candidate, stable pathname
3. current trailing matcher, request-derived pathname
4. radix candidate, request-derived pathname
5. current string pipeline
6. radix string pipeline
7. current JSON pipeline
8. radix JSON pipeline
9. current mixed static request
10. radix mixed static request
11. current mixed dynamic request
12. radix mixed dynamic request

The mixed topology contains `2,500` exact static routes and `2,500` trailing-parameter routes, for `5,000` total routes.

## Frozen viability gates

These thresholds are frozen before local timing:

| gate                            | candidate/current limit | rationale                                                                    |
| ------------------------------- | ----------------------: | ---------------------------------------------------------------------------- |
| request-derived dynamic matcher |              `<= 0.85x` | structural complexity must buy at least a material dynamic lookup win        |
| string/JSON pipeline geomean    |              `<= 0.97x` | the matcher win must survive into production-shaped response pipelines       |
| mixed dynamic request           |              `<= 0.90x` | benefit must survive a realistic static+dynamic method table                 |
| mixed static request            |              `<= 1.02x` | retaining static precedence must not materially regress exact static routing |

The stable-path ratio is diagnostic only, because Gelis' production request path is derived from `Request.url`; it is not a viability gate.

All four frozen gates must pass to justify building a production candidate from this structure.

## Interpretation rules

- A valid unfavorable result is preserved; the harness is not rerun merely because a gate fails.
- A PASS means only that the compressed-prefix structure is worth production-candidate engineering. It does not promote any code into `src/**`.
- Registration cost, memory footprint, generic-trie coexistence, matchingMethods, HTTP behavior, type behavior, and full production correctness remain mandatory gates before any later promotion.
- A FAIL means this exact prototype does not justify production complexity under the frozen criteria. It does not prove that all radix/full-URL routing designs are inferior.
