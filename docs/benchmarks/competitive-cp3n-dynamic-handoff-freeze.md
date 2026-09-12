# Competitive Performance v0.1 — CP3-N dynamic handoff decomposition freeze

## Purpose

CP3-M established that after promotion of the request URL pathname fast path, the remaining dynamic-route penalty is still much larger than isolated pathname extraction or `Router.match()` cost.

CP3-N decomposes the production-shaped dynamic handoff while removing a payload confound present in the earlier residual benchmarks. Static and dynamic controls return the same body content and JSON shape. Dynamic routes are then compared when the handler ignores the captured parameter versus when it returns `params.id`.

This phase is decomposition evidence only. It has no performance pass/fail threshold and does not modify production source.

## Frozen identity

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- Production source: `8e43aad09759d60378b3fc174292850057ccfba3`
- Routes: `5,000`
- Samples: `11` fresh worker processes per cell
- Warmup: `20,000` operations per worker
- Minimum calibration window: `20 ms`
- Target measurement window: approximately `120 ms`

## Payload controls

String cells use identical body content: `value-42`.

JSON cells use identical body content and shape: `{ "id": "value-42" }`.

For dynamic routes:

- `stable` means the handler ignores the captured parameter and returns the stable literal value.
- `param` means the handler returns the captured `params.id` value, which originates from the request-derived pathname slice.

Therefore `param/stable dynamic` comparisons are intended to expose the cost of carrying the captured request-derived parameter representation through the handler and response boundary without changing response content.

## Cell groups

1. Request-derived pathname and parameter extraction.
2. String and JSON normalization with stable versus request-derived parameter strings.
3. Request pathname plus router matching with static versus trailing-param routes.
4. Route match, context construction, and handler invocation without response normalization.
5. Full production-shaped pipeline normalization with identical string/JSON payloads.
6. Actual `Gelis.fetch()` with the same static/dynamic and stable/param controls.

## Interpretation rules

- Diagnostics are non-additive and are engineering direction only.
- A static/dynamic difference with identical payloads is routing/handoff evidence, not response-size evidence.
- A dynamic `param/stable` difference is evidence about using the captured request-derived parameter downstream; it must not automatically be attributed to one specific allocation or string operation without supporting cells.
- No result should be rerun merely because it is surprising or unfavorable.
- A valid completed local run becomes authoritative decomposition evidence.

## Completion marker

A valid timed run must end with:

`CP3-N LOCAL DYNAMIC HANDOFF DECOMPOSITION RUN: COMPLETE`
