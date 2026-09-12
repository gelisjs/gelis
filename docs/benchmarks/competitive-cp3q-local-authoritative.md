# Competitive Performance v0.1 — CP3-Q local authoritative result

## Classification

**CP3-Q STATIC-PATH ATTRIBUTION: VALID / AUTHORITATIVE / FAIL.**

This is a valid unfavorable result under the frozen all-gates-must-pass rule. The run completed normally and must not be rerun merely because one fidelity gate failed.

## Identity

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- CPU: Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz
- Harness SHA: `ba026ad9eae94f0823a104818b0fe2ccf9263a7d`
- Frozen production source: `8e43aad09759d60378b3fc174292850057ccfba3`
- Routes: `5,000`
- Samples: `11` fresh-worker samples per cell with rotated group order

## Timed cells

| cell | median ns/op | p25 | p75 | min | max |
| --- | ---: | ---: | ---: | ---: | ---: |
| production-mixed-static-request | 101.7 | 99.8 | 103.8 | 96.1 | 106.8 |
| shared-current-mixed-static-request | 114.8 | 113.5 | 115.0 | 111.6 | 119.0 |
| shared-fingerprint-mixed-static-request | 114.9 | 111.9 | 117.7 | 111.0 | 119.5 |
| production-mixed-dynamic-request | 216.8 | 211.0 | 220.3 | 209.6 | 288.8 |
| shared-current-mixed-dynamic-request | 214.5 | 213.8 | 218.7 | 209.3 | 225.9 |
| shared-fingerprint-mixed-dynamic-request | 189.3 | 185.7 | 192.8 | 184.2 | 194.4 |
| shared-current-pipeline-string | 810.8 | 791.0 | 831.4 | 777.5 | 841.4 |
| shared-fingerprint-pipeline-string | 781.6 | 768.2 | 799.0 | 756.8 | 920.8 |
| shared-current-pipeline-json | 609.5 | 595.7 | 613.6 | 583.2 | 627.7 |
| shared-fingerprint-pipeline-json | 584.8 | 579.7 | 596.5 | 563.8 | 632.9 |
| shared-current-collision-request | 233.8 | 233.5 | 236.2 | 228.8 | 244.8 |
| shared-fingerprint-collision-request | 263.8 | 259.1 | 268.2 | 251.7 | 272.5 |

## Derived ratios

| comparison | ratio |
| --- | ---: |
| shared fingerprint/current static | `1.0012x` |
| shared fingerprint/current dynamic | `0.8828x` |
| shared fingerprint/current string pipeline | `0.9640x` |
| shared fingerprint/current JSON pipeline | `0.9594x` |
| shared pipeline geomean | `0.9617x` |
| shared forced-collision fallback | `1.1283x` |
| shared-current / production static fidelity | `1.1286x` |
| shared-current / production dynamic fidelity | `0.9893x` |

## Frozen gates

| gate | value | limit | result |
| --- | ---: | ---: | --- |
| shared fingerprint/current static | `1.0012x` | `<= 1.0200x` | PASS |
| shared fingerprint/current dynamic | `0.8828x` | `<= 0.9000x` | PASS |
| shared pipeline geomean | `0.9617x` | `<= 0.9800x` | PASS |
| shared forced-collision fallback | `1.1283x` | `<= 1.1500x` | PASS |
| shared-current / production static fidelity | `1.1286x` | `0.9000x .. 1.1000x` | FAIL |
| shared-current / production dynamic fidelity | `0.9893x` | `0.9000x .. 1.1000x` | PASS |

Five of six frozen attribution gates passed. Because the protocol requires all six, CP3-Q is classified FAIL.

## Conclusions

1. With one identical shared static lookup path, the fingerprint sidecar does not materially tax exact static hits: `1.0012x` fingerprint/current.
2. The request-derived dynamic win remains material in the shared router: `0.8828x`, about `11.7%` lower median cost.
3. The gain survives response construction: string and JSON pipeline ratios are `0.9640x` and `0.9594x`, with a `0.9617x` geometric mean.
4. Forced-collision fallback remains exact and bounded at `1.1283x`, within the frozen `1.15x` limit.
5. The shared-current dynamic path faithfully tracks production at `0.9893x`, but the shared-current static path is `1.1286x` production and therefore fails the attribution-fidelity requirement.
6. This means CP3-Q cannot prove that a real production fingerprint candidate will preserve production static cost, even though it strongly indicates the fingerprint work itself is not executed on static hits.
7. The next experiment should move closer to the actual production `Router` implementation rather than introducing another alternate-router abstraction. A minimal production-shape candidate may add a trailing-prefix fingerprint sidecar while leaving the exact-static path and generic trie semantics unchanged.
8. No production promotion is justified yet. Any source candidate must pass complete correctness, `matchingMethods`, generic-trie coexistence, duplicate behavior, registration/memory checks, direct runtime gates, and HTTP revalidation before promotion.
