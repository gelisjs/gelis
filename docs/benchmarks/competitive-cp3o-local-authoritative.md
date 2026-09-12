# Competitive Performance v0.1 — CP3-O local authoritative result

## Classification

**CP3-O LOCAL TRAILING RADIX VIABILITY: VALID / AUTHORITATIVE / FAIL.**

This is a valid unfavorable result. The run completed normally on the frozen harness and must not be rerun merely because the candidate failed.

## Identity

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- CPU: Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz
- Harness SHA: `5bfdcb2510208dfc990edf9c236b319fa44f97b8`
- Frozen production source: `8e43aad09759d60378b3fc174292850057ccfba3`
- Routes: `5,000`
- Samples: `11` mirrored fresh-worker pairs per cell pair

## Timed cells

| cell                          | median ns/op |   p25 |   p75 |   min |   max |
| ----------------------------- | -----------: | ----: | ----: | ----: | ----: |
| current-trailing-stable       |         48.6 |  48.2 |  51.0 |  47.3 |  54.0 |
| radix-trailing-stable         |        119.6 | 118.9 | 121.1 | 118.0 | 126.0 |
| current-trailing-request      |        211.1 | 209.0 | 213.0 | 207.3 | 219.5 |
| radix-trailing-request        |        214.9 | 211.1 | 219.1 | 208.0 | 252.3 |
| current-pipeline-string       |        786.7 | 782.2 | 803.6 | 779.3 | 853.5 |
| radix-pipeline-string         |        802.9 | 793.6 | 817.1 | 779.8 | 893.2 |
| current-pipeline-json         |        606.3 | 597.0 | 612.0 | 592.7 | 621.3 |
| radix-pipeline-json           |        607.0 | 599.3 | 614.5 | 597.0 | 692.6 |
| current-mixed-static-request  |        103.9 | 101.6 | 105.7 |  98.9 | 106.7 |
| radix-mixed-static-request    |        113.5 | 112.3 | 113.9 | 110.3 | 133.5 |
| current-mixed-dynamic-request |        218.2 | 213.8 | 221.9 | 210.5 | 237.2 |
| radix-mixed-dynamic-request   |        221.2 | 216.9 | 227.6 | 213.0 | 228.8 |

## Candidate/current ratios

| comparison                        |   ratio | delta ns |
| --------------------------------- | ------: | -------: |
| trailing stable pathname          | 2.4609x | +71.0 ns |
| trailing request-derived pathname | 1.0182x |  +3.8 ns |
| string pipeline                   | 1.0207x | +16.3 ns |
| JSON pipeline                     | 1.0012x |  +0.7 ns |
| mixed static request              | 1.0925x |  +9.6 ns |
| mixed dynamic request             | 1.0136x |  +3.0 ns |

## Frozen gates

| gate                    | candidate/current |      limit | result |
| ----------------------- | ----------------: | ---------: | ------ |
| request-derived dynamic |           1.0182x | <= 0.8500x | FAIL   |
| pipeline geomean        |           1.0109x | <= 0.9700x | FAIL   |
| mixed dynamic request   |           1.0136x | <= 0.9000x | FAIL   |
| mixed static request    |           1.0925x | <= 1.0200x | FAIL   |
| stable-path diagnostic  |           2.4609x |        n/a | INFO   |

All four frozen viability gates failed.

## Conclusions

1. The exact compressed character-prefix radix prototype does not justify production complexity and is rejected.
2. Character-by-character JavaScript traversal is especially expensive on already-stable strings: the candidate is about `2.46x` the current matcher there.
3. Avoiding the fresh prefix substring/hash did not create a request-derived win; the radix candidate was still about `1.8%` slower.
4. The candidate did not recover its cost in production-shaped string or JSON pipelines.
5. Mixed static routing regressed about `9.3%`, violating the requirement that an optimization for trailing params must not tax exact static hits materially.
6. CP3-O does not prove that every non-string-key index is inferior. It specifically rejects a full compressed character-prefix walk in JavaScript for this hot path.
7. The next viable class of experiments should avoid both full-prefix fresh-string hashing and full character-by-character traversal. A fixed-cost non-allocating fingerprint/index with exact collision verification is a narrower hypothesis worth measuring before any production source change.
