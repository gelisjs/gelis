# Competitive Performance v0.1 — CP4-A Full URL Offset Viability Freeze

## Purpose

CP4-A tests a benchmark-only ceiling for trailing-parameter routing after CP3-Z showed that request-derived pathname representation materially increases dynamic match cost.

The experiment compares the current production path:

`request.url -> pathnameFromRequestUrl() -> Router.match()`

against a benchmark-only offset matcher that reads the full `request.url` directly, parses pathname bounds, computes the same trailing-prefix fingerprint over the original URL with an offset, verifies the stored prefix with `startsWith(prefix, pathStart)`, and slices the final param directly from the original URL.

This phase is decomposition/viability-only. It does not modify production source and has no performance acceptance threshold.

## Frozen production source

- Production SHA: `af4e5102046def1b163435333563b8d08f919bf5`
- Bun: exactly `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- Routes: `5,000`

The harness rejects any `src/**` difference from the frozen production SHA.

## Scope

The benchmark contains only trailing-parameter routes of the form `/r/<index>/:id`.

The offset matcher intentionally does **not** model production static-route precedence or generic trie fallback. Therefore a favorable CP4-A result is only evidence that direct full-URL matching is worth translating into a production-shaped candidate. It is not promotion evidence by itself.

## Frozen protocol

Each logical comparison uses:

- `11` mirrored fresh-worker pairs
- alternating current/offset execution order
- `20,000` warmup operations per worker
- calibration floor of `20 ms`
- target measurement duration of `120 ms`
- median, p25, p75, min, and max reporting

A correctness-only probe must pass before the single authoritative local timing run.

## Frozen cells

1. current request-derived router
2. full-URL offset router
3. current param handler
4. full-URL offset param handler
5. current stable-string pipeline
6. full-URL offset stable-string pipeline
7. current param-string pipeline
8. full-URL offset param-string pipeline
9. current stable-JSON pipeline
10. full-URL offset stable-JSON pipeline
11. current param-JSON pipeline
12. full-URL offset param-JSON pipeline

## Correctness probe

The probe validates:

- last registered route match
- route identity
- decoded `params.id`
- stable and param-derived string responses
- stable and param-derived JSON responses
- query-string bounded pathname matching
- percent-decoded trailing params
- unknown route miss for the offset matcher

## Interpretation rules

- Do not add isolated cell costs as exact accounting; JSC/string representation effects are non-additive.
- Do not rerun a valid authoritative timing because the result is surprising or unfavorable.
- A large router improvement that disappears in param pipelines means the nested/direct substring response representation remains a separate target.
- A router improvement that survives param pipelines would justify a production-shaped request-URL offset candidate with static precedence, collision fallback, generic trie compatibility, memory, registration, and HTTP revalidation gates.
- CP4-A has no PASS/FAIL performance gate.

## Completion markers

Probe:

`CP4-A CORRECTNESS PROBE: PASS (12/12)`

Timed run:

`CP4-A LOCAL FULL URL OFFSET VIABILITY RUN: COMPLETE`
