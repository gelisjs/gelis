# Competitive Performance v0.1 — CP4-Z Local Authoritative Production Acceptance

Date: 2026-09-13

## Classification

**VALID / AUTHORITATIVE / FAIL / REJECTED FOR PRODUCTION PROMOTION / ACCEPTED AS DIRECT PRODUCTION EVIDENCE**

This is the first valid completed local timed CP4-Z run and is authoritative as-is. It must not be rerun because a later result might be preferable.

## Identity

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- CPU: `Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz`
- Harness SHA: `c67857cbc0ceb5765c00e4d5356e741190c40b93`
- Production source: `af4e5102046def1b163435333563b8d08f919bf5`
- Candidate source: `1b4057ad9d12bc28d2ab2ca7917924368fe99444`
- Routes: `5,000`
- Samples: `12 mirrored fresh-worker pairs/cell pair`

## Frozen production gates

| gate | ratio | limit | result |
| --- | ---: | ---: | --- |
| static-only raw | 1.0251x | <= 1.0200x | FAIL |
| mixed static raw | 1.0142x | <= 1.0200x | PASS |
| mixed dynamic raw guard | 0.8960x | <= 1.0200x | PASS |
| mixed dynamic JSON guard | 0.9264x | <= 1.0200x | PASS |
| mixed dynamic geomean | 0.9111x | <= 0.9800x | PASS |
| mixed same-length dynamic raw | 1.0168x | <= 1.0200x | PASS |
| pure trailing dynamic raw | 0.8911x | <= 0.9400x | PASS |
| pure trailing dynamic JSON | 0.9312x | <= 0.9500x | PASS |
| generic dynamic raw | 1.0030x | <= 1.0300x | PASS |
| forced collision raw | 0.9290x | <= 1.1500x | PASS |
| ALL dynamic raw | 0.9243x | <= 1.0500x | PASS |
| static registration | 1.0564x | <= 1.0500x | FAIL |
| static retained heap | 0.9984x | <= 1.0500x | PASS |

Acceptance marker:

`CP4-Z MIXED-STATIC-FIRST DIRECT PRODUCTION ACCEPTANCE GATE: FAIL`

Completion marker:

`CP4-Z LOCAL MIXED-STATIC-FIRST PRODUCTION ACCEPTANCE RUN: COMPLETE`

## Consequence

CP4-Z fixes CP4-Y's mixed-static production blocker (`1.0142x`) while preserving the large dynamic gains, but it cannot be promoted because static-only and static registration exceed their frozen limits. The registration failure is not on the request-matching execution path changed by CP4-Z, so the next step is same-run balanced attribution rather than a rerun or a threshold change.
