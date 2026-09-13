# Competitive Performance v0.1 — CP4-F local authoritative acceptance

## Identity

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- CPU: Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz
- Harness SHA: `d95c8c29e54be5080ddaf21a04f25f052fcdd812`
- Previous production source: `af4e5102046def1b163435333563b8d08f919bf5`
- Frozen CP4-F candidate source: `1e19a185eafbe271125eb73fc9f389413345ea8b`
- Routes: `5,000`
- Samples: `11` mirrored fresh-worker pairs per cell pair
- Correctness probe: `PASS (24/24)`
- Repository check immediately before local probe: `741 pass / 0 fail / 2147 expect() calls`

## Candidate / production ratios

| comparison                    |   ratio | candidate delta |
| ----------------------------- | ------: | --------------: |
| static-only raw               | 1.0245x |        +19.3 ns |
| mixed static raw              | 1.0356x |        +28.1 ns |
| mixed dynamic raw             | 0.9538x |        -43.7 ns |
| mixed dynamic JSON            | 0.9271x |        -53.2 ns |
| mixed same-length dynamic raw | 1.0045x |         +4.3 ns |
| pure trailing dynamic raw     | 0.9358x |        -61.4 ns |
| pure trailing dynamic JSON    | 0.9142x |        -63.6 ns |
| generic dynamic raw           | 1.0071x |         +8.3 ns |
| forced collision raw          | 0.9499x |        -51.7 ns |
| ALL dynamic raw               | 0.9138x |        -82.5 ns |
| static registration           | 0.9444x |       -0.074 ms |
| static retained heap delta    | 0.9982x |     -1084 bytes |

## Frozen gate result

| gate                          | candidate / production |        limit | result   |
| ----------------------------- | ---------------------: | -----------: | -------- |
| static-only raw               |                1.0245x | `<= 1.0200x` | **FAIL** |
| mixed static raw              |                1.0356x | `<= 1.0200x` | **FAIL** |
| mixed dynamic raw guard       |                0.9538x | `<= 1.0200x` | PASS     |
| mixed dynamic JSON guard      |                0.9271x | `<= 1.0200x` | PASS     |
| mixed dynamic geomean         |                0.9403x | `<= 0.9800x` | PASS     |
| mixed same-length dynamic raw |                1.0045x | `<= 1.0200x` | PASS     |
| pure trailing dynamic raw     |                0.9358x | `<= 0.9400x` | PASS     |
| pure trailing dynamic JSON    |                0.9142x | `<= 0.9500x` | PASS     |
| generic dynamic raw           |                1.0071x | `<= 1.0300x` | PASS     |
| forced collision raw          |                0.9499x | `<= 1.1500x` | PASS     |
| ALL dynamic raw               |                0.9138x | `<= 1.0500x` | PASS     |
| static registration           |                0.9444x | `<= 1.0500x` | PASS     |
| static retained heap          |                0.9982x | `<= 1.0500x` | PASS     |

## Interpretation

1. Registration-time method-table kind specialization materially recovers the pure-static lane relative to CP4-E: `static-only raw` moves from `1.0368x` to `1.0245x`. The hypothesis was directionally correct, but the result still misses the frozen `<= 1.0200x` guard.
2. The specialization does not solve mixed-static overhead. `mixed static raw` moves from CP4-E's `1.0222x` to `1.0356x`, so the remaining blocker cannot be treated as the min/max metadata representation alone.
3. The performance mechanism remains strong outside static hits. Mixed dynamic geomean is `0.9403x`, same-length static precedence remains inside the guard at `1.0045x`, pure trailing remains faster, and collision/ALL paths remain materially faster.
4. Generic dynamic is no longer a blocker (`1.0071x`). The early generic fallback introduced after CP4-B is therefore preserving the established pathname path without the CP4-B generic regression.
5. Static registration (`0.9444x`) and retained heap (`0.9982x`) are both non-blockers. The residual problem is execution-path dispatch rather than registration or retained metadata cost.
6. The production-shaped request path still contains two universal dispatch layers before a static hit: `Gelis.fetch()` selects an optional `matchRequestUrl` capability, and `Router.matchRequestUrl()` then selects generic/fast-map/table-kind behavior. CP4-F does not isolate how much each layer costs.
7. CP4-F must not be rerun or have thresholds changed. The valid first authoritative run is retained as evidence.
8. Before another production candidate, the next phase should decompose request-URL dispatch cost so app-level capability dispatch can be separated from router-level method-table dispatch.

## Classification

**CP4-F LOCAL METHOD-TABLE KIND ACCEPTANCE: VALID / AUTHORITATIVE / FAIL.**

The candidate is rejected for production promotion and accepted as decomposition evidence.
