# Competitive Performance v0.1 — CP4-AJ lazy + KIND-primary composition viability freeze

**Status:** FROZEN BEFORE LOCAL TIMING  
**Date:** 2026-09-13

## Purpose

CP4-AJ composes two mechanisms that were independently supported by earlier evidence:

- CP4-AI lazy request-URL capability activation, which restored static-only request cost to near production while retaining the CP4-Z dynamic advantage;
- CP4-AH read-only `fastMapKind` request-dispatch specialization, which improved mixed-static relative to CP4-Z but failed because its static-only path did not recover sufficiently.

The CP4-AJ candidate keeps CP4-AI's lazy activation intact, so static-only applications still bypass `matchRequestUrl()`. The only production-source delta from CP4-AI is the CP4-AH KIND-primary specialization inside `matchRequestUrl()` for tables where the capability is already active.

This phase is targeted viability only. It cannot promote production source.

## Frozen identities

```text
Bun:            1.4.2
Bun revision:   744846f844374847c902b5e7fd59b4342a51ef99
Control CP4-AI: a7751059eef1d3074e6e0a1c2d227b49889affe4
Candidate:      6149054010ce78f9285b8bb01f9ccb6947de144a
Routes:         5,000
```

The candidate differs from CP4-AI in `src/**` only at `src/runtime/router.ts`.

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
order per block:    3 control→candidate + 3 candidate→control mirrored pairs
```

Correctness must pass before local timing. CI may run correctness-only validation but must not run timing for viability.

## Frozen viability gates

All gates use direct **candidate / CP4-AI control** median ratios.

```text
static-only raw           <= 1.0200x
mixed-static raw          <= 0.9750x
mixed dynamic raw         <= 1.0200x
pure trailing dynamic raw <= 1.0200x
generic dynamic raw       <= 1.0200x
ALL dynamic raw           <= 1.0200x
static registration       <= 1.0200x
```

The mixed-static threshold is intentionally stronger than neutrality. CP4-AI's authoritative direct-production result missed the frozen mixed-static production gate materially, so CP4-AJ must demonstrate a clear additional recovery before another full direct-production acceptance is justified. This threshold is a viability requirement only; it does not infer or mathematically chain a production ratio from another run.

## Decision rule

The first valid completed local timed run on the established Windows / Intel Core i5-10500H machine is authoritative as-is.

- Every frozen viability gate must pass for CP4-AJ to advance to a new full direct-production acceptance phase.
- Any failed gate rejects this exact composition candidate at viability.
- There is no rerun for result selection and no threshold adjustment after seeing results.
- A viability PASS does not promote production source.
- All earlier CP4 classifications remain unchanged regardless of this result.
