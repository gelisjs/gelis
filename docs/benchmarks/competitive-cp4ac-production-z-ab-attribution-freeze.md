# CP4-AC — production/Z/AB balanced attribution freeze

CP4-AC is a measurement-only attribution phase. It does not override or reopen any prior acceptance classification.

## Frozen identity

- Production: `af4e5102046def1b163435333563b8d08f919bf5`
- CP4-Z: `1b4057ad9d12bc28d2ab2ca7917924368fe99444`
- CP4-AB: `2114489c11d555edfc13db2a6336435fd4879931`
- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- Routes: 5,000
- Samples: 12 balanced fresh-worker triplets per cell
- Orders: all six source permutations, each repeated twice per cell

## Frozen cells

1. static-only raw
2. mixed-static raw
3. mixed dynamic raw
4. pure trailing dynamic raw
5. generic dynamic raw
6. ALL dynamic raw
7. static registration

The first valid completed local timed run is authoritative attribution evidence as-is. It must not be rerun because the result is favorable, unfavorable, or surprising. No production promotion can be inferred from this attribution run.
