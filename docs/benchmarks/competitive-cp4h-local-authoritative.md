# Competitive Performance v0.1 — CP4-H local authoritative decomposition

## Identity

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- CPU: Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz
- Harness SHA: `8ddf6241996a3161276b6019930f0bd4fb15481f`
- Frozen CP4-F control source: `1e19a185eafbe271125eb73fc9f389413345ea8b`
- Frozen CP4-H candidate source: `45598d35271be658da76fe4ca755c04c91f35c92`
- Routes: `5,000`
- Samples: `11` mirrored fresh-worker pairs per cell pair
- Correctness probe: `PASS (20/20)`

## Candidate / control ratios

| comparison                    |   ratio | candidate delta |
| ----------------------------- | ------: | --------------: |
| static-only raw               | 0.9721x |        -23.2 ns |
| mixed static raw              | 0.9901x |         -8.1 ns |
| mixed dynamic raw             | 0.9848x |        -13.4 ns |
| mixed dynamic JSON            | 1.0153x |        +10.4 ns |
| mixed same-length dynamic raw | 0.9788x |        -20.5 ns |
| pure trailing dynamic raw     | 0.9815x |        -16.5 ns |
| pure trailing dynamic JSON    | 0.9882x |         -8.0 ns |
| generic dynamic raw           | 0.9967x |         -3.9 ns |
| forced collision raw          | 0.9950x |         -4.9 ns |
| ALL dynamic raw               | 0.9974x |         -2.3 ns |

## Frozen gate result

| gate                                | candidate / CP4-F control |        limit | result   |
| ----------------------------------- | ------------------------: | -----------: | -------- |
| static-only recovery                |                   0.9721x | `<= 0.9956x` | PASS     |
| mixed-static recovery               |                   0.9901x | `<= 0.9850x` | **FAIL** |
| mixed dynamic raw guard             |                   0.9848x | `<= 1.0200x` | PASS     |
| mixed dynamic JSON guard            |                   1.0153x | `<= 1.0200x` | PASS     |
| mixed same-length dynamic raw guard |                   0.9788x | `<= 1.0200x` | PASS     |
| pure trailing dynamic raw guard     |                   0.9815x | `<= 1.0200x` | PASS     |
| pure trailing dynamic JSON guard    |                   0.9882x | `<= 1.0200x` | PASS     |
| generic dynamic raw guard           |                   0.9967x | `<= 1.0200x` | PASS     |
| forced collision raw guard          |                   0.9950x | `<= 1.0200x` | PASS     |
| ALL dynamic raw guard               |                   0.9974x | `<= 1.0200x` | PASS     |

## Interpretation

1. Making `fastMapKind` the primary capability discriminator materially recovers the pure-static deficit. `static-only raw` improves to `0.9721x` versus CP4-F, comfortably beyond the pre-frozen `<= 0.9956x` recovery requirement.
2. The mixed-static path also improves, but only to `0.9901x`, missing the pre-frozen `<= 0.9850x` requirement. Therefore the change alone is insufficient to close CP4-F's mixed-static production deficit.
3. Composing the authoritative CP4-F mixed-static ratio (`1.0356x` versus production) with CP4-H (`0.9901x` versus CP4-F) gives an approximate `1.0253x` production-relative ratio, still above the unchanged `<= 1.0200x` production guard. By contrast, static-only projects to approximately `0.9959x` versus production.
4. Every secondary dynamic guard passes. The generic path remains effectively neutral (`0.9967x`), while mixed dynamic raw, same-length dynamic raw, trailing raw/JSON, collision, and ALL dynamic are all at or below the CP4-F control. Mixed dynamic JSON regresses to `1.0153x` versus CP4-F but remains within the frozen `1.0200x` guard.
5. The result attributes a significant part of CP4-F's pure-static regression to the redundant `usesDynamicTrie` read/branch, but the remaining mixed-static deficit lies inside the mixed static-precedence discriminator itself.
6. Compared with CP4-B, the CP4-H mixed-static hot path performs a path-length calculation plus min/max bound loads and comparisons before the exact static lookup. For a static hit inside the range these checks cannot avoid the lookup and therefore become pure overhead. The next decomposition should test whether a one-sided upper-bound check can preserve the important long-dynamic skip while removing the lower-bound read/comparison from static hits.
7. CP4-H must not be rerun or have its frozen thresholds changed. The first valid local timed run is retained as authoritative decomposition evidence.

## Classification

**CP4-H LOCAL FAST-MAP PRIMARY DISCRIMINATOR DECOMPOSITION: VALID / AUTHORITATIVE / FAIL.**

The candidate is rejected as sufficient on its own for production promotion and accepted as decomposition evidence. Its `fastMapKind` primary-discriminator mechanism remains viable for composition into the next targeted experiment because it passed static-only recovery and every secondary guard; only mixed-static recovery remained insufficient.
