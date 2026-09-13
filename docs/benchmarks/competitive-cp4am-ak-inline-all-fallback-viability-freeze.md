# Competitive Performance v0.1 — CP4-AM AK + inline ALL table-miss fallback viability freeze

Date: 2026-09-13

## Purpose

CP4-AM tests whether the previously validated inline ALL table-miss fallback mechanism can compose with the CP4-AK static-leading mask without losing AK's mixed-static and same-length gains.

This is a new composition experiment. It does not rerun or reopen CP4-T, CP4-AK, or CP4-AL.

## Frozen sources

- Control (CP4-AK): `658c22c0d12322e278d996f47c4373831d61ba9b`
- Candidate (CP4-AM): `b14c3a4e3c8cfb07c1461a0cf66a189c8b6ddb2b`
- Candidate delta from CP4-AK under `src/**`: only `src/runtime/router.ts` (`+12/-2`)

The candidate keeps CP4-AK's static-leading mask and changes the opening of `matchRequestUrl()` so that a concrete-method table miss may fall directly to the ALL table before URL parsing. This avoids a second full matcher invocation for ALL fallback.

## Environment

Authoritative local timing requires:

- Bun `1.4.2`
- Bun revision `744846f844374847c902b5e7fd59b4342a51ef99`
- user authoritative CPU: Intel Core i5-10500H
- `5,000` routes

CI may run correctness-only probes. CI timing is not authoritative.

## Frozen cells

1. `static-only-raw`
2. `mixed-static-raw`
3. `mixed-dynamic-raw`
4. `mixed-same-length-dynamic-raw`
5. `trailing-dynamic-raw`
6. `generic-dynamic-raw`
7. `all-dynamic-raw`
8. `static-registration`

## Frozen sampling protocol

For every cell:

- 2 sources: CP4-AK control and CP4-AM candidate
- 4 blocks
- 6 mirrored fresh-worker pairs per block
- 24 measurements per source per cell
- each block: 3 control→candidate pairs and 3 candidate→control pairs
- first valid completed local timed run is authoritative as-is

No selective reruns are allowed because of noise, threshold proximity, or surprising direction.

## Frozen viability gates

All ratios are candidate / CP4-AK control medians from the same run.

```text
static-only raw                 <= 1.0200x
mixed-static raw                <= 1.0100x
mixed dynamic raw               <= 1.0200x
mixed same-length dynamic raw   <= 1.0200x
pure trailing dynamic raw       <= 1.0200x
generic dynamic raw             <= 1.0200x
ALL dynamic raw                 <= 0.9850x
static registration             <= 1.0200x
```

All gates must pass.

The `ALL dynamic <= 0.9850x` gate is the primary mechanism-recovery requirement. CP4-AM must show a material ALL improvement over CP4-AK rather than merely falling below the earlier broad guard.

## Decision rule

- All eight gates PASS: CP4-AM may advance to a newly frozen direct-production acceptance phase. Viability PASS alone does not authorize production promotion.
- Any gate FAIL: CP4-AM is rejected with no threshold adjustment and no result-selection rerun.

No cross-run ratio multiplication is valid acceptance evidence.
