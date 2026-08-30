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

# Gelis Type-System Benchmark Report

**Status:** Baseline 4 — typed-client laziness validated  
**Date:** 2026-08-31

## Environment

- Runtime: Bun 1.4.0
- TypeScript: 7.0.2
- CPU: Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz
- Logical CPUs: 12
- Memory: 24398 MB
- Runs per full benchmark case: 3
- Aggregation: median

## Scenarios

- `baseline`: plain TypeScript declarations.
- `routes`: route-local Gelis inference.
- `contract`: modules plus `defineContract()` and public contract projection.
- `rich-contract`: heavy routes with params, query/body Standard Schema input/output, three typed statuses, `reply.status()`, modules, and public contract access.
- `client-sparse`: 5,000-endpoint client may exist, but only 10 distributed client methods are inspected.
- `client-module`: only one 50-route module's client methods are inspected.
- `client`: every generated client method is exhaustively inspected.

## Results

| Scenario      | Routes | Instantiations | Memory MB | Check s | Total s | Check/base | Check/rich |
| ------------- | -----: | -------------: | --------: | ------: | ------: | ---------: | ---------: |
| baseline      |    100 |         36,143 |      65.9 |    0.24 |    0.28 |      1.00x |          - |
| routes        |    100 |         49,763 |      67.8 |    0.23 |    0.27 |      0.94x |          - |
| contract      |    100 |         69,263 |      70.6 |    0.24 |    0.28 |      1.00x |          - |
| rich-contract |    100 |        120,606 |      77.9 |    0.24 |    0.28 |      1.01x |          - |
| client-sparse |    100 |        124,989 |      77.9 |    0.30 |    0.34 |      1.24x |      1.23x |
| client-module |    100 |        147,769 |      82.2 |    0.31 |    0.35 |      1.27x |      1.26x |
| client        |    100 |        176,739 |      86.4 |    0.35 |    0.39 |      1.45x |      1.44x |
| baseline      |    500 |         42,147 |      70.5 |    0.23 |    0.28 |      1.00x |          - |
| routes        |    500 |         93,553 |      74.3 |    0.25 |    0.29 |      1.06x |          - |
| contract      |    500 |        158,851 |      86.0 |    0.26 |    0.31 |      1.13x |          - |
| rich-contract |    500 |        376,560 |     113.9 |    0.32 |    0.37 |      1.36x |          - |
| client-sparse |    500 |        382,057 |     110.5 |    0.50 |    0.54 |      2.14x |      1.57x |
| client-module |    500 |        403,077 |     113.4 |    0.51 |    0.56 |      2.19x |      1.61x |
| client        |    500 |        663,807 |     154.1 |    0.77 |    0.82 |      3.32x |      2.44x |
| baseline      |  1,000 |         49,647 |      76.6 |    0.24 |    0.29 |      1.00x |          - |
| routes        |  1,000 |        147,553 |      82.8 |    0.26 |    0.31 |      1.06x |          - |
| contract      |  1,000 |        264,920 |     104.4 |    0.39 |    0.44 |      1.62x |          - |
| rich-contract |  1,000 |        685,614 |     158.8 |    0.57 |    0.62 |      2.35x |          - |
| client-sparse |  1,000 |        688,394 |     150.5 |    0.55 |    0.60 |      2.28x |      0.97x |
| client-module |  1,000 |        709,414 |     152.9 |    0.57 |    0.62 |      2.34x |      1.00x |
| client        |  1,000 |      1,259,844 |     241.2 |    1.21 |    1.26 |      4.99x |      2.12x |
| baseline      |  5,000 |        109,647 |     125.3 |    0.31 |    0.38 |      1.00x |          - |
| routes        |  5,000 |        579,553 |     149.3 |    0.42 |    0.49 |      1.35x |          - |
| contract      |  5,000 |      1,134,580 |     253.2 |    1.15 |    1.22 |      3.71x |          - |
| rich-contract |  5,000 |      3,225,854 |     528.1 |    2.84 |    2.97 |      9.16x |          - |
| client-sparse |  5,000 |      3,204,634 |     472.2 |    2.73 |    2.82 |      8.79x |      0.96x |
| client-module |  5,000 |      3,225,654 |     475.3 |    3.16 |    3.27 |     10.20x |      1.11x |
| client        |  5,000 |      6,093,684 |     930.6 |    5.90 |    6.10 |     19.02x |      2.08x |

## Interpretation

The typed-client projection is lazy.

At 5,000 available rich endpoints:

- inspecting only 10 distributed client methods costs 2.73 s check time and 472.2 MB;
- inspecting one 50-route module costs 3.16 s and 475.3 MB;
- exhaustively inspecting all 5,000 client methods costs 5.90 s and 930.6 MB.

The sparse and one-module cases are close to the backend rich-contract case:

- sparse: 0.96x rich-contract check time;
- one module: 1.11x rich-contract check time.

This indicates that merely constructing `GelisClient<Api>` does not eagerly expand the entire API into expensive method/result types. Type work is primarily paid as client entries are inspected.

The exhaustive client case remains intentionally expensive because the benchmark forces TypeScript to inspect request parameters, query, body, response status unions, status-specific response bodies, headers, and raw response escape hatches for every endpoint.

## Decision

The current typed-client architecture is accepted as the v0.1 prototype direction.

There is no evidence that the root application, module boundary, public API contract, or typed-client projection requires architectural redesign before runtime work begins.

Continue monitoring:

- exhaustive client type cost;
- `.d.ts` size once packages emit declarations;
- tsserver / IntelliSense latency;
- TypeScript version regressions.

## Next milestone

Begin runtime work with the smallest measurable core:

1. runtime route registration;
2. Web Standard `app.fetch(request)`;
3. static route matching;
4. required `:param` route matching;
5. direct return normalization;
6. benchmark before middleware, validation, or runtime adapters add additional cost.

The first runtime benchmark should separate router/dispatch overhead from server/runtime overhead and establish a Gelis-only baseline before comparing identical workloads against Hono and Elysia.

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
