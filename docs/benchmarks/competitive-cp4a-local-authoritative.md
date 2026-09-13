# Competitive Performance v0.1 — CP4-A local authoritative viability

## Identity

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- CPU: Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz
- Harness SHA: `327d865904dc38f8dc5ea7104bc44741821415db`
- Frozen Gelis source: `af4e5102046def1b163435333563b8d08f919bf5`
- Routes: `5,000`
- Samples: `11` mirrored fresh-worker pairs per cell pair

## Full URL offset viability cells

| cell | median ns/op | p25 | p75 | min | max |
| --- | ---: | ---: | ---: | ---: | ---: |
| current-router | 184.6 | 183.5 | 194.4 | 182.2 | 203.1 |
| offset-router | 105.5 | 103.5 | 108.7 | 102.4 | 145.7 |
| current-handler-param | 187.3 | 185.6 | 190.8 | 183.6 | 198.7 |
| offset-handler-param | 116.3 | 115.7 | 117.2 | 112.5 | 124.0 |
| current-pipeline-string-stable | 864.1 | 855.8 | 868.5 | 830.2 | 897.7 |
| offset-pipeline-string-stable | 786.2 | 763.5 | 791.7 | 749.6 | 823.1 |
| current-pipeline-string-param | 911.7 | 903.4 | 930.3 | 890.0 | 993.2 |
| offset-pipeline-string-param | 823.8 | 816.2 | 831.5 | 805.6 | 853.3 |
| current-pipeline-json-stable | 686.1 | 678.8 | 690.1 | 662.1 | 731.0 |
| offset-pipeline-json-stable | 584.6 | 580.2 | 597.0 | 573.0 | 647.2 |
| current-pipeline-json-param | 697.1 | 694.4 | 709.0 | 683.3 | 721.0 |
| offset-pipeline-json-param | 643.7 | 629.6 | 647.8 | 615.4 | 662.8 |

## Offset / current ratios

| comparison | ratio | offset advantage |
| --- | ---: | ---: |
| request-derived router | 0.5717x | 79.0 ns |
| param handler | 0.6211x | 71.0 ns |
| stable string pipeline | 0.9099x | 77.9 ns |
| param string pipeline | 0.9036x | 87.9 ns |
| stable JSON pipeline | 0.8521x | 101.5 ns |
| param JSON pipeline | 0.9233x | 53.5 ns |

## Router-win translation diagnostics

| boundary | offset advantage | retained vs router win |
| --- | ---: | ---: |
| param handler | 71.0 ns | 0.8976x |
| stable string pipeline | 77.9 ns | 0.9851x |
| param string pipeline | 87.9 ns | 1.1119x |
| stable JSON pipeline | 101.5 ns | 1.2841x |
| param JSON pipeline | 53.5 ns | 0.6763x |

## Param response penalties

| variant | string param - stable | JSON param - stable |
| --- | ---: | ---: |
| current | 47.6 ns | 11.0 ns |
| full URL offset | 37.6 ns | 59.1 ns |

## Interpretation

1. Full-URL offset matching is strongly viable for trailing-param routing: request-derived router cost falls from `184.6 ns` to `105.5 ns`, a `79.0 ns` median advantage.
2. Most of the routing win survives through handler and response construction. Stable string retains `77.9 ns`; param string retains `87.9 ns`; stable JSON retains `101.5 ns`.
3. Param JSON retains less of the routing win (`53.5 ns`) and its param-vs-stable response penalty rises to `59.1 ns`, so full-URL offset does not eliminate every request-derived string representation cost.
4. CP4-A intentionally omits static exact-route precedence, generic dynamic fallback, and production application integration. It is viability evidence only and cannot be promoted directly.
5. The next production-shaped candidate must preserve static exact-first semantics, legacy/prebuilt compatibility, generic trie fallback, query bounding, encoded parameter decoding, method-miss behavior, and custom-router compatibility before performance acceptance.

## Classification

**CP4-A LOCAL FULL URL OFFSET VIABILITY: VALID / AUTHORITATIVE / ACCEPTED AS VIABILITY EVIDENCE.**
