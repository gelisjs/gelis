# CP4-AQ0 Benchmark Stability Calibration Freeze

## Status

Frozen before any local timing.

This phase is measurement-only. It does not reopen CP4-AO, revoke the CP4-AP promotion, or accept/reject any Gelis source change.

## Purpose

CP4-AQ0 measures the empirical noise floor of the local authoritative benchmark machine before CP4-AQ rebaseline timing.

The experiment intentionally compares byte-identical source against itself. Any measured B/A difference is therefore measurement variance, order effect, runtime/process variance, or host-system interference rather than a code-performance difference.

## Frozen identity

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- Source A: `5d9698d6b8d368ddcff358fc2645435b93c0c062`
- Source B: `5d9698d6b8d368ddcff358fc2645435b93c0c062`
- Routes: `5,000`
- A and B use separate detached worktrees pointing to the same exact source SHA.
- Worker kernel is byte-identical to the CP4-AO acceptance worker.

## Frozen cells

1. static-only raw
2. mixed-static raw
3. mixed dynamic raw
4. mixed dynamic JSON
5. mixed same-length dynamic raw
6. pure trailing dynamic raw
7. pure trailing dynamic JSON
8. generic dynamic raw
9. forced collision raw
10. ALL dynamic raw
11. static registration
12. static retained heap

These are the same twelve source cells used by CP4-AO.

## Frozen sampling protocol

For every cell:

- 5 blocks
- 8 mirrored pairs per block
- 40 pairs total
- 40 fresh-worker measurements for A
- 40 fresh-worker measurements for B
- each block contains exactly 4 `A -> B` pairs and 4 `B -> A` pairs
- paired ratio is always `B / A`, independent of execution order

No result may be discarded because it is inconvenient, surprising, or crosses an expected noise boundary.

## Frozen outputs

The harness reports:

- absolute A/B median, p25, p75, min, and max
- paired B/A median, p05, p25, p75, p95, min, and max
- counts of paired observations outside `+/-1%` and `+/-2%`
- order-conditioned paired medians for `A -> B` and `B -> A`
- five blockwise paired median ratios
- worst observed p05/p95 two-sided calibration radius across the twelve cells

## Interpretation contract

There is no PASS/FAIL performance gate in CP4-AQ0.

The first valid completed local timed run is the authoritative calibration observation. It is not rerun to seek a narrower noise envelope.

The result will be used prospectively to design the measurement protocol and uncertainty rules for CP4-AQ and later performance phases. It must not be used to retroactively reclassify CP4-AO or CP4-AP.

A future performance difference should not be treated as strongly resolved merely because its point estimate crosses a threshold when the calibrated same-source uncertainty for the relevant cell is of comparable magnitude.

## Correctness gate

Before local timing:

- full repository Quality must pass
- correctness-only probe must pass for both A and B across all twelve cells (`24/24`)
- no timing is permitted in CI

## Local execution order

1. run `--probe-only`
2. verify exact identities and `24/24`
3. run exactly one timed CP4-AQ0 calibration
4. preserve the complete output as evidence
