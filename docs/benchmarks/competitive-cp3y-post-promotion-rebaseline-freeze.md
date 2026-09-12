# Competitive Performance v0.1 — CP3-Y Post-Promotion Rebaseline Freeze

## Purpose

CP3-Y re-establishes the direct-runtime residual baseline after CP3-X promoted the accepted single-index trailing-prefix fingerprint router and direct-string default-success response path.

This phase is decomposition-only. It does not modify production source and has no performance acceptance threshold.

## Frozen production source

- Production SHA: `af4e5102046def1b163435333563b8d08f919bf5`
- Bun: exactly `1.4.2`
- Routes: `5,000`

The acceptance harness rejects any `src/**` difference from the frozen production SHA.

## Protocol

Each timed cell uses:

- `11` fresh Bun worker processes
- `20,000` warmup operations per worker
- calibration floor of `20 ms`
- target measurement duration of `120 ms`
- median, p25, p75, min, and max reporting

A correctness-only probe must pass before the single authoritative local timing run.

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

## Relationship to CP3-M

CP3-Y deliberately preserves the CP3-M worker mechanism and timing protocol so the post-CP3-X baseline remains directionally comparable. The only production change under measurement is the already accepted CP3-X source.

Interpretation must account for non-additive JSC/string-representation effects. In particular, direct-string success and request-derived dynamic strings may interact with response construction differently from stable payloads.

## Interpretation rules

- Do not add isolated cell costs as exact accounting; JSC optimization and string representation effects are non-additive.
- Do not rerun a valid authoritative timing because the result is surprising or unfavorable.
- Use CP3-Y to choose the next engineering target; do not promote any source change from this phase.
- Compare against CP3-M to identify which residuals moved after the fingerprint and string-success promotions.
- Treat `app.fetch()` versus production-shaped manual pipeline deltas as directional integration diagnostics, not exact accounting.

## Completion markers

Probe:

`CP3-Y CORRECTNESS PROBE: PASS (18/18)`

Timed run:

`CP3-Y LOCAL POST-PROMOTION REBASELINE RUN: COMPLETE`
