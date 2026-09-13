# Competitive Performance v0.1 — CP4-I local authoritative viability

## Identity

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- CPU: Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz
- Harness SHA: `cf419f6b5cd462c54a8c4d52035df902acfe0f6e`
- Frozen CP4-H control source: `45598d35271be658da76fe4ca755c04c91f35c92`
- Frozen CP4-I candidate source: `c18f231374d0008b7cc3e01bacbf9f81aff9a273`
- Routes: `5,000`
- Samples: `11` mirrored fresh-worker pairs per cell pair
- Correctness probe: `PASS (20/20)`

## Candidate / control ratios

| comparison                    |   ratio | candidate delta |
| ----------------------------- | ------: | --------------: |
| static-only raw               | 0.9926x |         -6.1 ns |
| mixed static raw              | 0.9801x |        -16.3 ns |
| mixed dynamic raw             | 1.0170x |        +14.7 ns |
| mixed dynamic JSON            | 0.9839x |        -11.1 ns |
| mixed same-length dynamic raw | 0.9835x |        -16.0 ns |
| pure trailing dynamic raw     | 1.0140x |        +12.3 ns |
| pure trailing dynamic JSON    | 0.9986x |         -1.0 ns |
| generic dynamic raw           | 0.9816x |        -21.9 ns |
| forced collision raw          | 0.9856x |        -14.1 ns |
| ALL dynamic raw               | 1.0183x |        +16.2 ns |

## Frozen gate result

| gate                                | candidate / CP4-H control |        limit | result |
| ----------------------------------- | ------------------------: | -----------: | ------ |
| static-only guard                   |                   0.9926x | `<= 1.0200x` | PASS   |
| mixed-static recovery               |                   0.9801x | `<= 0.9948x` | PASS   |
| mixed dynamic raw guard             |                   1.0170x | `<= 1.0200x` | PASS   |
| mixed dynamic JSON guard            |                   0.9839x | `<= 1.0200x` | PASS   |
| mixed same-length dynamic raw guard |                   0.9835x | `<= 1.0200x` | PASS   |
| pure trailing dynamic raw guard     |                   1.0140x | `<= 1.0200x` | PASS   |
| pure trailing dynamic JSON guard    |                   0.9986x | `<= 1.0200x` | PASS   |
| generic dynamic raw guard           |                   0.9816x | `<= 1.0200x` | PASS   |
| forced collision raw guard          |                   0.9856x | `<= 1.0200x` | PASS   |
| ALL dynamic raw guard               |                   1.0183x | `<= 1.0200x` | PASS   |

## Interpretation

1. The one-sided upper-bound mixed discriminator passes the pre-frozen viability requirement. Mixed-static improves to `0.9801x` versus CP4-H, comfortably beyond the required `<= 0.9948x` recovery ratio.
2. Static-only remains neutral-to-positive at `0.9926x`, so the CP4-H pure-static recovery is preserved rather than traded away.
3. Every dynamic secondary guard remains within the frozen `<= 1.0200x` envelope. The closest cells are ALL dynamic raw at `1.0183x` and mixed dynamic raw at `1.0170x`.
4. The result supports the attribution from CP4-H: the remaining mixed-static deficit was materially caused by the lower-bound metadata read/comparison in the two-sided range discriminator.
5. CP4-I is a viability decomposition, not production acceptance. Registration and retained heap were intentionally excluded. The CP4-H + CP4-I mechanism must now be measured directly against frozen production `af4e5102046def1b163435333563b8d08f919bf5` under the unchanged full production gates before promotion.
6. The first valid local timed run is retained as authoritative evidence. It must not be rerun merely to seek different numbers, and its frozen thresholds must not be changed after the result.

## Classification

**CP4-I LOCAL MIXED UPPER-BOUND VIABILITY: VALID / AUTHORITATIVE / PASS.**

The mechanism is accepted for composition into the next full production candidate. It is not yet production-accepted.
