# CP4-AQ2 hotpath detectability frontier freeze

## Purpose

AQ1F2 completed authoritatively and showed that same-process paired cycles greatly reduced central same-source bias, but universal 2% hotpath gates still failed because worker-level and temporal dispersion remained too large. AQ2 does not attempt another 2% acceptance mechanism. It measures the smallest multiplicative latency effect that the accepted AQ1F2 measurement infrastructure can classify reliably on this host.

AQ2 is calibration only. It cannot reclassify CP4-AO, CP4-AP, AQ1E-MAIN, AQ1E-MEMORY, AQ1F, AQ1F2, or Gelis source performance.

## Frozen identity

- Bun `1.4.2`
- revision `744846f844374847c902b5e7fd59b4342a51ef99`
- source A = source B = `5d9698d6b8d368ddcff358fc2645435b93c0c062`
- routes `5,000`
- authoritative host Windows / 12 logical CPUs
- timed workers logical CPU `10` / affinity `0x400` / priority `HIGH`
- gated launch and synchronous result-file IPC unchanged
- worker implementation is the exact accepted AQ1F2 worker blob `9df1a3a236b0ec07626fce9e85041291448963e1`

## Representative cells

Exactly five hotpaths are frozen: static-only raw, generic dynamic raw, trailing dynamic JSON, forced collision raw, and ALL dynamic raw.

## Frozen sampling

- 16 fresh paired A/B workers per cell
- 8 symmetric cycles per worker
- 4 timed legs per cycle
- 32 timed legs per worker
- balanced `ABBA` / `BAAB` cycle orientation inside each process
- same paired iteration count for A and B inside each worker
- 80 timed worker processes total across five cells
- 5,000 deterministic worker-bootstrap resamples

The raw timed run is always same-source A/B with no synthetic code added inside the measured operation.

## Synthetic effect injection

AQ2 derives counterfactual multiplicative latency effects only after timing. Every raw paired-worker B/A ratio is multiplied by one frozen factor:

- `0.90x` = -10% latency
- `0.95x` = -5% latency
- `1.00x` = 0% control
- `1.05x` = +5% latency
- `1.10x` = +10% latency

No synthetic work, delay, branch, sleep, allocation, or extra framework operation occurs inside a timed leg. This isolates the statistical detectability of known multiplicative effects under the real same-source noise distribution observed by the runner. It does not claim that every real code change with the same point-estimate effect will have an identical variance distribution.

## Frozen classification policy

The neutral policy zone is `0.9800x–1.0200x`, retained prospectively from the failed universal 2% target.

For each cell/effect band, AQ2 bootstraps the median of the shifted paired-worker ratios:

- `CLEAR IMPROVEMENT` if bootstrap 95% CI upper bound is `<= 0.9800x`
- `CLEAR REGRESSION` if bootstrap 95% CI lower bound is `>= 1.0200x`
- `INCONCLUSIVE` otherwise

The 0% control passes only if all five cells classify `INCONCLUSIVE`; any clear classification at 0% is a false-positive control failure.

The ±5% band passes only if every cell classifies `0.95x` as `CLEAR IMPROVEMENT` and `1.05x` as `CLEAR REGRESSION`.

The ±10% band passes only if every cell classifies `0.90x` as `CLEAR IMPROVEMENT` and `1.10x` as `CLEAR REGRESSION`.

If control passes, the universal local hotpath detection floor is the smallest passing band: `5%`, then `10%`, otherwise `>10%`. If control fails, the result is `INVALID CONTROL` and no detection floor may be claimed from this protocol.

## Authority contract

The correctness probe runs one paired-source correctness check for each frozen cell (5/5). Once accepted locally it is never rerun. The first valid completed local timed AQ2 run under the final frozen SHA is authoritative regardless of the resulting frontier. There is no rerun because the frontier is surprising, borderline, or undesirable. An abort before the completion marker is an infrastructure/methodology failure, not a detectability result.

Completion marker: `CP4-AQ2 LOCAL HOTPATH DETECTABILITY FRONTIER RUN: COMPLETE`.
