# Competitive Performance v0.1 — CP4-AC local authoritative attribution

Date: 2026-09-13

## Classification

**VALID / AUTHORITATIVE / ATTRIBUTION COMPLETE / MEASUREMENT-ONLY / NO PRODUCTION PROMOTION**

This is the first valid completed local timed CP4-AC run and is authoritative attribution evidence as-is. It must not be rerun because a later result might be preferable.

CP4-AC does not override or reopen the prior CP4-Z or CP4-AB acceptance classifications.

## Identity

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- CPU: `Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz`
- Harness SHA: `8ab944d43988943c3fda3a1beb21d0b7672f761c`
- Production source: `af4e5102046def1b163435333563b8d08f919bf5`
- CP4-Z source: `1b4057ad9d12bc28d2ab2ca7917924368fe99444`
- CP4-AB source: `2114489c11d555edfc13db2a6336435fd4879931`
- Routes: `5,000`
- Samples: `12 balanced fresh-worker triplets/cell`
- Order control: all six source permutations, repeated twice per cell

Local correctness probe before timing: `PASS (21/21)`.

## Balanced attribution cells

| cell                 | source     | median |    p25 |    p75 |    min |    max | unit  |
| -------------------- | ---------- | -----: | -----: | -----: | -----: | -----: | ----- |
| static-only-raw      | production |  796.2 |  787.3 |  838.1 |  781.0 |  915.4 | ns/op |
| static-only-raw      | cp4z       |  807.0 |  801.8 |  855.2 |  794.6 |  957.8 | ns/op |
| static-only-raw      | cp4ab      |  823.2 |  807.7 |  840.4 |  782.5 |  883.6 | ns/op |
| mixed-static-raw     | production |  817.6 |  794.2 |  831.2 |  783.1 |  844.8 | ns/op |
| mixed-static-raw     | cp4z       |  806.3 |  796.0 |  810.8 |  794.3 |  824.9 | ns/op |
| mixed-static-raw     | cp4ab      |  824.4 |  816.8 |  867.7 |  794.1 |  871.2 | ns/op |
| mixed-dynamic-raw    | production |  958.6 |  951.5 |  974.7 |  943.5 |  988.2 | ns/op |
| mixed-dynamic-raw    | cp4z       |  885.7 |  870.9 |  903.7 |  859.6 |  990.7 | ns/op |
| mixed-dynamic-raw    | cp4ab      |  893.5 |  875.7 |  915.6 |  850.2 |  985.4 | ns/op |
| trailing-dynamic-raw | production |  963.2 |  950.6 |  996.6 |  939.2 | 1114.7 | ns/op |
| trailing-dynamic-raw | cp4z       |  879.9 |  862.3 |  898.5 |  851.1 | 1161.4 | ns/op |
| trailing-dynamic-raw | cp4ab      |  917.5 |  884.7 |  952.8 |  857.9 |  984.3 | ns/op |
| generic-dynamic-raw  | production | 1163.4 | 1144.7 | 1197.5 | 1130.5 | 1527.5 | ns/op |
| generic-dynamic-raw  | cp4z       | 1211.8 | 1152.5 | 1223.6 | 1130.0 | 1373.1 | ns/op |
| generic-dynamic-raw  | cp4ab      | 1190.3 | 1174.8 | 1210.6 | 1126.7 | 1241.6 | ns/op |
| all-dynamic-raw      | production |  943.6 |  934.9 |  972.5 |  933.5 | 1164.8 | ns/op |
| all-dynamic-raw      | cp4z       |  895.5 |  883.8 |  905.8 |  859.5 |  929.4 | ns/op |
| all-dynamic-raw      | cp4ab      |  890.5 |  883.0 |  922.0 |  861.6 | 2049.1 | ns/op |
| static-registration  | production |  1.261 |  1.242 |  1.297 |  1.204 |  2.415 | ms    |
| static-registration  | cp4z       |  1.310 |  1.244 |  1.328 |  1.232 |  1.373 | ms    |
| static-registration  | cp4ab      |  1.346 |  1.299 |  1.383 |  1.261 |  1.550 | ms    |

## Direct ratios versus production

| comparison                |   CP4-Z |  CP4-AB |  AB / Z |
| ------------------------- | ------: | ------: | ------: |
| static-only raw           | 1.0136x | 1.0338x | 1.0200x |
| mixed static raw          | 0.9862x | 1.0084x | 1.0225x |
| mixed dynamic raw         | 0.9239x | 0.9321x | 1.0088x |
| pure trailing dynamic raw | 0.9135x | 0.9525x | 1.0427x |
| generic dynamic raw       | 1.0416x | 1.0232x | 0.9823x |
| ALL dynamic raw           | 0.9490x | 0.9437x | 0.9944x |
| static registration       | 1.0388x | 1.0672x | 1.0273x |

## Attribution

The balanced same-run result does not support CP4-AB's dead-metadata removal as a broadly beneficial production optimization relative to CP4-Z.

Relative to CP4-Z, CP4-AB is slower in five of seven measured cells:

- static-only raw: `1.0200x`;
- mixed static raw: `1.0225x`;
- mixed dynamic raw: `1.0088x`;
- pure trailing dynamic raw: `1.0427x`;
- static registration: `1.0273x`.

CP4-AB is faster than CP4-Z in two measured cells:

- generic dynamic raw: `0.9823x`;
- ALL dynamic raw: `0.9944x`.

The static-registration result is especially important for attribution. CP4-AB removes dead `fastMapKind` and `staticPathLengthMin` metadata work relative to CP4-Z, yet its balanced registration median is still slower than CP4-Z (`1.0273x AB/Z`). Therefore the prior CP4-AB registration failure cannot be explained as evidence that this metadata removal improved registration but was merely hidden by the direct production-pair run.

At the same time, CP4-AC does not prove that every observed difference is structural. Several distributions contain visible spread and outliers. Its purpose is narrower: under the frozen balanced protocol, there is no consistent performance evidence favoring CP4-AB over CP4-Z, and the expected registration benefit is not present.

## Consequence

- CP4-Z remains rejected for production promotion under its own authoritative gate result.
- CP4-AB remains rejected as a production candidate under its own authoritative gate result.
- CP4-AB's metadata-removal direction should not be promoted on performance grounds from the available evidence.
- No CP4-AC rerun is permitted for result selection.
- The next production candidate should target a newly identified measured cost rather than reopening CP4-Z/CP4-AB or relaxing their frozen gates.

Completion marker:

`CP4-AC LOCAL PRODUCTION-Z-AB ATTRIBUTION RUN: COMPLETE`
