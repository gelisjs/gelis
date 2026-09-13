# Competitive Performance v0.1 — CP4-O packed fast-map state viability freeze

## Purpose

CP4-N localized the first reproducible static regression to CP4-B -> CP4-C, where pathname-length discriminator metadata was introduced. CP4-M then showed the composed CP4-I mixed-static path at `1.0237x` versus production, slightly outside the frozen `1.0200x` production limit.

CP4-O tests whether packing fast-map lane state and the static pathname upper bound into one numeric field removes enough metadata-read/dispatch cost while preserving CP4-I's negative discrimination and dynamic wins.

## Frozen identity

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- Control source: `c18f231374d0008b7cc3e01bacbf9f81aff9a273`
- Candidate source: `882c35250f6ce141746f0980eb65378b442504c2`
- Routes: `5,000`
- Samples: `11` mirrored fresh-worker pairs per cell pair

## Frozen gates

- static-only raw guard: `<= 1.0200x`
- mixed-static recovery: `<= 0.9963x`
- mixed dynamic raw guard: `<= 1.0200x`
- mixed dynamic JSON guard: `<= 1.0200x`
- mixed same-length dynamic raw guard: `<= 1.0200x`
- pure trailing dynamic raw guard: `<= 1.0200x`
- pure trailing dynamic JSON guard: `<= 1.0200x`
- generic dynamic raw guard: `<= 1.0200x`
- forced collision raw guard: `<= 1.0200x`
- ALL dynamic raw guard: `<= 1.0200x`
- static registration guard: `<= 1.0500x`
- static retained heap guard: `<= 1.0500x`

The primary `0.9963x` gate is frozen before timing. It is slightly stricter than `1.0200 / 1.0237 = 0.9963856598...`, the recovery required by CP4-M's direct CP4-I mixed-static result.

PASS requires every gate to pass. Thresholds must not be relaxed after observing local timing. The first valid authoritative local run is evidence as-is.
