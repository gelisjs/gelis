# Competitive Performance v0.1 — CP3-J request URL fast path freeze

## Goal

Validate a production-safe fast path for pathname extraction from normalized `Request.url` values without changing the generic URL fallback semantics or routing structure.

CP3-I established that URL pathname extraction is a measurable low-risk target while replacing `Map` with a null-prototype object or replacing the trailing-param fast path with the current generic trie is not justified.

## Frozen source

- Production source before candidate: `98d8c00bfda8913a951bdf8780e136672646a90c`
- CP3-J candidate source: `2a10e42308631fe53faba9a789b227d0a1cb241c`
- Candidate branch: `work/competitive-cp3j-request-url-fastpath`
- Bun required for authoritative local timing: 1.4.2
- Routes per router cell: 5,000
- Samples: 11 fresh worker processes per cell
- Warmup: 20,000 operations per worker
- Calibration minimum: 20 ms
- Target measurement interval: approximately 120 ms

## Candidate semantics

The candidate keeps `pathnameFromUrl()` unchanged as the generic fallback and adds `pathnameFromRequestUrl()` for the normalized HTTP/HTTPS `Request.url` hot path.

Production routing and official application HTTP method resolution use the request-oriented helper. Non-HTTP or non-matching URL shapes fall back to `pathnameFromUrl()`.

The candidate does not change:

- router structures;
- static/dynamic route precedence;
- parameter decoding;
- handler context semantics;
- response normalization;
- application lifecycle behavior;
- public package contracts or type inference.

Direct correctness coverage must include generic URL behavior plus normalized HTTP, HTTPS, query, fragment input normalization, port, IPv6 authority, root URL, and non-HTTP fallback.

## Acceptance cells

Pathname extraction:

- `pathname-baseline-static`
- `pathname-candidate-static`
- `pathname-baseline-dynamic`
- `pathname-candidate-dynamic`

Production-shaped route and handler dispatch:

- `dispatch-baseline-static`
- `dispatch-candidate-static`
- `dispatch-baseline-dynamic`
- `dispatch-candidate-dynamic`

Production-shaped JSON normalization pipeline:

- `pipeline-baseline-static-json`
- `pipeline-candidate-static-json`
- `pipeline-baseline-dynamic-json`
- `pipeline-candidate-dynamic-json`

The baseline uses the unchanged generic `pathnameFromUrl()` in the same worker process. The candidate uses `pathnameFromRequestUrl()`. Router, request, handler, context creation, normalization, warmup, calibration, and timing machinery are otherwise shared.

## Frozen acceptance gates

These gates are fixed before authoritative timing.

1. Full local quality gate must pass.
2. Correctness probe must pass all 12 cells.
3. Quality CI must succeed on the exact timed harness SHA.
4. Candidate source must remain identical to `2a10e42308631fe53faba9a789b227d0a1cb241c` for `src/**` and `test/runtime/url.test.ts`.
5. Pathname candidate/baseline static ratio must be `<= 0.90x`.
6. Pathname candidate/baseline dynamic ratio must be `<= 0.90x`.
7. Dispatch static and dynamic candidate/baseline ratios must each be `<= 1.01x`.
8. Dispatch static/dynamic geomean must be `<= 0.97x`.
9. JSON pipeline static and dynamic candidate/baseline ratios must each be `<= 1.01x`.
10. JSON pipeline static/dynamic geomean must be `<= 0.99x`.

A valid unfavorable result is a CP3-J FAIL and must not be rerun merely because it is unfavorable.

## Interpretation boundaries

- CP3-J tests only the safe request-URL extraction candidate. It does not claim to eliminate the full fresh-string lookup penalty found in CP3-H/CP3-I.
- A CP3-J PASS justifies promotion and subsequent HTTP competitive revalidation.
- A CP3-J FAIL preserves the evidence and sends the project back to structural URL/router boundary work rather than weakening these gates.
