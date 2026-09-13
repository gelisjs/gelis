# Competitive Performance v0.1 — CP4-U local authoritative result

## Classification

**VALID / AUTHORITATIVE / FAIL / REJECTED AS SUFFICIENT COMPOSITION / ACCEPTED AS DECOMPOSITION EVIDENCE.**

Do not rerun CP4-U merely because the result is unfavorable. The first valid completed local timed run is authoritative evidence as-is.

## Identity

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- CPU: `Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz`
- Harness SHA: `360b796b6ede0d97f5f1202ac983f9f85d9ddef2`
- Control source: `c18f231374d0008b7cc3e01bacbf9f81aff9a273`
- Candidate source: `d00e9aa92bf36f59a4182d4602ca46392f5b3686`
- Routes: `5,000`
- Samples: `11` mirrored fresh-worker pairs per cell pair
- Local correctness probe: `CP4-U CORRECTNESS PROBE: PASS (20/20)`
- Completion marker: `CP4-U LOCAL UNBOUND ALL URL SPECIALIZATION RUN: COMPLETE`

## Authoritative ratios and frozen gates

- static-only raw: `0.9885x`, delta `-9.5 ns`, limit `<= 1.0200x` — PASS
- mixed static raw: `1.0321x`, delta `+26.9 ns`, limit `<= 0.9963x` — **FAIL**
- mixed dynamic raw: `1.0154x`, delta `+13.7 ns`, limit `<= 1.0200x` — PASS
- mixed dynamic JSON: `0.9905x`, delta `-6.5 ns`, limit `<= 1.0200x` — PASS
- mixed same-length dynamic raw: `1.0137x`, delta `+13.1 ns`, limit `<= 1.0200x` — PASS
- pure trailing dynamic raw: `1.0104x`, delta `+9.2 ns`, limit `<= 1.0200x` — PASS
- pure trailing dynamic JSON: `0.9983x`, delta `-1.2 ns`, limit `<= 1.0200x` — PASS
- generic dynamic raw: `1.0103x`, delta `+11.9 ns`, limit `<= 1.0200x` — PASS
- forced collision raw: `0.9578x`, delta `-42.3 ns`, limit `<= 1.0200x` — PASS
- ALL dynamic raw: `1.0073x`, delta `+6.4 ns`, limit `<= 1.0200x` — PASS

Gate marker: `CP4-U UNBOUND ALL URL SPECIALIZATION VIABILITY GATE: FAIL`

## Interpretation

CP4-U directly compares against CP4-I. Nine of ten frozen gates passed, including `ALL dynamic raw` at `1.0073x`. The sole blocker is the primary mixed-static recovery gate at `1.0321x` versus the frozen `<= 0.9963x` requirement.

The mixed-static benchmark does not register `app.all()`, so the CP4-U `router-all.ts` specialization is not semantically active in that workload. This does not invalidate or relax the acceptance result: CP4-U remains a valid authoritative FAIL. It does, however, motivate a balanced same-run attribution across CP4-I, CP4-Q, CP4-T, and CP4-U before another source composition is attempted.
