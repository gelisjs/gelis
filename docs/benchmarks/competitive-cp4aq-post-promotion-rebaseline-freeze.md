# Competitive Performance v0.1 — CP4-AQ Post-Promotion Rebaseline Freeze

## Purpose

CP4-AQ re-establishes the direct-runtime residual baseline after CP4-AP promoted the CP4-AO accepted static-leading and ALL-only routing fast paths.

This phase is decomposition-only. It does not modify production source, has no performance acceptance threshold, and cannot overturn the already accepted CP4-AO production classification.

## Frozen production source

- Production SHA: `5d9698d6b8d368ddcff358fc2645435b93c0c062`
- Bun: exactly `1.4.2`
- Routes: `5,000`

The harness rejects any `src/**` difference from the frozen production SHA.

## Protocol

Each timed cell uses:

- `11` fresh Bun worker processes
- `20,000` warmup operations per worker
- calibration floor of `20 ms`
- target measurement duration of `120 ms`
- median, p25, p75, min, and max reporting

A correctness-only probe must pass before the single authoritative local timing run.

The first valid completed local timed run on the authoritative Windows / Intel Core i5-10500H machine is the CP4-AQ baseline. It must not be rerun for result selection because a value is surprising, noisy, or unfavorable.

## Frozen cells

1. `pathname-request-static`
2. `pathname-request-dynamic`
3. `router-static-consume`
4. `router-dynamic-consume`
5. `router-static-escape`
6. `router-dynamic-escape`
7. `response-json-static`
8. `response-json-dynamic`
9. `normalize-static-json`
10. `normalize-dynamic-json`
11. `pipeline-static-raw`
12. `pipeline-dynamic-raw`
13. `pipeline-static-json`
14. `pipeline-dynamic-json`
15. `app-fetch-static-raw`
16. `app-fetch-dynamic-raw`
17. `app-fetch-static-json`
18. `app-fetch-dynamic-json`

## Relationship to CP3-Y

CP4-AQ deliberately preserves the CP3-Y worker mechanism and timing protocol. The worker source is reused byte-for-byte so the principal production variable is the already accepted CP4 promotion.

Cross-phase values are directional decomposition evidence only. Do not derive acceptance ratios by multiplying or chaining values from CP3-Y, CP4-AO, or any other separately timed run.

## Interpretation rules

- This phase is measurement-only; there is no PASS/FAIL performance gate.
- Do not add isolated cell costs as exact accounting; JSC optimization, object shape, and string representation effects are non-additive.
- Do not rerun a valid authoritative timing because the result is surprising or unfavorable.
- Use CP4-AQ to identify the next engineering target; do not promote any source change from this phase.
- CP4-AO remains accepted and CP4-AP remains the production promotion regardless of CP4-AQ timings.
- Compare with CP3-Y only as directional evidence about which residuals moved after the CP4 routing promotion.
- Treat `app.fetch()` versus production-shaped manual pipeline deltas as directional integration diagnostics, not exact accounting.

## Completion markers

Probe:

`CP4-AQ CORRECTNESS PROBE: PASS (18/18)`

Timed run:

`CP4-AQ LOCAL POST-PROMOTION REBASELINE RUN: COMPLETE`
