# Competitive Performance v0.1 — CP4-T local authoritative result

## Classification

**VALID / AUTHORITATIVE / FAIL / REJECTED AS SUFFICIENT COMPOSITION / ACCEPTED AS DECOMPOSITION EVIDENCE.**

Do not rerun CP4-T merely because the result is unfavorable. The first valid completed local timed run is authoritative evidence as-is.

## Identity

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- CPU: `Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz`
- Harness SHA: `7c38cf30ae55c34c05b593bec8dc2bbda3cc7ae8`
- Control source: `c18f231374d0008b7cc3e01bacbf9f81aff9a273`
- Candidate source: `bc519e56c599d7b325f0db13d1c6d318801b6024`
- Routes: `5,000`
- Samples: `11` mirrored fresh-worker pairs per cell pair
- Local correctness probe: `CP4-T CORRECTNESS PROBE: PASS (20/20)`
- Completion marker: `CP4-T LOCAL ALL TABLE-MISS FALLBACK RUN: COMPLETE`

## Authoritative ratios and frozen gates

- static-only raw: `1.0005x`, delta `+0.4 ns`, limit `<= 1.0200x` — PASS
- mixed static raw: `0.9934x`, delta `-5.4 ns`, limit `<= 0.9963x` — PASS
- mixed dynamic raw: `0.9988x`, delta `-1.1 ns`, limit `<= 1.0200x` — PASS
- mixed dynamic JSON: `0.9875x`, delta `-8.6 ns`, limit `<= 1.0200x` — PASS
- mixed same-length dynamic raw: `0.9894x`, delta `-10.2 ns`, limit `<= 1.0200x` — PASS
- pure trailing dynamic raw: `1.0049x`, delta `+4.3 ns`, limit `<= 1.0200x` — PASS
- pure trailing dynamic JSON: `1.0278x`, delta `+18.7 ns`, limit `<= 1.0200x` — **FAIL**
- generic dynamic raw: `1.0266x`, delta `+31.1 ns`, limit `<= 1.0200x` — **FAIL**
- forced collision raw: `1.0004x`, delta `+0.4 ns`, limit `<= 1.0200x` — PASS
- ALL dynamic raw: `0.9566x`, delta `-39.2 ns`, limit `<= 1.0200x` — PASS

Gate marker: `CP4-T ALL TABLE-MISS FALLBACK VIABILITY GATE: FAIL`

## Interpretation

CP4-T directly compares against CP4-I; no CP4-Q/CP4-R/CP4-S ratio chaining is used for acceptance.

The direct table-miss fallback successfully preserved mixed-static recovery (`0.9934x`) and delivered a strong ALL-method improvement (`0.9566x`). This is the first decomposition in this sequence to satisfy both of those target lanes simultaneously.

Composition still fails because pure trailing dynamic JSON (`1.0278x`) and generic dynamic raw (`1.0266x`) exceed the frozen `<= 1.0200x` guards. Those workloads use an existing concrete GET method table and therefore do not semantically take CP4-T's new table-miss fallback branch. That fact is useful attribution evidence, but it does not invalidate the frozen acceptance result and does not authorize a rerun.

The next experiment should preserve CP4-Q's method-hit `matchRequestUrl()` code shape exactly and specialize ALL fallback outside that shared hot function, so the ALL improvement can be tested without altering the instruction/code shape seen by ordinary method-hit routing.
