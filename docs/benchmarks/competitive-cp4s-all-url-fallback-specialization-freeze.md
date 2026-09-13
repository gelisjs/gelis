# Competitive Performance v0.1 — CP4-S ALL request URL fallback specialization viability freeze

## Purpose

CP4-Q recovered mixed-static decisively but missed the ALL-method guard. CP4-R proved that the ALL lane can be restored to neutral, but its router-wide sentinel altered unrelated mixed/collision behavior and therefore was rejected.

CP4-S returns to exact CP4-Q request-dispatch source and changes only `src/runtime/router-all.ts`. Gelis already installs an `ALL` fallback specialization at registration time for `router.match()`. CP4-S extends that same pay-for-use specialization to `router.matchRequestUrl()`, so applications without an `ALL` route keep the exact CP4-Q request path, while applications that register `ALL` can resolve a method miss to the ALL route inside the specialized URL matcher instead of returning to `Gelis.fetch()` for a second matcher dispatch.

This is a direct CP4-I control-versus-candidate decomposition. No CP4-Q or CP4-R ratio chaining is used for acceptance.

## Frozen identity

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- Control source: `c18f231374d0008b7cc3e01bacbf9f81aff9a273`
- Candidate source: `8bb0327336ae970d73fc8638305a501205534ec2`
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

Registration and retained-heap cells remain excluded because CP4-S is request-dispatch specialization only.

## Protocol

The first valid completed local timed run on the authoritative machine is evidence as-is. Do not rerun because the result is unfavorable. Do not change source, harness, sample count, or gates after timing begins.

A PASS is decomposition evidence only. It authorizes later direct production revalidation; it does not itself promote production.
