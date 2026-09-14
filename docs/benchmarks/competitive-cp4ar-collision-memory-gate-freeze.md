# CP4-AR Collision-Memory Gate Freeze

## Purpose

CP4-AR improves the forced primary trailing-fingerprint collision path by adding a secondary numeric fingerprint index. AQ3 established a material hotpath improvement for the candidate, but the source change allocates additional collision-bucket state. The existing AQ1E-MEMORY readiness result covers `static-memory` only and therefore cannot be reused as direct evidence for this collision-specific allocation.

This gate measures retained router heap for the exact 5,000-route forced-collision topology affected by CP4-AR.

## Frozen identities

- Production A: `5d9698d6b8d368ddcff358fc2645435b93c0c062`
- Candidate B: `263185b8e83f1115392d5500d10e7509ef01c628`
- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- Authoritative host: Windows, 12 logical CPUs
- CPU affinity: logical CPU 10 (`0x400`)
- Worker priority: HIGH

## Workload

Each router registers 5,000 routes shaped as:

`/collision/0000aaaa/:id` through `/collision/4999aaaa/:id`.

These routes intentionally collide under the production primary trailing fingerprint. Correctness checks match the final route and verify `params.id`.

## Measurement mechanism

- 32 complete routers retained simultaneously per worker measurement.
- One warmup router before measurement.
- Full GC before the baseline heap reading and after all 32 routers are retained.
- Metric: `(heapAfter - heapBefore) / 32`, reported as `bytes/router`.
- 8 blocks.
- 4 mirrored pairs per block.
- 2 A→B and 2 B→A pairs per block.
- 32 fresh-worker measurements per source.
- 5,000 deterministic complete-block bootstrap resamples.
- Accepted gated Windows launcher + result-file IPC from AQ1E-MEMORY.

## Stage 1: same-source calibration

Command mode: `--calibrate`.

Both A and B are production source. Readiness requires all frozen criteria:

- absolute aggregate bias <= 1.00%
- block-bootstrap 95% CI fully inside `0.9850x–1.0150x`
- A→B vs B→A order spread <= 1.00%
- maximum block ratio deviation from 1.0 <= 2.00%

If any criterion fails on the first valid completed calibration run, the collision-memory gate is not calibrated and the candidate memory run must not be opened unchanged.

Pass marker:

`CP4-AR COLLISION-MEMORY 5%-GATE READINESS: PASS`

Completion marker:

`CP4-AR COLLISION-MEMORY CALIBRATION RUN: COMPLETE`

## Stage 2: candidate memory decision

Default timed mode compares production A against CP4-AR candidate B.

The frozen 5% retained-heap ceiling is classified from the block-bootstrap 95% CI:

- `PASS`: CI upper <= `1.0500x`
- `FAIL`: CI lower > `1.0500x`
- `HOLD / INCONCLUSIVE`: otherwise

No gate or sampling change is allowed after results are observed.

Completion marker:

`CP4-AR COLLISION-MEMORY CANDIDATE RUN: COMPLETE`

## Authority contract

- Local correctness probe is run once and, once accepted, is not rerun.
- First valid completed local calibration run is authoritative for calibration readiness.
- If calibration passes, first valid completed candidate memory run is authoritative for the CP4-AR memory decision.
- A completed FAIL or HOLD is not rerun unchanged to seek PASS.
- CI timing is non-authoritative; CI is correctness/quality only.
- This gate is collision-memory evidence only and does not alter the already-authoritative AQ3 hotpath result.
