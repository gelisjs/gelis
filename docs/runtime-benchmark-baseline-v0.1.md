# Gelis Runtime Benchmark Baseline v0.1

**Status:** Baseline 2 — pathname and synchronous-handler fast paths  
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
- 0 runtime test failures.

The runtime tests include static and dynamic matching, static-route precedence,
dynamic fallback, module mounting, 404 handling, response normalization,
typed `reply.status()`, duplicate-route detection, asynchronous handlers,
query-string matching, and root URL matching.

## Component profiling before optimization

| Component                                | ns/op |
| ---------------------------------------- | ----: |
| `new URL(url).pathname`                  |   165 |
| fast absolute-URL pathname scan          |    42 |
| context creation                         |    17 |
| synchronous handler                      |     4 |
| raw-response normalization               |     5 |
| JSON normalization                       |   478 |
| await synchronous handler                |   135 |
| await asynchronous handler               |   138 |
| promise-like check on synchronous result |     7 |

The profile identified pathname parsing and unconditional `await` as the first
high-value optimization targets.

## Optimizations applied

### Absolute URL pathname fast path

Normal absolute HTTP(S) request URLs use a direct pathname scan instead of
constructing a new `URL` object.

A standards-based `URL` fallback remains available for unsupported URL shapes.

### Synchronous handler fast path

`app.fetch()` no longer unconditionally awaits every route handler.

Synchronous handlers normalize their result immediately. Promise-like results
take the asynchronous continuation path.

The public call pattern remains compatible with:

```ts
const response = await app.fetch(request);
```

because `await` accepts both `Response` and `Promise<Response>`.

## Route registration after optimization

| Kind    | Routes | Median ms | Routes/ms |
| ------- | -----: | --------: | --------: |
| static  |      1 |     0.002 |       500 |
| dynamic |      1 |     0.003 |       323 |
| static  |    100 |     0.080 |     1,256 |
| dynamic |    100 |     0.107 |       933 |
| static  |  1,000 |     0.303 |     3,305 |
| dynamic |  1,000 |     0.466 |     2,148 |
| static  |  5,000 |     1.635 |     3,059 |
| dynamic |  5,000 |     2.602 |     1,922 |

## Runtime dispatch after optimization

| Scenario           | Routes | ns/op |      ops/s |
| ------------------ | -----: | ----: | ---------: |
| router-static      |      1 |    14 | 70,000,653 |
| router-dynamic     |      1 |   199 |  5,020,212 |
| dispatch-static    |      1 |    33 | 30,497,444 |
| dispatch-dynamic   |      1 |   208 |  4,817,456 |
| fetch-static-raw   |      1 |   290 |  3,452,049 |
| fetch-dynamic-raw  |      1 |   489 |  2,044,017 |
| fetch-static-json  |      1 |   787 |  1,270,706 |
| fetch-dynamic-json |      1 | 1,076 |    929,418 |
| router-static      |    100 |    34 | 29,159,353 |
| router-dynamic     |    100 |   233 |  4,293,212 |
| dispatch-static    |    100 |    35 | 28,701,496 |
| dispatch-dynamic   |    100 |   252 |  3,974,000 |
| fetch-static-raw   |    100 |   312 |  3,204,866 |
| fetch-dynamic-raw  |    100 |   531 |  1,882,735 |
| fetch-static-json  |    100 |   835 |  1,196,904 |
| fetch-dynamic-json |    100 | 1,152 |    868,019 |
| router-static      |  1,000 |    33 | 30,407,068 |
| router-dynamic     |  1,000 |   269 |  3,719,673 |
| dispatch-static    |  1,000 |    46 | 21,526,082 |
| dispatch-dynamic   |  1,000 |   290 |  3,446,656 |
| fetch-static-raw   |  1,000 |   312 |  3,202,773 |
| fetch-dynamic-raw  |  1,000 |   590 |  1,695,122 |
| fetch-static-json  |  1,000 |   848 |  1,179,151 |
| fetch-dynamic-json |  1,000 | 1,204 |    830,530 |
| router-static      |  5,000 |    37 | 27,292,230 |
| router-dynamic     |  5,000 |   283 |  3,538,067 |
| dispatch-static    |  5,000 |    47 | 21,444,910 |
| dispatch-dynamic   |  5,000 |   301 |  3,324,483 |
| fetch-static-raw   |  5,000 |   329 |  3,035,999 |
| fetch-dynamic-raw  |  5,000 |   629 |  1,589,836 |
| fetch-static-json  |  5,000 |   896 |  1,115,488 |
| fetch-dynamic-json |  5,000 | 1,281 |    780,777 |

## Before/after at 5,000 routes

| Scenario           | Baseline 1 ns/op | Baseline 2 ns/op | Improvement |
| ------------------ | ---------------: | ---------------: | ----------: |
| static raw fetch   |              582 |              329 | 43.5% lower |
| dynamic raw fetch  |              935 |              629 | 32.7% lower |
| static JSON fetch  |            1,172 |              896 | 23.5% lower |
| dynamic JSON fetch |            1,685 |            1,281 | 24.0% lower |

The router numbers remained broadly stable, supporting the conclusion that the
improvement came from the fetch-path optimizations rather than changes in route
matching.

## Current hotspot order

Measured or inferred high-value costs now include:

1. JSON response construction/serialization;
2. dynamic route matching;
3. pathname extraction;
4. context allocation;
5. static route matching;
6. raw response normalization.

The pathname and synchronous-handler costs have already been materially reduced.

## Next decision

Keep the current static `Map` implementation.

Before modifying the dynamic trie, benchmark a direct path-segment scanner
against the current `slice + split + recursive trie` matcher in isolation.

Only replace the current dynamic matcher if the candidate produces a meaningful
repeatable gain while preserving:

- static-segment precedence;
- fallback from a dead static branch to a parameter branch;
- required named parameters;
- percent-decoded parameter values;
- duplicate-pattern detection;
- 5,000-route scaling.

After the portable router is optimized, establish a same-machine Bun HTTP
comparison against current Hono and Elysia using identical routes and payloads.
