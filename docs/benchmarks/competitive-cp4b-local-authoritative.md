# Competitive Performance v0.1 — CP4-B local authoritative acceptance

## Identity

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- CPU: Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz
- Harness SHA: `b19cf529e1cf4a287d523b6d4e028369ec0dc650`
- Previous production source: `af4e5102046def1b163435333563b8d08f919bf5`
- Frozen CP4-B candidate source: `ca7543b46ad68b89a9d2b10d29e052993b216758`
- Routes: `5,000`
- Samples: `11` mirrored fresh-worker pairs per cell pair
- Correctness probe: `PASS (18/18)`

## Production vs candidate cells

| cell                  | variant    | median ns/op |    p25 |    p75 |    min |    max |
| --------------------- | ---------- | -----------: | -----: | -----: | -----: | -----: |
| static-only-raw       | production |        798.3 |  786.0 |  856.4 |  782.6 |  973.1 |
| static-only-raw       | candidate  |        810.8 |  802.1 |  822.9 |  795.1 |  880.8 |
| mixed-static-raw      | production |        801.1 |  793.5 |  821.3 |  787.5 |  991.1 |
| mixed-static-raw      | candidate  |        805.9 |  797.8 |  818.8 |  793.1 |  848.2 |
| mixed-dynamic-raw     | production |        954.6 |  943.9 |  975.8 |  924.0 | 1115.7 |
| mixed-dynamic-raw     | candidate  |        956.5 |  949.5 |  971.3 |  938.2 |  999.6 |
| mixed-dynamic-json    | production |        734.2 |  728.3 |  740.9 |  721.8 |  804.6 |
| mixed-dynamic-json    | candidate  |        740.0 |  720.2 |  752.8 |  713.6 |  758.2 |
| trailing-dynamic-raw  | production |        957.0 |  941.1 |  993.5 |  923.9 | 1079.2 |
| trailing-dynamic-raw  | candidate  |        877.8 |  864.7 |  885.9 |  846.3 |  934.1 |
| trailing-dynamic-json | production |        806.1 |  733.6 |  822.0 |  723.5 |  836.6 |
| trailing-dynamic-json | candidate  |        695.7 |  676.4 |  765.6 |  660.2 |  983.6 |
| generic-dynamic-raw   | production |       1203.5 | 1169.6 | 1231.1 | 1127.0 | 1307.3 |
| generic-dynamic-raw   | candidate  |       1275.6 | 1181.9 | 1337.1 | 1142.8 | 1528.1 |
| collision-dynamic-raw | production |       1025.0 | 1013.3 | 1056.7 |  999.2 | 1133.8 |
| collision-dynamic-raw | candidate  |        957.0 |  949.8 |  992.1 |  942.0 | 1031.1 |
| all-dynamic-raw       | production |        961.7 |  936.3 |  989.1 |  931.6 | 1104.3 |
| all-dynamic-raw       | candidate  |        905.0 |  890.0 |  957.0 |  877.0 |  979.1 |

## Candidate / production ratios

| comparison                 |   ratio | candidate delta |
| -------------------------- | ------: | --------------: |
| static-only raw            | 1.0156x |        +12.4 ns |
| mixed static raw           | 1.0060x |         +4.8 ns |
| mixed dynamic raw          | 1.0019x |         +1.8 ns |
| mixed dynamic JSON         | 1.0078x |         +5.7 ns |
| pure trailing dynamic raw  | 0.9173x |        -79.2 ns |
| pure trailing dynamic JSON | 0.8630x |       -110.4 ns |
| generic dynamic raw        | 1.0599x |        +72.1 ns |
| forced collision raw       | 0.9336x |        -68.0 ns |
| ALL dynamic raw            | 0.9411x |        -56.7 ns |

## Frozen gate result

| gate                       | candidate / production |        limit | result   |
| -------------------------- | ---------------------: | -----------: | -------- |
| static-only raw            |                1.0156x | `<= 1.0200x` | PASS     |
| mixed static raw           |                1.0060x | `<= 1.0200x` | PASS     |
| mixed dynamic raw guard    |                1.0019x | `<= 1.0200x` | PASS     |
| mixed dynamic JSON guard   |                1.0078x | `<= 1.0200x` | PASS     |
| mixed dynamic geomean      |                1.0049x | `<= 0.9800x` | **FAIL** |
| pure trailing dynamic raw  |                0.9173x | `<= 0.9400x` | PASS     |
| pure trailing dynamic JSON |                0.8630x | `<= 0.9500x` | PASS     |
| generic dynamic raw        |                1.0599x | `<= 1.0300x` | **FAIL** |
| forced collision raw       |                0.9336x | `<= 1.1500x` | PASS     |
| ALL dynamic raw            |                0.9411x | `<= 1.0500x` | PASS     |

## Interpretation

1. The full-request-URL offset mechanism is real in production-shaped `Gelis.fetch()` when the method table has no static routes. Pure trailing-param raw improves by `79.2 ns` (`0.9173x`) and pure trailing-param JSON improves by `110.4 ns` (`0.8630x`).
2. ALL fallback also benefits materially (`0.9411x`) and the forced-collision path remains both correct and faster (`0.9336x`). The source shape therefore does not invalidate the offset mechanism itself.
3. Mixed dynamic does not improve. The candidate must materialize `pathname = url.slice(pathStart, pathEnd)` whenever `table.staticRoutes.size !== 0` so exact static lookup can retain precedence. It then performs the full-URL trailing lookup after already paying the pathname-substring cost. The authoritative mixed geomean is `1.0049x`, failing the frozen `<= 0.9800x` acceptance requirement.
4. Generic dynamic regresses to `1.0599x`. In the candidate, URL scheme/authority/path boundaries are parsed first and the code then materializes pathname and enters the existing generic trie. This adds offset-parser work to a path that cannot exploit trailing full-URL matching.
5. CP4-B must not be rerun or have its frozen thresholds changed. The exact candidate is rejected.
6. The next investigation should separate the two blockers: generic tables should be tested with an early fallback to the established pathname path, while mixed trailing tables require a way to preserve exact static precedence without unconditionally materializing the pathname substring. A static discriminator or exact static side index is a decomposition target before another production candidate is justified.

## Classification

**CP4-B LOCAL PRODUCTION URL-OFFSET ACCEPTANCE: VALID / AUTHORITATIVE / FAIL.**
