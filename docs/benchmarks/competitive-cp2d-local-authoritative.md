# Competitive Performance v0.1 — CP2-D Local Authoritative Result

**Status:** AUTHORITATIVE LOCAL EVIDENCE  
**Date:** 2026-09-11  
**Harness SHA:** `da867943bc1f3ad44876ae1673a86b1b9c1969f8`  
**Gelis production source:** `1dd5f94cf0e9ad884ca44e537ee287587cd8baab`  
**Bun:** `1.4.2`  
**CPU:** `Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz`  
**Hono:** `4.13.7`  
**Elysia stable:** `1.4.30`  
**Elysia next:** `2.0.0-beta.14`

This file is temporary internal benchmark evidence and is not intended to become public release documentation verbatim.

The run below was the first valid local timing run under the frozen CP2-D protocol. It must not be rerun merely because any result is unfavorable.

Primary ratio is `competitor ns/op / Gelis ns/op`; values above `1.0000x` mean Gelis measured faster for that cell.

## Outcome summary

- Hono: Gelis faster in **16/16** measured cells.
- Elysia stable default: Gelis faster in **4/16** measured cells.
- Elysia stable `precompile: true`: Gelis faster in **4/16** measured cells.
- Elysia 2 beta.14 source runtime: Gelis faster in **5/16** measured cells.
- At 5,000 Hono dynamic routes, Gelis measured `41.2294x` faster on raw and `27.4950x` faster on JSON direct dispatch.
- Elysia remains the stronger direct-dispatch target overall, especially JSON and dynamic JSON paths. CP2-D therefore does **not** establish a universal Gelis performance crown.

## Authoritative table

