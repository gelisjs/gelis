# Gelis Runtime Benchmark Baseline v0.1

**Status:** Baseline 5 — portable router v0.1 accepted  
**Date:** 2026-08-31

## Environment

- Runtime: Bun 1.4.0
- CPU: Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz
- Logical CPUs: 12
- Memory: 24398 MB
- Samples: 7

## Correctness gate

The production scanner router passed:

- core TypeScript check;
- type-system tests;
- runtime-test TypeScript check;
- 19 runtime tests;
- 0 runtime failures.

Covered behavior includes:

- exact static routes;
- required dynamic parameters;
- static-route precedence;
- fallback from a dead static branch;
- module mounting;
- 404 handling;
- string, undefined, null, raw `Response`, and JSON normalization;
- explicit `reply.status()`;
- duplicate route detection;
- asynchronous handlers;
- query-string-independent matching;
- root URLs;
- percent-decoded parameters;
- rejection of unmatched trailing path segments.

## Dynamic-router experiment

| Scenario        | Routes | ns/op |      ops/s |
| --------------- | -----: | ----: | ---------: |
| current-dynamic |      1 |    87 | 11,510,667 |
| scanner-dynamic |      1 |    86 | 11,610,220 |
| current-dynamic |    100 |   159 |  6,274,762 |
| scanner-dynamic |    100 |   182 |  5,495,226 |
| current-dynamic |  1,000 |   179 |  5,584,304 |
| scanner-dynamic |  1,000 |   181 |  5,523,259 |
| current-dynamic |  5,000 |   180 |  5,559,730 |
| scanner-dynamic |  5,000 |   188 |  5,328,796 |

After the scanner was ported into production, the production router performs at
least as well as the standalone scanner experiment. The standalone experiment is
therefore no longer the canonical implementation benchmark.

## Integrated runtime benchmark

| Scenario                  | Routes | ns/op |      ops/s |
| ------------------------- | -----: | ----: | ---------: |
| router-static             |      1 |    14 | 69,007,657 |
| router-dynamic            |      1 |   107 |  9,322,495 |
| dispatch-static           |      1 |    32 | 30,898,798 |
| dispatch-dynamic          |      1 |   113 |  8,884,295 |
| fetch-direct-static-raw   |      1 |   147 |  6,788,789 |
| fetch-direct-dynamic-raw  |      1 |   245 |  4,076,581 |
| fetch-direct-static-json  |      1 |   515 |  1,943,600 |
| fetch-direct-dynamic-json |      1 |   650 |  1,538,383 |
| router-static             |    100 |    34 | 29,772,089 |
| router-dynamic            |    100 |   146 |  6,843,071 |
| dispatch-static           |    100 |    34 | 29,565,116 |
| dispatch-dynamic          |    100 |   158 |  6,334,079 |
| fetch-direct-static-raw   |    100 |   162 |  6,170,988 |
| fetch-direct-dynamic-raw  |    100 |   306 |  3,263,469 |
| fetch-direct-static-json  |    100 |   655 |  1,526,811 |
| fetch-direct-dynamic-json |    100 |   710 |  1,408,999 |
| router-static             |  1,000 |    33 | 30,046,499 |
| router-dynamic            |  1,000 |   225 |  4,435,901 |
| dispatch-static           |  1,000 |    47 | 21,090,365 |
| dispatch-dynamic          |  1,000 |   205 |  4,873,793 |
| fetch-direct-static-raw   |  1,000 |   168 |  5,944,660 |
| fetch-direct-dynamic-raw  |  1,000 |   337 |  2,965,389 |
| fetch-direct-static-json  |  1,000 |   556 |  1,799,353 |
| fetch-direct-dynamic-json |  1,000 |   760 |  1,315,008 |
| router-static             |  5,000 |    34 | 29,073,895 |
| router-dynamic            |  5,000 |   194 |  5,162,553 |
| dispatch-static           |  5,000 |    50 | 20,179,423 |
| dispatch-dynamic          |  5,000 |   206 |  4,846,852 |
| fetch-direct-static-raw   |  5,000 |   180 |  5,567,830 |
| fetch-direct-dynamic-raw  |  5,000 |   365 |  2,739,227 |
| fetch-direct-static-json  |  5,000 |   602 |  1,660,496 |
| fetch-direct-dynamic-json |  5,000 |   798 |  1,252,580 |

## Scanner impact at 5,000 routes

Compared with the immediately previous production router:

| Scenario                  | Before ns/op | After ns/op | Latency reduction |
| ------------------------- | -----------: | ----------: | ----------------: |
| router-dynamic            |          281 |         194 |             31.0% |
| fetch-direct-dynamic-raw  |          455 |         365 |             19.8% |
| fetch-direct-dynamic-json |          933 |         798 |             14.5% |

Static paths remained effectively unchanged.

## Improvement from the original portable baseline

| Scenario     | Original ns/op | Current ns/op | Latency reduction |
| ------------ | -------------: | ------------: | ----------------: |
| static raw   |            582 |           180 |             69.1% |
| dynamic raw  |            935 |           365 |             61.0% |
| static JSON  |          1,172 |           602 |             48.6% |
| dynamic JSON |          1,685 |           798 |             52.6% |

## Accepted portable runtime decisions

- exact static routes use a method-local `Map`;
- dynamic routes use a segment trie;
- request-time dynamic matching scans the pathname directly without a segment array;
- parameter substrings are delayed until a successful match;
- static trie branches have priority with parameter fallback;
- absolute request URLs use a direct pathname scanner with standards fallback;
- synchronous handlers stay synchronous;
- `Response.json()` remains the ordinary JSON response path;
- common response normalization uses a fast default-status path;
- registration remains deliberately simpler than request-time matching.

## Milestone decision

The portable router/runtime baseline is sufficiently mature for v0.1.

Do not continue nanosecond-level optimization of the portable core before a real
HTTP benchmark identifies a user-visible bottleneck.

The next milestone is the Bun serving path and a same-machine HTTP benchmark
against Hono and Elysia using identical:

- Bun version;
- route count and path shape;
- response payload;
- server process model;
- benchmark client;
- connection count;
- pipelining;
- warm-up;
- duration.

Internal microbenchmark results must not be compared directly with public
framework benchmark claims.
