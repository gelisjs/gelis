# Competitive Performance v0.1 — CP4-V balanced composition attribution freeze

## Purpose

CP4-Q, CP4-T, and CP4-U each produced valid authoritative acceptance failures, but several failing cells occurred on workloads that do not semantically execute the changed source path. CP4-V therefore performs a balanced same-run attribution before any further source composition is attempted.

CP4-V is **not** a candidate acceptance rerun. It cannot retroactively promote CP4-Q, CP4-T, or CP4-U. Its sole purpose is to identify which source shape is stable enough to use as the basis for the next new candidate.

## Frozen sources

- CP4-I control: `c18f231374d0008b7cc3e01bacbf9f81aff9a273`
- CP4-Q deferred upper-bound dispatch: `b268a99f58e6c055ed0255c30ea16783f85fb5f3`
- CP4-T ALL table-miss fallback: `bc519e56c599d7b325f0db13d1c6d318801b6024`
- CP4-U unbound ALL URL specialization: `d00e9aa92bf36f59a4182d4602ca46392f5b3686`

## Frozen protocol

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- Routes: `5,000`
- Samples: `12` balanced fresh-worker quartets per cell
- Four Latin-style execution orders repeated three times, so every source appears in every ordinal position exactly three times per cell
- First valid completed local timed run is authoritative attribution evidence as-is
- CI may run correctness-only probes, never authoritative timing

## Frozen cells

1. static-only raw
2. mixed-static raw
3. mixed dynamic raw
4. pure trailing dynamic JSON
5. generic dynamic raw
6. forced collision raw
7. ALL dynamic raw

These cells cover the primary mixed-static recovery target, the CP4-Q ALL blocker, the CP4-T trailing-JSON/generic blockers, the CP4-U mixed-static blocker, and representative static/collision guards.

## Frozen threshold projection

For attribution only, each source is projected against the already-frozen CP4 acceptance thresholds:

- mixed-static raw: `<= 0.9963x` versus CP4-I
- every other selected cell: `<= 1.0200x` versus CP4-I

A projected all-pass result **does not** override a prior authoritative acceptance failure. It only identifies a source shape that is worth using as the base for a new candidate and a new direct acceptance run.

## Interpretation contract

After CP4-V, choose the next source base from same-run evidence rather than by multiplying ratios from separate runs. Prefer the source that preserves mixed-static recovery while avoiding stable regressions on ALL, trailing JSON, generic, collision, and static-only. If no source projects all selected cells inside threshold, isolate the smallest stable blocker before another composition candidate is built.