| competitor               | routes | scenario     | Gelis ns/op | competitor ns/op |    ratio | Gelis-first | competitor-first | completion |
| ------------------------ | -----: | ------------ | ----------: | ---------------: | -------: | ----------: | ---------------: | ---------- |
| hono                     |      1 | static-raw   |       395.4 |            579.0 |  1.4574x |     1.4927x |          1.4403x | sync/sync  |
| elysia-stable            |      1 | static-raw   |       409.2 |            337.5 |  0.8331x |     0.8086x |          0.8431x | sync/sync  |
| elysia-stable-precompile |      1 | static-raw   |       384.0 |            311.0 |  0.8100x |     0.7988x |          0.8386x | sync/sync  |
| elysia-next              |      1 | static-raw   |       376.7 |            429.6 |  1.1567x |     1.1539x |          1.1567x | sync/sync  |
| hono                     |      1 | dynamic-raw  |       553.7 |            777.9 |  1.3480x |     1.3424x |          1.3559x | sync/sync  |
| elysia-stable            |      1 | dynamic-raw  |       560.3 |            483.1 |  0.8973x |     0.9182x |          0.8385x | sync/sync  |
| elysia-stable-precompile |      1 | dynamic-raw  |       549.6 |            483.7 |  0.8784x |     0.8796x |          0.8784x | sync/sync  |
| elysia-next              |      1 | dynamic-raw  |       546.3 |            518.0 |  0.9290x |     0.9281x |          0.9325x | sync/sync  |
| hono                     |      1 | static-json  |       715.6 |           1128.8 |  1.5801x |     1.7932x |          1.5801x | sync/sync  |
| elysia-stable            |      1 | static-json  |       762.3 |            537.3 |  0.7174x |     0.7109x |          0.7174x | sync/sync  |
| elysia-stable-precompile |      1 | static-json  |       709.8 |            524.0 |  0.7319x |     0.7272x |          0.8079x | sync/sync  |
| elysia-next              |      1 | static-json  |       707.4 |            579.7 |  0.8292x |     0.7940x |          0.8390x | sync/sync  |
| hono                     |      1 | dynamic-json |       864.6 |           1306.0 |  1.5097x |     1.5082x |          1.5608x | sync/sync  |
| elysia-stable            |      1 | dynamic-json |       905.7 |            641.8 |  0.7118x |     0.7268x |          0.7089x | sync/sync  |
| elysia-stable-precompile |      1 | dynamic-json |       857.4 |            642.6 |  0.7617x |     0.7429x |          0.7835x | sync/sync  |
| elysia-next              |      1 | dynamic-json |       854.0 |            674.2 |  0.7943x |     0.7990x |          0.7941x | sync/sync  |
| hono                     |    100 | static-raw   |       379.7 |            554.2 |  1.4713x |     1.4608x |          1.4755x | sync/sync  |
| elysia-stable            |    100 | static-raw   |       373.0 |            307.7 |  0.8347x |     0.8263x |          0.8480x | sync/sync  |
| elysia-stable-precompile |    100 | static-raw   |       376.1 |            310.4 |  0.8187x |     0.8364x |          0.8131x | sync/sync  |
| elysia-next              |    100 | static-raw   |       380.0 |            443.7 |  1.1705x |     1.1643x |          1.1705x | sync/sync  |
| hono                     |    100 | dynamic-raw  |       571.9 |           1089.5 |  1.9055x |     1.8603x |          2.0919x | sync/sync  |
| elysia-stable            |    100 | dynamic-raw  |       537.0 |            495.7 |  0.9218x |     0.9506x |          0.9157x | sync/sync  |
| elysia-stable-precompile |    100 | dynamic-raw  |       561.2 |            502.5 |  0.8902x |     0.9176x |          0.8601x | sync/sync  |
| elysia-next              |    100 | dynamic-raw  |       591.6 |            604.0 |  1.0247x |     1.0228x |          1.0949x | sync/sync  |
| hono                     |    100 | static-json  |       708.2 |           1124.8 |  1.5627x |     1.5267x |          1.6420x | sync/sync  |
| elysia-stable            |    100 | static-json  |       734.9 |            549.0 |  0.7250x |     0.7489x |          0.7098x | sync/sync  |
| elysia-stable-precompile |    100 | static-json  |       722.3 |            535.6 |  0.7428x |     0.7480x |          0.7428x | sync/sync  |
| elysia-next              |    100 | static-json  |       714.7 |            603.8 |  0.8353x |     0.8330x |          0.8413x | sync/sync  |
| hono                     |    100 | dynamic-json |       868.2 |           1849.5 |  2.1353x |     2.1619x |          2.1038x | sync/sync  |
| elysia-stable            |    100 | dynamic-json |       872.3 |            670.8 |  0.7601x |     0.7663x |          0.7512x | sync/sync  |
| elysia-stable-precompile |    100 | dynamic-json |       881.6 |            669.0 |  0.7756x |     0.7793x |          0.7623x | sync/sync  |
| elysia-next              |    100 | dynamic-json |       874.1 |            692.1 |  0.8067x |     0.7939x |          0.8072x | sync/sync  |
| hono                     |   1000 | static-raw   |       378.8 |            560.0 |  1.4970x |     1.4955x |          1.4970x | sync/sync  |
| elysia-stable            |   1000 | static-raw   |       419.9 |            538.7 |  1.2938x |     1.3704x |          1.2611x | sync/sync  |
| elysia-stable-precompile |   1000 | static-raw   |       380.5 |            513.5 |  1.3542x |     1.3572x |          1.2704x | sync/sync  |
| elysia-next              |   1000 | static-raw   |       394.1 |            451.7 |  1.1299x |     1.1366x |          1.1299x | sync/sync  |
| hono                     |   1000 | dynamic-raw  |       572.2 |           5840.2 | 10.1755x |    10.1061x |         10.4980x | sync/sync  |
| elysia-stable            |   1000 | dynamic-raw  |       551.5 |            518.2 |  0.9205x |     0.9294x |          0.9205x | sync/sync  |
| elysia-stable-precompile |   1000 | dynamic-raw  |       554.8 |            511.1 |  0.9238x |     0.9252x |          0.9177x | sync/sync  |
| elysia-next              |   1000 | dynamic-raw  |       582.0 |            551.7 |  0.9988x |     1.0063x |          0.9425x | sync/sync  |
| hono                     |   1000 | static-json  |       729.0 |           1126.4 |  1.5616x |     1.5389x |          1.5733x | sync/sync  |
| elysia-stable            |   1000 | static-json  |       710.6 |            755.9 |  1.0633x |     1.0804x |          1.0633x | sync/sync  |
| elysia-stable-precompile |   1000 | static-json  |       707.8 |            736.4 |  1.0228x |     1.0465x |          1.0228x | sync/sync  |
| elysia-next              |   1000 | static-json  |       712.9 |            600.9 |  0.8441x |     0.8301x |          0.8479x | sync/sync  |
| hono                     |   1000 | dynamic-json |       876.2 |           6536.4 |  7.5337x |     7.4889x |          7.5670x | sync/sync  |
| elysia-stable            |   1000 | dynamic-json |       885.8 |            749.5 |  0.8047x |     0.8083x |          0.8047x | sync/sync  |
| elysia-stable-precompile |   1000 | dynamic-json |       879.7 |            690.0 |  0.7845x |     0.8015x |          0.7725x | sync/sync  |
| elysia-next              |   1000 | dynamic-json |       889.3 |            718.4 |  0.8226x |     0.8184x |          0.8423x | sync/sync  |
| hono                     |   5000 | static-raw   |       386.5 |            539.6 |  1.3944x |     1.4173x |          1.3899x | sync/sync  |
| elysia-stable            |   5000 | static-raw   |       384.3 |            529.0 |  1.3772x |     1.3733x |          1.3990x | sync/sync  |
| elysia-stable-precompile |   5000 | static-raw   |       397.2 |            579.6 |  1.4520x |     1.4856x |          1.4038x | sync/sync  |
| elysia-next              |   5000 | static-raw   |       427.5 |            453.6 |  1.0436x |     1.0582x |          0.9894x | sync/sync  |
| hono                     |   5000 | dynamic-raw  |       568.3 |          23511.7 | 41.2294x |    40.6501x |         41.7986x | sync/sync  |
| elysia-stable            |   5000 | dynamic-raw  |       564.0 |            539.4 |  0.9712x |     0.9602x |          0.9853x | sync/sync  |
| elysia-stable-precompile |   5000 | dynamic-raw  |       585.0 |            530.7 |  0.9230x |     0.9194x |          0.9230x | sync/sync  |
| elysia-next              |   5000 | dynamic-raw  |       591.1 |            592.4 |  0.9970x |     1.0258x |          0.9849x | sync/sync  |
| hono                     |   5000 | static-json  |       744.7 |           1133.2 |  1.4831x |     1.4699x |          1.5846x | sync/sync  |
| elysia-stable            |   5000 | static-json  |       790.5 |            825.9 |  1.0388x |     1.0217x |          1.0691x | sync/sync  |
| elysia-stable-precompile |   5000 | static-json  |       742.9 |            826.7 |  1.1298x |     1.1621x |          1.1067x | sync/sync  |
| elysia-next              |   5000 | static-json  |       742.3 |            598.0 |  0.8205x |     0.7905x |          0.8561x | sync/sync  |
| hono                     |   5000 | dynamic-json |       909.9 |          24578.1 | 27.4950x |    27.4854x |         27.5041x | sync/sync  |
| elysia-stable            |   5000 | dynamic-json |       871.4 |            699.2 |  0.7960x |     0.8086x |          0.7804x | sync/sync  |
| elysia-stable-precompile |   5000 | dynamic-json |       884.1 |            733.2 |  0.8449x |     0.8566x |          0.8313x | sync/sync  |
| elysia-next              |   5000 | dynamic-json |       874.3 |            732.6 |  0.8396x |     0.8343x |          0.8396x | sync/sync  |

Final harness output: `CP2-D LOCAL CROWN RUN: COMPLETE`.
