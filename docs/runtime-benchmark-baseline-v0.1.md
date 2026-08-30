# Gelis Runtime Benchmark Baseline v0.1

**Status:** Baseline 1 — portable runtime  
**Date:** 2026-08-31

## Environment

- Runtime: Bun 1.4.0
- CPU: Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz
- Logical CPUs: 12
- Memory: 24398 MB
- Samples: 7

## Route registration

| Kind    | Routes | Median ms | Routes/ms |
| ------- | -----: | --------: | --------: |
| static  |      1 |     0.002 |       476 |
| dynamic |      1 |     0.003 |       312 |
| static  |    100 |     0.068 |     1,462 |
| dynamic |    100 |     0.099 |     1,013 |
| static  |  1,000 |     0.343 |     2,916 |
| dynamic |  1,000 |     0.552 |     1,813 |
| static  |  5,000 |     1.796 |     2,783 |
| dynamic |  5,000 |     2.641 |     1,893 |

## Runtime dispatch

| Scenario           | Routes | ns/op |      ops/s |
| ------------------ | -----: | ----: | ---------: |
| router-static      |      1 |    14 | 71,784,648 |
| router-dynamic     |      1 |   201 |  4,977,842 |
| dispatch-static    |      1 |    31 | 31,987,002 |
| dispatch-dynamic   |      1 |   209 |  4,776,910 |
| fetch-static-raw   |      1 |   486 |  2,058,471 |
| fetch-dynamic-raw  |      1 |   712 |  1,403,708 |
| fetch-static-json  |      1 | 1,065 |    938,613 |
| fetch-dynamic-json |      1 | 1,428 |    700,261 |
| router-static      |    100 |    35 | 28,745,827 |
| router-dynamic     |    100 |   239 |  4,188,438 |
| dispatch-static    |    100 |    42 | 24,042,267 |
| dispatch-dynamic   |    100 |   320 |  3,126,184 |
| fetch-static-raw   |    100 |   705 |  1,419,062 |
| fetch-dynamic-raw  |    100 |   894 |  1,118,976 |
| fetch-static-json  |    100 | 1,126 |    887,781 |
| fetch-dynamic-json |    100 | 1,467 |    681,871 |
| router-static      |  1,000 |    34 | 29,685,053 |
| router-dynamic     |  1,000 |   285 |  3,504,505 |
| dispatch-static    |  1,000 |    49 | 20,261,919 |
| dispatch-dynamic   |  1,000 |   308 |  3,249,362 |
| fetch-static-raw   |  1,000 |   529 |  1,890,066 |
| fetch-dynamic-raw  |  1,000 |   858 |  1,166,053 |
| fetch-static-json  |  1,000 | 1,118 |    894,801 |
| fetch-dynamic-json |  1,000 | 1,608 |    621,786 |
| router-static      |  5,000 |    32 | 31,509,931 |
| router-dynamic     |  5,000 |   289 |  3,459,012 |
| dispatch-static    |  5,000 |    44 | 22,843,890 |
| dispatch-dynamic   |  5,000 |   319 |  3,135,036 |
| fetch-static-raw   |  5,000 |   582 |  1,717,795 |
| fetch-dynamic-raw  |  5,000 |   935 |  1,069,101 |
| fetch-static-json  |  5,000 | 1,172 |    853,567 |
| fetch-dynamic-json |  5,000 | 1,685 |    593,550 |

## Findings

### Route-table scaling

Static lookup remains effectively constant as the route table grows. At 5,000 routes, exact matching is still approximately 32 ns/op.

Dynamic matching also remains bounded by route shape rather than total route count. It grows from approximately 201 ns/op at one route to 289 ns/op at 5,000 routes.

There is no evidence of linear scanning across registered routes.

### Registration

Registration remains inexpensive:

- 5,000 static routes: 1.796 ms;
- 5,000 dynamic routes: 2.641 ms.

Registration cost is not currently a runtime optimization priority.

### Dispatch

Handler dispatch adds little cost over route matching:

- 5,000 static: 32 ns router → 44 ns dispatch;
- 5,000 dynamic: 289 ns router → 319 ns dispatch.

The handler invocation/context layer is therefore not the dominant cost in the current microbenchmark.

### Full `app.fetch()`

Portable `app.fetch()` is materially more expensive than direct dispatch:

- 5,000 static raw: 582 ns;
- 5,000 dynamic raw: 935 ns.

The current fetch path includes URL construction/pathname extraction, route matching, context construction, async/await handling, and response normalization.

This boundary is the highest-priority optimization target before changing the routing algorithm.

### JSON normalization

JSON response creation adds substantial cost:

- 5,000 static raw: 582 ns;
- 5,000 static JSON: 1,172 ns;
- 5,000 dynamic raw: 935 ns;
- 5,000 dynamic JSON: 1,685 ns.

Serialization and `Response` allocation are expected costs, but they should be isolated from framework dispatch when evaluating router performance.

## Decision

Keep the current static `Map` + dynamic trie architecture.

Do not optimize route registration yet.

Before adding middleware or validation, isolate and benchmark these fetch-path components:

1. `new URL(request.url).pathname`;
2. faster pathname extraction from an already-valid absolute request URL;
3. synchronous handler fast path versus unconditional `async`/`await`;
4. runtime context allocation;
5. response passthrough;
6. JSON normalization.

Only optimizations that are verified by benchmark and preserve correctness should be merged.
