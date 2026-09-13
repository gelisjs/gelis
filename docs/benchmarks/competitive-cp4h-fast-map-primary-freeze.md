# Competitive Performance v0.1 — CP4-H fast-map primary discriminator decomposition freeze

## Purpose

CP4-H isolates the request-time cost of reading `usesDynamicTrie` separately from the registration-time `fastMapKind` discriminator introduced in CP4-F.

Control is the exact frozen CP4-F source. Candidate changes only `src/runtime/router.ts`: runtime-created fast-map tables use `fastMapKind` as their primary capability discriminator, generic tables delete that kind when migrating to the trie, and legacy/prebuilt tables without a kind retain the conservative `usesDynamicTrie` fallback.

## Frozen identity

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- CP4-F control source: `1e19a185eafbe271125eb73fc9f389413345ea8b`
- CP4-H candidate source: `45598d35271be658da76fe4ca755c04c91f35c92`
- Routes per workload: `5,000`
- Samples: `11` mirrored fresh-worker pairs per cell pair
- Local authoritative machine: Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz

## Frozen cells

1. static-only raw
2. mixed static raw
3. mixed dynamic raw
4. mixed dynamic JSON
5. mixed same-length dynamic raw
6. pure trailing dynamic raw
7. pure trailing dynamic JSON
8. generic dynamic raw
9. forced collision raw
10. ALL dynamic raw

Correctness requires both control and candidate to pass every cell before timing: `20/20` probes.

Registration and retained-heap cells are excluded from this decomposition. If CP4-H is viable, the mechanism must later pass the full production acceptance including registration and memory before promotion.

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

The recovery limits were frozen before timing from CP4-F's authoritative deficits against production: `1.0245x` static-only and `1.0356x` mixed-static. Reaching the unchanged production guard of `<= 1.0200x` requires approximately `<= 0.9956x` and `<= 0.9850x` respectively versus CP4-F.

## Interpretation contract

- PASS requires both static recovery gates and every secondary guard to pass.
- If either recovery gate fails, the discriminator change alone is insufficient to close CP4-F's static deficit.
- The first valid local timed run is authoritative evidence as-is. No threshold may change after seeing timing.
- CI may validate formatting, typecheck, tests, and probe-only correctness. CI timing is not authoritative.
