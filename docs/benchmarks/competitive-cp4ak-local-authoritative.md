# Competitive Performance v0.1 — CP4-AK local authoritative result

Date: 2026-09-13

## Classification

**VALID / AUTHORITATIVE / FAIL / REJECTED AT VIABILITY / ACCEPTED AS STRUCTURAL EVIDENCE**

This is the first valid completed local timed CP4-AK run and is authoritative as-is. It must not be rerun for result selection, and the frozen thresholds must not be changed after observing the result.

## Identity

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- CPU: `Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz`
- Harness SHA: `03d85e24da34a13980ae7999d6f945ab723caf30`
- CP4-AI control: `a7751059eef1d3074e6e0a1c2d227b49889affe4`
- Candidate source: `658c22c0d12322e278d996f47c4373831d61ba9b`
- Routes: `5,000`
- Blocks: `4`
- Pairs per block: `6`
- Samples per source per cell: `24 fresh-worker measurements`
- Order: `3 control→candidate + 3 candidate→control pairs per block`

Local correctness probe before timing: `PASS (16/16)`.

## Overall distributions

```text
cell                           source      median   p25      p75      min      max      unit
static-only-raw                control      807.0   792.5    822.6    769.6    945.4   ns/op
static-only-raw                candidate    803.5   792.1    817.9    775.5   1092.5   ns/op
mixed-static-raw               control      826.9   798.6    846.7    786.2   1023.4   ns/op
mixed-static-raw               candidate    802.5   796.6    813.4    785.7    876.8   ns/op
mixed-dynamic-raw              control      886.4   875.1    922.6    841.9    984.7   ns/op
mixed-dynamic-raw              candidate    880.3   864.1    903.8    857.8    951.8   ns/op
mixed-same-length-dynamic-raw  control      971.1   963.5    985.2    925.1   1072.2   ns/op
mixed-same-length-dynamic-raw  candidate    882.4   868.8    905.7    850.0   1142.3   ns/op
trailing-dynamic-raw           control      884.5   874.9    905.0    860.4   1121.2   ns/op
trailing-dynamic-raw           candidate    877.4   862.4    896.8    853.1    966.1   ns/op
generic-dynamic-raw            control     1183.6  1144.5   1214.9   1115.8   1275.1   ns/op
generic-dynamic-raw            candidate   1170.9  1156.1   1184.0   1134.0   1287.9   ns/op
all-dynamic-raw                control      876.0   870.2    890.3    853.3    915.1   ns/op
all-dynamic-raw                candidate    898.6   875.9    903.8    855.4   1019.2   ns/op
static-registration            control        1.253   1.220    1.311    1.201    3.406  ms
static-registration            candidate      1.259   1.226    1.318    1.208    1.514  ms
```

## Overall candidate / AI control ratios

```text
comparison                       candidate / AI
static-only raw                  0.9957x
mixed static raw                 0.9704x
mixed dynamic raw                0.9930x
mixed same-length dynamic raw    0.9086x
pure trailing dynamic raw        0.9920x
generic dynamic raw              0.9893x
ALL dynamic raw                  1.0258x
static registration              1.0045x
```

## Blockwise candidate / AI control ratios

```text
comparison                       block 1   block 2   block 3   block 4   candidate-faster blocks
static-only raw                  0.9870x   0.9999x   1.0105x   0.9910x   3/4
mixed static raw                 0.9923x   0.9735x   1.0088x   0.9514x   3/4
mixed dynamic raw                0.9958x   0.9840x   0.9817x   0.9861x   4/4
mixed same-length dynamic raw    0.9384x   0.9005x   0.8824x   0.9069x   4/4
pure trailing dynamic raw        0.9730x   1.0130x   0.9904x   0.9909x   3/4
generic dynamic raw              0.9637x   0.9862x   1.0171x   1.0100x   2/4
ALL dynamic raw                  1.0039x   1.0014x   1.0294x   1.0383x   0/4
static registration              0.9709x   1.0212x   0.9538x   1.0274x   2/4
```

## Frozen viability gates

```text
gate                              candidate / AI   limit       result
static-only raw                   0.9957x          <=1.0200x   PASS
mixed static raw                  0.9704x          <=0.9850x   PASS
mixed dynamic raw                 0.9930x          <=1.0200x   PASS
mixed same-length dynamic raw     0.9086x          <=1.0200x   PASS
pure trailing dynamic raw         0.9920x          <=1.0200x   PASS
generic dynamic raw               0.9893x          <=1.0200x   PASS
ALL dynamic raw                   1.0258x          <=1.0200x   FAIL
static registration               1.0045x          <=1.0200x   PASS
```

Final harness result:

`CP4-AK STATIC-LEADING MASK VIABILITY GATE: FAIL`

## Interpretation

CP4-AK succeeds at its primary target. Mixed-static improves by about 2.96% versus CP4-AI at `0.9704x`, satisfying the frozen `<=0.9850x` requirement. The result is supported by three of four blocks. The same structural discriminator also produces a large improvement on mixed same-length dynamic (`0.9086x`, four of four blocks), showing that the benefit is not merely a path-length artifact.

The candidate also preserves or improves static-only, mixed dynamic, trailing dynamic, generic dynamic, and static registration. Mixed dynamic is faster in all four blocks. The sole failure is `ALL dynamic raw` at `1.0258x` versus the frozen `<=1.0200x` guard, and it is directionally consistent across all four blocks (`0/4` candidate-faster). Therefore the failure is not a borderline median-only artifact.

This isolates the remaining conflict to the ALL fallback lane. The static-leading mask mechanism itself is strongly supported for mixed-table dispatch, but the exact candidate cannot advance unchanged because its interaction with ALL fallback violates a frozen guard.

The next experiment should preserve CP4-AK's mixed-static and same-length gains while removing or bypassing the mask-related work from the ALL fallback path. It must not reopen the already-closed static-only, `fastMapKind`, or dead-metadata lines.

## Consequence

- CP4-AK must not be rerun for result selection.
- Candidate `658c22c0d12322e278d996f47c4373831d61ba9b` is rejected at viability and must not advance unchanged to direct-production acceptance.
- The static-leading mask hypothesis remains viable as a component because its primary target and all non-ALL guards pass.
- The next source experiment should target only the ALL fallback interaction while preserving the mask behavior for ordinary mixed dynamic tables.
- Any future candidate requires a separately frozen source, correctness probe, and viability/acceptance protocol.

Completion marker:

`CP4-AK LOCAL STATIC-LEADING MASK VIABILITY RUN: COMPLETE`
