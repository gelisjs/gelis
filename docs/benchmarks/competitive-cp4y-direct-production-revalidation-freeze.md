# Competitive Performance v0.1 — CP4-Y Direct Production Revalidation Freeze

## Identity

- Production source: `af4e5102046def1b163435333563b8d08f919bf5`
- CP4-X candidate source: `efaa228231c920fee78053edeb5c8c094f324aca`
- Runtime: Bun `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- Routes: `5,000`
- Samples: `12 balanced fresh-worker pairs/cell pair`
- Pair order: 6 production→candidate and 6 candidate→production for every cell
- CI timing is non-authoritative and must not be run.
- The first valid completed local timed run is authoritative as-is.

## Cells

1. static-only raw
2. mixed static raw
3. mixed dynamic raw
4. mixed dynamic JSON
5. mixed same-length dynamic raw
6. pure trailing dynamic raw
7. pure trailing dynamic JSON
8. generic dynamic raw
9. forced collision raw
10. ALL dynamic raw
11. static registration
12. static retained heap delta

## Frozen production gates

These are the same thresholds used by CP4-J; none are relaxed for CP4-Y.

- static-only raw: `candidate/production <= 1.0200x`
- mixed static raw: `<= 1.0200x`
- mixed dynamic raw guard: `<= 1.0200x`
- mixed dynamic JSON guard: `<= 1.0200x`
- mixed dynamic geomean: `<= 0.9800x`
- mixed same-length dynamic raw: `<= 1.0200x`
- pure trailing dynamic raw: `<= 0.9400x`
- pure trailing dynamic JSON: `<= 0.9500x`
- generic dynamic raw: `<= 1.0300x`
- forced collision raw: `<= 1.1500x`
- ALL dynamic raw: `<= 1.0500x`
- static registration: `<= 1.0500x`
- static retained heap: `<= 1.0500x`

PASS requires every frozen gate to pass.

A PASS is direct production acceptance evidence for exact CP4-X source `efaa2282...`; a FAIL rejects production promotion while preserving the run as authoritative evidence.
