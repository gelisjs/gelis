# Competitive Performance v0.1 — CP3-V local authoritative fingerprint + string-success candidate

## Identity

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- CPU: Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz
- Harness SHA: `22312e088b8e1a8c95533d8c359c1ee63188e8e1`
- Production source: `8e43aad09759d60378b3fc174292850057ccfba3`
- Candidate source: `979821c709e809e29018791ce0fe212cded04162`
- Routes: `5,000`
- Samples: `11` mirrored fresh-worker pairs per cell pair
- Correctness probe: `PASS (16/16)`
- Local full quality: `735 pass`, `0 fail`, `2141 expect()` calls across `90` files
- Completion marker: `CP3-V LOCAL FINGERPRINT + STRING-SUCCESS RUN: COMPLETE`

## Production vs candidate cells

| cell | variant | median | p25 | p75 | min | max | unit |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| mixed-static-request | production | 125.5 | 121.3 | 131.1 | 118.2 | 137.3 | ns/op |
| mixed-static-request | candidate | 122.1 | 119.9 | 123.5 | 117.3 | 131.8 | ns/op |
| mixed-dynamic-request | production | 220.3 | 216.3 | 222.3 | 212.1 | 226.2 | ns/op |
| mixed-dynamic-request | candidate | 186.2 | 184.8 | 189.4 | 180.1 | 193.4 | ns/op |
| generic-dynamic-request | production | 354.3 | 349.5 | 357.9 | 343.2 | 377.6 | ns/op |
| generic-dynamic-request | candidate | 352.8 | 350.7 | 365.5 | 347.9 | 395.7 | ns/op |
| pipeline-string | production | 841.1 | 836.6 | 863.0 | 830.4 | 889.2 | ns/op |
| pipeline-string | candidate | 797.6 | 778.9 | 805.3 | 772.5 | 822.9 | ns/op |
| pipeline-json | production | 635.2 | 628.3 | 643.2 | 609.4 | 668.2 | ns/op |
| pipeline-json | candidate | 602.9 | 594.4 | 607.2 | 579.3 | 629.4 | ns/op |
| collision-request | production | 239.9 | 237.5 | 244.6 | 235.8 | 253.0 | ns/op |
| collision-request | candidate | 254.3 | 251.5 | 258.0 | 249.5 | 283.8 | ns/op |
| registration-trailing | production | 2.340 | 2.014 | 2.388 | 1.902 | 2.403 | ms |
| registration-trailing | candidate | 2.327 | 2.212 | 2.420 | 2.045 | 4.126 | ms |
| memory-trailing | production | 977,464 | 977,464 | 977,464 | 977,352 | 978,629 | bytes |
| memory-trailing | candidate | 1,216,704 | 1,216,652 | 1,216,750 | 1,216,508 | 1,218,415 | bytes |

## Candidate / production ratios

| comparison | ratio | delta |
| --- | ---: | ---: |
| mixed static request | `0.9726x` | `-3.4 ns/op` |
| mixed trailing dynamic request | `0.8453x` | `-34.1 ns/op` |
| generic multi-param dynamic request | `0.9960x` | `-1.4 ns/op` |
| string pipeline | `0.9483x` | `-43.5 ns/op` |
| JSON pipeline | `0.9492x` | `-32.2 ns/op` |
| forced fingerprint collision | `1.0601x` | `+14.4 ns/op` |
| trailing registration | `0.9943x` | `-0.013 ms` |
| retained router heap delta | `1.2448x` | `+239,240 bytes` |

## Frozen CP3-V candidate gates

The thresholds are identical to CP3-S and were not changed after the CP3-S failure.

| gate | candidate/production | limit | result |
| --- | ---: | ---: | --- |
| mixed static request | `0.9726x` | `<= 1.0200x` | PASS |
| mixed trailing dynamic request | `0.8453x` | `<= 0.9000x` | PASS |
| generic multi-param dynamic request | `0.9960x` | `<= 1.0300x` | PASS |
| pipeline geomean | `0.9488x` | `<= 0.9800x` | PASS |
| forced-collision fallback | `1.0601x` | `<= 1.1500x` | PASS |
| trailing-route registration | `0.9943x` | `<= 1.7500x` | PASS |
| retained router heap delta | `1.2448x` | `<= 1.5000x` | PASS |

## Interpretation

1. The CP3-S single-index fingerprint routing mechanism remains materially faster for trailing dynamic routes while preserving the exact static fast path and generic multi-parameter behavior.
2. The CP3-U direct-string default-success mechanism removes the CP3-S pipeline blocker. String pipeline improves by about `5.2%`, JSON pipeline by about `5.1%`, and their geomean is `0.9488x`, comfortably inside the unchanged `0.9800x` gate.
3. The direct-string change does not add router memory or registration overhead. Retained router heap remains at `1.2448x` production, within the existing `1.5000x` bound.
4. Forced fingerprint collisions remain slower than production but within the frozen bound at `1.0601x`.
5. This is sufficient runtime evidence to advance the candidate to exact real-HTTP revalidation. It is not yet sufficient for production promotion.

## Classification

**CP3-V LOCAL FINGERPRINT + STRING-SUCCESS CANDIDATE: VALID / AUTHORITATIVE / ACCEPTED.**
