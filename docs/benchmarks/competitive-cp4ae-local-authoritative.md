# Competitive Performance v0.1 — CP4-AE local authoritative result

Date: 2026-09-13

## Classification

**VALID / AUTHORITATIVE / FAIL / REJECTED FOR PRODUCTION PROMOTION / ACCEPTED AS DIRECT PRODUCTION EVIDENCE**

This is the first valid completed local timed CP4-AE run and is authoritative as-is. It must not be rerun because the result is unfavorable or close to a threshold.

## Identity

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- CPU: `Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz`
- Harness SHA: `8cac0e4b9cfde14629d677a311f5e2035697bc96`
- Production source: `af4e5102046def1b163435333563b8d08f919bf5`
- Candidate source: `408f9856f814184ca0204aa49d3812af8660f077`
- Candidate meaning: CP4-Z with `fastMapKind` metadata removed while preserving `staticPathLengthMin` and `staticPathLengthMax`
- Routes: `5,000`
- Samples: `12 mirrored fresh-worker pairs/cell pair`

Local correctness probe before timing: `PASS (24/24)`.

## Authoritative medians

| cell | production | candidate | unit |
| --- | ---: | ---: | --- |
| static-only raw | 809.3 | 803.8 | ns/op |
| mixed static raw | 803.3 | 798.3 | ns/op |
| mixed dynamic raw | 962.5 | 882.5 | ns/op |
| mixed dynamic JSON | 722.6 | 693.2 | ns/op |
| mixed same-length dynamic raw | 969.9 | 964.7 | ns/op |
| pure trailing dynamic raw | 959.7 | 905.0 | ns/op |
| pure trailing dynamic JSON | 797.8 | 697.3 | ns/op |
| generic dynamic raw | 1193.9 | 1255.2 | ns/op |
| forced collision raw | 1080.5 | 994.9 | ns/op |
| ALL dynamic raw | 987.2 | 950.5 | ns/op |
| static registration | 1.252 | 1.264 | ms |
| static retained heap | 619117 | 618198 | bytes |

## Frozen gate results

| gate | candidate / production | limit | result |
| --- | ---: | ---: | --- |
| static-only raw | 0.9933x | <= 1.0200x | PASS |
| mixed static raw | 0.9938x | <= 1.0200x | PASS |
| mixed dynamic raw guard | 0.9169x | <= 1.0200x | PASS |
| mixed dynamic JSON guard | 0.9594x | <= 1.0200x | PASS |
| mixed dynamic geomean | 0.9379x | <= 0.9800x | PASS |
| mixed same-length dynamic raw | 0.9946x | <= 1.0200x | PASS |
| pure trailing dynamic raw | 0.9430x | <= 0.9400x | FAIL |
| pure trailing dynamic JSON | 0.8740x | <= 0.9500x | PASS |
| generic dynamic raw | 1.0513x | <= 1.0300x | FAIL |
| forced collision raw | 0.9208x | <= 1.1500x | PASS |
| ALL dynamic raw | 0.9628x | <= 1.0500x | PASS |
| static registration | 1.0101x | <= 1.0500x | PASS |
| static retained heap | 0.9985x | <= 1.0500x | PASS |

## Interpretation

CP4-AE passes 11 of 13 frozen production gates but fails two independent gates, so the candidate is rejected for production promotion.

The pure trailing dynamic raw result is `0.9430x` against the frozen `<= 0.9400x` threshold. The candidate is still materially faster than production in absolute terms, but the predeclared acceptance threshold is not met and must not be relaxed after measurement.

The generic dynamic raw result is the stronger blocker at `1.0513x` against `<= 1.0300x`, corresponding to a `+61.2 ns/op` candidate median regression. This is not a threshold-rounding issue.

The rest of the candidate signature is favorable: static-only and mixed-static are below production, mixed dynamic raw is `0.9169x`, mixed dynamic JSON is `0.9594x`, trailing JSON is `0.8740x`, collision is `0.9208x`, ALL dynamic is `0.9628x`, registration is inside the frozen guard at `1.0101x`, and retained heap is slightly lower at `0.9985x`.

The CP4-AE generic result conflicts with the CP4-AD same-run component attribution, where KIND-only was `0.9716x` relative to CP4-Z on generic dynamic raw. Together with earlier CP4-Z generic measurements that varied materially across direct and balanced protocols, the evidence supports follow-up attribution rather than immediate source mutation or result selection by rerun.

## Consequence

- CP4-AE must not be rerun for result selection.
- KIND-only is rejected for production promotion under the frozen CP4-AE gates.
- CP4-Z and CP4-AB prior classifications remain unchanged.
- No gate is relaxed despite the narrow trailing-raw miss.
- The next scientifically useful phase should compare production, CP4-Z, and KIND-only in one balanced fresh-worker protocol, with emphasis on trailing raw and generic raw plus stable control cells. The purpose is attribution only, not reopening CP4-AE.

Completion marker:

`CP4-AE LOCAL KIND-ONLY PRODUCTION ACCEPTANCE RUN: COMPLETE`
