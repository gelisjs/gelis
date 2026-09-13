# Competitive Performance v0.1 — CP4-T ALL table-miss fallback viability freeze

## Purpose

CP4-Q recovered mixed-static strongly but failed its ALL dynamic guard. CP4-R showed that changing the fast-map discriminator globally could recover ALL but disturbed mixed-static and collision behavior. CP4-S showed that specializing `matchRequestUrl()` only after `app.all()` registration can recover ALL strongly, but the resulting source composition still failed frozen mixed-static and generic guards.

CP4-T returns to exact CP4-Q production source and changes only `Router.matchRequestUrl()` at the existing method-table miss branch. When the requested method table is absent, it reuses the reserved `*` table directly before normal URL parsing. Method-table hits continue through the CP4-Q path unchanged. The existing `router-all.ts` helper is restored exactly to CP4-Q.

This is a direct CP4-I control-versus-candidate acceptance experiment. No CP4-Q, CP4-R, or CP4-S ratio chaining is used.

## Frozen identity

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- Control source: `c18f231374d0008b7cc3e01bacbf9f81aff9a273`
- Candidate source: `bc519e56c599d7b325f0db13d1c6d318801b6024`
- Routes: `5,000`
- Samples: `11` mirrored fresh-worker pairs per cell pair
- Timed cells: `10`
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

The first valid completed local timed run on the authoritative machine is evidence as-is. Do not rerun because the result is unfavorable. Do not relax gates after observing timing.

PASS requires every frozen gate. PASS authorizes direct production revalidation; it does not itself promote production.
