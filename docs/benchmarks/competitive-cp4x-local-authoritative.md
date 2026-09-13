# Competitive Performance v0.1 — CP4-X Local Authoritative Balanced Acceptance

Date: 2026-09-13

## Classification

**VALID / AUTHORITATIVE / PASS / ACCEPTED FOR DIRECT PRODUCTION REVALIDATION**

This is the first valid completed local timed CP4-X run and is authoritative as-is. It must not be rerun merely because a later result is preferable or unfavorable.

## Identity

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- CPU: `Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz`
- Harness SHA: `80b4a2bae05bc6682bed3ba7f613fd3797f39dff`
- CP4-I control: `c18f231374d0008b7cc3e01bacbf9f81aff9a273`
- CP4-U attribution anchor: `d00e9aa92bf36f59a4182d4602ca46392f5b3686`
- CP4-X candidate: `efaa228231c920fee78053edeb5c8c094f324aca`
- Routes: `5,000`
- Samples: `12 balanced fresh-worker triplets/cell`

## Direct CP4-X / CP4-I ratios

| gate                                |   ratio |      limit | result |
| ----------------------------------- | ------: | ---------: | ------ |
| static-only guard                   | 0.9988x | <= 1.0200x | PASS   |
| mixed-static recovery               | 0.9853x | <= 0.9963x | PASS   |
| mixed dynamic raw guard             | 1.0071x | <= 1.0200x | PASS   |
| mixed dynamic JSON guard            | 1.0054x | <= 1.0200x | PASS   |
| mixed same-length dynamic raw guard | 0.9935x | <= 1.0200x | PASS   |
| pure trailing dynamic raw guard     | 1.0141x | <= 1.0200x | PASS   |
| pure trailing dynamic JSON guard    | 1.0084x | <= 1.0200x | PASS   |
| generic dynamic raw guard           | 1.0156x | <= 1.0200x | PASS   |
| forced collision raw guard          | 0.9805x | <= 1.0200x | PASS   |
| ALL dynamic raw guard               | 0.9948x | <= 1.0200x | PASS   |

Acceptance marker:

`CP4-X GENERIC TABLE REQUEST SPECIALIZATION BALANCED ACCEPTANCE GATE: PASS`

Completion marker:

`CP4-X LOCAL BALANCED ACCEPTANCE RUN: COMPLETE`

## Attribution anchor observed in the same run

CP4-U / CP4-I ratios in the same balanced run were:

- static-only raw: `0.9950x`
- mixed static raw: `0.9875x`
- mixed dynamic raw: `1.0092x`
- mixed dynamic JSON: `1.0135x`
- mixed same-length dynamic raw: `0.9921x`
- trailing dynamic raw: `1.0492x`
- trailing dynamic JSON: `1.0148x`
- generic dynamic raw: `1.0058x`
- collision dynamic raw: `0.9719x`
- ALL dynamic raw: `0.9862x`

These anchor values are attribution evidence only and do not alter CP4-U's prior authoritative FAIL classification.

## Consequence

CP4-X passes its frozen viability/composition acceptance contract and advances to **direct production-vs-CP4-X revalidation**. Production acceptance must be measured directly; it must not be inferred by multiplying ratios from separate runs.
