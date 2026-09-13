# Competitive Performance v0.1 — CP3-Y local authoritative rebaseline

## Identity

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- CPU: Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz
- Harness SHA: `8458b5471ea194bb47f631f3359af48113f7f03e`
- Frozen production source: `af4e5102046def1b163435333563b8d08f919bf5`
- Routes: `5,000`
- Samples: `11` fresh worker processes per cell

## Post-promotion residual cells

| cell                     | median ns/op |   p25 |   p75 |   min |   max |
| ------------------------ | -----------: | ----: | ----: | ----: | ----: |
| pathname-request-static  |         31.3 |  30.8 |  32.0 |  29.3 |  33.6 |
| pathname-request-dynamic |         31.8 |  31.1 |  33.4 |  30.7 |  37.2 |
| router-static-consume    |          2.8 |   2.8 |   2.9 |   2.8 |   2.9 |
| router-dynamic-consume   |         89.6 |  89.0 |  91.4 |  88.1 |  92.8 |
| router-static-escape     |         17.1 |  16.8 |  17.2 |  16.6 |  21.4 |
| router-dynamic-escape    |         91.5 |  90.6 |  95.4 |  90.1 | 113.7 |
| response-json-static     |        478.1 | 469.8 | 480.1 | 466.7 | 525.9 |
| response-json-dynamic    |        471.4 | 467.0 | 485.6 | 464.4 | 499.1 |
| normalize-static-json    |        480.7 | 474.8 | 491.4 | 463.6 | 508.9 |
| normalize-dynamic-json   |        483.3 | 478.7 | 489.1 | 467.4 | 675.4 |
| pipeline-static-raw      |        309.8 | 307.2 | 310.5 | 301.3 | 325.2 |
| pipeline-dynamic-raw     |        434.5 | 428.7 | 441.6 | 419.6 | 465.8 |
| pipeline-static-json     |        526.3 | 521.6 | 536.9 | 513.5 | 570.8 |
| pipeline-dynamic-json    |        651.3 | 638.1 | 659.6 | 614.3 | 678.5 |
| app-fetch-static-raw     |        322.5 | 321.4 | 338.6 | 319.4 | 350.7 |
| app-fetch-dynamic-raw    |        450.6 | 446.5 | 465.6 | 439.5 | 503.8 |
| app-fetch-static-json    |        533.1 | 528.0 | 536.8 | 523.6 | 551.2 |
| app-fetch-dynamic-json   |        652.6 | 647.1 | 664.7 | 628.6 | 680.2 |

## Derived diagnostics

These values are non-additive and are engineering direction only.

| diagnostic                                |    value |
| ----------------------------------------- | -------: |
| pathname dynamic/static request           |  1.0159x |
| router dynamic/static consume             | 31.7433x |
| router static escape/consume              |  6.0659x |
| router dynamic escape/consume             |  1.0217x |
| normalize static / Response.json static   |  1.0056x |
| normalize dynamic / Response.json dynamic |  1.0252x |
| app.fetch - pipeline static raw           |  12.7 ns |
| app.fetch - pipeline dynamic raw          |  16.1 ns |
| app.fetch - pipeline static JSON          |   6.8 ns |
| app.fetch - pipeline dynamic JSON         |   1.3 ns |
| dynamic-static app.fetch raw              | 128.1 ns |
| dynamic-static app.fetch JSON             | 119.5 ns |

## CP3-M to CP3-Y comparison

| cell                   |    CP3-M |    CP3-Y |  change |
| ---------------------- | -------: | -------: | ------: |
| router static consume  |   2.8 ns |   2.8 ns |    0.0% |
| router dynamic consume |  27.4 ns |  89.6 ns | +227.0% |
| pipeline static raw    | 314.2 ns | 309.8 ns |   -1.4% |
| pipeline dynamic raw   | 470.2 ns | 434.5 ns |   -7.6% |
| pipeline static JSON   | 531.5 ns | 526.3 ns |   -1.0% |
| pipeline dynamic JSON  | 661.4 ns | 651.3 ns |   -1.5% |
| app.fetch static raw   | 322.8 ns | 322.5 ns |   -0.1% |
| app.fetch dynamic raw  | 485.5 ns | 450.6 ns |   -7.2% |
| app.fetch static JSON  | 544.4 ns | 533.1 ns |   -2.1% |
| app.fetch dynamic JSON | 676.7 ns | 652.6 ns |   -3.6% |

The `app.fetch()` dynamic-static gap fell from `162.7 ns` to `128.1 ns` for raw responses and from `132.3 ns` to `119.5 ns` for JSON responses.

The isolated dynamic-router cell moved in the opposite direction from production-shaped pipeline and `app.fetch()` performance. This is therefore not valid evidence that the production router became slower overall. The discrepancy is consistent with the already observed non-additive JSC and string-representation effects around literal path strings versus request-derived strings.

## Conclusions

1. CP3-X survives promotion and improves the actual production-shaped dynamic path materially.
2. Request URL pathname extraction is effectively symmetric between static and dynamic paths and is not a meaningful residual target.
3. The outer `app.fetch()` wrapper remains small, especially for dynamic JSON where the measured residual above the manual pipeline is only `1.3 ns`.
4. JSON normalization remains close to native `Response.json()` and is not the primary residual target.
5. The isolated dynamic-router result must not be optimized in isolation because it conflicts directionally with the end-to-end result after CP3-X.
6. The remaining production dynamic-static gap is about `128 ns` raw and `120 ns` JSON. The next phase should decompose the request-derived production path again across match, parameter materialization, context/handler handoff, and response construction before changing routing architecture.

## Classification

**CP3-Y LOCAL POST-PROMOTION REBASELINE: VALID / AUTHORITATIVE / ACCEPTED AS DECOMPOSITION EVIDENCE.**
