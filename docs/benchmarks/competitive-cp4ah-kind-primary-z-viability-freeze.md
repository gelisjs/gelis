# Competitive Performance v0.1 — CP4-AH KIND-primary Z viability freeze

**Status:** FROZEN BEFORE LOCAL TIMING  
**Date:** 2026-09-13

## Purpose

CP4-AH tests one structural request-dispatch treatment on top of CP4-Z after CP4-AG closed the dead-`fastMapKind` removal line.

The candidate keeps CP4-Z registration metadata and generic-table static-first ordering intact, but uses the already-present `fastMapKind` only as a read-only specialization hint for runtime-created fast-map tables. It does not restore the earlier CP4-X generic-table bypass. Legacy/AOT/prebuilt tables that omit `fastMapKind` retain the conservative CP4-Z fallback behavior.

This phase is viability-only. It cannot promote production source.

## Frozen identities

```text
Bun:           1.4.2
Bun revision:  744846f844374847c902b5e7fd59b4342a51ef99
Control CP4-Z: 1b4057ad9d12bc28d2ab2ca7917924368fe99444
Candidate:     0ec95837e912921624fa1b1d9d4f18c28dfe82cc
Routes:        5,000
```

The candidate differs from CP4-Z in production source only at `src/runtime/router.ts`. Temporary source-preparation files are not part of the candidate runtime surface.

## Frozen cells

```text
static-only raw
mixed-static raw
mixed dynamic raw
pure trailing dynamic raw
generic dynamic raw
ALL dynamic raw
static registration
```

## Frozen sampling protocol

For every cell:

```text
blocks:             4
pairs per block:    6
samples per source: 24 fresh-worker measurements
order per block:    3 Z→candidate + 3 candidate→Z mirrored pairs
```

Each source measurement runs in a fresh worker. Source order is balanced inside every block.

Correctness must pass before local timing. GitHub Actions may run the correctness probe but must not run timing for acceptance or viability.

## Frozen viability gates

All gates are candidate / CP4-Z median ratios and all must pass:

```text
static-only raw           <= 0.9950x
mixed-static raw          <= 1.0100x
mixed dynamic raw         <= 1.0200x
pure trailing dynamic raw <= 1.0200x
generic dynamic raw       <= 1.0200x
ALL dynamic raw           <= 1.0200x
static registration       <= 1.0200x
```

The static-only requirement intentionally demands measurable recovery relative to CP4-Z rather than accepting neutrality. The remaining gates prevent buying that recovery with a material regression in the routes CP4-Z improved.

## Decision rule

The first valid completed local timed run on the established authoritative Windows/i5-10500H machine is authoritative as-is.

- If every frozen gate passes, the mechanism is accepted only for a new direct-production acceptance phase under the existing full 13 production gates.
- If any frozen gate fails, the CP4-AH candidate is rejected. There is no rerun for result selection and no threshold adjustment.
- A viability PASS is not production promotion.
- CP4-Z, CP4-AE, CP4-AF, and CP4-AG historical classifications remain unchanged regardless of this result.
