# Competitive Performance v0.1 — CP4-Y Local Authoritative Production Revalidation

Date: 2026-09-13

## Classification

**VALID / AUTHORITATIVE / FAIL / REJECTED FOR PRODUCTION PROMOTION / ACCEPTED AS DIRECT PRODUCTION EVIDENCE**

This is the first valid completed local timed CP4-Y run and is authoritative as-is. It must not be rerun merely because a later result would be preferable.

## Identity

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- CPU: `Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz`
- Harness SHA: `d217d375d9e90e47ea63dea77ee2e3cd8bc8adfb`
- Production source: `af4e5102046def1b163435333563b8d08f919bf5`
- Candidate source: `efaa228231c920fee78053edeb5c8c094f324aca`
- Routes: `5,000`
- Samples: `12 mirrored fresh-worker pairs/cell pair`

## Direct candidate / production gates

| gate | ratio | limit | result |
| --- | ---: | ---: | --- |
| static-only raw | 1.0192x | <= 1.0200x | PASS |
| mixed static raw | 1.0308x | <= 1.0200x | FAIL |
| mixed dynamic raw guard | 0.9177x | <= 1.0200x | PASS |
| mixed dynamic JSON guard | 0.9091x | <= 1.0200x | PASS |
| mixed dynamic geomean | 0.9134x | <= 0.9800x | PASS |
| mixed same-length dynamic raw | 1.0072x | <= 1.0200x | PASS |
| pure trailing dynamic raw | 0.9166x | <= 0.9400x | PASS |
| pure trailing dynamic JSON | 0.9198x | <= 0.9500x | PASS |
| generic dynamic raw | 0.9975x | <= 1.0300x | PASS |
| forced collision raw | 0.9214x | <= 1.1500x | PASS |
| ALL dynamic raw | 0.9573x | <= 1.0500x | PASS |
| static registration | 1.0067x | <= 1.0500x | PASS |
| static retained heap | 0.9982x | <= 1.0500x | PASS |

Acceptance marker:

`CP4-Y DIRECT PRODUCTION REVALIDATION GATE: FAIL`

Completion marker:

`CP4-Y LOCAL DIRECT PRODUCTION REVALIDATION RUN: COMPLETE`

## Interpretation

Twelve of thirteen frozen production gates pass. The only blocker is `mixed-static-raw`, where the candidate is `1.0308x` production against a `<= 1.0200x` limit.

The CP4-X candidate resolves a method table before request-URL matching and immediately dispatches any `usesDynamicTrie` table to `matchGenericMethodTable(table, pathnameFromRequestUrl(url))`. A mixed GET table containing both static and generic dynamic routes therefore bypasses the full-URL exact-static lane even when the request itself targets an exact static route. This is the next mechanism to isolate; the authoritative FAIL itself remains final.
