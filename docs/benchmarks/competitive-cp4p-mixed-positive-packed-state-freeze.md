# Competitive Performance v0.1 — CP4-P mixed-positive packed-state viability freeze

## Purpose

CP4-O showed that packing lane state and the static upper bound into one numeric field was safe on every secondary guard and improved registration, but it did not recover mixed-static request time: `1.0008x` versus CP4-I against a frozen `<= 0.9963x` recovery requirement.

CP4-P keeps the one-field representation but flips its polarity so the mixed lane is the direct positive case. A mixed request now checks the positive upper bound directly instead of passing through the CP4-O negative-state decode (`state < -1`, then `-state - 1`). Pure-static state is encoded negative, trailing-only remains a sentinel, and generic routing remains unchanged.

The benchmark remains a direct comparison against CP4-I. CP4-O ratios are not chained into acceptance.

## Frozen identity

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- Control source: `c18f231374d0008b7cc3e01bacbf9f81aff9a273`
- Candidate source: `4a79497f0b4c5e6fa88abf77c84f922417b634af`
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

PASS requires every gate to pass. Thresholds are frozen before local timing and must not be relaxed afterward. The first valid authoritative local run is evidence as-is.
