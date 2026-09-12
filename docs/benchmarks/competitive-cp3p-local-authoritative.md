# Competitive Performance v0.1 — CP3-P local authoritative result

## Classification

**CP3-P LOCAL TRAILING FINGERPRINT VIABILITY: VALID / AUTHORITATIVE / FAIL.**

This is a valid unfavorable result under the frozen all-gates-must-pass rule. The run completed normally and must not be rerun merely because one gate failed.

## Identity

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- CPU: Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz
- Harness SHA: `d04c904d7fb60d5f738d3250b8f0da86938b6f48`
- Frozen production source: `8e43aad09759d60378b3fc174292850057ccfba3`
- Routes: `5,000`
- Samples: `11` mirrored fresh-worker pairs per cell pair

## Timed cells

| cell | median ns/op | p25 | p75 | min | max |
| --- | ---: | ---: | ---: | ---: | ---: |
| current-trailing-stable | 49.5 | 48.6 | 51.1 | 46.5 | 56.0 |
| fingerprint-trailing-stable | 88.8 | 83.8 | 91.6 | 82.8 | 96.2 |
| current-trailing-request | 224.7 | 214.5 | 234.3 | 210.0 | 266.1 |
| fingerprint-trailing-request | 181.4 | 179.7 | 184.2 | 178.5 | 190.9 |
| current-pipeline-string | 804.6 | 792.4 | 819.2 | 783.1 | 837.9 |
| fingerprint-pipeline-string | 754.0 | 750.0 | 783.4 | 737.9 | 852.7 |
| current-pipeline-json | 600.2 | 596.8 | 605.7 | 592.2 | 628.9 |
| fingerprint-pipeline-json | 585.0 | 572.4 | 600.4 | 560.8 | 636.9 |
| current-mixed-static-request | 102.1 | 99.8 | 108.4 | 95.9 | 202.9 |
| fingerprint-mixed-static-request | 110.1 | 109.0 | 112.2 | 108.6 | 126.6 |
| current-mixed-dynamic-request | 219.1 | 212.5 | 225.6 | 207.3 | 231.3 |
| fingerprint-mixed-dynamic-request | 186.7 | 182.0 | 189.9 | 175.2 | 197.9 |
| current-collision-request | 236.1 | 231.3 | 242.6 | 227.4 | 285.3 |
| fingerprint-collision-request | 249.6 | 247.0 | 254.9 | 244.5 | 292.4 |

## Candidate/current ratios

| comparison | ratio | delta ns |
| --- | ---: | ---: |
| trailing stable pathname | 1.7917x | +39.2 ns |
| trailing request-derived pathname | 0.8073x | -43.3 ns |
| string pipeline | 0.9371x | -50.6 ns |
| JSON pipeline | 0.9747x | -15.2 ns |
| mixed static request | 1.0786x | +8.0 ns |
| mixed dynamic request | 0.8521x | -32.4 ns |
| forced fingerprint collision | 1.0569x | +13.4 ns |

## Frozen gates

| gate | candidate/current | limit | result |
| --- | ---: | ---: | --- |
| request-derived dynamic | 0.8073x | <= 0.9000x | PASS |
| pipeline geomean | 0.9557x | <= 0.9800x | PASS |
| mixed dynamic request | 0.8521x | <= 0.9300x | PASS |
| mixed static request | 1.0786x | <= 1.0200x | FAIL |
| forced-collision fallback | 1.0569x | <= 1.1500x | PASS |
| stable-path diagnostic | 1.7917x | n/a | INFO |

Four of five frozen viability gates passed. Because the protocol requires all five, the exact CP3-P candidate is rejected.

## Conclusions

1. The fixed-cost fingerprint mechanism is materially faster on the production-relevant request-derived dynamic path: about `19.3%` lower median matcher cost.
2. The win survives production-shaped response work: about `6.3%` lower string-pipeline median and `2.5%` lower JSON-pipeline median; their geometric mean passes the frozen gate.
3. The mixed dynamic topology improves about `14.8%`, showing the benefit survives coexistence with exact static routes.
4. Forced fingerprint collision fallback remains exact and bounded at about `5.7%` overhead, passing its frozen gate.
5. The exact benchmark-local candidate nevertheless fails viability because mixed static routing regresses about `7.9%`, well outside the `2%` allowance.
6. Production `Router.match()` returns immediately on a static hit before entering trailing-parameter logic. Therefore the next experiment should determine whether the static regression comes from the benchmark-local alternate router shape/JIT layout rather than from work intrinsically required by the fingerprint mechanism.
7. CP3-Q should preserve one identical shared static fast path for both variants and diverge only after a static miss. No production source should change until that hypothesis is measured.
