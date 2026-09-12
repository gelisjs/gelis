# Competitive Performance v0.1 — CP3-T pipeline translation decomposition freeze

## Purpose

CP3-S proved that the single-index fingerprint candidate fixed the CP3-R retained-memory failure while preserving a large trailing dynamic routing win, but the frozen pipeline geomean gate still failed.

Authoritative CP3-S medians:

- mixed trailing dynamic request: candidate / production `0.8617x` (`-30.3 ns/op`)
- string pipeline: `1.0021x` (`+1.8 ns/op`)
- JSON pipeline: `0.9773x` (`-14.2 ns/op`)
- pipeline geomean: `0.9896x`, frozen limit `<= 0.9800x` — FAIL
- retained router heap delta: `1.2447x`, frozen limit `<= 1.5000x` — PASS

CP3-T is decomposition-only. It must identify where the CP3-S router win stops translating into the full string pipeline before another production candidate is designed.

## Frozen identities

- Bun: exactly `1.4.2`
- Bun revision: exactly `744846f844374847c902b5e7fd59b4342a51ef99`
- Production source: `8e43aad09759d60378b3fc174292850057ccfba3`
- CP3-S candidate source: `77168cea5056c50bd7188b2dace17f72f7a01514`
- Route count: `5,000`

The CP3-T branch may add benchmark and documentation files only. `src/**` must remain byte-equivalent to the frozen CP3-S candidate source.

## Frozen protocol

- 11 mirrored fresh-worker pairs per cell pair
- production/candidate order alternates by sample
- each worker owns exactly one measured cell and one router variant
- 20,000 warmup operations
- calibration floor: 20 ms
- target measured duration: 120 ms
- report median, p25, p75, min, max
- run correctness probe before local authoritative timing
- create a detached production worktree only for the production router module
- remove and prune the temporary worktree after every probe/timing invocation

## Frozen cells

Each cell is measured for both production and the CP3-S candidate:

1. `router-dynamic`
2. `handler-string-stable`
3. `handler-string-param`
4. `handler-json-stable`
5. `handler-json-param`
6. `pipeline-string-stable`
7. `pipeline-string-param`
8. `pipeline-json-stable`
9. `pipeline-json-param`

The same 5,000 trailing-param route shape is used throughout: `/r/<index>/:id`. The measured request targets the last route with `id=value-42`.

## Attribution logic

The cells intentionally separate four boundaries:

- router lookup and parameter materialization
- context creation plus synchronous handler invocation with a stable payload
- handler consumption of the request-derived parameter
- response normalization / `Response` construction

The output reports:

- candidate / production ratio at every boundary
- absolute candidate advantage at every boundary
- per-variant incremental cost between adjacent layers
- how much of the router win remains visible at handler and pipeline boundaries

If the candidate win survives through handler execution but disappears only after string normalization, the next work should target request-derived string response representation or response construction. If it disappears before normalization, the next work should target router-to-handler integration or optimizer shape instead.

## Evidence classification

CP3-T has **no performance acceptance threshold**. It is diagnostic evidence only. A valid local run is accepted as decomposition evidence regardless of whether the CP3-S candidate appears faster or slower in any cell.

The authoritative local timing must be run once after a successful correctness probe. It must not be rerun merely because the result is surprising or unfavorable.
