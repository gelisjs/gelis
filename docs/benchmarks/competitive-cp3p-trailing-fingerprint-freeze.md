# Competitive Performance v0.1 — CP3-P trailing-prefix fingerprint viability freeze

## Purpose

CP3-O rejected a compressed character-prefix radix matcher: full JavaScript character traversal was slower than the current trailing-prefix `Map` lookup in every production-relevant gate.

CP3-P tests a narrower structural hypothesis before any production router change:

> Use a fixed-cost integer fingerprint derived from the trailing-prefix boundary and a few nearby character codes. Unique fingerprints avoid allocating/hash-looking-up the complete prefix string; fingerprint collisions fall back to an exact prefix `Map` lookup.

The production source remains frozen at:

`8e43aad09759d60378b3fc174292850057ccfba3`

No `src/**` changes are allowed in this phase.

## Candidate mechanics

For a trailing-parameter request:

1. exact static route lookup remains first;
2. find the final slash with `lastIndexOf`;
3. compute a fixed-cost integer key from prefix length plus four character codes immediately before the trailing slash;
4. look up that integer in `Map<number, ...>`;
5. for a unique fingerprint, verify exact prefix length and `pathname.startsWith(prefix)` before accepting;
6. for a collided fingerprint, create the prefix substring and use an exact `Map<string, ...>` fallback;
7. materialize/decode the final parameter exactly as production semantics require.

This is not a probabilistic router: a fingerprint hit is never sufficient without exact verification.

## Correctness scope

The benchmark-local candidate must preserve:

- exact static precedence;
- one final path parameter;
- arbitrary final parameter names;
- method isolation;
- percent decoding compatible with production `decodeParam` behavior;
- duplicate trailing-prefix rejection;
- exact verification after a unique fingerprint hit;
- exact fallback behavior when multiple prefixes share a fingerprint.

Generic multi-param routes remain outside this prototype and would continue to use the production generic trie if this structure later becomes a production candidate.

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
2. fingerprint candidate, stable pathname
3. current trailing matcher, request-derived pathname
4. fingerprint candidate, request-derived pathname
5. current string pipeline
6. fingerprint string pipeline
7. current JSON pipeline
8. fingerprint JSON pipeline
9. current mixed static request
10. fingerprint mixed static request
11. current mixed dynamic request
12. fingerprint mixed dynamic request
13. current forced-collision request
14. fingerprint forced-collision request

The mixed topology contains `2,500` exact static routes and `2,500` trailing-parameter routes. The forced-collision topology intentionally gives all `5,000` trailing prefixes the same fingerprint key shape so the candidate must exercise its exact string-map fallback.

## Frozen viability gates

These limits are fixed before local timing:

| gate | candidate/current limit | rationale |
| --- | ---: | --- |
| request-derived dynamic matcher | `<= 0.90x` | added indexing complexity must buy at least a material common-path routing win |
| string/JSON pipeline geomean | `<= 0.98x` | the lookup win must survive response construction |
| mixed dynamic request | `<= 0.93x` | benefit must survive a realistic static+dynamic table |
| mixed static request | `<= 1.02x` | dynamic optimization must not tax exact static hits materially |
| forced-collision fallback | `<= 1.15x` | adversarial fingerprint collisions must remain bounded and exact |

The stable-path ratio is diagnostic only.

All five frozen gates must pass to justify engineering a production candidate from this structure.

## Interpretation rules

- A valid unfavorable result is preserved and not rerun merely because a gate fails.
- PASS means only that the fingerprint structure is worth production-candidate engineering; it does not promote code into `src/**`.
- FAIL rejects this exact fixed-fingerprint structure under these thresholds.
- Registration cost, memory, generic-trie coexistence, `matchingMethods`, HTTP behavior, route-scale behavior, and complete production correctness remain mandatory before any later promotion.
