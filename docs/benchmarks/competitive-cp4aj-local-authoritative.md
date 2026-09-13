# Competitive Performance v0.1 — CP4-AJ local authoritative result

Date: 2026-09-13

## Classification

**VALID / AUTHORITATIVE / FAIL / REJECTED AT VIABILITY / ACCEPTED AS COMPOSITION EVIDENCE**

The first valid completed local timed CP4-AJ run is authoritative as-is. It must not be rerun for result selection, and the frozen thresholds must not be changed after observing the result.

## Identity

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- CPU: `Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz`
- Harness SHA: `e290d0aa7783ba73ce3026733434771e2ca32eed`
- CP4-AI control source: `a7751059eef1d3074e6e0a1c2d227b49889affe4`
- CP4-AJ candidate source: `6149054010ce78f9285b8bb01f9ccb6947de144a`
- Routes: `5,000`
- Blocks: `4`
- Pairs per block: `6`
- Samples per source per cell: `24 fresh-worker measurements`
- Order: `3 control→candidate + 3 candidate→control pairs per block`

Local correctness probe before timing: `PASS (14/14)`.

## Overall distributions

```text
cell                    source       median   p25      p75      min      max      unit
static-only-raw         control       800.9   787.0    820.6    773.9    955.5   ns/op
static-only-raw         candidate     803.6   788.4    817.2    775.3    912.9   ns/op
mixed-static-raw        control       809.9   801.8    829.2    789.3    851.7   ns/op
mixed-static-raw        candidate     809.9   797.8    829.0    787.9    902.8   ns/op
mixed-dynamic-raw       control       879.5   864.3    903.2    853.2   1242.3   ns/op
mixed-dynamic-raw       candidate     884.9   864.7    920.0    845.6   1008.3   ns/op
trailing-dynamic-raw    control       877.3   866.3    892.7    854.7    939.5   ns/op
trailing-dynamic-raw    candidate     881.9   859.4    904.0    845.2    975.1   ns/op
generic-dynamic-raw     control      1165.2  1141.0   1200.0   1128.2   1386.1   ns/op
generic-dynamic-raw     candidate    1163.8  1146.6   1191.0   1124.2   1223.0   ns/op
all-dynamic-raw         control       887.3   869.7    899.0    853.6    948.6   ns/op
all-dynamic-raw         candidate     886.1   875.1    908.0    860.3   1005.2   ns/op
static-registration     control         1.308   1.224    1.348    1.206    2.494  ms
static-registration     candidate       1.226   1.218    1.315    1.194    1.545  ms
```

## Overall candidate / CP4-AI ratios

```text
comparison                  candidate / AI control
static-only raw             1.0034x
mixed static raw            1.0000x
mixed dynamic raw           1.0062x
pure trailing dynamic raw   1.0051x
generic dynamic raw         0.9989x
ALL dynamic raw             0.9987x
static registration         0.9375x
```

## Blockwise candidate / CP4-AI ratios

```text
comparison                  block 1   block 2   block 3   block 4   candidate-faster blocks
static-only raw             1.0085x   0.9957x   0.9947x   0.9970x   3/4
mixed static raw            0.9943x   1.0087x   1.0107x   0.9898x   2/4
mixed dynamic raw           0.9886x   1.0371x   0.9690x   1.0225x   2/4
pure trailing dynamic raw   0.9770x   1.0269x   0.9985x   0.9908x   3/4
generic dynamic raw         1.0354x   0.9609x   0.9995x   1.0085x   2/4
ALL dynamic raw             1.0269x   1.0016x   1.0131x   0.9753x   1/4
static registration         0.9379x   0.9321x   1.0944x   0.9314x   3/4
```

## Frozen viability gates

```text
gate                        candidate / AI control   limit       result
static-only raw             1.0034x                  <=1.0200x   PASS
mixed static raw            1.0000x                  <=0.9750x   FAIL
mixed dynamic raw           1.0062x                  <=1.0200x   PASS
pure trailing dynamic raw   1.0051x                  <=1.0200x   PASS
generic dynamic raw         0.9989x                  <=1.0200x   PASS
ALL dynamic raw             0.9987x                  <=1.0200x   PASS
static registration         0.9375x                  <=1.0200x   PASS
```

Final harness result:

`CP4-AJ LAZY-KIND COMPOSITION VIABILITY GATE: FAIL`

## Interpretation

CP4-AJ fails the primary gate that justified the composition experiment. Mixed-static is exactly neutral at the overall median (`1.0000x`) against CP4-AI rather than meeting the frozen `<= 0.9750x` recovery requirement. The blockwise result is split `2/4`, so there is no stable mixed-static improvement signal.

The six guard cells all pass. Static-only remains effectively neutral at `1.0034x`, mixed dynamic and trailing remain within guard limits, generic and ALL are essentially neutral, and static registration improves materially to `0.9375x`. Those results show that composing lazy activation with KIND-primary dispatch is not broadly harmful under this protocol, but they do not solve the one residual CP4-AJ was created to solve.

This result closes the direct composition hypothesis: the CP4-AH request-dispatch specialization does not recover CP4-AI's mixed-static production gap when placed behind CP4-AI lazy capability activation. The exact composition must not advance to direct-production acceptance.

## Consequence

- CP4-AJ must not be rerun for result selection.
- The exact candidate `6149054010ce78f9285b8bb01f9ccb6947de144a` is rejected at viability.
- CP4-AI remains rejected for production promotion but accepted as the strongest direct evidence that lazy capability repairs static-only while preserving dynamic gains.
- The `fastMapKind` deletion/specialization/composition line is closed for the current CP4 residual.
- Future work must target the mixed-static hot path directly with a new structural hypothesis rather than another metadata or kind-dispatch variation.
- Any future production candidate requires a separately frozen source, correctness proof, viability evidence where appropriate, and the unchanged full direct-production acceptance gates.

Completion marker:

`CP4-AJ LOCAL LAZY-KIND COMPOSITION VIABILITY RUN: COMPLETE`
