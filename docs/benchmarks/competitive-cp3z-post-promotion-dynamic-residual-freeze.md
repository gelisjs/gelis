# Competitive Performance v0.1 — CP3-Z Post-Promotion Dynamic Residual Freeze

## Purpose

CP3-Z decomposes the remaining dynamic request residual after the accepted CP3-X production promotion and the CP3-Y post-promotion rebaseline.

This phase is decomposition-only. It does not modify production source and has no performance acceptance threshold.

## Frozen production source

- Production SHA: `af4e5102046def1b163435333563b8d08f919bf5`
- Bun: exactly `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- Routes: `5,000`

The acceptance harness rejects any `src/**` difference from the frozen production SHA.

## Why this phase exists

CP3-Y showed an intentionally non-additive result:

- isolated literal dynamic router consume rose from about `27 ns` in CP3-M to about `90 ns` after the fingerprint promotion,
- while production-shaped dynamic pipeline and `app.fetch()` became materially faster.

Therefore the isolated literal router cell must not be treated as a production bottleneck by itself. CP3-Z measures the current production router with both literal and request-derived pathname representations, then follows the request-derived path through handler, normalization, and `app.fetch()` boundaries.

## Protocol

Each timed cell uses:

- `11` fresh Bun worker processes,
- `20,000` warmup operations per worker,
- calibration floor of `20 ms`,
- target measurement duration of `120 ms`,
- median, p25, p75, min, and max reporting.

A correctness-only probe must pass before the single authoritative local timing run.

## Frozen cells

1. `pathname-request-dynamic`
2. `router-literal-dynamic`
3. `router-request-dynamic`
4. `handler-string-stable`
5. `handler-string-param`
6. `handler-json-stable`
7. `handler-json-param`
8. `pipeline-string-stable`
9. `pipeline-string-param`
10. `pipeline-json-stable`
11. `pipeline-json-param`
12. `app-string-stable`
13. `app-string-param`
14. `app-json-stable`
15. `app-json-param`

## Interpretation

The primary diagnostics are:

- request-derived router cost versus literal router cost,
- stable-handler increment above request-derived matching,
- parameter-use increment above stable-handler work,
- normalization increment for stable and parameter-derived string/JSON values,
- outer `app.fetch()` increment above the corresponding manual pipeline.

The stable and parameter cells deliberately use identical route topology. Only the handler payload source changes.

Direct-string handlers return ordinary strings so CP3-Z measures the CP3-X default-success response path rather than a raw `Response` passthrough.

## Interpretation rules

- Do not add isolated layer costs as exact accounting; JSC optimization and string representation effects are non-additive.
- Do not rerun a valid authoritative timing because a result is surprising or unfavorable.
- Do not optimize the literal router cell alone unless request-derived production-shaped evidence points in the same direction.
- Use CP3-Z to choose the next engineering target; do not promote any source change from this phase.

## Completion markers

Probe:

`CP3-Z CORRECTNESS PROBE: PASS (15/15)`

Timed run:

`CP3-Z LOCAL DYNAMIC RESIDUAL DECOMPOSITION RUN: COMPLETE`
