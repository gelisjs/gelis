# Competitive Performance v0.1 — CP4-N local authoritative sub-lineage attribution

## Identity

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- CPU: Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz
- Harness SHA: `feddd461121c37918f279c5f17f0991d276c1d8c`
- Production source: `af4e5102046def1b163435333563b8d08f919bf5`
- CP4-B source: `ca7543b46ad68b89a9d2b10d29e052993b216758`
- CP4-C source: `f6a1345ca5bee07870fbaa3d42321ed84439bf67`
- CP4-D source: `5d9e5672031ff0ec468052f1d82c55e10b5387d7`
- CP4-E source: `f18e43623eeafe6356248b174b3ae2112bcc8e82`
- CP4-F source: `1e19a185eafbe271125eb73fc9f389413345ea8b`
- Routes: `5,000`
- Samples: `12` balanced fresh-worker sextets per cell
- Local correctness probe: `PASS (42/42)`

## Direct ratios vs production

| comparison | CP4-B | CP4-C | CP4-D | CP4-E | CP4-F |
| --- | ---: | ---: | ---: | ---: | ---: |
| static-only raw | 1.0105x | 1.0322x | 1.0391x | 1.0220x | 1.0131x |
| mixed static raw | 0.9985x | 1.0305x | 1.0457x | 0.9953x | 1.0150x |
| mixed dynamic raw | 0.9670x | 0.8733x | 0.8780x | 0.9199x | 0.9074x |
| mixed dynamic JSON | 0.9850x | 0.9330x | 0.9297x | 0.9216x | 0.9308x |
| pure trailing dynamic raw | 0.9252x | 0.9153x | 0.9219x | 0.9106x | 0.9179x |
| generic dynamic raw | 1.0169x | 1.0379x | 1.0453x | 1.0359x | 1.0246x |
| ALL dynamic raw | 0.9397x | 0.9442x | 0.9377x | 0.9460x | 0.9401x |

## Adjacent sub-lineage ratios

| comparison | production -> CP4-B | CP4-B -> CP4-C | CP4-C -> CP4-D | CP4-D -> CP4-E | CP4-E -> CP4-F |
| --- | ---: | ---: | ---: | ---: | ---: |
| static-only raw | 1.0105x | 1.0215x | 1.0066x | 0.9836x | 0.9913x |
| mixed-static raw | 0.9985x | 1.0320x | 1.0148x | 0.9518x | 1.0198x |

Frozen attribution boundary: `> 1.0200x` versus production.

- Static-only first crossing: `CP4-B -> CP4-C`.
- Mixed-static first crossing: `CP4-B -> CP4-C`.

## Interpretation

1. CP4-N narrows the first reproducible static regression to the exact CP4-B -> CP4-C transition.
2. CP4-C introduced the static pathname-length discriminator and its registration metadata. The dynamic win is real: mixed dynamic raw improves from CP4-B `0.9670x` to CP4-C `0.8733x` versus production, while mixed dynamic JSON improves from `0.9850x` to `0.9330x`.
3. The same transition also pushes static-only from `1.0105x` to `1.0322x` and mixed-static from `0.9985x` to `1.0305x` versus production. Therefore the discriminator representation/read path is the first source segment that must be optimized.
4. CP4-D worsens the same static tradeoff in this run. CP4-E then recovers mixed-static strongly to `0.9953x`, proving ordering/lane selection matters, but later CP4-F adds part of the cost back (`1.0150x`).
5. The current CP4-I direct production result from CP4-M remains the relevant composed target: mixed-static `1.0237x`, only slightly outside the frozen production limit `1.0200x`. A next candidate should preserve upper-bound negative discrimination while reducing metadata reads/dispatch overhead.
6. No rerun is authorized merely to obtain a more favorable result.

## Classification

**CP4-N LOCAL MIXED-STATIC SUB-LINEAGE ATTRIBUTION: VALID / AUTHORITATIVE / ATTRIBUTION COMPLETE.**
