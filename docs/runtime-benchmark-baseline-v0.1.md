# Gelis Runtime Benchmark Baseline v0.1

**Status:** Baseline 3 — direct synchronous fetch path validated  
**Date:** 2026-08-31

## Environment

- Runtime: Bun 1.4.0
- CPU: Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz
- Logical CPUs: 12
- Memory: 24398 MB
- Samples: 7

## Correctness gate

The optimized runtime passed:

- core TypeScript check;
- type-system tests;
- runtime-test TypeScript check;
- 15 runtime tests;
- 0 runtime failures.

## Important benchmark correction

`Gelis.fetch()` intentionally returns:

```ts
Response | Promise<Response>;
```

so synchronous handlers can remain synchronous.

The earlier fetch benchmark used:

```ts
await app.fetch(request);
```

inside every timed iteration. That measured caller-side `await` overhead even when
the framework returned a synchronous `Response`.

The benchmark now measures the server-compatible direct path:

```ts
return app.fetch(request);
```

for synchronous handlers.

This is the appropriate portable fast-path baseline because a runtime adapter can
forward the returned `Response | Promise<Response>` directly.

## Runtime dispatch

| Scenario                  | Routes | ns/op |      ops/s |
| ------------------------- | -----: | ----: | ---------: |
| router-static             |      1 |    14 | 70,035,340 |
| router-dynamic            |      1 |   203 |  4,935,939 |
| dispatch-static           |      1 |    33 | 30,055,654 |
| dispatch-dynamic          |      1 |   256 |  3,912,873 |
| fetch-direct-static-raw   |      1 |   173 |  5,768,159 |
| fetch-direct-dynamic-raw  |      1 |   381 |  2,623,475 |
| fetch-direct-static-json  |      1 |   652 |  1,532,641 |
| fetch-direct-dynamic-json |      1 |   911 |  1,097,524 |
| router-static             |    100 |    35 | 28,452,468 |
| router-dynamic            |    100 |   252 |  3,975,371 |
| dispatch-static           |    100 |    36 | 28,042,802 |
| dispatch-dynamic          |    100 |   255 |  3,916,417 |
| fetch-direct-static-raw   |    100 |   177 |  5,642,171 |
| fetch-direct-dynamic-raw  |    100 |   384 |  2,605,196 |
| fetch-direct-static-json  |    100 |   701 |  1,426,058 |
| fetch-direct-dynamic-json |    100 |   947 |  1,056,073 |
| router-static             |  1,000 |    35 | 28,343,568 |
| router-dynamic            |  1,000 |   274 |  3,655,591 |
| dispatch-static           |  1,000 |    51 | 19,644,663 |
| dispatch-dynamic          |  1,000 |   314 |  3,183,328 |
| fetch-direct-static-raw   |  1,000 |   169 |  5,916,131 |
| fetch-direct-dynamic-raw  |  1,000 |   441 |  2,265,737 |
| fetch-direct-static-json  |  1,000 |   695 |  1,439,687 |
| fetch-direct-dynamic-json |  1,000 | 1,017 |    983,741 |
| router-static             |  5,000 |    33 | 30,493,049 |
| router-dynamic            |  5,000 |   295 |  3,389,267 |
| dispatch-static           |  5,000 |    48 | 20,901,026 |
| dispatch-dynamic          |  5,000 |   310 |  3,230,423 |
| fetch-direct-static-raw   |  5,000 |   180 |  5,554,904 |
| fetch-direct-dynamic-raw  |  5,000 |   460 |  2,174,235 |
| fetch-direct-static-json  |  5,000 |   722 |  1,385,592 |
| fetch-direct-dynamic-json |  5,000 | 1,090 |    917,538 |

## Improvement from the original portable baseline at 5,000 routes

| Scenario           | Original ns/op | Current ns/op | Latency reduction | Throughput factor |
| ------------------ | -------------: | ------------: | ----------------: | ----------------: |
| static raw fetch   |            582 |           180 |             69.1% |             3.23x |
| dynamic raw fetch  |            935 |           460 |             50.8% |             2.03x |
| static JSON fetch  |          1,172 |           722 |             38.4% |             1.62x |
| dynamic JSON fetch |          1,685 |         1,090 |             35.3% |             1.55x |

## Improvement from the previous awaited benchmark at 5,000 routes

| Scenario           | Awaited ns/op | Direct ns/op | Latency reduction |
| ------------------ | ------------: | -----------: | ----------------: |
| static raw fetch   |           329 |          180 |             45.3% |
| dynamic raw fetch  |           629 |          460 |             26.9% |
| static JSON fetch  |           896 |          722 |             19.4% |
| dynamic JSON fetch |         1,281 |        1,090 |             14.9% |

## JSON component results

| Component                            | ns/op |
| ------------------------------------ | ----: |
| `normalizeResponse(object)`          |   478 |
| `JSON.stringify(payload)`            |    69 |
| `Response.json(payload)`             |   342 |
| `JSON.stringify + new Response`      |   601 |
| pre-serialized JSON + `new Response` |   509 |

`Response.json()` is the fastest measured response-construction path. Gelis should
not replace it with manual `JSON.stringify + new Response`.

The remaining opportunity is reducing framework branching around
`Response.json()`, not replacing Bun's native Web Standard implementation.

## Current interpretation

At 5,000 routes:

- exact static matching is only ~33 ns;
- dynamic trie matching is ~295 ns;
- complete direct static raw fetch is ~180 ns;
- complete direct dynamic raw fetch is ~460 ns.

Static routing is not currently an optimization target.

The remaining static raw overhead above lookup is roughly 147 ns. Dynamic raw
adds roughly 165 ns above dynamic lookup. These values include pathname extraction,
runtime option checks, context construction, handler invocation, promise-like
detection, and response normalization.

JSON responses remain substantially more expensive because response construction
and serialization dominate the path.

## Registration note

The latest 5,000-route registration sample was slower than earlier runs despite
no registration-path implementation change.

Registration is allocation-heavy and completes in only a few milliseconds, so
the current sampling method is sensitive to GC/JIT noise. No architectural
conclusion should be drawn from that fluctuation.

A future registration benchmark should batch multiple complete router builds per
sample before registration performance is used for optimization decisions.

## Next optimization target

Optimize `normalizeResponse()` for the common default-status path while preserving:

- raw `Response` passthrough;
- `undefined -> 204`;
- text response normalization;
- JSON normalization using `Response.json()`;
- typed `reply.status()` runtime results;
- bodyless HTTP statuses.

Benchmark the optimized normalization independently and then rerun the full direct
fetch benchmark.

After response normalization, profile a non-allocating dynamic path-segment
scanner against the current `slice + split + trie` implementation.
