# Competitive Performance v0.1 — CP4-O local authoritative evidence

## Classification

**VALID / AUTHORITATIVE / FAIL / REJECTED AS SUFFICIENT MIXED-STATIC RECOVERY / ACCEPTED AS DECOMPOSITION EVIDENCE**

CP4-O tested whether packing fast-map lane state and the static upper bound into one numeric field could recover the remaining CP4-I mixed-static overhead while preserving the existing dynamic gains.

## Authoritative identity

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- CPU: `Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz`
- Harness SHA: `8d80b509665b6e1824d7a9aeeb3ff6d8ac6b5786`
- Control source: `c18f231374d0008b7cc3e01bacbf9f81aff9a273`
- Candidate source: `882c35250f6ce141746f0980eb65378b442504c2`
- Routes: `5,000`
- Samples: `11` mirrored fresh-worker pairs per cell pair
- Completion marker present: `CP4-O LOCAL PACKED FAST-MAP STATE RUN: COMPLETE`

## Authoritative ratios

| comparison | candidate / control | frozen limit | result |
| --- | ---: | ---: | --- |
| static-only raw | `1.0074x` | `<= 1.0200x` | PASS |
| mixed static raw | `1.0008x` | `<= 0.9963x` | **FAIL** |
| mixed dynamic raw | `0.9851x` | `<= 1.0200x` | PASS |
| mixed dynamic JSON | `0.9976x` | `<= 1.0200x` | PASS |
| mixed same-length dynamic raw | `1.0168x` | `<= 1.0200x` | PASS |
| pure trailing dynamic raw | `0.9647x` | `<= 1.0200x` | PASS |
| pure trailing dynamic JSON | `1.0148x` | `<= 1.0200x` | PASS |
| generic dynamic raw | `0.9781x` | `<= 1.0200x` | PASS |
| forced collision raw | `0.9998x` | `<= 1.0200x` | PASS |
| ALL dynamic raw | `0.9972x` | `<= 1.0200x` | PASS |
| static registration | `0.9372x` | `<= 1.0500x` | PASS |
| static retained heap | `1.0000x` | `<= 1.0500x` | PASS |

## Interpretation

The packed representation is semantically correct and clean on every secondary guard. It also improves static registration by about `6.3%` relative to CP4-I in this run, while retained heap is effectively unchanged.

However, the primary mixed-static objective is not met. The candidate measured `1.0008x` relative to CP4-I, while the frozen recovery requirement was `<= 0.9963x`. Therefore metadata packing by itself does not remove enough mixed-static request-time cost to justify composition or production revalidation.

The result narrows the residual further: the remaining mixed-static cost is not explained by the second metadata property read alone. The next decomposition should target the mixed-lane branch/arithmetic shape while preserving the length discriminator and the dynamic wins.

The first valid completed local run is the authoritative evidence. It must not be rerun merely to seek a more favorable result.
