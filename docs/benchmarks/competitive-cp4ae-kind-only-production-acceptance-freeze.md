# CP4-AE — KIND-only direct production acceptance freeze

CP4-AE is a direct production-acceptance phase for the KIND-only component source selected by CP4-AD attribution. It does not reopen CP4-Z or CP4-AB and does not relax any production threshold.

## Frozen identity

- Production source: `af4e5102046def1b163435333563b8d08f919bf5`
- Candidate source: `408f9856f814184ca0204aa49d3812af8660f077`
- Candidate provenance: direct child of CP4-Z `1b4057ad9d12bc28d2ab2ca7917924368fe99444`
- Candidate change: remove only the `fastMapKind` metadata family from `src/runtime/router.ts`
- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- Routes: `5,000`
- Samples: `12 mirrored fresh-worker pairs per cell pair`

## Source isolation

The candidate differs from CP4-Z only at `src/runtime/router.ts`, with `24` deletions and no additions. It removes only the `fastMapKind` metadata family while retaining CP4-Z `staticPathLengthMin`, `staticPathLengthMax`, and request-dispatch logic.

CP4-AE must compare the exact candidate source directly against the frozen production source. Ratios from CP4-AD or other runs must not be multiplied together as acceptance evidence.

## Frozen production gates

The gates and thresholds are identical to CP4-Z and CP4-AB direct production acceptance:

| gate                          | limit      |
| ----------------------------- | ---------- |
| static-only raw               | `<=1.0200x` |
| mixed static raw              | `<=1.0200x` |
| mixed dynamic raw guard       | `<=1.0200x` |
| mixed dynamic JSON guard      | `<=1.0200x` |
| mixed dynamic geomean         | `<=0.9800x` |
| mixed same-length dynamic raw | `<=1.0200x` |
| pure trailing dynamic raw     | `<=0.9400x` |
| pure trailing dynamic JSON    | `<=0.9500x` |
| generic dynamic raw           | `<=1.0300x` |
| forced collision raw          | `<=1.1500x` |
| ALL dynamic raw               | `<=1.0500x` |
| static registration           | `<=1.0500x` |
| static retained heap          | `<=1.0500x` |

Every gate must pass. No threshold may be changed after observing CP4-AE timing.

## Protocol

- 12 production/candidate cell pairs;
- 12 samples per pair;
- fresh worker process for every sample member;
- mirrored order: production/candidate then candidate/production;
- exact source identity preflight;
- clean worktree preflight;
- correctness probe before local timing;
- CI may execute correctness only;
- CI timing is forbidden;
- the user's local machine is authoritative for performance acceptance.

The first valid completed local timed CP4-AE run is authoritative as-is. It must not be rerun because the result is favorable, unfavorable, close to a threshold, or surprising.
