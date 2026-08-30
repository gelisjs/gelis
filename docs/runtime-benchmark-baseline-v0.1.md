# Gelis Runtime Benchmark Baseline v0.1

**Status:** Baseline 4 — response normalization fast path validated  
**Date:** 2026-08-31

## Environment

- Runtime: Bun 1.4.0
- CPU: Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz
- Logical CPUs: 12
- Memory: 24398 MB
- Samples: 7

## Correctness

The optimized runtime previously passed 15 runtime tests. The response-normalization
optimization must remain gated by the expanded runtime test suite before merge.

## Response component benchmark

| Scenario                     | ns/op |       ops/s |
| ---------------------------- | ----: | ----------: |
| pathname-new-url             |   162 |   6,191,773 |
| pathname-fast-scan           |    41 |  24,529,723 |
| context-create               |    16 |  62,374,128 |
| handler-sync                 |     4 | 251,234,420 |
| normalize-raw                |     8 | 121,035,614 |
| normalize-json               |   346 |   2,891,884 |
| normalize-string             |   553 |   1,807,687 |
| normalize-undefined          |   346 |   2,890,472 |
| normalize-reply-json         |   662 |   1,509,598 |
| json-stringify               |    76 |  13,157,644 |
| response-json-direct         |   507 |   1,971,978 |
| response-json-manual         |   683 |   1,464,380 |
| response-json-pre-serialized |   592 |   1,688,202 |
| await-sync-handler           |   141 |   7,093,073 |
| await-async-handler          |   146 |   6,859,525 |
| promise-check-sync           |     4 | 244,765,132 |

Individual component microbenchmarks are useful for finding candidates, but direct
cross-case comparisons can be affected by JIT inlining and escape analysis. The
integrated before/after `app.fetch()` benchmark is the canonical acceptance signal.

## Runtime dispatch after response normalization optimization

| Scenario                  | Routes | ns/op |      ops/s |
| ------------------------- | -----: | ----: | ---------: |
| router-static             |      1 |    14 | 72,139,541 |
| router-dynamic            |      1 |   198 |  5,051,428 |
| dispatch-static           |      1 |    33 | 30,135,127 |
| dispatch-dynamic          |      1 |   205 |  4,885,781 |
| fetch-direct-static-raw   |      1 |   151 |  6,609,226 |
| fetch-direct-dynamic-raw  |      1 |   336 |  2,979,868 |
| fetch-direct-static-json  |      1 |   515 |  1,942,193 |
| fetch-direct-dynamic-json |      1 |   773 |  1,292,977 |
| router-static             |    100 |    33 | 30,319,856 |
| router-dynamic            |    100 |   235 |  4,260,193 |
| dispatch-static           |    100 |    34 | 29,427,072 |
| dispatch-dynamic          |    100 |   245 |  4,085,971 |
| fetch-direct-static-raw   |    100 |   168 |  5,944,964 |
| fetch-direct-dynamic-raw  |    100 |   376 |  2,657,121 |
| fetch-direct-static-json  |    100 |   717 |  1,393,824 |
| fetch-direct-dynamic-json |    100 |   975 |  1,026,152 |
| router-static             |  1,000 |    35 | 28,911,662 |
| router-dynamic            |  1,000 |   284 |  3,523,974 |
| dispatch-static           |  1,000 |    48 | 20,954,060 |
| dispatch-dynamic          |  1,000 |   291 |  3,438,389 |
| fetch-direct-static-raw   |  1,000 |   175 |  5,710,666 |
| fetch-direct-dynamic-raw  |  1,000 |   433 |  2,309,381 |
| fetch-direct-static-json  |  1,000 |   569 |  1,758,609 |
| fetch-direct-dynamic-json |  1,000 |   893 |  1,120,316 |
| router-static             |  5,000 |    31 | 32,044,073 |
| router-dynamic            |  5,000 |   281 |  3,556,441 |
| dispatch-static           |  5,000 |    46 | 21,963,127 |
| dispatch-dynamic          |  5,000 |   325 |  3,075,871 |
| fetch-direct-static-raw   |  5,000 |   183 |  5,473,422 |
| fetch-direct-dynamic-raw  |  5,000 |   455 |  2,197,394 |
| fetch-direct-static-json  |  5,000 |   595 |  1,680,698 |
| fetch-direct-dynamic-json |  5,000 |   933 |  1,072,314 |

## Before/after response-normalization optimization at 5,000 routes

| Scenario     | Previous ns/op | Current ns/op | Change |
| ------------ | -------------: | ------------: | -----: |
| static raw   |            180 |           183 |  +1.7% |
| dynamic raw  |            460 |           455 |  -1.1% |
| static JSON  |            722 |           595 | -17.6% |
| dynamic JSON |          1,090 |           933 | -14.4% |

The raw-path changes are within ordinary benchmark variance. JSON paths improved
materially and consistently, so the normalization fast path is accepted.

## Improvement from the original portable baseline at 5,000 routes

| Scenario     | Original ns/op | Current ns/op | Latency reduction |
| ------------ | -------------: | ------------: | ----------------: |
| static raw   |            582 |           183 |             68.6% |
| dynamic raw  |            935 |           455 |             51.3% |
| static JSON  |          1,172 |           595 |             49.2% |
| dynamic JSON |          1,685 |           933 |             44.6% |

## Decisions

- Keep the static exact-path `Map`.
- Keep `Response.json()` for ordinary JSON responses.
- Keep the synchronous `app.fetch()` fast path.
- Keep the absolute-request-URL pathname scanner.
- Keep the common-case response-normalization fast path.
- Do not optimize route registration based on the current short-duration samples.

## Next profiling target

The largest framework-owned cost remaining in the common dynamic route path is
dynamic matching, approximately 281 ns at 5,000 routes.

Before modifying production routing code, benchmark a scanner-based dynamic trie
matcher that:

- reads path segments by index instead of `slice(1).split('/')`;
- avoids allocating the segment array;
- delays parameter substring creation until a route is successfully matched;
- preserves static-child priority and fallback to parameter children;
- preserves required named parameters and percent decoding.

Only replace the production matcher if the integrated dynamic fetch benchmark
shows a repeatable material improvement and all routing correctness tests remain
green.
