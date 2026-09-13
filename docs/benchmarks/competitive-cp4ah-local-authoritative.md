# Competitive Performance v0.1 — CP4-AH local authoritative result

Date: 2026-09-13

## Classification

**VALID / AUTHORITATIVE / FAIL / REJECTED AT VIABILITY / ACCEPTED AS STRUCTURAL EVIDENCE**

The first valid completed local timed CP4-AH run is authoritative as-is. It must not be rerun for result selection, and the frozen thresholds must not be changed after observing the result.

## Identity

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- CPU: `Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz`
- Harness SHA: `76a0f870f90c5c6e44f90e3a3a12e880c8ae0507`
- CP4-Z source: `1b4057ad9d12bc28d2ab2ca7917924368fe99444`
- Candidate source: `0ec95837e912921624fa1b1d9d4f18c28dfe82cc`
- Routes: `5,000`
- Blocks: `4`
- Pairs per block: `6`
- Samples per source per cell: `24 fresh-worker measurements`
- Order: `3 Z→candidate + 3 candidate→Z pairs per block`

Local correctness probe before timing: `PASS (14/14)`.

## Overall distributions

| Cell | Source | Median | p25 | p75 | Min | Max | Unit |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| static-only-raw | cp4z | 816.1 | 799.2 | 829.9 | 784.5 | 862.6 | ns/op |
| static-only-raw | candidate | 818.5 | 802.6 | 827.1 | 786.8 | 951.0 | ns/op |
| mixed-static-raw | cp4z | 829.1 | 810.3 | 890.2 | 793.1 | 962.4 | ns/op |
| mixed-static-raw | candidate | 813.5 | 802.5 | 874.0 | 786.1 | 938.5 | ns/op |
| mixed-dynamic-raw | cp4z | 889.4 | 868.0 | 910.1 | 848.8 | 949.1 | ns/op |
| mixed-dynamic-raw | candidate | 887.1 | 868.4 | 912.5 | 849.3 | 989.0 | ns/op |
| trailing-dynamic-raw | cp4z | 885.3 | 872.8 | 907.9 | 854.3 | 961.3 | ns/op |
| trailing-dynamic-raw | candidate | 878.5 | 870.8 | 909.6 | 851.3 | 965.7 | ns/op |
| generic-dynamic-raw | cp4z | 1212.5 | 1161.6 | 1246.7 | 1130.5 | 1340.8 | ns/op |
| generic-dynamic-raw | candidate | 1193.3 | 1159.7 | 1221.3 | 1122.8 | 1242.7 | ns/op |
| all-dynamic-raw | cp4z | 881.4 | 871.4 | 890.5 | 861.5 | 954.8 | ns/op |
| all-dynamic-raw | candidate | 881.7 | 870.0 | 900.1 | 859.2 | 917.5 | ns/op |
| static-registration | cp4z | 1.274 | 1.237 | 1.324 | 1.215 | 1.744 | ms |
| static-registration | candidate | 1.237 | 1.230 | 1.266 | 1.216 | 1.323 | ms |

## Overall candidate / Z ratios

| Comparison | Candidate / Z |
| --- | ---: |
| static-only raw | `1.0029x` |
| mixed static raw | `0.9812x` |
| mixed dynamic raw | `0.9974x` |
| pure trailing dynamic raw | `0.9923x` |
| generic dynamic raw | `0.9841x` |
| ALL dynamic raw | `1.0004x` |
| static registration | `0.9712x` |

## Blockwise candidate / Z ratios

| Comparison | Block 1 | Block 2 | Block 3 | Block 4 | Candidate-faster blocks |
| --- | ---: | ---: | ---: | ---: | ---: |
| static-only raw | 1.0082x | 0.9929x | 0.9928x | 1.0200x | 2/4 |
| mixed static raw | 0.9886x | 0.9716x | 1.0132x | 1.0021x | 2/4 |
| mixed dynamic raw | 0.9882x | 1.0310x | 0.9904x | 0.9902x | 3/4 |
| pure trailing dynamic raw | 0.9635x | 1.0266x | 1.0069x | 0.9970x | 2/4 |
| generic dynamic raw | 0.9785x | 0.9796x | 0.9859x | 0.9983x | 4/4 |
| ALL dynamic raw | 1.0015x | 1.0260x | 0.9784x | 0.9932x | 2/4 |
| static registration | 0.9573x | 0.9897x | 0.9829x | 0.9369x | 4/4 |

## Frozen viability gates

| Gate | Candidate / Z | Limit | Result |
| --- | ---: | ---: | --- |
| static-only raw | `1.0029x` | `<= 0.9950x` | **FAIL** |
| mixed static raw | `0.9812x` | `<= 1.0100x` | PASS |
| mixed dynamic raw | `0.9974x` | `<= 1.0200x` | PASS |
| pure trailing dynamic raw | `0.9923x` | `<= 1.0200x` | PASS |
| generic dynamic raw | `0.9841x` | `<= 1.0200x` | PASS |
| ALL dynamic raw | `1.0004x` | `<= 1.0200x` | PASS |
| static registration | `0.9712x` | `<= 1.0200x` | PASS |

Final harness result:

`CP4-AH KIND-PRIMARY Z VIABILITY GATE: FAIL`

## Interpretation

The candidate fails the one gate that defines the primary purpose of this phase. Static-only request cost is effectively neutral-to-slightly-worse versus CP4-Z at `1.0029x`, rather than meeting the frozen `<= 0.9950x` recovery requirement. Blockwise static-only results are split `2/4`, so there is no stable static-only recovery signal.

The rest of the candidate is materially encouraging but cannot override the frozen failure. Mixed-static improves to `0.9812x`, mixed dynamic and trailing remain neutral-to-better, generic dynamic improves to `0.9841x` and is faster in all four blocks, and static registration improves to `0.9712x` and is faster in all four blocks. ALL dynamic is effectively neutral at `1.0004x`.

Therefore using `fastMapKind` as a read-only specialization hint on top of CP4-Z appears compatible with the dynamic lanes and can improve mixed-static/generic/registration under this protocol, but it does not solve the static-only residual that CP4-AH was explicitly required to solve. The exact candidate is not eligible for direct-production acceptance.

This result is also consistent with earlier CP4-K and CP4-L evidence that static-only cost is not recovered by changing request handoff or by eliding static router capability. CP4-AH should not be reinterpreted by relaxing its static-only gate after the fact.

## Consequence

- CP4-AH must not be rerun for result selection.
- The exact candidate `0ec95837e912921624fa1b1d9d4f18c28dfe82cc` is rejected at viability and must not advance unchanged to direct-production acceptance.
- The CP4-Z, CP4-AE, CP4-AF, and CP4-AG classifications remain unchanged.
- Future work must not continue dead-metadata deletion or repeat static-only handoff/capability-elision experiments already rejected in CP4-K/CP4-L.
- Any next source experiment requires a new structural hypothesis, a new frozen candidate, and independent correctness/performance gates before local timing.

Completion marker:

`CP4-AH LOCAL KIND-PRIMARY Z VIABILITY RUN: COMPLETE`
