# Competitive Performance v0.1 — CP3-N local authoritative dynamic handoff decomposition

## Identity

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- CPU: Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz
- Harness SHA: `2e717d6915de4d77575c623d69eb9dcfb66c6baf`
- Frozen production source: `8e43aad09759d60378b3fc174292850057ccfba3`
- Routes: `5,000`
- Samples: `11` fresh worker processes per cell

## Dynamic handoff and payload-representation cells

| cell | median ns/op | p25 | p75 | min | max |
| --- | ---: | ---: | ---: | ---: | ---: |
| pathname-request-dynamic | 31.4 | 31.0 | 32.3 | 30.9 | 37.3 |
| param-request-consume | 67.5 | 67.1 | 69.7 | 66.8 | 70.9 |
| normalize-string-stable | 630.2 | 621.9 | 634.9 | 607.4 | 646.2 |
| normalize-string-request-param | 782.4 | 771.1 | 793.0 | 749.3 | 814.3 |
| normalize-json-stable-param | 449.5 | 442.1 | 458.9 | 439.1 | 464.0 |
| normalize-json-request-param | 577.3 | 568.4 | 582.0 | 563.7 | 613.1 |
| request-router-static | 101.9 | 98.1 | 103.7 | 97.4 | 112.6 |
| request-router-dynamic | 214.3 | 211.8 | 227.4 | 207.9 | 250.1 |
| route-handler-stable-static | 106.6 | 104.9 | 107.6 | 103.8 | 110.5 |
| route-handler-stable-dynamic | 218.5 | 215.0 | 223.8 | 212.9 | 234.3 |
| route-handler-param-dynamic | 222.8 | 219.3 | 224.2 | 215.2 | 227.0 |
| pipeline-string-stable-static | 674.4 | 663.3 | 693.7 | 659.7 | 795.3 |
| pipeline-string-stable-dynamic | 813.7 | 799.5 | 838.9 | 780.2 | 1169.7 |
| pipeline-string-param-dynamic | 869.9 | 843.7 | 883.2 | 825.8 | 895.9 |
| pipeline-json-stable-static | 495.0 | 490.3 | 498.7 | 489.6 | 519.3 |
| pipeline-json-stable-dynamic | 615.5 | 606.8 | 618.3 | 601.2 | 637.2 |
| pipeline-json-param-dynamic | 626.5 | 624.0 | 632.8 | 613.7 | 660.9 |
| app-fetch-string-stable-static | 678.8 | 676.6 | 696.4 | 667.8 | 756.8 |
| app-fetch-string-stable-dynamic | 809.9 | 803.5 | 824.0 | 794.1 | 851.5 |
| app-fetch-string-param-dynamic | 877.7 | 850.3 | 926.9 | 840.7 | 938.8 |
| app-fetch-json-stable-static | 505.1 | 496.8 | 509.0 | 490.8 | 574.3 |
| app-fetch-json-stable-dynamic | 640.9 | 628.0 | 653.5 | 608.6 | 718.8 |
| app-fetch-json-param-dynamic | 651.0 | 644.0 | 675.6 | 637.6 | 748.9 |

## Derived diagnostics

These values are non-additive and are engineering direction only.

| diagnostic | value |
| --- | ---: |
| request param extraction beyond pathname | 36.1 ns |
| normalize request-param string / stable string | 1.2414x |
| normalize request-param JSON / stable-param JSON | 1.2843x |
| request-router dynamic/static | 2.1035x |
| route-handler stable dynamic/static | 2.0497x |
| route-handler param/stable dynamic | 1.0197x |
| pipeline string stable dynamic/static | 1.2067x |
| pipeline string param/stable dynamic | 1.0690x |
| pipeline JSON stable dynamic/static | 1.2434x |
| pipeline JSON param/stable dynamic | 1.0178x |
| app.fetch string stable dynamic/static | 1.1931x |
| app.fetch string param/stable dynamic | 1.0837x |
| app.fetch JSON stable dynamic/static | 1.2689x |
| app.fetch JSON param/stable dynamic | 1.0157x |
| app.fetch - pipeline string stable static | 4.5 ns |
| app.fetch - pipeline string stable dynamic | -3.9 ns |
| app.fetch - pipeline string param dynamic | 7.8 ns |
| app.fetch - pipeline JSON stable static | 10.0 ns |
| app.fetch - pipeline JSON stable dynamic | 25.4 ns |
| app.fetch - pipeline JSON param dynamic | 24.5 ns |

## Layer deltas

| comparison | delta |
| --- | ---: |
| request-router dynamic - static | 112.4 ns |
| route-handler stable dynamic - static | 111.9 ns |
| route-handler stable - request-router, static | 4.7 ns |
| route-handler stable - request-router, dynamic | 4.2 ns |
| route-handler param - stable dynamic | 4.3 ns |
| pipeline string stable dynamic - static | 139.3 ns |
| pipeline JSON stable dynamic - static | 120.5 ns |
| app.fetch string stable dynamic - static | 131.1 ns |
| app.fetch JSON stable dynamic - static | 135.8 ns |
| pipeline string param - stable dynamic | 56.2 ns |
| pipeline JSON param - stable dynamic | 11.0 ns |
| app.fetch string param - stable dynamic | 67.8 ns |
| app.fetch JSON param - stable dynamic | 10.1 ns |

The stable-payload route-handler delta is effectively identical to the request-router delta (`111.9 ns` versus `112.4 ns`). This means context creation plus a no-param-read handler contributes only about `4–5 ns` per side and does not explain the dynamic penalty.

Reading `params.id` itself adds only about `4.3 ns` at the route-handler layer. The materially larger string-response penalty appears later when a request-derived parameter string is handed to response construction. JSON is much less sensitive at the full pipeline/app.fetch layer, where using the parameter adds only about `10–11 ns` over the stable dynamic payload.

## Conclusions

1. The dominant remaining dynamic penalty is already present at the request-derived pathname plus router-match boundary. `request-router` is `101.9 ns` static versus `214.3 ns` dynamic, a `112.4 ns` gap.
2. Context construction and handler invocation are not the dominant problem. Stable route-handler cost preserves essentially the same dynamic-static gap as request-router.
3. Reading `params.id` is cheap at the handler boundary (`+4.3 ns`). The public handler/context API should not be redesigned for this hotspot.
4. A request-derived substring can carry additional response-construction cost, especially for direct string responses. This is secondary to the routing gap and should not be conflated with route matching.
5. Because the dynamic penalty survives even when the handler returns a stable payload that ignores params, the next optimization target should be the fresh request-derived dynamic lookup representation itself.
6. The current trailing-param fast path still performs a full static-map miss, `lastIndexOf`, prefix slicing, prefix `Map.get`, value slicing, decode scan, and params-object materialization. Prior CP3-H/CP3-I evidence already showed that fresh request-derived string lookup is disproportionately expensive compared with stable strings.
7. The next candidate phase should prototype a slice-free/hash-free trailing-prefix matcher, preferably a compact radix/character-prefix structure, against the current production router before any production rewrite.

## Classification

**CP3-N LOCAL DYNAMIC HANDOFF DECOMPOSITION: VALID / AUTHORITATIVE / ACCEPTED AS DECOMPOSITION EVIDENCE.**
