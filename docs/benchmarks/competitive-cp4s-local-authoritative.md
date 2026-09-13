# Competitive Performance v0.1 — CP4-S local authoritative result

## Classification

**VALID / AUTHORITATIVE / FAIL / REJECTED AS SUFFICIENT COMPOSITION / ACCEPTED AS DECOMPOSITION EVIDENCE.**

Do not rerun CP4-S merely because the result is unfavorable. The first valid completed local timed run is authoritative evidence as-is.

## Identity

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- CPU: `Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz`
- Harness SHA: `c7e7bd781587ff0bdb9a1b241684f8de89f0c80b`
- Control source: `c18f231374d0008b7cc3e01bacbf9f81aff9a273`
- Candidate source: `8bb0327336ae970d73fc8638305a501205534ec2`
- Routes: `5,000`
- Samples: `11` mirrored fresh-worker pairs per cell pair
- Local correctness probe: `CP4-S CORRECTNESS PROBE: PASS (20/20)`
- Completion marker: `CP4-S LOCAL ALL REQUEST URL FALLBACK SPECIALIZATION RUN: COMPLETE`

## Authoritative ratios and frozen gates

- static-only raw: `0.9726x`, delta `-22.8 ns`, limit `<= 1.0200x` — PASS
- mixed static raw: `1.0138x`, delta `+11.1 ns`, limit `<= 0.9963x` — **FAIL**
- mixed dynamic raw: `1.0062x`, delta `+5.5 ns`, limit `<= 1.0200x` — PASS
- mixed dynamic JSON: `1.0012x`, delta `+0.8 ns`, limit `<= 1.0200x` — PASS
- mixed same-length dynamic raw: `1.0020x`, delta `+1.9 ns`, limit `<= 1.0200x` — PASS
- pure trailing dynamic raw: `1.0169x`, delta `+14.7 ns`, limit `<= 1.0200x` — PASS
- pure trailing dynamic JSON: `0.9858x`, delta `-9.7 ns`, limit `<= 1.0200x` — PASS
- generic dynamic raw: `1.0218x`, delta `+25.3 ns`, limit `<= 1.0200x` — **FAIL**
- forced collision raw: `1.0173x`, delta `+16.6 ns`, limit `<= 1.0200x` — PASS
- ALL dynamic raw: `0.9516x`, delta `-48.0 ns`, limit `<= 1.0200x` — PASS

Gate marker: `CP4-S ALL REQUEST URL FALLBACK SPECIALIZATION VIABILITY GATE: FAIL`

## Interpretation

CP4-S directly compares against CP4-I. No ratio chaining is used for acceptance.

The intended ALL-method improvement succeeded decisively: ALL dynamic raw reached `0.9516x`, removing the CP4-Q ALL blocker. However the frozen composition still fails because mixed-static is `1.0138x` instead of the required `<= 0.9963x`, and generic dynamic raw is `1.0218x`, narrowly outside its `<= 1.0200x` guard.

The mixed-static and generic cells do not register `app.all()`, so `activateAllFallback()` is not executed by those workloads. Their failures therefore cannot be interpreted as a directly reachable semantic cost of the ALL wrapper. They may reflect code-layout/JIT sensitivity or run-level variance, but the acceptance contract does not permit overriding the failed gates on that basis. CP4-S remains rejected as a sufficient composition and must not be rerun simply to seek a favorable result.
