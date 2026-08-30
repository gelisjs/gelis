# Gelis Type-System Benchmark Report

**Status:** Baseline 3 — typed-client projection  
**Date:** 2026-08-31

## Environment

- Runtime: Bun 1.4.0
- TypeScript: 7.0.2
- CPU: Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz
- Logical CPUs: 12
- Memory: 24398 MB
- Runs per full benchmark case: 3
- Aggregation: median

## Results

| Scenario      | Routes | Instantiations | Memory MB | Check s | Total s | Check/base | Check/rich |
| ------------- | -----: | -------------: | --------: | ------: | ------: | ---------: | ---------: |
| baseline      |    100 |         36,143 |      65.8 |    0.23 |    0.27 |      1.00x |          - |
| routes        |    100 |         49,763 |      67.8 |    0.23 |    0.28 |      1.00x |          - |
| contract      |    100 |         69,263 |      70.6 |    0.24 |    0.28 |      1.04x |          - |
| rich-contract |    100 |        120,606 |      77.8 |    0.25 |    0.31 |      1.10x |          - |
| client        |    100 |        176,739 |      86.5 |    0.35 |    0.39 |      1.52x |      1.38x |
| baseline      |    500 |         42,147 |      70.6 |    0.24 |    0.29 |      1.00x |          - |
| routes        |    500 |         93,553 |      74.4 |    0.27 |    0.32 |      1.12x |          - |
| contract      |    500 |        158,851 |      86.0 |    0.26 |    0.30 |      1.09x |          - |
| rich-contract |    500 |        376,560 |     114.0 |    0.32 |    0.37 |      1.33x |          - |
| client        |    500 |        663,807 |     154.1 |    0.78 |    0.83 |      3.22x |      2.41x |
| baseline      |  1,000 |         49,647 |      76.6 |    0.24 |    0.29 |      1.00x |          - |
| routes        |  1,000 |        147,553 |      82.8 |    0.26 |    0.31 |      1.09x |          - |
| contract      |  1,000 |        264,920 |     104.3 |    0.39 |    0.45 |      1.64x |          - |
| rich-contract |  1,000 |        685,614 |     158.8 |    0.57 |    0.62 |      2.37x |          - |
| client        |  1,000 |      1,259,844 |     241.0 |    1.14 |    1.20 |      4.76x |      2.01x |
| baseline      |  5,000 |        109,647 |     125.3 |    0.30 |    0.36 |      1.00x |          - |
| routes        |  5,000 |        579,553 |     149.3 |    0.51 |    0.59 |      1.68x |          - |
| contract      |  5,000 |      1,134,580 |     252.9 |    1.14 |    1.22 |      3.78x |          - |
| rich-contract |  5,000 |      3,225,854 |     528.0 |    2.88 |    2.99 |      9.54x |          - |
| client        |  5,000 |      6,093,684 |     930.9 |    6.01 |    6.25 |     19.91x |      2.09x |

## Interpretation

The typed-client prototype preserves bounded growth and does not trigger deep-instantiation failure, but it is now the largest type-system hotspot.

At 5,000 rich endpoints, adding the client projection over the rich public contract adds approximately:

- 2,867,830 type instantiations;
- 402.9 MB compiler memory;
- 3.13 seconds check time.

The total 5,000-route client case is:

- 6,093,684 instantiations;
- 930.9 MB compiler memory;
- 6.01 seconds check time;
- 6.25 seconds total compiler time.

The growth shape is still broadly linear rather than explosive. That means the architecture is not fundamentally broken, but the client projection is expensive enough that it should be optimized before being accepted as the final public client type.

## Decision

Do not redesign the route/module/contract architecture.

Do not move to HTTP transport yet.

First optimize only the typed-client projection and benchmark it against this baseline.

The optimization should preserve:

- named client methods such as `client.users.find(...)`;
- request params/query/body inference;
- Standard Schema input types on the client;
- status/body discriminated response unions;
- Web Standard `Headers` and `Response` escape hatches.

The first optimization hypothesis is to reduce repeated conditional and indexed-access work in `ClientMethod` by decomposing a route contract once into request and response components, then constructing the client method from those components.

A new benchmark scenario should be kept side-by-side with the current `client` baseline until the optimized projection proves better.
