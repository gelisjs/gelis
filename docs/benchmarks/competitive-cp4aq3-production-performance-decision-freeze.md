# CP4-AQ3 production performance decision protocol v0.1 — freeze

## Purpose

CP4-AQ3 converts the calibrated AQ2 hotpath detectability result into a reusable production-candidate decision protocol. AQ3 is not a new detectability calibration and must not be used to rewrite AQ2.

The objective is to promote real performance wins aggressively while refusing to treat sub-detection-floor noise as proof of improvement.

## Frozen environment

- Bun: 1.4.2
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- authoritative timing host: Windows, Intel Core i5-10500H, 12 logical CPUs
- production source A: `5d9698d6b8d368ddcff358fc2645435b93c0c062`
- candidate source B: supplied explicitly as `--candidate=<commit-sha>` and fixed for the run
- routes: 5,000
- worker measurement implementation: exact AQ1F2/AQ2 worker blob `9df1a3a236b0ec07626fce9e85041291448963e1`
- logical CPU affinity: CPU 10 / mask `0x400`
- worker priority: HIGH
- result transport: result-file IPC after measurement

## Frozen hotpath cells

1. static-only raw
2. generic dynamic raw
3. pure trailing dynamic JSON
4. forced collision raw
5. ALL dynamic raw

These are the five representative cells on which AQ2 established the universal tested 5% detection floor.

## Frozen sampling

For every cell:

- 16 fresh paired A/B workers
- production A and candidate B execute in the same Bun process
- 8 symmetric cycles per worker
- 4 timed legs per cycle
- balanced ABBA / BAAB cycle order
- 32 timed legs per worker
- A and B use the same paired iteration count inside a worker
- worker observation = median of its 8 symmetric cycle ratios
- aggregate estimator = median of 16 worker observations
- 5,000 deterministic bootstrap resamples of complete worker observations
- bootstrap statistic = median

No local timing may be authoritative on CI. CI is correctness/quality only.

## Frozen per-cell classifier

For candidate / production ratio:

- `CLEAR IMPROVEMENT` if bootstrap 95% CI upper bound is `<= 0.9800x`
- `CLEAR REGRESSION` if bootstrap 95% CI lower bound is `>= 1.0200x`
- `INCONCLUSIVE` otherwise

AQ2 established a universal tested detection floor of 5%. Therefore:

- a `MATERIAL IMPROVEMENT` requires both `CLEAR IMPROVEMENT` and paired-worker median `<= 0.9500x`
- a paired-worker median `>= 1.0500x` is a `MATERIAL REGRESSION ESTIMATE` and blocks promotion even if its CI remains inconclusive

A sub-5% clear improvement may be recorded as evidence but cannot by itself justify source promotion.

## Frozen hotpath decision

### REJECTED FOR PRODUCTION PROMOTION

If any calibrated cell is `CLEAR REGRESSION`.

### HOLD / INCONCLUSIVE

If there is no clear regression, but either:

- any cell has a material regression estimate (`median >= 1.0500x`), or
- there is no material improvement.

A HOLD is not a failure of the candidate's correctness. It means the performance evidence is not sufficient to promote it.

### ELIGIBLE FOR PRODUCTION PROMOTION

Only if all are true:

1. zero `CLEAR REGRESSION` cells;
2. zero material regression estimates;
3. at least one material improvement.

This permits targeted large wins without demanding that unrelated cells also improve, while preventing promotion on tiny/noisy changes alone.

## External prerequisites

AQ3 hotpath eligibility is not by itself final production promotion. Before source promotion:

- full repository Quality must pass;
- candidate correctness/semantic tests must pass;
- candidate-specific correctness probe must pass once;
- separately applicable memory acceptance must pass when the candidate changes memory-relevant routing/runtime structures;
- no known portability, typing scalability, or API-contract regression may be accepted for speed.

AQ1E-MEMORY remains the accepted basis for future 5% memory gates.

## Authority and rerun rules

- Candidate SHA is frozen before the timed run.
- The first valid completed local timed run for that exact production/candidate/protocol identity is authoritative.
- A completed `REJECTED`, `HOLD`, or `ELIGIBLE` result is not rerun unchanged to seek a better result.
- An abort before the completion marker is not a performance decision.
- A new source candidate requires a new candidate SHA and therefore a new decision run.
- Gates are never loosened after seeing candidate results.

Required completion marker:

`CP4-AQ3 LOCAL PRODUCTION PERFORMANCE DECISION RUN: COMPLETE`

## Competitive objective

AQ3 decides whether a candidate is genuinely faster than current Gelis production under the calibrated local protocol. It does not by itself prove Gelis is the fastest framework overall. Competitor-facing claims still require separate fair Gelis/Hono/Elysia benchmark evidence after promoted source changes.
