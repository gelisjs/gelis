# Competitive Performance v0.1 — CP4-AI lazy request-URL capability production acceptance freeze

**Status:** FROZEN BEFORE LOCAL TIMING  
**Date:** 2026-09-13

## Purpose

CP4-AI tests a pay-for-use routing capability on top of the final CP4-Z request-URL implementation.

The candidate keeps `Router.prototype.matchRequestUrl` and the CP4-Z dynamic request path intact, but a newly constructed static-only router shadows that capability with an own `undefined` value. The shadow is removed only after a dynamic/trailing route or `ALL` route is successfully registered, or when a prebuilt router is hydrated with routing state that requires request-URL matching.

The intended split is therefore structural:

- static-only applications use the existing production `pathnameFromRequestUrl()` + `router.match()` path;
- mixed/dynamic applications expose the CP4-Z request-URL capability;
- failed transactional registration must not activate the capability;
- AOT/prebuilt hydration must activate it when dynamic/trailing state requires it;
- `ALL` fallback semantics remain unchanged.

This phase is a direct production acceptance test. CP4-Z is carried in the same balanced run only as an attribution anchor. Production promotion is decided exclusively from candidate / production ratios under the frozen gates below.

## Frozen identities

```text
Bun:           1.4.2
Bun revision:  744846f844374847c902b5e7fd59b4342a51ef99
Production:    af4e5102046def1b163435333563b8d08f919bf5
CP4-Z:         1b4057ad9d12bc28d2ab2ca7917924368fe99444
Candidate:     a7751059eef1d3074e6e0a1c2d227b49889affe4
Routes:        5,000
```

The candidate's production-source delta from CP4-Z is restricted to `src/runtime/router.ts`. CP4-Z source-preparation artifacts are removed from the clean candidate branch and are not part of the candidate runtime surface.

## Frozen cells

```text
static-only raw
mixed static raw
mixed dynamic raw
mixed dynamic JSON
mixed same-length dynamic raw
pure trailing dynamic raw
pure trailing dynamic JSON
generic dynamic raw
forced collision raw
ALL dynamic raw
static registration
static retained heap
```

## Frozen sampling protocol

Each cell uses all three exact sources in fresh worker processes.

```text
sources:           production / CP4-Z / candidate
triplets per cell: 12
source orders:      all 6 permutations, each repeated twice per cell
worker isolation:   one metric per fresh process
reported stats:     median / p25 / p75 / min / max
```

The harness reports these direct same-run ratios:

```text
CP4-Z / production
candidate / production
candidate / CP4-Z
```

No ratio chaining across earlier CP4 runs is permitted.

Correctness must pass for every source × cell before local timing. GitHub Actions may run correctness-only validation but must not run timing for acceptance.

## Frozen direct-production gates

All acceptance gates use direct **candidate / production** median ratios.

```text
static-only raw                  <= 1.0200x
mixed static raw                 <= 1.0200x
mixed dynamic raw                <= 1.0200x
mixed dynamic JSON               <= 1.0200x
mixed dynamic raw/JSON geomean   <= 0.9800x
mixed same-length dynamic raw    <= 1.0200x
pure trailing dynamic raw        <= 0.9400x
pure trailing dynamic JSON       <= 0.9500x
generic dynamic raw              <= 1.0300x
forced collision raw             <= 1.1500x
ALL dynamic raw                  <= 1.0500x
static registration              <= 1.0500x
static retained heap             <= 1.0500x
```

These are the existing CP4 direct-production acceptance gates and must not be changed after observing local timing.

## Decision rule

The first valid completed local timed run on the established Windows / Intel Core i5-10500H machine is authoritative as-is.

- Every frozen direct-production gate must pass for CP4-AI to be eligible for production promotion.
- Any failed gate rejects the exact candidate for production promotion.
- CP4-Z ratios are attribution evidence only and cannot rescue a failed candidate / production gate.
- There is no rerun for result selection, no threshold adjustment, and no acceptance inference from CI timing.
- Prior CP4-Z through CP4-AH classifications remain unchanged regardless of this result.
