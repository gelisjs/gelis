# CP4-M Lineage Attribution Freeze

## Purpose

CP4-M is an attribution benchmark, not a production acceptance candidate and not a source optimization. It exists to resolve the conflict between chained CP4-H/CP4-I decomposition evidence and the direct CP4-J production comparison.

No `src/**` change is introduced for CP4-M.

## Frozen source lineage

- production: `af4e5102046def1b163435333563b8d08f919bf5`
- CP4-B: `ca7543b46ad68b89a9d2b10d29e052993b216758`
- CP4-F: `1e19a185eafbe271125eb73fc9f389413345ea8b`
- CP4-I: `c18f231374d0008b7cc3e01bacbf9f81aff9a273`

## Runtime identity

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- authoritative machine: Intel Core i5-10500H @ 2.50 GHz, 12 logical CPUs
- routes: `5,000`

## Frozen cells

1. static-only raw
2. mixed static raw
3. mixed dynamic raw
4. mixed dynamic JSON
5. pure trailing dynamic raw
6. generic dynamic raw
7. ALL dynamic raw

Registration and retained heap are intentionally excluded because CP4-M changes no source and exists only to attribute request-time lineage behavior. Those metrics return for any later production acceptance candidate.

## Methodology

- `12` samples per cell.
- Each sample is a fresh-worker quartet containing production, CP4-B, CP4-F, and CP4-I.
- Four Latin-style execution orders are repeated three times, so every variant occupies every quartet position equally often.
- Every source is loaded from its own detached exact-SHA worktree.
- The existing frozen CP4-J worker supplies the identical workload implementation for every lineage source.
- The local authoritative run is the first valid completed timing run and is evidence as-is.
- No selective rerun is permitted merely because an attribution result is unfavorable.

## Correctness gate

Before timing, all `7 x 4 = 28` source/cell probes must pass on the authoritative local machine.

CI may run `--probe-only` as supplemental correctness evidence. CI timing is non-authoritative and must not be used.

## Frozen attribution rule

The production static regression boundary remains `1.0200x`.

For both static-only raw and mixed-static raw, CP4-M reports every lineage source directly against production. The first direct ratio above `1.0200x` identifies the first crossing:

- CP4-B > `1.0200x`: `production -> CP4-B`
- otherwise CP4-F > `1.0200x`: `CP4-B -> CP4-F`
- otherwise CP4-I > `1.0200x`: `CP4-F -> CP4-I`
- otherwise: no stable `>1.0200x` crossing in this balanced run

Adjacent ratios are also reported for diagnosis, but the direct-to-production crossing rule is authoritative for attribution.

Dynamic cells are diagnostic evidence only in CP4-M. They are used to show where the gains and regressions coexist; they are not production promotion gates.

## Interpretation contract

CP4-M cannot promote any source to production. Its only accepted outcome is a lineage attribution result that determines the next isolated source experiment, or shows that the direct CP4-J static failure is not stable under a balanced four-source run.
