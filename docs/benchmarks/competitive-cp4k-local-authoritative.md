# Competitive Performance v0.1 — CP4-K local authoritative result

## Classification

`VALID / AUTHORITATIVE / FAIL / REJECTED FOR COMPOSITION / ACCEPTED AS DECOMPOSITION EVIDENCE`

The first valid local authoritative run completed on the frozen machine and harness without rerun or threshold changes.

## Identity

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- CPU: Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz
- Harness SHA: `81fa153a0226f36b12840fa1d1db7d52e40ef3a2`
- Control source: `c18f231374d0008b7cc3e01bacbf9f81aff9a273`
- Candidate source: `ac7cc2fc5eb381f703b410a1d3f9cc3a958106b8`
- Routes: `5,000`
- Samples: `11` mirrored fresh-worker pairs per cell pair
- Correctness preflight: `20/20 PASS`

## Authoritative ratios

- static-only raw: `1.0073x` (`+6.0 ns`) — FAIL against recovery `<= 0.9491x`
- mixed static raw: `0.9977x` (`-1.9 ns`) — PASS
- mixed dynamic raw: `0.9953x` (`-4.1 ns`) — PASS
- mixed dynamic JSON: `1.0109x` (`+7.5 ns`) — PASS
- mixed same-length dynamic raw: `0.9803x` (`-19.5 ns`) — PASS
- pure trailing dynamic raw: `1.0046x` (`+4.1 ns`) — PASS
- pure trailing dynamic JSON: `1.0046x` (`+3.2 ns`) — PASS
- generic dynamic raw: `0.9446x` (`-68.9 ns`) — PASS
- forced collision raw: `0.9995x` (`-0.5 ns`) — PASS
- ALL dynamic raw: `1.0110x` (`+9.8 ns`) — PASS

## Interpretation

The static-only handoff hypothesis is rejected. Replacing the CP4-I static-only full request-URL offset parser with a production-shaped `pathnameFromRequestUrl(url)` plus exact static-map lookup did not recover the required static regression; the candidate was slightly slower than control at `1.0073x`.

All secondary guards passed. Therefore the CP4-J residual is not attributable to the static-only pathname extraction / exact-map handoff itself. The next decomposition must isolate whether the remaining cost comes from application-to-router capability dispatch rather than from trailing fingerprint, generic trie, or static-map lookup mechanics.

No rerun is permitted merely because the result is unfavorable. CP4-K is not production-promotion eligible.
