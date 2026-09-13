# Competitive Performance v0.1 — CP4-W guardless ALL URL specialization balanced acceptance freeze

## Purpose

CP4-V balanced composition attribution showed substantial run/code-layout sensitivity in the earlier pairwise viability runs. In the same balanced run, CP4-U was the only source that projected below every frozen threshold across the seven attribution cells.

CP4-W therefore uses CP4-U as its source basis and makes one real request-path change in `src/runtime/router-all.ts`: the URL fallback wrapper removes the redundant `method === ALL_ROUTE_METHOD` guard. The wrapper calls `Router.prototype.matchRequestUrl` directly, so a miss with `ALL_ROUTE_METHOD` cannot recurse; it can only repeat the same pure lookup and return `undefined`. This mirrors the existing pathname `match()` fallback shape, which already has no equivalent guard.

CP4-U itself remains failed on its original authoritative viability run. It is included in CP4-W only as a same-run attribution anchor and cannot be promoted or accepted by this benchmark.

## Frozen identity

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- CP4-I control: `c18f231374d0008b7cc3e01bacbf9f81aff9a273`
- CP4-U basis anchor: `d00e9aa92bf36f59a4182d4602ca46392f5b3686`
- CP4-W candidate: `3e123c45969412b731c249cb65505747c1b207bd`
- Routes: `5,000`
- Samples: `12` balanced fresh-worker triplets per cell
- Execution orders: all six permutations of CP4-I / CP4-U / CP4-W, repeated twice
- Timed cells: `10`
- Correctness probes required before local timing: `30/30`

## Frozen acceptance gates

Acceptance is based only on direct `CP4-W / CP4-I` ratios.

- static-only raw guard: `<= 1.0200x`
- mixed-static recovery: `<= 0.9963x`
- mixed dynamic raw guard: `<= 1.0200x`
- mixed dynamic JSON guard: `<= 1.0200x`
- mixed same-length dynamic raw guard: `<= 1.0200x`
- pure trailing dynamic raw guard: `<= 1.0200x`
- pure trailing dynamic JSON guard: `<= 1.0200x`
- generic dynamic raw guard: `<= 1.0200x`
- forced collision raw guard: `<= 1.0200x`
- ALL dynamic raw guard: `<= 1.0200x`

PASS requires every gate to pass. CP4-U ratios are printed for attribution only and have no acceptance effect.

## Protocol

The first valid completed local timed run on the authoritative machine is evidence as-is. Do not rerun because a result is unfavorable or surprising. Do not alter source, sample count, execution orders, cells, or gates after timing begins.

If all ten direct CP4-W / CP4-I gates pass, classification is:

**VALID / AUTHORITATIVE / PASS / ACCEPTED FOR DIRECT PRODUCTION REVALIDATION.**

If any gate fails, classification is:

**VALID / AUTHORITATIVE / FAIL / REJECTED FOR COMPOSITION / ACCEPTED AS DECOMPOSITION EVIDENCE.**

A PASS does not itself promote production. Production promotion still requires a separate direct production-vs-CP4-W acceptance run.
