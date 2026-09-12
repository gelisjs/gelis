# Competitive Performance v0.1 — CP3-M Post-Promotion Residual Rebaseline Freeze

## Purpose

CP3-M re-establishes the direct-runtime residual baseline after the accepted CP3-J request URL pathname fast path was promoted in CP3-L.

This phase is decomposition-only. It does not modify production source and has no performance acceptance threshold.

## Frozen production source

- Production SHA: `8e43aad09759d60378b3fc174292850057ccfba3`
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

## Production-shaped change from CP3-F

The manual pipeline cells now use `pathnameFromRequestUrl(request.url)`, matching the promoted production request hot path. CP3-M also measures that extractor directly for static and dynamic request URLs.

All other residual cells preserve the CP3-F mechanism so the new baseline remains directionally comparable while reflecting the promoted request URL path.

## Interpretation rules

- Do not add isolated cell costs as exact accounting; V8/JSC optimization and string representation effects are non-additive.
- Do not rerun a valid authoritative timing because the result is surprising or unfavorable.
- Use CP3-M to choose the next engineering target; do not promote any source change from this phase.
- If `app.fetch()` and the production-shaped manual pipeline converge materially after CP3-J, the previous fresh-path integration residual is considered largely resolved.
- Remaining dynamic/static gaps should be decomposed before any router redesign.
