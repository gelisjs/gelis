# Competitive Performance v0.1 — CP4-R upper-bound sentinel dispatch viability freeze

## Purpose

CP4-Q recovered mixed-static strongly (`0.9545x` versus CP4-I) but failed its only composition guard at `ALL dynamic raw = 1.0272x`. Inspection of the frozen worker shows that `ALL dynamic raw` is not an aggregate workload; it is an `app.all()` trailing-parameter route requested through `PATCH`.

CP4-R isolates one request-time cost in CP4-Q: runtime-created trailing-only method tables have `staticPathLengthMax = -Infinity`, but CP4-Q still reads `table.staticRoutes.size` before trailing lookup. CP4-R makes `staticPathLengthMax` the primary static discriminator. Runtime-created trailing-only tables therefore fail the length comparison without reading `Map.size`; runtime-created static/mixed tables keep the same upper-bound test; legacy/prebuilt tables with undefined metadata retain the conservative `staticRoutes.size` fallback.

The candidate starts from exact CP4-Q source. This benchmark compares CP4-R directly against CP4-I; no CP4-Q ratio chaining is used for acceptance.

## Frozen identity

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- Control source: `c18f231374d0008b7cc3e01bacbf9f81aff9a273`
- Candidate source: `49953b7ecb366c8c300dd2968ce2d8656b41a315`
- Routes: `5,000`
- Samples: `11` mirrored fresh-worker pairs per cell pair
- Timed cells: `10` request-dispatch cells
- Correctness probes: `20/20` required before timing

## Frozen gates

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

Registration and retained-heap cells remain excluded because CP4-R changes only request dispatch and retains CP4-Q registration metadata unchanged.

## Protocol

The first valid completed local timed run on the authoritative machine is evidence as-is. Do not rerun because the result is unfavorable. Do not change source, harness, sample count, or gates after timing begins.

A PASS is decomposition/composition evidence only. It authorizes later direct production revalidation; it does not itself promote production.
