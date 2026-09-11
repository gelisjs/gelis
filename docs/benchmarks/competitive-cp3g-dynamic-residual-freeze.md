# Competitive Performance v0.1 — CP3-G Dynamic Residual Freeze

## Purpose

CP3-F established that the dynamic JSON `app.fetch` path is about 160 ns slower than the static JSON path, while isolated dynamic router lookup explains only about 24 ns of that difference. CP3-G decomposes the remaining dynamic residual before any production-code optimization is attempted.

## Frozen production source

`98d8c00bfda8913a951bdf8780e136672646a90c`

No `src/**` changes are permitted in this phase.

## Runtime protocol

- Bun 1.4.2
- 5,000 routes
- Intel i5-10500H local machine is authoritative for performance
- 11 fresh worker processes per cell
- 20,000 warmup operations per worker
- calibrated ~120 ms timed region per worker
- median is primary
- correctness probe must pass before timing
- Quality CI must pass before authoritative timing
- one authoritative local timing run only

## Cells

Primitive/string cells:

- `pathname-dynamic`
- `last-index`
- `prefix-slice`
- `value-slice`
- `percent-scan`

Parameter-shape cells:

- `params-computed-consume`
- `params-literal-consume`
- `params-factory-consume`
- `params-computed-escape`

Handler handoff cells:

- `handler-prebuilt-params`
- `handler-computed-params`
- `handler-literal-params`

Production routing/pipeline cells:

- `router-static-consume`
- `router-dynamic-consume`
- `route-handler-static`
- `route-handler-dynamic`
- `pipeline-static-json`
- `pipeline-dynamic-json`

## Interpretation rules

1. Primitive cells are lower-level engineering diagnostics only. They are not additive predictions of full request cost.
2. `params-literal-consume` is a theoretical fixed-shape lower bound for a known parameter name. It is not directly implementable for arbitrary runtime parameter names without some form of specialization.
3. `params-factory-consume` tests whether registration-time closure specialization can give the runtime a stable captured key without code generation. If it wins materially, any production candidate must also be gated on memory because one factory per route can increase resident memory.
4. `params-computed-escape` exists to expose forced materialization/allocation sensitivity. It must not be confused with normal local consumption.
5. `route-handler-*` are the most important pre-normalization production-shaped cells. Their dynamic/static delta should be compared with the isolated router delta from the same run.
6. `pipeline-*` confirms how much of the dynamic gap survives JSON normalization.
7. No production candidate is accepted from CP3-G. CP3-G only selects the next hypothesis.

## Required semantics for any later candidate

A future production optimization must preserve:

- exact static precedence,
- trailing-parameter matching,
- percent-decoding semantics,
- method isolation and ALL/HEAD/OPTIONS behavior,
- arbitrary parameter names,
- concurrency safety,
- handler-visible `params` object semantics,
- zero-unused hot paths,
- portable core behavior,
- type-system behavior,
- low memory usage.

No dynamic code generation is assumed acceptable by default. If a later experiment considers generated materializers, it must be justified separately for security, CSP/edge portability, startup, memory, and package semantics before it can become a production candidate.
