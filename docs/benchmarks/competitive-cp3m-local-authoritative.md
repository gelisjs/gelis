# Competitive Performance v0.1 — CP3-M local authoritative rebaseline

## Identity

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- CPU: Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz
- Harness SHA: `f81a07e505aa113b75a43a2b551999acdb63da58`
- Frozen production source: `8e43aad09759d60378b3fc174292850057ccfba3`
- Routes: `5,000`
- Samples: `11` fresh worker processes per cell

## Post-promotion residual cells

| cell                     | median ns/op |   p25 |   p75 |   min |   max |
| ------------------------ | -----------: | ----: | ----: | ----: | ----: |
| pathname-request-static  |         29.0 |  28.5 |  29.2 |  28.3 |  30.4 |
| pathname-request-dynamic |         31.5 |  31.1 |  31.9 |  30.7 |  32.1 |
| router-static-consume    |          2.8 |   2.8 |   2.8 |   2.8 |   2.9 |
| router-dynamic-consume   |         27.4 |  26.8 |  27.7 |  26.1 |  37.7 |
| router-static-escape     |         17.2 |  17.1 |  17.5 |  16.8 |  18.6 |
| router-dynamic-escape    |         25.8 |  25.7 |  26.5 |  25.5 |  29.0 |
| response-json-static     |        479.5 | 473.8 | 485.9 | 466.5 | 508.2 |
| response-json-dynamic    |        470.8 | 464.0 | 484.4 | 462.0 | 502.4 |
| normalize-static-json    |        491.7 | 479.0 | 504.3 | 476.8 | 511.7 |
| normalize-dynamic-json   |        474.8 | 471.5 | 479.0 | 466.1 | 500.4 |
| pipeline-static-raw      |        314.2 | 304.5 | 319.5 | 301.1 | 466.7 |
| pipeline-dynamic-raw     |        470.2 | 462.9 | 476.5 | 456.0 | 501.3 |
| pipeline-static-json     |        531.5 | 521.7 | 550.3 | 520.3 | 738.0 |
| pipeline-dynamic-json    |        661.4 | 659.9 | 675.3 | 655.2 | 699.2 |
| app-fetch-static-raw     |        322.8 | 318.0 | 327.7 | 312.9 | 344.1 |
| app-fetch-dynamic-raw    |        485.5 | 479.5 | 491.3 | 476.0 | 511.3 |
| app-fetch-static-json    |        544.4 | 530.2 | 569.9 | 519.0 | 603.4 |
| app-fetch-dynamic-json   |        676.7 | 671.1 | 683.5 | 662.0 | 700.3 |

## Derived diagnostics

These values are non-additive and are engineering direction only.

| diagnostic                                |    value |
| ----------------------------------------- | -------: |
| pathname dynamic/static request           |  1.0858x |
| router dynamic/static consume             |  9.6865x |
| router static escape/consume              |  6.0818x |
| router dynamic escape/consume             |  0.9446x |
| normalize static / Response.json static   |  1.0254x |
| normalize dynamic / Response.json dynamic |  1.0084x |
| app.fetch - pipeline static raw           |   8.7 ns |
| app.fetch - pipeline dynamic raw          |  15.3 ns |
| app.fetch - pipeline static JSON          |  12.9 ns |
| app.fetch - pipeline dynamic JSON         |  15.3 ns |
| dynamic-static app.fetch raw              | 162.7 ns |
| dynamic-static app.fetch JSON             | 132.3 ns |

## CP3-F to CP3-M comparison

| cell                   |    CP3-F |    CP3-M | change |
| ---------------------- | -------: | -------: | -----: |
| pipeline static raw    | 339.8 ns | 314.2 ns |  -7.5% |
| pipeline dynamic raw   | 512.0 ns | 470.2 ns |  -8.2% |
| pipeline static JSON   | 562.5 ns | 531.5 ns |  -5.5% |
| pipeline dynamic JSON  | 705.8 ns | 661.4 ns |  -6.3% |
| app.fetch static raw   | 359.3 ns | 322.8 ns | -10.2% |
| app.fetch dynamic raw  | 533.9 ns | 485.5 ns |  -9.1% |
| app.fetch static JSON  | 566.1 ns | 544.4 ns |  -3.8% |
| app.fetch dynamic JSON | 726.2 ns | 676.7 ns |  -6.8% |

The app.fetch dynamic-static gap fell from about `174.6 ns` to `162.7 ns` for raw responses and from about `160.1 ns` to `132.3 ns` for JSON responses.

## Conclusions

1. CP3-J's request URL fast path survives promotion and lowers production-shaped pipeline/app.fetch cost materially.
2. Isolated router cost is effectively unchanged: static remains about `2.8 ns`, while dynamic remains about `27 ns`.
3. The remaining dynamic penalty is not explained by pathname extraction or isolated router lookup alone. Pipeline dynamic-static gaps remain about `156 ns` raw and `130 ns` JSON.
4. `app.fetch()` adds only about `9–15 ns` beyond the equivalent production-shaped pipeline, so the next target is inside the dynamic pathname/match/context/handler/response integration rather than an outer application wrapper.
5. JSON normalization overhead above `Response.json()` is now small in this workload, so response normalization is no longer the primary residual target.
6. The next decomposition should equalize payload construction and isolate dynamic-match handoff, parameter materialization/use, context creation, handler invocation, and normalization separately before changing production routing architecture.

## Classification

**CP3-M LOCAL POST-PROMOTION REBASELINE: VALID / AUTHORITATIVE / ACCEPTED AS DECOMPOSITION EVIDENCE.**
