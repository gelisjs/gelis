# Competitive Performance v0.1 — CP4-AG local authoritative result

Date: 2026-09-13

## Classification

**VALID / AUTHORITATIVE / STABILITY COMPLETE / MEASUREMENT-ONLY / NO PRODUCTION PROMOTION**

This is the first valid completed local timed CP4-AG run and is authoritative as-is. It must not be rerun for result selection.

## Identity

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- CPU: `Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz`
- Harness SHA: `32c833dd425f180653f2d891e6a4919353a7ca68`
- CP4-Z source: `1b4057ad9d12bc28d2ab2ca7917924368fe99444`
- KIND-only source: `408f9856f814184ca0204aa49d3812af8660f077`
- Routes: `5,000`
- Blocks: `4`
- Pairs per block: `6`
- Samples per source per cell: `24 fresh-worker measurements`
- Order: `3 Z→KIND + 3 KIND→Z pairs per block`

Local correctness probe before timing: `PASS (14/14)`.

## Overall medians

```text
cell                           CP4-Z     KIND-only   unit
static-only raw                810.7     809.0       ns/op
mixed static raw               816.4     804.7       ns/op
mixed dynamic raw              870.0     892.0       ns/op
pure trailing dynamic raw      872.7     889.0       ns/op
generic dynamic raw            1166.2    1174.5      ns/op
ALL dynamic raw                887.3     885.1       ns/op
static registration            1.248     1.271       ms
```

## Overall KIND / Z ratios

```text
comparison                     KIND / Z
static-only raw                0.9979x
mixed static raw               0.9857x
mixed dynamic raw              1.0252x
pure trailing dynamic raw      1.0186x
generic dynamic raw            1.0071x
ALL dynamic raw                0.9975x
static registration            1.0185x
```

## Blockwise KIND / Z ratios

```text
comparison                     block 1   block 2   block 3   block 4   KIND-faster blocks
static-only raw                0.9814x   0.9956x   0.9943x   0.9937x   4/4
mixed static raw               0.9809x   0.9967x   0.9802x   0.9852x   4/4
mixed dynamic raw              1.0359x   1.0488x   1.0496x   1.0177x   0/4
pure trailing dynamic raw      1.0371x   1.0184x   1.0063x   1.0171x   0/4
generic dynamic raw            0.9832x   1.0216x   1.0181x   1.0155x   1/4
ALL dynamic raw                0.9905x   0.9854x   1.0179x   1.0009x   2/4
static registration            0.9989x   1.0287x   1.0409x   1.0185x   1/4
```

## Interpretation

CP4-AG resolves the main ambiguity left by CP4-AD and CP4-AF. The KIND-only source has a stable blockwise split relative to CP4-Z rather than a universal win or loss.

Static request cells favor KIND-only consistently. `static-only raw` is faster in all four blocks and has an overall ratio of `0.9979x`; `mixed static raw` is also faster in all four blocks and has an overall ratio of `0.9857x`.

Dynamic request cells move in the opposite direction. `mixed dynamic raw` is slower in all four blocks at an overall `1.0252x`, and `pure trailing dynamic raw` is slower in all four blocks at `1.0186x`. This is strong evidence that the apparent dynamic benefit seen for KIND-only in some earlier balanced runs was not a stable component effect.

`generic dynamic raw` is slower in three of four blocks and overall at `1.0071x`. `static registration` is slower in three of four blocks and overall at `1.0185x`. Those two cells therefore no longer support the earlier hypothesis that removing `fastMapKind` gives a dependable registration or generic-path benefit.

`ALL dynamic raw` remains effectively neutral overall at `0.9975x`, with the four blocks split two faster and two slower. It should not be used to claim a directional component effect.

Because `fastMapKind` is not read by the final CP4-Z request dispatch, these request-time shifts are consistent with code-shape/JIT/layout sensitivity rather than a semantic routing improvement caused by removing the field. The blockwise experiment shows that such shape changes can still produce repeatable workload-specific tradeoffs. That is precisely why dead-metadata deletion must not be promoted merely because the field is semantically unused.

## Consequence

- CP4-AG must not be rerun for result selection.
- CP4-Z and CP4-AE prior acceptance classifications remain unchanged.
- KIND-only remains rejected for production promotion because CP4-AE is the frozen direct-production acceptance phase.
- The `fastMapKind` removal line is closed. Current evidence shows a stable static-versus-dynamic tradeoff and does not justify further dead-metadata tuning.
- Future CP4 work should return to a structural request-dispatch change that can preserve the CP4-Z lineage's dynamic gains without relying on metadata deletion or code-shape luck.
- Any next candidate must be frozen as a new phase and validated independently against production; CP4-AG itself is measurement-only and cannot promote source.

Completion marker:

`CP4-AG LOCAL Z-KIND BLOCKWISE STABILITY RUN: COMPLETE`
