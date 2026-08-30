# Gelis Type-System Benchmark Report

**Status:** Baseline 2  
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

### baseline

Plain TypeScript declarations without Gelis route or contract machinery.

### routes

Gelis route-local inference using `app.get()` without building a large public API contract.

### contract

Routes grouped into modules, combined through `defineContract()`, then normalized public route contracts are accessed.

### rich-contract

A deliberately heavy Gelis route shape using:

- path parameter inference;
- query schema input/output transformation;
- body schema input/output transformation;
- three typed response statuses;
- `reply.status()` status/body pairing;
- modules;
- `defineContract()`;
- access to public request and response contract types.

## Results

| Scenario      | Routes | Instantiations | Memory MB | Check s | Total s | Check/base |
| ------------- | -----: | -------------: | --------: | ------: | ------: | ---------: |
| baseline      |    100 |         36,143 |      65.8 |    0.24 |    0.28 |      1.00x |
| routes        |    100 |         49,763 |      67.9 |    0.29 |    0.34 |      1.22x |
| contract      |    100 |         69,263 |      70.6 |    0.28 |    0.34 |      1.18x |
| rich-contract |    100 |        120,606 |      77.8 |    0.26 |    0.30 |      1.06x |
| baseline      |    500 |         42,147 |      70.6 |    0.25 |    0.29 |      1.00x |
| routes        |    500 |         93,553 |      74.3 |    0.25 |    0.29 |      1.01x |
| contract      |    500 |        158,851 |      86.1 |    0.27 |    0.32 |      1.11x |
| rich-contract |    500 |        376,560 |     113.9 |    0.33 |    0.38 |      1.35x |
| baseline      |  1,000 |         49,647 |      76.7 |    0.25 |    0.30 |      1.00x |
| routes        |  1,000 |        147,553 |      82.8 |    0.27 |    0.32 |      1.10x |
| contract      |  1,000 |        264,920 |     104.3 |    0.41 |    0.46 |      1.66x |
| rich-contract |  1,000 |        685,614 |     158.8 |    0.58 |    0.63 |      2.33x |
| baseline      |  5,000 |        109,647 |     125.4 |    0.34 |    0.42 |      1.00x |
| routes        |  5,000 |        579,553 |     149.3 |    0.45 |    0.53 |      1.33x |
| contract      |  5,000 |      1,134,580 |     253.1 |    1.11 |    1.19 |      3.26x |
| rich-contract |  5,000 |      3,225,854 |     528.2 |    2.87 |    2.99 |      8.43x |

## Interpretation

The rich-contract scenario is materially heavier than simple route and contract scenarios, as expected.

At 5,000 rich routes the compiler performed:

- 3,225,854 type instantiations;
- 528.2 MB compiler memory;
- 2.87 s check time;
- 2.99 s total compiler time.

Despite the larger absolute cost, the measurements do not show evidence of exponential type growth or deep-instantiation failure.

Across the measured points, rich-contract growth is close to linear with route count.

A simple linear fit over the four measured points is approximately:

- instantiations: 634 additional instantiations per route plus fixed compiler/framework overhead;
- memory: 0.092 MB additional compiler memory per route plus fixed overhead;
- check time: roughly 0.00055 s per route plus fixed overhead.

These fitted values are descriptive only and must not be treated as hard performance guarantees.

The important observation is the growth shape:

- route count: 100 → 5,000 = 50x;
- rich-contract instantiations: 120,606 → 3,225,854 = ~26.7x;
- rich-contract memory: 77.8 → 528.2 MB = ~6.8x;
- rich-contract check time: 0.26 → 2.87 s = ~11.0x.

No `Type instantiation is excessively deep` error occurred.

## Current conclusion

The current Gelis type architecture is acceptable to continue.

Specifically:

- root route-local inference remains inexpensive;
- module and contract boundaries remain bounded;
- rich request/response typing increases compiler cost substantially but predictably;
- there is no evidence yet that the architecture needs to be redesigned.

`defineContract()` and rich response/schema typing remain optimization-sensitive areas, but they are not blockers at this stage.

## Next benchmark target

The next type-system milestone should add a typed-client projection.

The client benchmark must verify that converting the public API contract into ergonomic client methods does not create a second application-wide generic explosion.

The preferred client shape is expected to resemble:

```ts
client.users.find({
  params: {
    id: "123",
  },
});
```

rather than path-proxy APIs.

The result should preserve status/body correlation:

```ts
const result = await client.users.find(...)

if (result.status === 200) {
  result.data
}

if (result.status === 404) {
  result.data
}
```

Typed-client work should therefore be implemented first as a type-only prototype and benchmarked before an HTTP transport runtime is added.
