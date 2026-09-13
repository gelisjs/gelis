# Competitive Performance v0.1 — CP4-U unbound ALL URL specialization viability freeze

## Purpose

CP4-T preserved mixed-static recovery and improved ALL routing, but still failed unrelated method-hit guards after changing shared `Router.matchRequestUrl()` code shape. CP4-U therefore restores `router.ts` exactly to CP4-Q and specializes only routers that actually register `app.all()`.

Unlike CP4-S, the URL specialization does not capture a bound copy of `router.matchRequestUrl`. It stores `Router.prototype.matchRequestUrl` once at module scope and invokes it with `.call(router, ...)`, removing the extra bound-function layer while leaving ordinary non-ALL routers untouched.

This is a direct CP4-I control-versus-candidate decomposition. No prior ratio chaining is used for acceptance.

## Frozen identity

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- Control source: `c18f231374d0008b7cc3e01bacbf9f81aff9a273`
- Candidate source: `d00e9aa92bf36f59a4182d4602ca46392f5b3686`
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

## Protocol

The first valid completed local timed run on the authoritative machine is evidence as-is. Do not rerun because the result is unfavorable. Do not change source, harness, sample count, or gates after timing begins.

A PASS authorizes direct production revalidation only; it does not itself promote production.
