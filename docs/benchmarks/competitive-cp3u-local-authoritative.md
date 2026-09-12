# Competitive Performance v0.1 — CP3-U local authoritative string response decomposition

## Identity

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- CPU: Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz
- Harness SHA: `27b8613cd9327041ad11ffec3101f50d9b523a85`
- Production source: `8e43aad09759d60378b3fc174292850057ccfba3`
- Candidate source: `77168cea5056c50bd7188b2dace17f72f7a01514`
- Routes: `5,000`
- Samples: `11` fresh workers per cell with rotated group order
- Correctness probe: `PASS (15/15)`
- Completion marker: `CP3-U LOCAL STRING RESPONSE DECOMPOSITION RUN: COMPLETE`

## String response decomposition cells

| cell | median ns/op | p25 | p75 | min | max |
| --- | ---: | ---: | ---: | ---: | ---: |
| production-stable-current | 823.5 | 804.6 | 846.8 | 773.5 | 981.8 |
| candidate-stable-current | 777.1 | 760.4 | 781.1 | 747.4 | 803.9 |
| candidate-stable-cached-status | 760.1 | 752.5 | 776.7 | 733.9 | 825.8 |
| candidate-stable-no-status | 756.1 | 741.9 | 795.6 | 734.1 | 993.2 |
| candidate-stable-cached-no-status | 754.7 | 745.8 | 789.8 | 733.1 | 816.9 |
| production-handler-param | 216.5 | 214.0 | 217.8 | 211.2 | 225.1 |
| candidate-handler-param | 185.0 | 182.2 | 186.2 | 180.0 | 198.4 |
| candidate-handler-param-prehash | 272.6 | 268.3 | 282.1 | 263.7 | 336.1 |
| production-param-current | 853.1 | 848.0 | 870.5 | 818.7 | 896.0 |
| candidate-param-current | 810.6 | 804.0 | 842.2 | 802.7 | 875.0 |
| candidate-param-cached-status | 812.6 | 802.0 | 831.2 | 784.4 | 845.7 |
| candidate-param-no-status | 779.5 | 778.7 | 810.2 | 771.3 | 862.7 |
| candidate-param-cached-no-status | 784.0 | 776.0 | 809.1 | 769.2 | 833.1 |
| candidate-param-prehash-current | 921.5 | 905.5 | 974.0 | 898.3 | 1075.0 |
| candidate-param-prehash-no-status | 909.9 | 888.3 | 928.3 | 875.9 | 952.8 |

## Candidate / production ratios

| comparison | ratio | delta ns |
| --- | ---: | ---: |
| candidate-stable-current | 0.9436x | -46.4 |
| candidate-stable-cached-status | 0.9230x | -63.4 |
| candidate-stable-no-status | 0.9181x | -67.4 |
| candidate-stable-cached-no-status | 0.9165x | -68.8 |
| candidate-handler-param | 0.8548x | -31.4 |
| candidate-handler-param-prehash | 1.2594x | 56.2 |
| candidate-param-current | 0.9503x | -42.4 |
| candidate-param-cached-status | 0.9526x | -40.5 |
| candidate-param-no-status | 0.9137x | -73.6 |
| candidate-param-cached-no-status | 0.9190x | -69.1 |
| candidate-param-prehash-current | 1.0802x | 68.4 |
| candidate-param-prehash-no-status | 1.0667x | 56.9 |

## Alternative / candidate-current ratios

| comparison | ratio | delta ns |
| --- | ---: | ---: |
| candidate-stable-cached-status | 0.9781x | -17.0 |
| candidate-stable-no-status | 0.9730x | -21.0 |
| candidate-stable-cached-no-status | 0.9712x | -22.4 |
| candidate-param-cached-status | 1.0024x | 2.0 |
| candidate-param-no-status | 0.9616x | -31.2 |
| candidate-param-cached-no-status | 0.9671x | -26.7 |
| candidate-param-prehash-current | 1.1367x | 110.8 |
| candidate-param-prehash-no-status | 1.1225x | 99.3 |

## Parameter response-construction increments

| response path | increment above matching handler | delta vs candidate current increment |
| --- | ---: | ---: |
| production current | 636.6 ns | 11.0 ns |
| candidate current | 625.6 ns | 0.0 ns |
| candidate cached status | 627.6 ns | 2.0 ns |
| candidate no status | 594.5 ns | -31.2 ns |
| candidate cached no status | 598.9 ns | -26.7 ns |
| candidate prehash current | 648.8 ns | 23.2 ns |
| candidate prehash no status | 637.3 ns | 11.7 ns |

## Legacy prefix prehash diagnostics

| diagnostic | value |
| --- | ---: |
| prehash handler overhead | 87.6 ns |
| prehash current normalization change | 23.2 ns |

## Historical CP3-S recovery diagnostic

With the CP3-S JSON ratio held only as an engineering diagnostic at `0.9773x`, the historical pipeline geomean gate would require the string ratio to be approximately `<= 0.9827x`.

| candidate param pipeline | ratio vs production current | meets `<= 0.9827x`? |
| --- | ---: | --- |
| candidate-param-current | 0.9503x | YES |
| candidate-param-cached-status | 0.9526x | YES |
| candidate-param-no-status | 0.9137x | YES |
| candidate-param-cached-no-status | 0.9190x | YES |
| candidate-param-prehash-current | 1.0802x | NO |
| candidate-param-prehash-no-status | 1.0667x | NO |

## Interpretation

1. CP3-U rejects the legacy-prefix-prehash hypothesis. Reintroducing the old prefix `slice + Map.get` work costs `87.6 ns` at the handler boundary and makes current normalization another `23.2 ns` more expensive instead of making it cheaper.
2. Reusing an explicit-status `ResponseInit` does not help the parameter response path: `candidate-param-cached-status` is `2.0 ns` slower than candidate current.
3. Omitting explicit success status is the strongest response-construction mechanism measured. `candidate-param-no-status` is `31.2 ns` faster than candidate current and `73.6 ns` faster than production current in this decomposition harness.
4. Caching the no-status `ResponseInit` does not improve the parameter case further; it is `4.5 ns` slower than the inline no-status variant at the median.
5. The same no-status mechanism also improves the stable-string path by `21.0 ns` versus candidate current.
6. The production source currently gives direct successful strings an explicit `status: 200`, while ordinary JSON success already uses the native default-success path. The next production candidate should therefore test the minimal direct-string change `new Response(value, { headers: TEXT_HEADERS })` together with the CP3-S single-index fingerprint router.
7. That candidate must re-run the exact frozen CP3-S candidate gates, including static, trailing dynamic, generic dynamic, pipeline geomean, forced collision, registration, and retained heap. CP3-U itself remains decomposition-only and does not prove production acceptance.

## Classification

**CP3-U LOCAL STRING RESPONSE DECOMPOSITION: VALID / AUTHORITATIVE / ACCEPTED AS DECOMPOSITION EVIDENCE.**
