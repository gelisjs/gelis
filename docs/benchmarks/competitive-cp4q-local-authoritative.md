# Competitive Performance v0.1 — CP4-Q local authoritative result

## Classification

**VALID / AUTHORITATIVE / FAIL / REJECTED AS SUFFICIENT COMPOSITION / ACCEPTED AS DECOMPOSITION EVIDENCE.**

Do not rerun CP4-Q merely because the result is unfavorable. The first valid completed local timed run is authoritative evidence as-is.

## Identity

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- CPU: `Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz`
- Harness SHA: `dd22280080a82efeee2dc51ffad1edb85bd64758`
- Control source: `c18f231374d0008b7cc3e01bacbf9f81aff9a273`
- Candidate source: `b268a99f58e6c055ed0255c30ea16783f85fb5f3`
- Routes: `5,000`
- Samples: `11` mirrored fresh-worker pairs per cell pair
- Local correctness probe: `CP4-Q CORRECTNESS PROBE: PASS (20/20)`
- Completion marker: `CP4-Q LOCAL DEFERRED UPPER-BOUND DISPATCH RUN: COMPLETE`

## Authoritative ratios and frozen gates

- static-only raw: `1.0066x`, delta `+5.3 ns`, limit `<= 1.0200x` — PASS
- mixed static raw: `0.9545x`, delta `-38.1 ns`, limit `<= 0.9963x` — PASS
- mixed dynamic raw: `0.9985x`, delta `-1.3 ns`, limit `<= 1.0200x` — PASS
- mixed dynamic JSON: `1.0170x`, delta `+11.5 ns`, limit `<= 1.0200x` — PASS
- mixed same-length dynamic raw: `1.0042x`, delta `+4.1 ns`, limit `<= 1.0200x` — PASS
- pure trailing dynamic raw: `1.0108x`, delta `+9.6 ns`, limit `<= 1.0200x` — PASS
- pure trailing dynamic JSON: `1.0000x`, delta `+0.0 ns`, limit `<= 1.0200x` — PASS
- generic dynamic raw: `0.9789x`, delta `-25.2 ns`, limit `<= 1.0200x` — PASS
- forced collision raw: `0.9671x`, delta `-32.6 ns`, limit `<= 1.0200x` — PASS
- ALL dynamic raw: `1.0272x`, delta `+23.9 ns`, limit `<= 1.0200x` — **FAIL**

Gate marker: `CP4-Q DEFERRED UPPER-BOUND DISPATCH VIABILITY GATE: FAIL`

## Interpretation

CP4-Q directly compares against CP4-I. No ratio chaining is used for acceptance.

The intended mixed-static recovery succeeded decisively at `0.9545x`, well inside the frozen `<= 0.9963x` requirement. Static-only remained safe at `1.0066x`, and every individual dynamic guard also passed. The composition nevertheless fails because the aggregate `ALL dynamic raw` cell regressed to `1.0272x`, exceeding its `<= 1.0200x` guard.

This pattern means the deferred upper-bound dispatch mechanism is viable for mixed-static recovery but is not yet safe as a whole. The next experiment must isolate why the aggregate dynamic mixture regresses even though its individual component cells remain within guard. CP4-Q must not be promoted or directly production-revalidated as a sufficient composition on this run.
