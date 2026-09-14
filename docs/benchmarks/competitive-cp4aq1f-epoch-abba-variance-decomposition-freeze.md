# CP4-AQ1F epoch-median + symmetric-quartet variance decomposition freeze

## Purpose

AQ1E-MAIN completed authoritatively and failed 2% readiness because same-source temporal/order dispersion remained too large, especially trailing JSON, collision, and ALL. AQ1F is a prospective mechanism experiment. It tests whether two changed mechanisms reduce that dispersion before any full 11-cell AQ1G calibration is allowed.

AQ1F is calibration only. It cannot reclassify CP4-AO, CP4-AP, AQ1E-MAIN, AQ1E-MEMORY, or Gelis source performance.

## Frozen identity

- Bun `1.4.2`
- revision `744846f844374847c902b5e7fd59b4342a51ef99`
- source A = source B = `5d9698d6b8d368ddcff358fc2645435b93c0c062`
- routes `5,000`
- authoritative host Windows / 12 logical CPUs
- timed workers logical CPU `10` / affinity `0x400` / priority `HIGH`
- gated launch and synchronous result-file IPC are unchanged from accepted AQ1D/AQ1E infrastructure

## Representative cells

Exactly five hotpaths are frozen: static-only raw, generic dynamic raw, trailing dynamic JSON, forced collision raw, and ALL dynamic raw. They cover a stable control, a near-stable dynamic control, and the three strongest AQ1E variance failures.

## Mechanism 1: five timed epochs per worker

Each fresh worker keeps the existing 20,000 warmups and calibration rule. After calibration it executes exactly **5** timed epochs using the same calibrated iteration count. Each epoch targets the existing 120 ms duration. The worker metric is the median of the five epoch ns/op values. Epoch result-file serialization occurs only after all measured epochs. The harness also reports each worker's `(max epoch - min epoch) / median epoch` as a diagnostic; epoch spread is not itself an acceptance gate.

## Mechanism 2: symmetric quartets

Each quartet consists of four fresh workers in one of two balanced symmetric orientations: `A→B→B→A` or `B→A→A→B`. Orientations alternate by block/quartet position. For worker medians `A1,A2,B1,B2`, the quartet ratio is `sqrt((B1*B2)/(A1*A2))`. This is the primary same-source estimator unit and is intended to cancel first-order multiplicative drift in log space.

## Frozen sampling

- 8 blocks
- 2 quartets/block
- 16 quartets/cell
- 32 fresh workers/source/cell; 64 total workers/cell
- 320 timed workers total across five cells
- 5 timed epochs/worker
- 5,000 deterministic complete-block bootstrap resamples

The harness reports raw worker-median `median(B)/median(A)` only as a diagnostic. Primary viability uses the median symmetric-quartet ratio. Bootstrap resamples complete blocks and recomputes the median quartet ratio. Orientation spread is the absolute difference between median ABBA and BAAB quartet ratios. Each block ratio is the median of its two quartet ratios.

## Frozen mechanism-viability criteria

Every one of the five representative cells must satisfy all four:

- primary quartet-ratio bias `<= 1.00%`
- block-bootstrap 95% CI entirely within `0.9850x–1.0150x`
- ABBA-vs-BAAB orientation spread `<= 1.00%`
- maximum block median-quartet deviation from `1.0` `<= 2.00%`

All five PASS => `CP4-AQ1F MECHANISM VIABILITY FOR FULL AQ1G: PASS`. Only then is a full AQ1G all-hotpath calibration justified. Any completed AQ1F FAIL is authoritative for this mechanism and cannot be rerun unchanged to seek a PASS. An abort before the completion marker is infrastructure/methodology failure rather than viability PASS/FAIL.

## Correctness and interpretation contract

The correctness probe runs both byte-identical sources for all five frozen cells (10 checks). Once accepted locally it is never rerun. The first valid completed local timed AQ1F run under this frozen SHA is authoritative regardless of PASS/FAIL. No ratios from AQ1E are multiplied or chained into AQ1F.
