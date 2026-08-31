# Gelis Type-System Benchmark Baseline v0.1

**Status:** Accepted typed-client laziness baseline  
**Date:** 2026-08-31

## Environment

- Bun: 1.4.0
- TypeScript: 7.0.2
- CPU: Intel Core i5-10500H @ 2.50GHz
- Memory: ~24 GB
- Aggregation: median

## Scenarios

- `baseline`: plain TypeScript declarations;
- `routes`: route-local inference;
- `contract`: modules + `defineContract()` + public projection;
- `rich-contract`: params, query/body schema input/output, typed statuses, modules;
- `client-sparse`: 5,000 endpoints exist, only 10 client methods are inspected;
- `client-module`: one 50-route module is inspected;
- `client`: all client methods are exhaustively inspected.

## 5,000-route results

| Scenario      | Instantiations | Memory MB | Check s | Check/rich |
| ------------- | -------------: | --------: | ------: | ---------: |
| baseline      |        109,647 |     125.3 |    0.31 |          - |
| routes        |        579,553 |     149.3 |    0.42 |          - |
| contract      |      1,134,580 |     253.2 |    1.15 |          - |
| rich-contract |      3,225,854 |     528.1 |    2.84 |      1.00x |
| client-sparse |      3,204,634 |     472.2 |    2.73 |      0.96x |
| client-module |      3,225,654 |     475.3 |    3.16 |      1.11x |
| client        |      6,093,684 |     930.6 |    5.90 |      2.08x |

## Interpretation

The typed-client projection is lazy.

Merely constructing a client for a large contract does not eagerly expand every expensive method/result type.

At 5,000 rich endpoints, sparse and one-module inspection stay close to the backend rich-contract cost, while exhaustive inspection is intentionally much more expensive.

## Decision

The route/module/public-contract/client type architecture is accepted as the v0.1 direction.

Do not redesign it without evidence of non-linear growth, deep-instantiation failures, unacceptable editor latency, declaration-size problems, or TypeScript-version regressions.

## Ongoing measurements

Continue tracking:

- instantiations;
- compiler memory;
- check time;
- emitted `.d.ts` size;
- tsserver/IntelliSense latency;
- TypeScript version regressions.
