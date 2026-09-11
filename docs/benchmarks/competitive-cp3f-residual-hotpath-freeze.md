# Competitive Performance v0.1 — CP3-F Residual Hot-Path Freeze

**Status:** FROZEN BEFORE LOCAL TIMING  
**Date:** 2026-09-11  
**Frozen production source:** `98d8c00bfda8913a951bdf8780e136672646a90c`  
**Bun:** `1.4.2`  
**Routes:** `5,000`  
**Samples:** `11` fresh worker processes per cell

CP3-F re-measures the remaining core hot path after promotion of the CP3-C status-200 JSON success fast path into the active P11 lineage.

## Why the legacy decomposition output is exploratory only

The existing `bench/runtime/decomposition.mts` remains useful for broad investigation but is not authoritative CP3-F evidence. Two details materially alter some stage costs:

1. router matches are assigned to a module-level `sink`, forcing the match/params result to escape and therefore exposing allocation behavior that is not equivalent to the integrated `app.fetch` consumption path;
2. raw fixture handlers return one shared `Response` instance repeatedly, so those raw lanes intentionally do not model ordinary per-request response construction.

The local run on production SHA `98d8c00b...` is retained as exploratory evidence and must not be discarded, but its `143 ns` dynamic-router cell must not be interpreted as the production router's intrinsic routing cost.

## CP3-F questions

CP3-F is designed to answer four narrower questions without changing production source:

- what is the residual static versus trailing-param dynamic routing cost when the match is consumed locally;
- how much cost appears only when route-match objects are forced to escape;
- whether `normalizeResponse()` remains effectively at the `Response.json()` lower bound after CP3-C promotion;
- how much cost remains between an equivalent manual plain pipeline and production `app.fetch` for raw and JSON responses.

## Frozen cells

### Router

- `router-static-consume`
- `router-dynamic-consume`
- `router-static-escape`
- `router-dynamic-escape`

The consume cells read the matched route/params locally, matching the shape used by the integrated runtime. The escape cells deliberately retain the match object in module scope to quantify allocation/escape sensitivity. They are diagnostic only and are not optimization targets by themselves.

### JSON response construction

- `response-json-static`
- `response-json-dynamic`
- `normalize-static-json`
- `normalize-dynamic-json`

These cells verify whether production normalization is still close to direct `Response.json()`.

### End-to-end direct runtime

- `pipeline-static-raw`
- `pipeline-dynamic-raw`
- `pipeline-static-json`
- `pipeline-dynamic-json`
- `app-fetch-static-raw`
- `app-fetch-dynamic-raw`
- `app-fetch-static-json`
- `app-fetch-dynamic-json`

Raw handlers construct a fresh `Response` for every operation. JSON handlers return ordinary objects and therefore exercise the promoted success fast path.

## Correctness and timing protocol

- Bun must be exactly `1.4.2`;
- `src/**` must be byte-identical to frozen production SHA `98d8c00b...`;
- the worktree must be clean;
- every cell must pass an untimed correctness probe before timing;
- every timing cell runs in `11` fresh Bun worker processes;
- each worker performs `20,000` warmup operations;
- iteration count is calibrated to approximately `120 ms` measured work after at least `20 ms` calibration;
- primary descriptive statistic is median ns/op, with p25, p75, min and max retained;
- derived deltas and ratios are engineering diagnostics only, not independent acceptance gates.

## Decision rule

CP3-F is a decomposition phase, not a production-change acceptance gate. The first valid local run is authoritative for choosing the next optimization hypothesis and must not be rerun merely because a result is unfavorable.

A subsequent optimization phase may begin only after CP3-F identifies a residual cost that is both material and plausibly removable without sacrificing correctness, security, memory, startup, portability, type scalability, or zero-unused behavior.
