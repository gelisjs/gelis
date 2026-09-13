# Competitive Performance v0.1 — CP4-N Mixed-Static Sub-Lineage Attribution Freeze

## Purpose

CP4-M established that the reproducible static residual is mixed-static, not static-only, and located the first broad crossing inside the cumulative CP4-B -> CP4-F segment. CP4-N narrows that segment without changing `src/**`.

This phase is attribution only. It does not promote a source candidate and has no pass/fail production gate.

## Frozen source lineage

- production: `af4e5102046def1b163435333563b8d08f919bf5`
- CP4-B: `ca7543b46ad68b89a9d2b10d29e052993b216758`
- CP4-C: `f6a1345ca5bee07870fbaa3d42321ed84439bf67`
- CP4-D: `5d9e5672031ff0ec468052f1d82c55e10b5387d7`
- CP4-E: `f18e43623eeafe6356248b174b3ae2112bcc8e82`
- CP4-F: `1e19a185eafbe271125eb73fc9f389413345ea8b`

## Frozen runtime identity

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- authoritative machine: Intel Core i5-10500H @ 2.50 GHz, 12 logical CPUs
- routes: `5,000`

## Frozen cells

1. static-only raw — context only
2. mixed static raw — **primary attribution cell**
3. mixed dynamic raw — guard / benefit attribution
4. mixed dynamic JSON — guard / benefit attribution
5. pure trailing dynamic raw — guard / benefit attribution
6. generic dynamic raw — guard
7. ALL dynamic raw — guard / aggregate dynamic context

Correctness scope is `7 cells × 6 sources = 42 probes`.

## Timing protocol

- `12` fresh-worker sextets per cell
- every source is measured once per sextet
- order is balanced across twelve frozen permutations
- each source occupies every ordinal position exactly twice
- the existing frozen CP4-J worker defines each workload
- source revisions are materialized as detached Git worktrees
- no CI timing is authoritative
- first valid local completed run is evidence as-is

## Frozen attribution boundary

The production-relative static boundary remains exactly:

`> 1.0200x`

The harness reports the first source whose direct ratio versus production exceeds that boundary for:

- static-only raw
- mixed-static raw

The primary question is: **which adjacent sub-lineage transition first causes mixed-static to cross `1.0200x` versus production?**

The adjacent transitions are frozen as:

1. production -> CP4-B
2. CP4-B -> CP4-C
3. CP4-C -> CP4-D
4. CP4-D -> CP4-E
5. CP4-E -> CP4-F

## Interpretation contract

- If CP4-C is the first crossing, investigate the static-length discriminator representation introduced in CP4-C.
- If CP4-D is the first crossing, investigate the Set -> min/max range representation/dispatch transition.
- If CP4-E is the first crossing, investigate deferred metadata / lane-ordering changes.
- If CP4-F is the first crossing, investigate registration-time method-table-kind specialization.
- If no source crosses, treat the broad CP4-M crossing as protocol sensitivity and do not invent a source culprit.

Dynamic improvements must be considered together with the mixed-static cost. A source transition that produces the crossing but also produces the major dynamic win should be decomposed, not reverted wholesale.

## Hygiene

- No source optimization is part of CP4-N.
- No thresholds may be changed after timing.
- No selective rerun is permitted to erase unfavorable attribution evidence.
- Temporary formatting/probe workflows and triggers must be removed before local authoritative timing.
