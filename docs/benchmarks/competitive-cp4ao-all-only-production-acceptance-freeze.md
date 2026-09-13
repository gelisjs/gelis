# CP4-AO — ALL-only method-miss elision direct production acceptance freeze

## Purpose

CP4-AN passed its frozen AK-control viability gate. CP4-AO therefore evaluates the exact CP4-AN source directly against the frozen production anchor under the established CP4 direct-production acceptance protocol.

This is a new direct production acceptance phase. CP4-AN's viability result remains unchanged and cannot be replaced by CP4-AO.

## Frozen identities

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- Production source: `af4e5102046def1b163435333563b8d08f919bf5`
- CP4-AK attribution source: `658c22c0d12322e278d996f47c4373831d61ba9b`
- Candidate source: `8734bc5a88749f107efd5925f70e304370261d17`
- Routes: `5,000`

The candidate is the exact clean source that passed CP4-AN viability. No source changes are permitted after this freeze.

## Sources in the same run

Each cell measures three exact sources in balanced fresh-worker triplets:

1. production
2. CP4-AK
3. candidate

CP4-AK is attribution-only. Candidate acceptance is determined exclusively by direct candidate/production ratios. No ratio chaining is allowed.

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
12. static retained heap

## Sampling

- `12` balanced fresh-worker triplets per cell.
- Six source-order permutations, each repeated twice per cell.
- One metric per fresh worker.
- Report median, p25, p75, min, and max.
- Report direct same-run CP4-AK/production, candidate/production, and candidate/CP4-AK ratios.
- No ratio chaining.

## Frozen direct-production gates

All candidate/production gates must pass:

| gate                           |      limit |
| ------------------------------ | ---------: |
| static-only raw                | <= 1.0200x |
| mixed static raw               | <= 1.0200x |
| mixed dynamic raw guard        | <= 1.0200x |
| mixed dynamic JSON guard       | <= 1.0200x |
| mixed dynamic raw/JSON geomean | <= 0.9800x |
| mixed same-length dynamic raw  | <= 1.0200x |
| pure trailing dynamic raw      | <= 0.9400x |
| pure trailing dynamic JSON     | <= 0.9500x |
| generic dynamic raw            | <= 1.0300x |
| forced collision raw           | <= 1.1500x |
| ALL dynamic raw                | <= 1.0500x |
| static registration            | <= 1.0500x |
| static retained heap           | <= 1.0500x |

These are the existing CP4 direct-production gates. They must not be relaxed after timing.

## Decision rule

The first valid completed local timed run on the frozen Windows/i5-10500H environment is authoritative.

- If every direct candidate/production gate passes: `VALID / AUTHORITATIVE / PASS / ELIGIBLE FOR PRODUCTION PROMOTION`.
- If any direct candidate/production gate fails: `VALID / AUTHORITATIVE / FAIL / REJECTED FOR PRODUCTION PROMOTION / ACCEPTED AS DIRECT PRODUCTION EVIDENCE`.

CP4-AK attribution cannot rescue a failed direct-production gate. No rerun is permitted for result selection.

Before timing, the exact frozen harness must pass correctness-only probing for all source×cell combinations. CI correctness timing is not authoritative and must not be used for acceptance.
