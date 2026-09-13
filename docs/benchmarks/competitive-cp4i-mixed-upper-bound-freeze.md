# Competitive Performance v0.1 — CP4-I mixed upper-bound viability freeze

## Purpose

CP4-I isolates the residual mixed-static cost left after CP4-H. The control is the exact frozen CP4-H source. The candidate keeps CP4-H's primary `fastMapKind` discriminator and changes only the mixed static-precedence range check from a min/max range to a one-sided upper-bound check.

For a mixed-table request longer than the maximum static route length, a static match is impossible, so the exact static lookup can still be skipped. For a request at or below the maximum, the candidate performs the exact static lookup. This is conservative for paths shorter than the previous minimum: they may pay an unnecessary lookup but cannot produce a false static match. Same-length static precedence remains exact.

## Frozen identity

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- CP4-H control source: `45598d35271be658da76fe4ca755c04c91f35c92`
- CP4-I candidate source: `c18f231374d0008b7cc3e01bacbf9f81aff9a273`
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

Registration and retained-heap cells remain outside this viability decomposition. A passing CP4-I mechanism must later pass full production acceptance against the frozen production source, including registration and retained heap, before any promotion.

## Frozen viability gates

| gate                                | candidate / CP4-H control |        limit |
| ----------------------------------- | ------------------------: | -----------: |
| static-only guard                   |         candidate/control | `<= 1.0200x` |
| mixed-static recovery               |         candidate/control | `<= 0.9948x` |
| mixed dynamic raw guard             |         candidate/control | `<= 1.0200x` |
| mixed dynamic JSON guard            |         candidate/control | `<= 1.0200x` |
| mixed same-length dynamic raw guard |         candidate/control | `<= 1.0200x` |
| pure trailing dynamic raw guard     |         candidate/control | `<= 1.0200x` |
| pure trailing dynamic JSON guard    |         candidate/control | `<= 1.0200x` |
| generic dynamic raw guard           |         candidate/control | `<= 1.0200x` |
| forced collision raw guard          |         candidate/control | `<= 1.0200x` |
| ALL dynamic raw guard               |         candidate/control | `<= 1.0200x` |

The mixed-static recovery limit was frozen before timing. CP4-F measured `1.0356x` versus production and CP4-H measured `0.9901x` versus CP4-F, yielding an approximate residual of `1.0253x` versus production. Returning to the unchanged production guard of `<= 1.0200x` therefore requires approximately `1.0200 / (1.0356 * 0.9901) = 0.9948x` versus CP4-H.

## Interpretation contract

- PASS requires the mixed-static recovery gate and every secondary guard to pass.
- If mixed-static recovery fails, removing the lower-bound read/comparison is insufficient to close the residual mixed-static deficit.
- If a secondary guard fails, the one-sided discriminator is not viable even if mixed-static improves.
- The first valid local timed run is authoritative evidence as-is. No threshold may change after timing is seen.
- CI may validate formatting, typecheck, tests, and probe-only correctness. CI timing is not authoritative.
