# Competitive Performance v0.1 — CP4-AK static-leading mask viability freeze

**Status:** FROZEN BEFORE LOCAL TIMING  
**Date:** 2026-09-13

## Purpose

CP4-AK tests a new negative-static discriminator on top of CP4-AI after CP4-AJ showed that KIND-primary composition does not recover the mixed-static residual.

The candidate replaces the runtime-created table's unused `staticPathLengthMin` slot with a conservative `staticPathLeadMask`. The mask records a hashed bit derived from the first UTF-16 code unit after the leading slash of each static route. During request-URL matching:

- a missing bit proves that an exact static route cannot match, so substring allocation and static `Map` lookup may be skipped;
- a present bit performs the canonical exact static lookup directly without paying the static upper-bound comparison on the static-hit path;
- bit collisions are conservative false positives only;
- legacy/AOT/prebuilt tables without the new mask retain CP4-AI's existing upper-bound fallback.

This phase is viability-only. It cannot promote production source.

## Frozen identities

```text
Bun:              1.4.2
Bun revision:     744846f844374847c902b5e7fd59b4342a51ef99
CP4-AI control:   a7751059eef1d3074e6e0a1c2d227b49889affe4
CP4-AK candidate: 658c22c0d12322e278d996f47c4373831d61ba9b
Routes:           5,000
```

The candidate differs from CP4-AI in production source only at `src/runtime/router.ts`.

## Frozen cells

```text
static-only raw
mixed-static raw
mixed dynamic raw
mixed same-length dynamic raw
pure trailing dynamic raw
generic dynamic raw
ALL dynamic raw
static registration
```

The same-length dynamic guard prevents interpreting a win that depends only on the existing static max-length rejection boundary.

## Frozen sampling protocol

For every cell:

```text
blocks:             4
pairs per block:    6
samples per source: 24 fresh-worker measurements
order per block:    3 control→candidate + 3 candidate→control mirrored pairs
```

Each source measurement runs in a fresh worker. Source order is balanced inside every block.

Correctness must pass before local timing. GitHub Actions may run the correctness probe but must not run timing for viability.

## Frozen viability gates

All gates are candidate / CP4-AI median ratios and all must pass:

```text
static-only raw                 <= 1.0200x
mixed-static raw                <= 0.9850x
mixed dynamic raw               <= 1.0200x
mixed same-length dynamic raw   <= 1.0200x
pure trailing dynamic raw       <= 1.0200x
generic dynamic raw             <= 1.0200x
ALL dynamic raw                 <= 1.0200x
static registration             <= 1.0200x
```

The `0.9850x` mixed-static gate requires a material same-run improvement over CP4-AI. It is not obtained by multiplying ratios from separate historical runs.

## Decision rule

The first valid completed local timed run on the established authoritative Windows/i5-10500H machine is authoritative as-is.

- If every frozen gate passes, CP4-AK may advance only to a separate robustness check and then, if warranted, a new direct-production acceptance under the unchanged full production gates.
- If any frozen gate fails, the exact CP4-AK candidate is rejected at viability.
- There is no rerun for result selection and no threshold adjustment after observing timing.
- A viability PASS is not production promotion.
- CP4-AI and CP4-AJ historical classifications remain unchanged regardless of this result.
