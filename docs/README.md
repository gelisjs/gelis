# Gelis Engineering Documentation

This directory records accepted architectural decisions, reproducible benchmark baselines, and the current engineering roadmap.

## Architecture

- [`architecture/technical-constitution.md`](architecture/technical-constitution.md)
- [`architecture/api-surface-v0.1.md`](architecture/api-surface-v0.1.md)
- [`architecture/runtime-v0.1.md`](architecture/runtime-v0.1.md)
- [`architecture/validation-v0.1.md`](architecture/validation-v0.1.md)
- [`architecture/on-request-v0.1.md`](architecture/on-request-v0.1.md)
- [`architecture/on-error-v0.1.md`](architecture/on-error-v0.1.md)
- [`architecture/response-contracts-v0.1.md`](architecture/response-contracts-v0.1.md)
- [`architecture/response-contracts-v0.1.md`](architecture/response-contracts-v0.1.md)

## Benchmarks

- [`benchmarks/type-system-baseline-v0.1.md`](benchmarks/type-system-baseline-v0.1.md)
- [`benchmarks/runtime-baseline-v0.1.md`](benchmarks/runtime-baseline-v0.1.md)
- [`benchmarks/http-comparison-baseline-v0.1.md`](benchmarks/http-comparison-baseline-v0.1.md)
- [`benchmarks/validation-v0.1.md`](benchmarks/validation-v0.1.md)
- [`benchmarks/on-request-v0.1.md`](benchmarks/on-request-v0.1.md)
- [`benchmarks/on-error-v0.1.md`](benchmarks/on-error-v0.1.md)
- [`benchmarks/response-contracts-v0.1.md`](benchmarks/response-contracts-v0.1.md)

## Development

- [`development/roadmap.md`](development/roadmap.md)

## Documentation policy

Keep accepted architectural decisions, reproducible benchmark baselines, and milestone results in this directory.

Temporary experiments do not belong in `docs/` merely because they were useful during development.

An experiment should become permanent documentation only when it establishes one of the following:

- an accepted architectural decision;
- a reproducible performance baseline;
- a compatibility or behavioral contract;
- a milestone result future contributors need to understand;
- a rejected architectural direction whose rationale is important enough to prevent accidental reintroduction.

Benchmark documentation must distinguish:

- local evidence from universal claims;
- observable workload equivalence from identical framework internals;
- stable conclusions from benchmark noise;
- accepted results from temporary experimental numbers.

Small benchmark differences should not be promoted as meaningful performance advantages without sufficient evidence.

The architecture remains governed by the principle:

> Enterprise capability must not require enterprise overhead when unused.
