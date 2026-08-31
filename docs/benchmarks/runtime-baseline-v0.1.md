# Gelis Portable Runtime Benchmark Baseline v0.1

**Status:** Portable router/runtime baseline accepted  
**Date:** 2026-08-31

This is an intentionally historical regression reference from before validation and middleware work.

## Environment

- Bun: 1.4.0
- CPU: Intel Core i5-10500H @ 2.50GHz
- Memory: ~24 GB
- Samples: 7

## 5,000-route baseline

| Scenario                  | ns/op |      ops/s |
| ------------------------- | ----: | ---------: |
| router-static             |    34 | 29,073,895 |
| router-dynamic            |   194 |  5,162,553 |
| dispatch-static           |    50 | 20,179,423 |
| dispatch-dynamic          |   206 |  4,846,852 |
| fetch-direct-static-raw   |   180 |  5,567,830 |
| fetch-direct-dynamic-raw  |   365 |  2,739,227 |
| fetch-direct-static-json  |   602 |  1,660,496 |
| fetch-direct-dynamic-json |   798 |  1,252,580 |

## Improvement from original portable baseline

| Scenario     | Original ns/op | Accepted ns/op | Latency reduction |
| ------------ | -------------: | -------------: | ----------------: |
| static raw   |            582 |            180 |             69.1% |
| dynamic raw  |            935 |            365 |             61.0% |
| static JSON  |          1,172 |            602 |             48.6% |
| dynamic JSON |          1,685 |            798 |             52.6% |

## Accepted decisions

- method-local static `Map`;
- dynamic segment trie;
- scanner-based request matching;
- delayed param slicing;
- static-edge priority with param fallback;
- fast pathname extraction with standards fallback;
- sync handlers stay sync;
- promise-like detection instead of unconditional `await`;
- `Response.json()` for ordinary JSON;
- registration may remain simpler than hot request code.

## Purpose

Later validation, middleware, error, and adapter work should use this baseline as a regression reference.

Do not compare these nanosecond microbenchmarks directly to external framework HTTP benchmark claims.
