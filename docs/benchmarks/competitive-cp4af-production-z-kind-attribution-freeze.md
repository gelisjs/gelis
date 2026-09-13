# Competitive Performance v0.1 — CP4-AF production/Z/KIND balanced attribution freeze

Date: 2026-09-13

## Purpose

CP4-AF is a measurement-only balanced attribution phase following the authoritative CP4-AE failure.

Its purpose is to determine, in one same-run protocol, whether the CP4-AE generic-dynamic regression and narrow trailing-raw miss are primarily inherited from the CP4-Z lineage, introduced by removing `fastMapKind`, or dominated by code-shape/run sensitivity.

CP4-AF does not reopen CP4-Z or CP4-AE acceptance decisions and cannot promote a source directly.

## Frozen sources

- Production: `af4e5102046def1b163435333563b8d08f919bf5`
- CP4-Z: `1b4057ad9d12bc28d2ab2ca7917924368fe99444`
- KIND-only: `408f9856f814184ca0204aa49d3812af8660f077`

KIND-only differs from CP4-Z only in `src/runtime/router.ts` and removes the dead `fastMapKind` metadata family while preserving the active `staticPathLengthMax` discriminator and `staticPathLengthMin` metadata.

## Frozen environment

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- Routes: `5,000`
- Authoritative performance machine: the established local Intel(R) Core(TM) i5-10500H machine

## Frozen cells

1. static-only raw
2. mixed-static raw
3. mixed dynamic raw
4. pure trailing dynamic raw
5. generic dynamic raw
6. ALL dynamic raw
7. static registration

These are the same seven attribution cells used by CP4-AD. The two CP4-AE failing raw cells are retained together with static, mixed, ALL, and registration controls.

## Frozen sampling protocol

- 12 balanced fresh-worker triplets per cell
- all six source permutations
- each permutation repeated twice per cell
- one metric per fresh worker process
- median, p25, p75, min, and max reported for each source/cell
- direct ratios reported as CP4-Z / production, KIND-only / production, and KIND-only / CP4-Z

## Correctness gate

Before any local timing:

- all 21 source/cell correctness probes must pass;
- source identities must match the frozen SHAs;
- Bun version and revision must match exactly;
- the benchmark worktree must be clean;
- KIND-only must differ from CP4-Z under `src/**` only at `src/runtime/router.ts`.

CI may run correctness probes only. CI timing is prohibited for this phase.

## Decision rule

The first valid completed local timed CP4-AF run is authoritative attribution evidence as-is and must not be rerun for result selection.

No CP4-Z or CP4-AE production classification changes as a result of CP4-AF. Any later production candidate requires a separately frozen source and direct production acceptance phase with gates fixed before timing.
