# Competitive Performance v0.1 — CP4-AL local authoritative result

Date: 2026-09-13

## Classification

**VALID / AUTHORITATIVE / FAIL / REJECTED AT VIABILITY / ACCEPTED AS ALL-PATH ISOLATION EVIDENCE**

The first valid completed local timed CP4-AL run is authoritative as-is. It must not be rerun for result selection, and the frozen thresholds must not be changed after observing the result.

## Identity

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- CPU: `Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz`
- Harness SHA: `9f5fc901916f37823a43dd2349294396b456e135`
- CP4-AK control source: `658c22c0d12322e278d996f47c4373831d61ba9b`
- Candidate source: `2a01866678b296a9618e17c245a897752f4d640a`
- Routes: `5,000`
- Blocks: `4`
- Pairs per block: `6`
- Samples per source per cell: `24 fresh-worker measurements`
- Order: `3 control→candidate + 3 candidate→control pairs per block`

Local correctness probe before timing: `PASS (16/16)`.

## Overall distributions

```text
cell                           source      median   p25      p75      min      max      unit
static-only-raw                control      805.8   782.7    825.7    772.1    925.3   ns/op
static-only-raw                candidate    793.6   788.8    809.8    778.5    961.3   ns/op
mixed-static-raw               control      818.9   812.1    859.0    791.8    987.2   ns/op
mixed-static-raw               candidate    819.5   803.2    852.8    786.3    930.1   ns/op
mixed-dynamic-raw              control      890.4   875.9    922.4    857.5    990.0   ns/op
mixed-dynamic-raw              candidate    880.6   872.7    907.1    849.1   1034.6   ns/op
mixed-same-length-dynamic-raw  control      888.5   868.2    928.2    849.3   1040.8   ns/op
mixed-same-length-dynamic-raw  candidate    878.1   863.5    889.5    852.4    933.1   ns/op
trailing-dynamic-raw           control      873.0   866.2    887.5    851.2    961.5   ns/op
trailing-dynamic-raw           candidate    878.0   864.0    908.4    854.9    957.2   ns/op
generic-dynamic-raw            control     1174.7  1153.5   1220.0   1127.7   1306.6   ns/op
generic-dynamic-raw            candidate   1165.0  1148.5   1177.3   1133.0   1254.1   ns/op
all-dynamic-raw                control      895.0   882.8    929.0    848.8   1138.4   ns/op
all-dynamic-raw                candidate    920.0   892.3    981.0    875.7   1080.1   ns/op
static-registration            control        1.263   1.232    1.311    1.208    1.643  ms
static-registration            candidate      1.272   1.239    1.328    1.214    1.943  ms
```

## Overall candidate / AK control ratios

```text
comparison                       candidate / AK
static-only raw                   0.9848x
mixed static raw                  1.0007x
mixed dynamic raw                 0.9890x
mixed same-length dynamic raw     0.9883x
pure trailing dynamic raw         1.0058x
generic dynamic raw               0.9918x
ALL dynamic raw                   1.0280x
static registration               1.0068x
```

## Blockwise candidate / AK control ratios

```text
comparison                       block 1   block 2   block 3   block 4   candidate-faster blocks
static-only raw                  0.9517x   0.9790x   1.0087x   1.0142x   2/4
mixed static raw                 1.0456x   0.9606x   0.9970x   0.9723x   3/4
mixed dynamic raw                1.0150x   0.9793x   0.9863x   0.9674x   3/4
mixed same-length dynamic raw    0.9681x   0.9656x   1.0124x   0.9683x   3/4
pure trailing dynamic raw        0.9940x   1.0252x   1.0201x   0.9957x   2/4
generic dynamic raw              0.9831x   0.9523x   1.0086x   0.9918x   3/4
ALL dynamic raw                  1.0013x   1.0466x   1.0355x   1.0223x   0/4
static registration              0.9744x   1.0355x   1.0023x   1.0181x   1/4
```

## Frozen viability gates

```text
gate                              candidate / AK   limit       result
static-only raw                   0.9848x          <=1.0200x   PASS
mixed static raw                  1.0007x          <=1.0100x   PASS
mixed dynamic raw                 0.9890x          <=1.0200x   PASS
mixed same-length dynamic raw     0.9883x          <=1.0200x   PASS
pure trailing dynamic raw         1.0058x          <=1.0200x   PASS
generic dynamic raw               0.9918x          <=1.0200x   PASS
ALL dynamic raw                   1.0280x          <=0.9850x   FAIL
static registration               1.0068x          <=1.0200x   PASS
```

Final harness result:

`CP4-AL ALL DYNAMIC SPECIALIZATION VIABILITY GATE: FAIL`

## Interpretation

CP4-AL fails the one gate that defines the purpose of the phase. The dedicated dynamic-only ALL specialization does not recover the CP4-AK ALL residual; it makes the overall ALL median worse at `1.0280x` versus CP4-AK and loses in all four blocks.

The secondary lanes remain acceptable and mostly neutral-to-better, which means the failure is isolated rather than a broad correctness or performance collapse. However, the specialization mechanism itself is not viable because its target lane moved in the wrong direction.

This is stronger evidence than a single noisy crossing: ALL is slower in `0/4` candidate-faster blocks, with block ratios `1.0013x`, `1.0466x`, `1.0355x`, and `1.0223x`. Therefore the ALL residual should not be attacked by duplicating or splitting the request-URL matcher again.

Combined with CP4-AK, the current evidence says:

- the static-leading mask remains structurally promising for mixed-static and same-length dynamic workloads;
- the ALL regression in CP4-AK is not repaired by a dedicated dynamic-only ALL request-URL path;
- the remaining ALL issue is likely an interaction with generated code shape / call topology around the ALL wrapper rather than missing dynamic-only semantics;
- another ALL-specific matcher fork would repeat a now-rejected mechanism and should not be pursued.

## Consequence

- CP4-AL must not be rerun for result selection.
- Candidate `2a01866678b296a9618e17c245a897752f4d640a` is rejected at viability and must not advance to production acceptance.
- CP4-AK remains rejected as a whole, but its static-leading mask mechanism remains useful evidence because its primary mixed-static target passed materially.
- Future work should preserve the AK mask hypothesis while changing the ALL call topology or wrapper interaction, not by adding another dedicated ALL matcher body.
- Any next source experiment requires a new frozen candidate and independent correctness/performance gates.

Completion marker:

`CP4-AL LOCAL ALL DYNAMIC SPECIALIZATION VIABILITY RUN: COMPLETE`
