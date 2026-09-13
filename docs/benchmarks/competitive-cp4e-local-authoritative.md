# Competitive Performance v0.1 — CP4-E local authoritative acceptance

## Identity

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- CPU: Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz
- Harness SHA: `d85069ce4faef807d71f82fa625a0425bdfe4f0c`
- Previous production source: `af4e5102046def1b163435333563b8d08f919bf5`
- Frozen CP4-E candidate source: `f18e43623eeafe6356248b174b3ae2112bcc8e82`
- Routes: `5,000`
- Samples: `11` mirrored fresh-worker pairs per cell pair
- Correctness probe: `PASS (24/24)`
- Repository check immediately before local probe: `741 pass / 0 fail / 2147 expect() calls`

## Candidate / production ratios

| comparison                    |   ratio | candidate delta |
| ----------------------------- | ------: | --------------: |
| static-only raw               | 1.0368x |        +29.2 ns |
| mixed static raw              | 1.0222x |        +17.4 ns |
| mixed dynamic raw             | 0.9346x |        -61.9 ns |
| mixed dynamic JSON            | 0.9426x |        -41.9 ns |
| mixed same-length dynamic raw | 0.9798x |        -19.5 ns |
| pure trailing dynamic raw     | 0.9250x |        -70.9 ns |
| pure trailing dynamic JSON    | 0.9122x |        -65.4 ns |
| generic dynamic raw           | 1.0246x |        +28.2 ns |
| forced collision raw          | 0.9038x |       -101.1 ns |
| ALL dynamic raw               | 0.9302x |        -66.5 ns |
| static registration           | 1.0214x |       +0.027 ms |
| static retained heap delta    | 0.9983x |     -1071 bytes |

## Frozen gate result

| gate                          | candidate / production |        limit | result   |
| ----------------------------- | ---------------------: | -----------: | -------- |
| static-only raw               |                1.0368x | `<= 1.0200x` | **FAIL** |
| mixed static raw              |                1.0222x | `<= 1.0200x` | **FAIL** |
| mixed dynamic raw guard       |                0.9346x | `<= 1.0200x` | PASS     |
| mixed dynamic JSON guard      |                0.9426x | `<= 1.0200x` | PASS     |
| mixed dynamic geomean         |                0.9386x | `<= 0.9800x` | PASS     |
| mixed same-length dynamic raw |                0.9798x | `<= 1.0200x` | PASS     |
| pure trailing dynamic raw     |                0.9250x | `<= 0.9400x` | PASS     |
| pure trailing dynamic JSON    |                0.9122x | `<= 0.9500x` | PASS     |
| generic dynamic raw           |                1.0246x | `<= 1.0300x` | PASS     |
| forced collision raw          |                0.9038x | `<= 1.1500x` | PASS     |
| ALL dynamic raw               |                0.9302x | `<= 1.0500x` | PASS     |
| static registration           |                1.0214x | `<= 1.0500x` | PASS     |
| static retained heap          |                0.9983x | `<= 1.0500x` | PASS     |

## Interpretation

1. Deferring trailing-route metadata reads until after exact-static handling improves CP4-D's static-only result from `1.0474x` to `1.0368x`, so eager trailing metadata selection was a measurable contributor to the regression.
2. The deferred ordering does not recover the frozen static gate. `static-only raw` remains `3.68%` slower than production and `mixed static raw` narrowly exceeds the guard at `1.0222x`.
3. The static-length range mechanism remains useful. Mixed dynamic geomean is `0.9386x`, same-length precedence is preserved at `0.9798x`, pure trailing remains materially faster, and collision/ALL paths remain strong.
4. Registration and retained heap are not blockers: `1.0214x` and `0.9983x` both remain inside their frozen guards.
5. Compared with CP4-B, which held `static-only raw` at `1.0156x` and `mixed static raw` at `1.0060x`, the residual regression is now attributable to the additional static/range dispatch shape introduced after CP4-B rather than to the full-request URL offset mechanism alone.
6. CP4-E must not be rerun or have thresholds changed. The valid first authoritative run is retained as evidence.
7. The next candidate should specialize method-table kind at registration so pure-static tables can take the CP4-B-shaped static path without paying mixed static/trailing range discrimination, while mixed tables retain the min/max range mechanism.

## Classification

**CP4-E LOCAL DEFERRED TRAILING-METADATA ACCEPTANCE: VALID / AUTHORITATIVE / FAIL.**

The candidate is rejected for production promotion and accepted as decomposition evidence.
