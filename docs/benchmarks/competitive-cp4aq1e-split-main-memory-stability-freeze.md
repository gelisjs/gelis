# CP4-AQ1E split main/memory benchmark stability calibration freeze

## Purpose

AQ1D proved the gated Windows launcher and synchronous result-file IPC, but its full run failed late because the single-router retained-heap cell produced a negative GC-adjusted delta. AQ1E prospectively separates normal performance stability from memory stability so a memory-methodology failure cannot discard completed hotpath work.

Neither AQ1E experiment can reclassify CP4-AO, CP4-AP, or historical Gelis performance evidence.

## Frozen identity

- Bun `1.4.2`
- revision `744846f844374847c902b5e7fd59b4342a51ef99`
- source A = source B = `5d9698d6b8d368ddcff358fc2645435b93c0c062`
- `5,000` routes
- authoritative host: Windows, 12 logical CPUs
- timed workers: logical CPU `10` / mask `0x400`, process priority `HIGH`
- launch gate opens only after affinity and priority are applied
- result transport: synchronous result-file IPC after measurement

## AQ1E-MAIN

Exactly 11 cells: the 10 AQ1D hotpath cells plus static registration. Static memory is excluded. Their measurement kernels are unchanged from AQ1D.

- `8` blocks
- `8` mirrored pairs/block
- `64` samples/source/cell
- each block: `4 A→B` + `4 B→A`
- `5,000` deterministic complete-block bootstrap resamples
- estimator: `median(all B) / median(all A)`

Hotpath readiness, every cell: bias `<=1.00%`; bootstrap 95% CI inside `0.9850x–1.0150x`; order spread `<=1.00%`; max block deviation `<=2.00%`.

Registration readiness: bias `<=2.00%`; bootstrap 95% CI inside `0.9600x–1.0400x`; order spread `<=3.00%`; max block deviation `<=5.00%`.

All 11 must pass for `CP4-AQ1E-MAIN HARDENED BENCHMARK 2%-GATE READINESS: PASS`.

## AQ1E-MEMORY

Dedicated retained-heap calibration. Each worker performs one unmeasured warmup router registration, lets that router become unreachable, forces GC, records baseline heap, then creates and retains **32** complete 5,000-route routers simultaneously, forces GC, and records final heap.

Metric: `(after - before) / 32`, reported as `bytes/router`. Result-file writing occurs only afterward. A non-positive amplified total delta remains invalid and is never clamped.

- `8` blocks
- `4` mirrored pairs/block
- `32` samples/source
- each block: `2 A→B` + `2 B→A`
- `5,000` deterministic complete-block bootstrap resamples
- estimator: `median(all B) / median(all A)`

Prospective readiness for future 5% memory gates: bias `<=1.00%`; bootstrap 95% CI inside `0.9850x–1.0150x`; order spread `<=1.00%`; max block deviation `<=2.00%`.

All criteria must pass for `CP4-AQ1E-MEMORY HARDENED 5%-MEMORY-GATE READINESS: PASS`.

## Interpretation contract

AQ1E-MAIN and AQ1E-MEMORY are independent authoritative calibration experiments. A completed result from one remains valid if the other later aborts or fails. The first valid completed local timed run of each experiment is authoritative for that experiment. An abort before its completion marker is infrastructure/methodology failure, not readiness PASS/FAIL. Accepted correctness probes are never rerun. An unchanged completed FAIL is never rerun to seek a PASS. CP4-AQ remains paused until the hardened runner requirements are satisfied. Parent progress lines occur only between worker measurements and are outside all measured worker intervals.
