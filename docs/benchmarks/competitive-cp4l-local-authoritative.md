# CP4-L Local Authoritative Result

## Classification

**VALID / AUTHORITATIVE / FAIL / REJECTED FOR COMPOSITION / ACCEPTED AS DECOMPOSITION EVIDENCE**

The first valid local timed run is authoritative as-is. No rerun is permitted merely because the result is unfavorable.

## Identity

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- CPU: `Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz`
- Harness SHA: `bc472ed8aaf101705b2f660c58298392d90be56b`
- Control source: `c18f231374d0008b7cc3e01bacbf9f81aff9a273`
- Candidate source: `dafeae25257f9288735e0564a14201a70b474f7e`
- Routes: `5,000`
- Samples: `11` mirrored fresh-worker pairs per cell pair
- Local correctness probe: `24/24 PASS`

## Candidate / control ratios

| Comparison | Ratio | Candidate delta |
| --- | ---: | ---: |
| static-only raw | 0.9938x | -5.0 ns |
| mixed static raw | 0.9971x | -2.4 ns |
| mixed dynamic raw | 0.9800x | -18.1 ns |
| mixed dynamic JSON | 1.0023x | +1.6 ns |
| mixed same-length dynamic raw | 0.9954x | -4.4 ns |
| pure trailing dynamic raw | 0.9974x | -2.3 ns |
| pure trailing dynamic JSON | 1.0145x | +9.9 ns |
| generic dynamic raw | 1.1059x | +145.4 ns |
| forced collision raw | 1.0181x | +17.7 ns |
| ALL dynamic raw | 0.9837x | -14.9 ns |
| static registration | 1.5117x | +0.652 ms |
| static retained heap | 1.0006x | +362 bytes |

## Frozen gate result

| Gate | Candidate / control | Limit | Result |
| --- | ---: | ---: | --- |
| static-only recovery | 0.9938x | <= 0.9491x | **FAIL** |
| mixed-static guard | 0.9971x | <= 1.0200x | PASS |
| mixed dynamic raw guard | 0.9800x | <= 1.0200x | PASS |
| mixed dynamic JSON guard | 1.0023x | <= 1.0200x | PASS |
| mixed same-length dynamic raw guard | 0.9954x | <= 1.0200x | PASS |
| pure trailing dynamic raw guard | 0.9974x | <= 1.0200x | PASS |
| pure trailing dynamic JSON guard | 1.0145x | <= 1.0200x | PASS |
| generic dynamic raw guard | 1.1059x | <= 1.0200x | **FAIL** |
| forced collision raw guard | 1.0181x | <= 1.0200x | PASS |
| ALL dynamic raw guard | 0.9837x | <= 1.0200x | PASS |
| static registration guard | 1.5117x | <= 1.0500x | **FAIL** |
| static retained heap guard | 1.0006x | <= 1.0500x | PASS |

## Interpretation

Static capability elision does not recover the CP4-J static-only deficit. The measured static-only ratio is `0.9938x`, far from the frozen `<= 0.9491x` recovery requirement.

The mechanism also creates a material static-registration regression (`1.5117x`) and a generic-dynamic regression (`1.1059x`). Retained heap remains effectively neutral (`1.0006x`).

Therefore the CP4-J residual is not attributable to the presence of `matchRequestUrl` as a static-only Router capability. CP4-L is rejected for composition. The next step is source-lineage attribution across production, CP4-B, CP4-F, and CP4-I under one balanced local run before any further hot-path source experiment is attempted.
