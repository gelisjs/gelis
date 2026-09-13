# Competitive Performance v0.1 — CP3-Z local authoritative decomposition

## Identity

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- CPU: Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz
- Harness SHA: `7d04a04a6946fd86b61facd9d9ee47ec2fc8b658`
- Frozen production source: `af4e5102046def1b163435333563b8d08f919bf5`
- Routes: `5,000`
- Samples: `11` fresh worker processes per cell

## Post-promotion dynamic residual cells

| cell                     | median ns/op |   p25 |   p75 |   min |    max |
| ------------------------ | -----------: | ----: | ----: | ----: | -----: |
| pathname-request-dynamic |         31.4 |  31.3 |  31.5 |  30.9 |   34.4 |
| router-literal-dynamic   |         89.8 |  88.6 |  91.9 |  85.7 |   94.2 |
| router-request-dynamic   |        181.6 | 180.1 | 185.6 | 175.3 |  194.9 |
| handler-string-stable    |        185.4 | 182.7 | 192.5 | 180.6 |  196.0 |
| handler-string-param     |        189.6 | 189.0 | 192.7 | 183.2 |  196.2 |
| handler-json-stable      |        191.5 | 189.4 | 194.8 | 185.9 |  200.4 |
| handler-json-param       |        193.9 | 189.8 | 201.2 | 188.2 |  209.3 |
| pipeline-string-stable   |        879.7 | 865.6 | 890.6 | 849.8 |  917.1 |
| pipeline-string-param    |        941.5 | 921.4 | 946.4 | 915.7 |  968.4 |
| pipeline-json-stable     |        678.1 | 672.6 | 706.6 | 665.2 |  716.8 |
| pipeline-json-param      |        724.1 | 710.4 | 731.2 | 690.5 |  755.0 |
| app-string-stable        |        895.3 | 888.7 | 901.7 | 880.1 | 1061.2 |
| app-string-param         |        957.2 | 949.8 | 971.7 | 929.4 | 1078.8 |
| app-json-stable          |        701.9 | 698.1 | 727.5 | 681.3 |  836.1 |
| app-json-param           |        743.0 | 727.3 | 752.6 | 707.4 |  780.3 |

## Derived diagnostics

These values are non-additive and are engineering direction only.

| diagnostic                             |    value |
| -------------------------------------- | -------: |
| router request-derived / literal       |  2.0210x |
| router request-derived - literal       |  91.7 ns |
| router request-derived - pathname only | 150.1 ns |
| handler stable string - request router |   3.9 ns |
| handler param string - stable string   |   4.2 ns |
| handler stable JSON - request router   |   9.9 ns |
| handler param JSON - stable JSON       |   2.4 ns |
| normalize stable string                | 694.3 ns |
| normalize param string                 | 751.9 ns |
| normalize stable JSON                  | 486.6 ns |
| normalize param JSON                   | 530.2 ns |
| app.fetch stable string - pipeline     |  15.6 ns |
| app.fetch param string - pipeline      |  15.7 ns |
| app.fetch stable JSON - pipeline       |  23.8 ns |
| app.fetch param JSON - pipeline        |  18.9 ns |
| param penalty at string handler        |   4.2 ns |
| param penalty at string pipeline       |  61.8 ns |
| param penalty at string app.fetch      |  61.9 ns |
| param penalty at JSON handler          |   2.4 ns |
| param penalty at JSON pipeline         |  46.0 ns |
| param penalty at JSON app.fetch        |  41.1 ns |

## Interpretation

1. The request-derived dynamic route path is materially more expensive than the same router operation over a literal pathname. `router-request-dynamic` includes pathname extraction, so subtracting the `31.4 ns` pathname cell leaves about `150.2 ns` for request-derived matching versus `89.8 ns` for the literal path. This implies roughly `60 ns` of additional matching cost associated with the request-derived string representation beyond pathname extraction itself.
2. Context creation and handler invocation are not the dominant residual. A stable string handler adds only about `3.9 ns` above the request-derived router boundary, and reading `params.id` adds about `4.2 ns`. JSON shows the same shape: about `9.9 ns` for the stable object handler and only `2.4 ns` additional cost for the param-derived object.
3. Param-derived response construction remains a separate hotspot. The param penalty grows from `4.2 ns` at the string handler boundary to `61.8 ns` at the string pipeline, and from `2.4 ns` to `46.0 ns` for JSON.
4. The outer application wrapper is not responsible for that penalty. String stable/param wrapper deltas are essentially identical (`15.6` and `15.7 ns`), while JSON wrapper overhead is small relative to the pipeline.
5. The next experiment should not optimize the isolated literal router cell. It should test whether matching directly against the full request URL with pathname offsets can avoid operations on the sliced pathname and reduce nested-substring costs for both matching and param response construction.

## Classification

**CP3-Z LOCAL DYNAMIC RESIDUAL DECOMPOSITION: VALID / AUTHORITATIVE / ACCEPTED AS DECOMPOSITION EVIDENCE.**
