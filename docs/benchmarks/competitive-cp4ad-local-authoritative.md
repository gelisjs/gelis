# Competitive Performance v0.1 — CP4-AD local authoritative attribution

Date: 2026-09-13

## Classification

**VALID / AUTHORITATIVE / ATTRIBUTION COMPLETE / MEASUREMENT-ONLY / NO PRODUCTION PROMOTION**

This is the first valid completed local timed CP4-AD run and is authoritative attribution evidence as-is. It must not be rerun because a later result might be preferable.

CP4-AD does not override or reopen the prior CP4-Z or CP4-AB production-acceptance classifications.

## Identity

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- CPU: `Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz`
- Harness SHA: `e8a629f4e811f90324319ce3d775e3dc5837fa2e`
- CP4-Z source: `1b4057ad9d12bc28d2ab2ca7917924368fe99444`
- MIN-only source: `031c5cea5c855256c35e14f63d524c544293b29f`
- KIND-only source: `408f9856f814184ca0204aa49d3812af8660f077`
- Routes: `5,000`
- Samples: `12 balanced fresh-worker triplets/cell`
- Order control: all six source permutations, repeated twice per cell

Local correctness probe before timing: `PASS (21/21)`.

## Balanced attribution cells

| cell                 | source    | median |    p25 |    p75 |    min |    max | unit  |
| -------------------- | --------- | -----: | -----: | -----: | -----: | -----: | ----- |
| static-only-raw      | cp4z      |  812.6 |  805.5 |  836.5 |  797.4 |  956.7 | ns/op |
| static-only-raw      | min-only  |  813.8 |  797.6 |  839.4 |  787.8 |  861.1 | ns/op |
| static-only-raw      | kind-only |  809.6 |  805.1 |  825.6 |  791.7 |  852.5 | ns/op |
| mixed-static-raw     | cp4z      |  799.1 |  796.4 |  818.7 |  781.8 |  911.0 | ns/op |
| mixed-static-raw     | min-only  |  794.4 |  789.8 |  806.6 |  782.6 | 1147.5 | ns/op |
| mixed-static-raw     | kind-only |  822.6 |  814.7 |  824.6 |  798.4 |  829.9 | ns/op |
| mixed-dynamic-raw    | cp4z      |  880.1 |  873.1 |  901.6 |  865.2 |  933.3 | ns/op |
| mixed-dynamic-raw    | min-only  |  885.4 |  864.5 |  895.7 |  840.6 |  950.0 | ns/op |
| mixed-dynamic-raw    | kind-only |  872.5 |  863.2 |  893.5 |  850.3 |  925.5 | ns/op |
| trailing-dynamic-raw | cp4z      |  875.5 |  867.9 |  893.4 |  848.1 |  906.4 | ns/op |
| trailing-dynamic-raw | min-only  |  871.8 |  862.3 |  910.7 |  855.5 |  930.5 | ns/op |
| trailing-dynamic-raw | kind-only |  861.9 |  857.1 |  876.9 |  845.8 | 1251.5 | ns/op |
| generic-dynamic-raw  | cp4z      | 1194.8 | 1184.6 | 1255.4 | 1157.7 | 1306.8 | ns/op |
| generic-dynamic-raw  | min-only  | 1206.0 | 1156.7 | 1316.1 | 1115.2 | 1415.2 | ns/op |
| generic-dynamic-raw  | kind-only | 1160.8 | 1144.6 | 1211.6 | 1125.2 | 1307.6 | ns/op |
| all-dynamic-raw      | cp4z      |  884.9 |  876.0 |  904.3 |  859.7 |  983.1 | ns/op |
| all-dynamic-raw      | min-only  |  883.9 |  876.5 |  897.3 |  869.1 |  961.2 | ns/op |
| all-dynamic-raw      | kind-only |  888.7 |  876.8 |  897.0 |  865.1 |  924.9 | ns/op |
| static-registration  | cp4z      |  1.356 |  1.275 |  1.437 |  1.223 |  1.504 | ms    |
| static-registration  | min-only  |  1.296 |  1.236 |  1.356 |  1.203 |  1.780 | ms    |
| static-registration  | kind-only |  1.279 |  1.243 |  1.322 |  1.207 |  1.410 | ms    |

## Direct component ratios versus CP4-Z

| comparison                | MIN-only / Z | KIND-only / Z | KIND / MIN |
| ------------------------- | -----------: | ------------: | ---------: |
| static-only raw           |      1.0014x |       0.9963x |    0.9949x |
| mixed static raw          |      0.9942x |       1.0294x |    1.0354x |
| mixed dynamic raw         |      1.0060x |       0.9913x |    0.9854x |
| pure trailing dynamic raw |      0.9957x |       0.9845x |    0.9887x |
| generic dynamic raw       |      1.0094x |       0.9716x |    0.9625x |
| ALL dynamic raw           |      0.9989x |       1.0042x |    1.0054x |
| static registration       |      0.9559x |       0.9434x |    0.9869x |

## Attribution

The component result is non-additive relative to CP4-AB's combined removal. Both individual removals reduce the static-registration median relative to CP4-Z, while the prior combined CP4-AB source was slower than CP4-Z in CP4-AC registration attribution. Therefore the available evidence does not support a simple monotonic rule that removing more dead metadata necessarily improves this code path.

MIN-only is close to CP4-Z on request execution. Its six runtime ratios span `0.9942x` to `1.0094x`, while static registration improves to `0.9559x`. Under this protocol, the `staticPathLengthMin` removal is primarily a registration-side signal rather than a clear request-path optimization.

KIND-only has a stronger but mixed signature. Relative to CP4-Z it improves:

- static-only raw to `0.9963x`;
- mixed dynamic raw to `0.9913x`;
- pure trailing dynamic raw to `0.9845x`;
- generic dynamic raw to `0.9716x`;
- static registration to `0.9434x`.

It regresses mixed-static raw to `1.0294x` and ALL dynamic raw to `1.0042x`.

The mixed-static regression means KIND-only cannot be promoted from CP4-AD itself. However, KIND-only is the stronger component candidate for a separately frozen direct production acceptance phase because it combines the largest registration improvement with favorable dynamic-path attribution in four of the five non-ALL request cells. Any production decision must come from a fresh direct production comparison, not from multiplying ratios across independent runs.

## Consequence

- CP4-Z remains rejected for production promotion under its own authoritative gate result.
- CP4-AB remains rejected as a production candidate under its own authoritative gate result.
- CP4-AD must not be rerun for result selection.
- MIN-only does not justify direct production promotion from attribution evidence alone.
- KIND-only is the preferred next source for a separately frozen direct production acceptance phase.
- The next acceptance phase must compare KIND-only directly against the frozen production source and reuse the existing production gate semantics without relaxing thresholds after seeing results.

Completion marker:

`CP4-AD LOCAL DEAD-METADATA COMPONENT ATTRIBUTION RUN: COMPLETE`
