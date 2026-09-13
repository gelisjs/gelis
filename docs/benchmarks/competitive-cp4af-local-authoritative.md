# Competitive Performance v0.1 — CP4-AF local authoritative result

Date: 2026-09-13

## Classification

**VALID / AUTHORITATIVE / ATTRIBUTION COMPLETE / MEASUREMENT-ONLY / NO PRODUCTION PROMOTION**

This is the first valid completed local timed CP4-AF run and is authoritative as-is. It must not be rerun because the result is surprising or conflicts with earlier attribution runs.

## Identity

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- CPU: `Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz`
- Harness SHA: `47e94ecee91532b4d1a68c92a09a0a2ef508d72f`
- Production source: `af4e5102046def1b163435333563b8d08f919bf5`
- CP4-Z source: `1b4057ad9d12bc28d2ab2ca7917924368fe99444`
- KIND-only source: `408f9856f814184ca0204aa49d3812af8660f077`
- Routes: `5,000`
- Samples: `12 balanced fresh-worker triplets/cell`

Local correctness probe before timing: `PASS (21/21)`.

## Authoritative medians

| cell | production | CP4-Z | KIND-only | unit |
| --- | ---: | ---: | ---: | --- |
| static-only raw | 780.0 | 812.3 | 792.0 | ns/op |
| mixed static raw | 793.6 | 807.0 | 808.6 | ns/op |
| mixed dynamic raw | 962.0 | 876.5 | 876.5 | ns/op |
| pure trailing dynamic raw | 957.0 | 873.7 | 870.6 | ns/op |
| generic dynamic raw | 1162.7 | 1154.4 | 1185.1 | ns/op |
| ALL dynamic raw | 944.2 | 881.0 | 872.0 | ns/op |
| static registration | 1.261 | 1.248 | 1.278 | ms |

## Direct attribution ratios

| comparison | Z / production | KIND / production | KIND / Z |
| --- | ---: | ---: | ---: |
| static-only raw | 1.0415x | 1.0155x | 0.9750x |
| mixed static raw | 1.0169x | 1.0189x | 1.0020x |
| mixed dynamic raw | 0.9112x | 0.9112x | 1.0000x |
| pure trailing dynamic raw | 0.9130x | 0.9098x | 0.9965x |
| generic dynamic raw | 0.9929x | 1.0192x | 1.0266x |
| ALL dynamic raw | 0.9331x | 0.9235x | 0.9897x |
| static registration | 0.9898x | 1.0134x | 1.0238x |

## Interpretation

CP4-AF confirms that the CP4-AE generic regression is not a stable universal property of the KIND-only source relative to production. In this balanced run, KIND-only generic dynamic raw is `1.0192x` production, not the `1.0513x` seen in the authoritative direct CP4-AE acceptance run. The CP4-AE classification remains final because CP4-AF is attribution-only and cannot reopen a failed frozen acceptance run.

Within the same CP4-AF run, removing `fastMapKind` from CP4-Z has a mixed signature. KIND-only improves static-only raw by about `2.50%`, leaves mixed static effectively neutral at `1.0020x`, leaves mixed dynamic exactly neutral at `1.0000x`, improves trailing raw slightly at `0.9965x`, and improves ALL dynamic raw at `0.9897x`. However, KIND-only is slower than CP4-Z on generic dynamic raw at `1.0266x` and static registration at `1.0238x`.

That same-source component direction is not robust across prior balanced attribution. CP4-AD measured KIND-only / Z at `0.9625x` on generic dynamic raw and `0.9869x` on static registration, whereas CP4-AF measures `1.0266x` and `1.0238x` respectively. Mixed-static and ALL dynamic also change direction between the two balanced protocols. Therefore the current evidence does not support a stable causal claim that removing `fastMapKind` either improves or regresses those cells independently of code shape and measurement context.

The production-relative dynamic advantage of the CP4-Z lineage remains directionally strong in this run: mixed dynamic `0.9112x`, trailing `0.9130x`, and ALL dynamic `0.9331x`. Generic dynamic is approximately production-neutral for CP4-Z at `0.9929x`. The unresolved problem is no longer whether the lineage can be fast; it is whether small metadata/code-shape changes can be made without unstable movement in generic, static, and registration cells.

## Consequence

- CP4-AF must not be rerun for result selection.
- CP4-Z and CP4-AE prior acceptance classifications remain unchanged.
- KIND-only remains rejected for production promotion because CP4-AE is the frozen direct-production acceptance phase.
- The combined CP4-AD and CP4-AF evidence does not justify another immediate dead-metadata removal candidate.
- Any follow-up must be a separately frozen experiment aimed at explaining the contradictory source-effect direction, not an acceptance rerun.
- A useful next phase is a higher-powered, blockwise Z-vs-KIND stability experiment focused on generic dynamic raw, static registration, and stable control cells, with source order balanced inside each block. Its purpose would be to determine whether the sign flips are sampling/order sensitivity or a reproducible code-shape interaction.

Completion marker:

`CP4-AF LOCAL PRODUCTION-Z-KIND ATTRIBUTION RUN: COMPLETE`
