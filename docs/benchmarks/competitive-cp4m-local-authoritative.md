# CP4-M Local Authoritative Lineage Attribution

## Classification

**VALID / AUTHORITATIVE / ATTRIBUTION COMPLETE / STATIC-ONLY CROSSING NOT REPRODUCED / MIXED-STATIC FIRST CROSSING LOCATED IN CP4-B -> CP4-F SEGMENT**

The first valid local timed run is authoritative as-is. It must not be rerun merely because the result differs from an earlier decomposition or direct acceptance run.

## Identity

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- CPU: `Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz`
- Harness SHA: `b37c487c0cede0202a606490505fd4f5bfcaceaa`
- Production source: `af4e5102046def1b163435333563b8d08f919bf5`
- CP4-B source: `ca7543b46ad68b89a9d2b10d29e052993b216758`
- CP4-F source: `1e19a185eafbe271125eb73fc9f389413345ea8b`
- CP4-I source: `c18f231374d0008b7cc3e01bacbf9f81aff9a273`
- Routes: `5,000`
- Samples: `12` balanced fresh-worker quartets per cell
- Local correctness probe: `28/28 PASS`

## Lineage medians

| Cell                      | Production |  CP4-B |  CP4-F |  CP4-I | Unit  |
| ------------------------- | ---------: | -----: | -----: | -----: | ----- |
| static-only raw           |      822.2 |  796.9 |  828.7 |  806.7 | ns/op |
| mixed static raw          |      789.9 |  799.3 |  815.3 |  808.6 | ns/op |
| mixed dynamic raw         |      946.6 |  962.4 |  875.7 |  888.1 | ns/op |
| mixed dynamic JSON        |      735.7 |  731.1 |  683.1 |  675.9 | ns/op |
| pure trailing dynamic raw |      974.8 |  868.9 |  884.2 |  890.6 | ns/op |
| generic dynamic raw       |     1178.7 | 1170.3 | 1195.3 | 1177.4 | ns/op |
| ALL dynamic raw           |      963.0 |  877.1 |  881.0 |  899.6 | ns/op |

## Direct ratios versus production

| Comparison                |   CP4-B |   CP4-F |   CP4-I |
| ------------------------- | ------: | ------: | ------: |
| static-only raw           | 0.9693x | 1.0079x | 0.9812x |
| mixed static raw          | 1.0119x | 1.0321x | 1.0237x |
| mixed dynamic raw         | 1.0167x | 0.9251x | 0.9383x |
| mixed dynamic JSON        | 0.9937x | 0.9286x | 0.9188x |
| pure trailing dynamic raw | 0.8914x | 0.9071x | 0.9137x |
| generic dynamic raw       | 0.9929x | 1.0141x | 0.9989x |
| ALL dynamic raw           | 0.9108x | 0.9148x | 0.9342x |

## Adjacent lineage ratios

| Comparison       | Production -> CP4-B | CP4-B -> CP4-F | CP4-F -> CP4-I |
| ---------------- | ------------------: | -------------: | -------------: |
| static-only raw  |             0.9693x |        1.0399x |        0.9735x |
| mixed static raw |             1.0119x |        1.0199x |        0.9919x |

## Frozen attribution boundary

The static attribution boundary was frozen at `> 1.0200x` versus production.

- Static-only first crossing: **none**. No lineage source exceeded `1.0200x` versus production in this run.
- Mixed-static first crossing: **CP4-B -> CP4-F segment**. CP4-B is `1.0119x` versus production, while CP4-F is `1.0321x`.
- CP4-I partially recovers the CP4-F mixed-static regression to `1.0237x`, but remains narrowly above the frozen `1.0200x` production boundary.

## Interpretation

1. The `1.0747x` static-only failure observed in CP4-J is not reproduced as a stable lineage crossing under the balanced CP4-M protocol. CP4-I measures `0.9812x` versus production here, while CP4-B and CP4-F are also inside the static-only boundary.
2. Therefore no further source work should target static-only request handoff or capability presence on the basis of CP4-J alone. CP4-K and CP4-L already failed to recover that path and are consistent with this conclusion.
3. Mixed-static is the reproducible residual. The first direct production crossing appears inside the cumulative CP4-B -> CP4-F source segment.
4. The same segment also contains the large dynamic recovery: mixed dynamic raw improves from CP4-B `1.0167x` to CP4-F `0.9251x`, and mixed dynamic JSON from `0.9937x` to `0.9286x`. Any next experiment must preserve those gains rather than simply revert the segment.
5. CP4-I recovers mixed-static from CP4-F `1.0321x` to `1.0237x` while preserving strong dynamic performance, leaving only a narrow `0.37%` excess above the frozen mixed-static production gate.
6. The next step is sub-lineage attribution across frozen CP4-B, CP4-C, CP4-D, CP4-E, and CP4-F source points under one balanced local run, with mixed-static as the primary attribution cell and dynamic request cells as guards. No new production optimization should be attempted before that attribution identifies the first sub-segment crossing.

## Status

CP4-M is complete. It is attribution evidence only and does not promote CP4-I. The production source remains `af4e5102046def1b163435333563b8d08f919bf5`.
