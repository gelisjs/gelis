# Competitive Performance v0.1 — CP4-G request URL dispatch decomposition freeze

## Purpose

CP4-G isolates the per-request application dispatch cost that remains above the CP4-F router algorithm. It is a decomposition experiment, not a production acceptance candidate.

The control is the exact frozen CP4-F source. The candidate changes only `src/app.ts`: routers that already provide `matchRequestUrl` are used directly, while routers without it are normalized once at installation through a compatibility adapter. `Gelis.fetch()` then calls the normalized request-URL matcher directly instead of performing an optional capability branch and `Function.call()` on every request.

## Frozen identity

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- CP4-F control source: `1e19a185eafbe271125eb73fc9f389413345ea8b`
- CP4-G candidate source: `b3ae6337b561d2683376a0f459a3bbf2d50d0867`
- Routes per workload: `5,000`
- Samples: `11` mirrored fresh-worker pairs per cell pair
- Local authoritative machine: Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz

## Frozen cells

- static-only raw
- mixed static raw
- mixed dynamic raw
- mixed dynamic JSON
- mixed same-length dynamic raw
- pure trailing dynamic raw
- pure trailing dynamic JSON
- generic dynamic raw
- forced collision raw
- ALL dynamic raw

Correctness requires both control and candidate to pass every cell before timing: `20/20` probes.

Registration and retained-heap cells are intentionally excluded because CP4-G changes application request dispatch only and does not alter router registration or table representation.

## Frozen viability gates

| gate                                | candidate / CP4-F control |        limit |
| ----------------------------------- | ------------------------: | -----------: |
| static-only recovery                |         candidate/control | `<= 0.9956x` |
| mixed-static recovery               |         candidate/control | `<= 0.9850x` |
| mixed dynamic raw guard             |         candidate/control | `<= 1.0200x` |
| mixed dynamic JSON guard            |         candidate/control | `<= 1.0200x` |
| mixed same-length dynamic raw guard |         candidate/control | `<= 1.0200x` |
| pure trailing dynamic raw guard     |         candidate/control | `<= 1.0200x` |
| pure trailing dynamic JSON guard    |         candidate/control | `<= 1.0200x` |
| generic dynamic raw guard           |         candidate/control | `<= 1.0200x` |
| forced collision raw guard          |         candidate/control | `<= 1.0200x` |
| ALL dynamic raw guard               |         candidate/control | `<= 1.0200x` |

The two recovery thresholds are derived before timing from CP4-F's authoritative production deficits. CP4-F static-only was `1.0245x` vs production, so closing the frozen production guard of `1.0200x` requires at most `1.0200 / 1.0245 = 0.995607...`, frozen as `0.9956x`. CP4-F mixed-static was `1.0356x`, so closing the same production guard requires at most `1.0200 / 1.0356 = 0.984936...`, frozen as `0.9850x`.

The remaining cells use the established `<= 1.0200x` no-regression guard. They exist to ensure an app-dispatch improvement is not bought by materially harming dynamic request shapes.

## Interpretation contract

- If both recovery gates pass and every secondary guard passes, app-level request-URL dispatch is strong enough to compose into the next full production candidate.
- If either recovery gate fails, this mechanism alone does not recover enough of the observed CP4-F static deficit to justify production promotion by itself.
- A valid first local timed run is evidence as-is. Thresholds must not be relaxed and the run must not be repeated merely because the result is unfavorable.
- CI may validate formatting, typecheck, tests, and the probe-only harness. CI timing is not authoritative.
