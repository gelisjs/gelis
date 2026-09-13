# Competitive Performance v0.1 — CP4-P local authoritative result

## Classification

**VALID / AUTHORITATIVE / FAIL / REJECTED AS MIXED-POSITIVE PACKED-STATE RECOVERY MECHANISM / ACCEPTED AS DECOMPOSITION EVIDENCE.**

Do not rerun CP4-P merely because the result is unfavorable. The first valid completed local timed run is authoritative evidence as-is.

## Identity

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- CPU: `Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz`
- Harness SHA: `92a656ec4e172073ee5cdd2e13e162b5327654af`
- Control source: `c18f231374d0008b7cc3e01bacbf9f81aff9a273`
- Candidate source: `4a79497f0b4c5e6fa88abf77c84f922417b634af`
- Routes: `5,000`
- Samples: `11` mirrored fresh-worker pairs per cell pair
- Local correctness probe: `CP4-P CORRECTNESS PROBE: PASS (24/24)`
- Completion marker: `CP4-P LOCAL MIXED-POSITIVE PACKED-STATE RUN: COMPLETE`

## Authoritative ratios and frozen gates

- static-only raw: `0.9774x`, delta `-18.7 ns`, limit `<= 1.0200x` — PASS
- mixed static raw: `1.0013x`, delta `+1.1 ns`, limit `<= 0.9963x` — **FAIL**
- mixed dynamic raw: `1.0126x`, delta `+11.2 ns`, limit `<= 1.0200x` — PASS
- mixed dynamic JSON: `0.9773x`, delta `-15.7 ns`, limit `<= 1.0200x` — PASS
- mixed same-length dynamic raw: `1.0291x`, delta `+27.6 ns`, limit `<= 1.0200x` — **FAIL**
- pure trailing dynamic raw: `1.0058x`, delta `+5.1 ns`, limit `<= 1.0200x` — PASS
- pure trailing dynamic JSON: `0.9779x`, delta `-15.4 ns`, limit `<= 1.0200x` — PASS
- generic dynamic raw: `0.9747x`, delta `-30.8 ns`, limit `<= 1.0200x` — PASS
- forced collision raw: `0.9991x`, delta `-0.9 ns`, limit `<= 1.0200x` — PASS
- ALL dynamic raw: `0.9772x`, delta `-20.7 ns`, limit `<= 1.0200x` — PASS
- static registration: `0.9207x`, delta `-0.103 ms`, limit `<= 1.0500x` — PASS
- static retained heap: `1.0000x`, delta `-18 bytes`, limit `<= 1.0500x` — PASS

Gate marker: `CP4-P MIXED-POSITIVE PACKED-STATE VIABILITY GATE: FAIL`

## Interpretation

CP4-P directly compares against CP4-I; no CP4-O ratio chaining is used for acceptance.

Changing packed-state polarity did not recover mixed-static. The primary lane remained effectively neutral/slower at `1.0013x`, outside the frozen `<= 0.9963x` requirement. It also produced a localized secondary failure in mixed same-length dynamic raw at `1.0291x` versus `<= 1.0200x`.

Other signals remain useful decomposition evidence: static-only `0.9774x`, ALL dynamic `0.9772x`, generic dynamic `0.9747x`, static registration `0.9207x`, and retained heap `1.0000x`. Therefore mixed-positive packed-state polarity is not a sufficient recovery mechanism and must not be promoted or composed on this run.
