# Competitive Performance v0.1 — CP3-U string response decomposition freeze

## Purpose

CP3-T proved that the CP3-S single-index fingerprint router keeps its roughly 36 ns routing advantage through handler invocation and through a stable string response, but loses roughly 20 ns of that advantage when the response body is the captured request-derived parameter.

CP3-U isolates two hypotheses without modifying production source:

1. the legacy trailing-prefix `slice + Map.get` path may incidentally materialize the request-derived pathname before the trailing parameter is sliced, deferring less string work into response construction; and
2. the ordinary successful string response path may pay avoidable cost by always providing an explicit `status: 200` `ResponseInit`, while the already-accepted JSON success path uses the native default-success status.

CP3-U is decomposition-only. It does not promote either mechanism and has no performance acceptance gate.

## Frozen source identity

- production source: `8e43aad09759d60378b3fc174292850057ccfba3`
- candidate source: `77168cea5056c50bd7188b2dace17f72f7a01514`
- CP3-T authoritative harness: `657e80d840bc3266ed71775305a20ff745cf2fce`
- Bun: exactly `1.4.2`
- Bun revision: exactly `744846f844374847c902b5e7fd59b4342a51ef99`
- routes: `5,000`

The CP3-U branch must not modify `src/**` after the candidate source commit.

## Protocol

- correctness probe before timing
- `11` fresh worker samples per cell
- `20,000` warmups per worker
- calibration floor: `20 ms`
- target measured duration: approximately `120 ms`
- cells run in fixed semantic groups with rotated starting order per sample
- the exact production source is mounted through a temporary detached Git worktree
- the temporary worktree is removed and `git worktree prune` is run in `finally`
- no rerun merely because a valid result is surprising or unfavorable

## Frozen cells

### Stable string pipeline group

1. `production-stable-current`
2. `candidate-stable-current`
3. `candidate-stable-cached-status`
4. `candidate-stable-no-status`
5. `candidate-stable-cached-no-status`

### Parameter string handler/pipeline group

6. `production-handler-param`
7. `candidate-handler-param`
8. `candidate-handler-param-prehash`
9. `production-param-current`
10. `candidate-param-current`
11. `candidate-param-cached-status`
12. `candidate-param-no-status`
13. `candidate-param-cached-no-status`
14. `candidate-param-prehash-current`
15. `candidate-param-prehash-no-status`

## Response variants

`current` uses the source tree's `normalizeResponse()` implementation.

`cached-status` constructs the same text response semantics with one shared `ResponseInit` containing `status: 200` and the canonical text Content-Type header.

`no-status` constructs the same response semantics with an inline `ResponseInit` that omits `status`, relying on the native default status `200` while preserving the explicit canonical text Content-Type header.

`cached-no-status` is the same no-status semantics using one shared `ResponseInit` object.

Every response variant must probe:

- status `200`
- empty default status text
- body exactly `value-42`
- Content-Type exactly `text/plain; charset=utf-8`

## Legacy prefix prehash diagnostic

The `prehash` cells intentionally perform a production-shaped prefix operation before candidate routing:

1. derive the request pathname;
2. compute the trailing prefix with `slice(0, slash + 1)`;
3. consume that prefix through a populated `Map.get` lookup;
4. then run the candidate router on the same pathname.

This is diagnostic only. It intentionally reintroduces work that the fingerprint candidate removed. If it reduces the later response-construction increment, that supports the deferred string-materialization hypothesis. It is not automatically a production candidate.

## Historical CP3-S recovery diagnostic

CP3-S recorded:

- string pipeline candidate/production: `1.0021x`
- JSON pipeline candidate/production: `0.9773x`
- frozen pipeline geomean gate: `<= 0.9800x`

Holding the CP3-S JSON ratio fixed only as an engineering diagnostic, the string side would need to be approximately `<= 0.9827x` to satisfy that historical geomean gate.

CP3-U may print this threshold as a diagnostic. It is not a CP3-U acceptance gate and must not be changed after timing.

## Interpretation rules

- If `cached-status` materially beats `current`, object reuse is a candidate mechanism.
- If `no-status` materially beats both `current` and `cached-status`, omission of explicit success status is the stronger mechanism.
- If `cached-no-status` adds further improvement, both mechanisms may compose.
- If `prehash` increases handler cost but reduces the later normalization increment, the deferred materialization hypothesis is supported.
- If no response variant recovers enough of the parameter pipeline loss, do not modify `normalizeResponse()` merely to force CP3-S through its old gate.

## Completion markers

Probe:

`CP3-U CORRECTNESS PROBE: PASS (15/15)`

Timed run:

`CP3-U LOCAL STRING RESPONSE DECOMPOSITION RUN: COMPLETE`
