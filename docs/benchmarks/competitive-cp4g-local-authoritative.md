# Competitive Performance v0.1 — CP4-G local authoritative decomposition

## Identity

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- CPU: Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz
- Harness SHA: `7e1b7ededd514d5d758ac58a6b2cbd56e90f8f77`
- Frozen CP4-F control source: `1e19a185eafbe271125eb73fc9f389413345ea8b`
- Frozen CP4-G candidate source: `b3ae6337b561d2683376a0f459a3bbf2d50d0867`
- Routes: `5,000`
- Samples: `11` mirrored fresh-worker pairs per cell pair
- Correctness probe: `PASS (20/20)`
- Repository check reported before authoritative timing: `741 pass / 0 fail / 2147 expect() calls`

## Candidate / control ratios

| comparison | ratio | candidate delta |
| --- | ---: | ---: |
| static-only raw | 1.0080x | +6.5 ns |
| mixed static raw | 1.0138x | +11.2 ns |
| mixed dynamic raw | 1.0052x | +4.6 ns |
| mixed dynamic JSON | 0.9885x | -8.0 ns |
| mixed same-length dynamic raw | 1.0084x | +8.1 ns |
| pure trailing dynamic raw | 1.0252x | +21.9 ns |
| pure trailing dynamic JSON | 0.9812x | -12.9 ns |
| generic dynamic raw | 1.0236x | +27.7 ns |
| forced collision raw | 0.9941x | -5.6 ns |
| ALL dynamic raw | 1.0043x | +3.8 ns |

## Frozen gate result

| gate | candidate / CP4-F control | limit | result |
| --- | ---: | ---: | --- |
| static-only recovery | 1.0080x | `<= 0.9956x` | **FAIL** |
| mixed-static recovery | 1.0138x | `<= 0.9850x` | **FAIL** |
| mixed dynamic raw guard | 1.0052x | `<= 1.0200x` | PASS |
| mixed dynamic JSON guard | 0.9885x | `<= 1.0200x` | PASS |
| mixed same-length dynamic raw guard | 1.0084x | `<= 1.0200x` | PASS |
| pure trailing dynamic raw guard | 1.0252x | `<= 1.0200x` | **FAIL** |
| pure trailing dynamic JSON guard | 0.9812x | `<= 1.0200x` | PASS |
| generic dynamic raw guard | 1.0236x | `<= 1.0200x` | **FAIL** |
| forced collision raw guard | 0.9941x | `<= 1.0200x` | PASS |
| ALL dynamic raw guard | 1.0043x | `<= 1.0200x` | PASS |

## Interpretation

1. Removing the per-request optional `matchRequestUrl` capability branch and `Function.call()` does not recover the CP4-F static deficit. `static-only raw` becomes `1.0080x` and `mixed static raw` becomes `1.0138x` versus the frozen CP4-F control, so both pre-frozen recovery requirements fail materially.
2. The app-level dispatch hypothesis is therefore rejected as the primary explanation for the remaining CP4-F static regression. The experiment should not be composed into the next production candidate merely on architectural cleanliness grounds.
3. The candidate also fails the frozen raw guards for pure trailing (`1.0252x`) and generic dynamic (`1.0236x`). This reinforces that the normalized direct-call shape is not a generally superior hot-path shape on the authoritative Bun 1.4.2 machine.
4. JSON trailing improves (`0.9812x`) and collision improves slightly (`0.9941x`), but these isolated wins do not compensate for the failed recovery and raw guards.
5. The next investigation should return inside `Router.matchRequestUrl()`. Compared with CP4-B, CP4-F adds an early generic-table discriminator plus registration-time fast-map kind dispatch. A more targeted decomposition should test whether runtime-created fast-map tables can avoid the `usesDynamicTrie` read/branch entirely by making the registration-time kind the primary discriminator, while generic tables clear that kind when they migrate to the trie. Legacy/prebuilt tables must retain conservative fallback semantics.
6. CP4-G must not be rerun or have its frozen thresholds changed. The first valid local timed run is retained as authoritative decomposition evidence.

## Classification

**CP4-G LOCAL REQUEST URL DISPATCH DECOMPOSITION: VALID / AUTHORITATIVE / FAIL.**

The candidate is rejected for composition into a production candidate and accepted as decomposition evidence.
