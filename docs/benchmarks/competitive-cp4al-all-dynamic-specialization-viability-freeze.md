# Competitive Performance v0.1 — CP4-AL ALL dynamic specialization viability freeze

**Status:** FROZEN BEFORE LOCAL TIMING  
**Date:** 2026-09-13

## Purpose

CP4-AL tests whether the CP4-AK static-leading mask can retain its mixed-table gains while isolating dynamic-only `ALL` fallback from the shared `matchRequestUrl()` code shape that caused CP4-AK's sole viability failure.

The candidate keeps CP4-AK's ordinary `matchRequestUrl()` body unchanged. `router-all.ts` uses a dedicated `Router.matchAllRequestUrl()` only for fallback into an `ALL` method table. That specialization is active only when the `ALL` table contains no static routes; if static routes exist, it falls back to canonical CP4-AK matching.

This phase is viability-only. It cannot promote production source.

## Frozen identities

```text
Bun:            1.4.2
Bun revision:   744846f844374847c902b5e7fd59b4342a51ef99
CP4-AK control: 658c22c0d12322e278d996f47c4373831d61ba9b
Candidate:      2a01866678b296a9618e17c245a897752f4d640a
Routes:         5,000
```

The candidate differs from CP4-AK production source only at:

```text
src/runtime/router.ts
src/runtime/router-all.ts
```

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

All gates are candidate / CP4-AK median ratios and all must pass:

```text
static-only raw                  <= 1.0200x
mixed-static raw                 <= 1.0100x
mixed dynamic raw                <= 1.0200x
mixed same-length dynamic raw    <= 1.0200x
pure trailing dynamic raw        <= 1.0200x
generic dynamic raw              <= 1.0200x
ALL dynamic raw                  <= 0.9850x
static registration              <= 1.0200x
```

`ALL dynamic raw` is the primary recovery gate. The `<=0.9850x` requirement demands a material improvement relative to CP4-AK rather than accepting noise-level neutrality. `mixed-static raw` receives a tighter `<=1.0100x` guard because CP4-AK's mixed-static recovery is the component being preserved.

No cross-run ratio multiplication is permitted. These viability ratios compare candidate and CP4-AK directly in the same balanced run.

## Decision rule

The first valid completed local timed run on the established authoritative Windows/i5-10500H machine is authoritative as-is.

- If every frozen gate passes, the mechanism may advance to a new direct-production acceptance phase under the full production gates.
- If any frozen gate fails, the exact CP4-AL candidate is rejected. There is no rerun for result selection and no threshold adjustment.
- A viability PASS is not production promotion.
- CP4-AK remains an authoritative viability FAIL regardless of CP4-AL outcome.
