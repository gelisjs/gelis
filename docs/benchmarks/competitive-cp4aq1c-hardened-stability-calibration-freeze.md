# CP4-AQ1C hardened benchmark stability calibration freeze

## Purpose

CP4-AQ1C calibrates a hardened local benchmark runner before any further Gelis performance acceptance work. It compares byte-identical production source against itself and therefore measures environment/estimator stability only.

This phase cannot reclassify CP4-AO, CP4-AP, or any Gelis source performance result.

## Frozen identity

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- production source A: `5d9698d6b8d368ddcff358fc2645435b93c0c062`
- production source B: `5d9698d6b8d368ddcff358fc2645435b93c0c062`
- routes: `5,000`
- authoritative timed host: Windows machine with `12` logical CPUs

## Frozen workloads

The worker is byte-identical to the CP4-AO/CP4-AQ0 worker and covers the same 12 cells:

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

## Frozen local execution protocol

- `8` blocks
- `8` mirrored pairs per block
- `64` fresh-worker measurements per source per cell
- each block contains `4 A→B` and `4 B→A` pairs
- both A and B use detached worktrees pointing to the same source SHA
- timed workers on Windows run at `HIGH` process priority
- Windows workers are launched through PowerShell `Start-Process`; affinity and priority are set on the child process before its measured warmup/calibration completes
- `cmd start /wait` is explicitly not used because AQ1 infrastructure testing showed it can fail or hang on the authoritative local Windows environment
- timed workers are pinned to one logical CPU: `logicalCpuCount - 2`
- on the authoritative 12-logical-CPU host this is logical CPU `10`, affinity mask `0x400`
- correctness probes do not apply affinity/priority and may run on CI
- worker measurement kernel remains unchanged from CP4-AO/AQ0

## Frozen estimators

The primary same-source estimator is:

`median(all B samples) / median(all A samples)`

The harness also reports:

- absolute sample distributions
- deterministic block-bootstrap `95%` confidence interval around the aggregate ratio
- order-conditioned `A→B` and `B→A` ratio-of-medians
- order spread
- eight block ratio-of-medians values
- maximum block deviation from `1.0`

Bootstrap details:

- `5,000` deterministic resamples
- resampling unit is the complete block, preserving within-block temporal structure
- each resample draws eight blocks with replacement and recomputes `median(B) / median(A)`

## Frozen benchmark-readiness criteria

These criteria evaluate whether this local runner is sufficiently stable for future `2%` hotpath acceptance gates. They do not evaluate Gelis performance.

### Hotpath cells

Every hotpath cell must satisfy all of:

- aggregate same-source bias `<= 1.00%`
- block-bootstrap 95% CI entirely within `0.9850x–1.0150x`
- order-conditioned ratio spread `<= 1.00%`
- maximum block ratio-of-medians deviation from `1.0` `<= 2.00%`

### Static registration

- aggregate same-source bias `<= 2.00%`
- block-bootstrap 95% CI entirely within `0.9600x–1.0400x`
- order spread `<= 3.00%`
- maximum block deviation `<= 5.00%`

### Static retained heap

- aggregate same-source bias `<= 0.50%`
- block-bootstrap 95% CI entirely within `0.9950x–1.0050x`
- order spread `<= 0.50%`
- maximum block deviation `<= 0.50%`

All 12 cells must pass for:

`CP4-AQ1C HARDENED BENCHMARK 2%-GATE READINESS: PASS`

Any failure means this exact hardened runner is not yet accepted for future 2% performance gates. There is no rerun of an unchanged failed calibration to search for a passing result; a new calibration requires a changed mechanism and a new frozen phase.

## Interpretation contract

- CP4-AQ1C is calibration-only.
- No historical performance ratio is recomputed or chained from this result.
- CP4-AO remains classified by its first valid frozen run under its own protocol.
- CP4-AQ remains paused until a hardened benchmark protocol is accepted.
- The first valid completed local timed CP4-AQ1C run is authoritative for this calibration phase.

## AQ1B launcher-only delta

AQ1B changes only the Windows worker launcher implementation. Source SHA, worker measurement kernel, workloads, block structure, sample count, estimators, bootstrap procedure, readiness thresholds, CPU affinity target, and `HIGH` priority requirement are unchanged from AQ1. The failed AQ1 local timing attempt produced no completed worker measurement and therefore was not authoritative.

## AQ1C launcher correction

AQ1B did not complete: the PowerShell launcher returned exit status `0` but an empty stdout capture for a `static-memory` worker before the final dataset and completion marker were produced. Therefore AQ1B created no authoritative timed calibration result.

AQ1C preserves AQ1B's frozen workloads, block structure, sample counts, estimators, bootstrap procedure, and readiness criteria. It changes only launcher infrastructure:

- timed workers receive a unique launch-gate path;
- the worker waits at the gate before importing Gelis source or preparing the workload;
- the parent starts the worker, applies logical-CPU affinity and `HIGH` priority, and only then writes `go` to the gate;
- after process exit, stdout/stderr capture receives up to `2,000 ms` grace for redirected-file visibility before it is read;
- temporary stdout, stderr, and gate files are removed after every worker.

Before the first full timed AQ1C run, `--launcher-probe` may be run once on the authoritative local host. It executes one `static-only-raw` worker and one `static-memory` worker through the exact final gated launcher. Their metrics are discarded and are infrastructure-only; they are not Gelis performance evidence. A failed launcher probe is not a timed calibration run.
