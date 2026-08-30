# Gelis Type-System Benchmark Baseline

**Status:** Baseline 1  
**Date:** 2026-08-31

## Environment

- Runtime: Bun 1.4.0
- TypeScript: 7.0.2
- CPU: Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz
- Logical CPUs: 12
- Memory: 24398 MB
- Runs per full benchmark case: 3
- Result aggregation: median

## Scenarios

### baseline

Plain TypeScript declarations without Gelis route or contract machinery.

### routes

Gelis route-local inference using `app.get()` without a large public API contract.

### contract

Routes grouped into modules, combined through `defineContract()`, then normalized public route contracts are accessed.

## Results

| Scenario | Routes | Instantiations | Memory MB | Check s | Total s | Check/base |
| -------- | -----: | -------------: | --------: | ------: | ------: | ---------: |
| baseline |    100 |         36,143 |      65.8 |    0.25 |    0.29 |      1.00x |
| routes   |    100 |         49,763 |      67.8 |    0.23 |    0.27 |      0.94x |
| contract |    100 |         69,263 |      70.6 |    0.24 |    0.28 |      0.96x |
| baseline |    500 |         42,147 |      70.6 |    0.23 |    0.27 |      1.00x |
| routes   |    500 |         93,553 |      74.3 |    0.25 |    0.29 |      1.07x |
| contract |    500 |        158,851 |      86.0 |    0.26 |    0.31 |      1.14x |
| baseline |  1,000 |         49,647 |      76.7 |    0.24 |    0.29 |      1.00x |
| routes   |  1,000 |        147,553 |      82.8 |    0.28 |    0.33 |      1.17x |
| contract |  1,000 |        264,920 |     104.3 |    0.39 |    0.44 |      1.63x |
| baseline |  5,000 |        109,647 |     125.3 |    0.30 |    0.37 |      1.00x |
| routes   |  5,000 |        579,553 |     149.3 |    0.43 |    0.49 |      1.40x |
| contract |  5,000 |      1,134,580 |     253.0 |    1.10 |    1.18 |      3.62x |

## Initial interpretation

The first benchmark does not show exponential type growth or deep-instantiation failures.

Route-local inference remains inexpensive at 5,000 routes:

- 579,553 instantiations
- 149.3 MB compiler memory
- 0.43 s check time
- 0.49 s total compiler time

The public contract scenario is substantially heavier but remains practical at 5,000 routes:

- 1,134,580 instantiations
- 253 MB compiler memory
- 1.10 s check time
- 1.18 s total compiler time

The `contract` scenario is therefore a current optimization focus, but these results do not justify redesigning the contract architecture.

The route count grew 50x from 100 to 5,000. Over the same range:

- route scenario check time grew from 0.23 s to 0.43 s;
- contract scenario check time grew from 0.24 s to 1.10 s;
- no `Type instantiation is excessively deep` error occurred.

## Important limitation

This baseline primarily stresses:

- path-parameter inference;
- simple inferred responses;
- module composition;
- `defineContract()`;
- public contract projection.

It does not yet represent the heaviest realistic Gelis route.

The next benchmark must add a rich-contract scenario containing:

- request body schemas;
- query schemas;
- differing Standard Schema input/output types;
- multiple typed status responses;
- `reply.status()` usage;
- modules;
- `defineContract()`;
- public contract access.

Typed-client work should not begin until that richer scenario has been measured.
