# Competitive Performance v0.1 — CP4-AA Production/X/Z Attribution Freeze

Date: 2026-09-13

## Purpose

Attribute CP4-Y and CP4-Z direct-production results in one balanced run before changing production source again. This phase is measurement-only and cannot alter prior acceptance classifications.

## Frozen sources

- production: `af4e5102046def1b163435333563b8d08f919bf5`
- CP4-X: `efaa228231c920fee78053edeb5c8c094f324aca`
- CP4-Z: `1b4057ad9d12bc28d2ab2ca7917924368fe99444`

## Protocol

- Bun `1.4.2`, revision `744846f844374847c902b5e7fd59b4342a51ef99`
- 5,000 routes where applicable
- 7 attribution cells
- 12 balanced fresh-worker triplets per cell
- all 6 source permutations repeated twice, so each source appears four times in each ordinal position across 12 samples
- medians are reported directly vs production plus CP4-Z / CP4-X
- no acceptance gate is evaluated
- CI may run correctness-only probes; local machine timing is authoritative

## Cells

1. static-only raw
2. mixed-static raw
3. mixed dynamic raw
4. pure trailing dynamic raw
5. generic dynamic raw
6. ALL dynamic raw
7. static registration

## Interpretation contract

CP4-AA is attribution only. CP4-X remains accepted only for direct production revalidation and CP4-Z remains rejected for production promotion. No result from CP4-AA may retroactively convert a prior FAIL into PASS. The result may determine which source shape should be used for a genuinely new candidate.
