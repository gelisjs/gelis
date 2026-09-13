# Competitive Performance v0.1 — CP4-R local authoritative result

## Classification

**VALID / AUTHORITATIVE / FAIL / REJECTED AS SUFFICIENT COMPOSITION / ACCEPTED AS DECOMPOSITION EVIDENCE.**

The first valid local timed run is authoritative evidence as-is. Do not rerun CP4-R merely because the result is unfavorable.

## Identity

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- CPU: `Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz`
- Harness SHA: `4956711cbebb585ebf5e6e7b7f3e2cfd28e25c58`
- Control source: `c18f231374d0008b7cc3e01bacbf9f81aff9a273`
- Candidate source: `49953b7ecb366c8c300dd2968ce2d8656b41a315`
- Routes: `5,000`
- Samples: `11` mirrored fresh-worker pairs per cell pair
- Local correctness probe: `CP4-R CORRECTNESS PROBE: PASS (20/20)`
- Completion marker: `CP4-R LOCAL UPPER-BOUND SENTINEL DISPATCH RUN: COMPLETE`

## Authoritative ratios and frozen gates

- static-only raw: `1.0024x`, delta `+2.0 ns`, limit `<= 1.0200x` — PASS
- mixed static raw: `0.9993x`, delta `-0.5 ns`, limit `<= 0.9963x` — **FAIL**
- mixed dynamic raw: `1.0181x`, delta `+15.8 ns`, limit `<= 1.0200x` — PASS
- mixed dynamic JSON: `1.0083x`, delta `+5.7 ns`, limit `<= 1.0200x` — PASS
- mixed same-length dynamic raw: `0.9892x`, delta `-10.5 ns`, limit `<= 1.0200x` — PASS
- pure trailing dynamic raw: `1.0005x`, delta `+0.4 ns`, limit `<= 1.0200x` — PASS
- pure trailing dynamic JSON: `0.9959x`, delta `-2.8 ns`, limit `<= 1.0200x` — PASS
- generic dynamic raw: `0.9933x`, delta `-7.8 ns`, limit `<= 1.0200x` — PASS
- forced collision raw: `1.0358x`, delta `+34.2 ns`, limit `<= 1.0200x` — **FAIL**
- ALL dynamic raw: `1.0005x`, delta `+0.5 ns`, limit `<= 1.0200x` — PASS

Gate marker: `CP4-R UPPER-BOUND SENTINEL DISPATCH VIABILITY GATE: FAIL`

## Interpretation

CP4-R directly compares against CP4-I; no CP4-Q ratio chaining is used for acceptance.

The upper-bound sentinel successfully removes CP4-Q's ALL-method blocker: the ALL dynamic ratio improves from CP4-Q's `1.0272x` to `1.0005x`. However, the mechanism is not composable because mixed-static recovery disappears (`0.9993x` versus frozen `<= 0.9963x`) and forced-collision raw regresses to `1.0358x` versus `<= 1.0200x`.

This evidence narrows the next experiment. The next candidate should retain CP4-Q request dispatch unchanged for normal method tables and target only the application-level method-miss to `ALL` fallback path.
