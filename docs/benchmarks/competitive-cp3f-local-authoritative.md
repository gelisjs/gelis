# Competitive Performance v0.1 — CP3-F Local Authoritative Result

Date: 2026-09-11

## Classification

**CP3-F LOCAL RESIDUAL DECOMPOSITION RUN: VALID / ACCEPTED AS DECOMPOSITION EVIDENCE**

This is decomposition evidence used to choose the next optimization target. It is not itself a production-code acceptance gate.

## Frozen identity

- Harness SHA: `a16769a950e6a420e150da0d01c086b7f53a6167`
- Frozen Gelis production source: `98d8c00bfda8913a951bdf8780e136672646a90c`
- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- CPU: Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz
- Routes: 5,000
- Samples: 11 fresh worker processes per cell
- Correctness probe before timing: 16/16 PASS
- GitHub Quality on harness SHA: SUCCESS

## Authoritative medians

| cell                   | median ns/op |
| ---------------------- | -----------: |
| router-static-consume  |          2.8 |
| router-dynamic-consume |         26.6 |
| router-static-escape   |         16.8 |
| router-dynamic-escape  |         26.0 |
| response-json-static   |        467.8 |
| response-json-dynamic  |        468.2 |
| normalize-static-json  |        482.4 |
| normalize-dynamic-json |        481.9 |
| pipeline-static-raw    |        339.8 |
| pipeline-dynamic-raw   |        512.0 |
| pipeline-static-json   |        562.5 |
| pipeline-dynamic-json  |        705.8 |
| app-fetch-static-raw   |        359.3 |
| app-fetch-dynamic-raw  |        533.9 |
| app-fetch-static-json  |        566.1 |
| app-fetch-dynamic-json |        726.2 |

## Derived diagnostics

| diagnostic                                |   value |
| ----------------------------------------- | ------: |
| router dynamic/static consume             | 9.3863x |
| router static escape/consume              | 5.9256x |
| router dynamic escape/consume             | 0.9764x |
| normalize static / Response.json static   | 1.0311x |
| normalize dynamic / Response.json dynamic | 1.0292x |
| app.fetch - pipeline static raw           | 19.5 ns |
| app.fetch - pipeline dynamic raw          | 22.0 ns |
| app.fetch - pipeline static JSON          |  3.6 ns |
| app.fetch - pipeline dynamic JSON         | 20.4 ns |
| dynamic/static app.fetch raw              | 1.4862x |
| dynamic/static app.fetch JSON             | 1.2828x |

Additional engineering decomposition from the authoritative medians:

- Static JSON app.fetch minus `Response.json`: **98.3 ns**.
- Dynamic JSON app.fetch minus `Response.json`: **258.0 ns**.
- Dynamic minus static JSON app.fetch: **160.1 ns**.
- Dynamic minus static router consume: **23.8 ns**.
- Dynamic/static residual not explained by isolated router lookup: approximately **136.3 ns**. This is non-additive and is used only to choose the next decomposition target.
- Static normalize overhead over `Response.json`: approximately **3.12%**.
- Dynamic normalize overhead over `Response.json`: approximately **2.93%**.

## Interpretation

1. CP3-C JSON success fast path is confirmed structurally: normalization is now close to the Bun `Response.json()` primitive. Response normalization is no longer the dominant Gelis-owned residual cost.
2. The static router hot path remains exceptionally small at 2.8 ns/op in this isolated consumed-result cell.
3. Dynamic lookup itself is 26.6 ns/op, but the full dynamic JSON path remains roughly 160 ns slower than static JSON at app.fetch. Therefore most of the remaining dynamic penalty is not explained by lookup alone.
4. Forced escape materially changes the static router cell but does not worsen the dynamic cell. This supports treating allocation/materialization behavior separately from lookup cost.
5. `app.fetch` integration overhead above the manually reproduced pipeline is small in all four cells. The outer application boundary is not the primary next target.
6. `Response.json()` itself remains the dominant absolute primitive cost for small JSON responses, but it is a Bun/Web Response primitive rather than a Gelis-specific tax. Gelis should not weaken semantics merely to bypass it in the portable core.

## Next direction

Freeze CP3-G as a focused **dynamic residual decomposition**. It must split the remaining dynamic-path cost into at least:

- trailing-parameter boundary discovery / prefix lookup,
- parameter value slicing and percent-decode check,
- parameter object materialization,
- route-match wrapper/materialization behavior,
- runtime context creation / handoff into the handler,
- dynamic handler payload construction,
- integrated dynamic pipeline.

The purpose is to identify a structural optimization opportunity, not to tune a benchmark-specific branch. Any production candidate must preserve routing grammar, decoded params, static precedence, method isolation, concurrency safety, zero-unused behavior, memory discipline, and the existing handler API semantics.
