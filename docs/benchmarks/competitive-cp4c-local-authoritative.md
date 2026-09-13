# Competitive Performance v0.1 — CP4-C local authoritative decomposition

## Identity

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- CPU: Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz
- Harness SHA: `d1c2a00e331b828203c6e76e2e8b1649a37e8175`
- Production source: `af4e5102046def1b163435333563b8d08f919bf5`
- Rejected CP4-B source: `ca7543b46ad68b89a9d2b10d29e052993b216758`
- CP4-C diagnostic source: `f6a1345ca5bee07870fbaa3d42321ed84439bf67`
- Routes: `5,000`
- Samples: `11` rotated fresh-worker samples per variant/cell

## Three-source decomposition cells

| cell | variant | median | p25 | p75 | min | max | unit |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| static-only-raw | production | 798.5 | 785.9 | 807.1 | 777.2 | 863.7 | ns/op |
| static-only-raw | cp4b | 799.7 | 791.0 | 810.9 | 781.1 | 976.4 | ns/op |
| static-only-raw | cp4c | 816.4 | 804.5 | 831.8 | 782.6 | 864.2 | ns/op |
| mixed-static-raw | production | 794.9 | 791.8 | 808.0 | 773.0 | 838.5 | ns/op |
| mixed-static-raw | cp4b | 798.4 | 792.7 | 804.7 | 784.6 | 841.6 | ns/op |
| mixed-static-raw | cp4c | 809.3 | 798.7 | 821.8 | 788.8 | 851.2 | ns/op |
| mixed-dynamic-raw | production | 944.7 | 942.7 | 968.8 | 921.0 | 1046.3 | ns/op |
| mixed-dynamic-raw | cp4b | 947.0 | 936.8 | 970.3 | 931.3 | 986.8 | ns/op |
| mixed-dynamic-raw | cp4c | 881.8 | 876.7 | 886.4 | 851.4 | 900.1 | ns/op |
| mixed-dynamic-json | production | 720.2 | 714.7 | 733.6 | 709.9 | 768.5 | ns/op |
| mixed-dynamic-json | cp4b | 724.1 | 715.6 | 744.4 | 694.7 | 763.8 | ns/op |
| mixed-dynamic-json | cp4c | 676.4 | 662.8 | 706.6 | 657.2 | 880.2 | ns/op |
| mixed-same-length-dynamic-raw | production | 950.1 | 948.1 | 957.9 | 939.5 | 981.6 | ns/op |
| mixed-same-length-dynamic-raw | cp4b | 959.8 | 942.5 | 973.1 | 933.4 | 1107.4 | ns/op |
| mixed-same-length-dynamic-raw | cp4c | 955.4 | 940.4 | 975.2 | 925.7 | 1020.3 | ns/op |
| trailing-dynamic-raw | production | 954.2 | 935.3 | 983.8 | 928.1 | 995.9 | ns/op |
| trailing-dynamic-raw | cp4b | 888.0 | 868.3 | 900.1 | 853.5 | 920.6 | ns/op |
| trailing-dynamic-raw | cp4c | 865.5 | 857.7 | 879.3 | 848.5 | 966.9 | ns/op |
| trailing-dynamic-json | production | 730.0 | 722.3 | 768.0 | 716.8 | 781.1 | ns/op |
| trailing-dynamic-json | cp4b | 680.3 | 662.6 | 700.9 | 654.2 | 806.1 | ns/op |
| trailing-dynamic-json | cp4c | 678.9 | 668.1 | 686.2 | 661.9 | 803.8 | ns/op |
| generic-dynamic-raw | production | 1138.6 | 1134.2 | 1186.5 | 1115.3 | 1305.1 | ns/op |
| generic-dynamic-raw | cp4b | 1162.2 | 1154.9 | 1194.0 | 1121.0 | 1308.9 | ns/op |
| generic-dynamic-raw | cp4c | 1168.2 | 1147.0 | 1220.8 | 1135.6 | 1300.6 | ns/op |
| static-registration | production | 1.236 | 1.227 | 1.361 | 1.205 | 2.339 | ms |
| static-registration | cp4b | 1.260 | 1.240 | 1.325 | 1.200 | 1.663 | ms |
| static-registration | cp4c | 1.271 | 1.267 | 1.397 | 1.119 | 1.545 | ms |
| static-memory | production | 619117 | 619005 | 619117 | 619005 | 619453 | bytes |
| static-memory | cp4b | 619118 | 619118 | 619454 | 619006 | 619454 | bytes |
| static-memory | cp4c | 618270 | 618158 | 618270 | 618139 | 618606 | bytes |

## Ratios by source transition

| comparison | CP4-B / production | CP4-C / production | CP4-C / CP4-B | CP4-C - CP4-B |
| --- | ---: | ---: | ---: | ---: |
| static-only raw | 1.0014x | 1.0224x | 1.0209x | +16.7 ns |
| mixed static raw | 1.0044x | 1.0181x | 1.0136x | +10.9 ns |
| mixed length-miss dynamic raw | 1.0025x | 0.9335x | 0.9312x | -65.2 ns |
| mixed length-miss dynamic JSON | 1.0054x | 0.9393x | 0.9342x | -47.6 ns |
| mixed same-length dynamic raw | 1.0101x | 1.0056x | 0.9955x | -4.3 ns |
| pure trailing dynamic raw | 0.9306x | 0.9071x | 0.9747x | -22.5 ns |
| pure trailing dynamic JSON | 0.9319x | 0.9299x | 0.9979x | -1.4 ns |
| generic dynamic raw | 1.0207x | 1.0260x | 1.0052x | +6.0 ns |
| static registration | 1.0194x | 1.0282x | 1.0087x | +0.011 ms |
| static retained heap delta | 1.0000x | 0.9986x | 0.9986x | -848 bytes |

## Mechanism diagnostics

| diagnostic | ratio | interpretation |
| --- | ---: | --- |
| mixed length-miss raw CP4-C/CP4-B | 0.9312x | strong discriminator recovery |
| mixed length-miss JSON CP4-C/CP4-B | 0.9342x | strong discriminator recovery |
| mixed length-miss geomean CP4-C/CP4-B | 0.9327x | aggregate discriminator recovery |
| mixed same-length raw CP4-C/CP4-B | 0.9955x | exact-static fallback remains near parity |
| generic raw CP4-C/CP4-B | 1.0052x | early fallback does not materially improve this sample |
| static-only raw CP4-C/CP4-B | 1.0209x | static-only tables should not pay discriminator lookup |
| mixed static raw CP4-C/CP4-B | 1.0136x | mixed static-hit overhead is modest but real |
| trailing raw CP4-C/CP4-B | 0.9747x | pure-dynamic win preserved |
| trailing JSON CP4-C/CP4-B | 0.9979x | pure-dynamic win preserved |
| static registration CP4-C/CP4-B | 1.0087x | Set maintenance adds small registration cost |
| static heap CP4-C/CP4-B | 0.9986x | retained heap is effectively neutral in this run |

## Interpretation

1. The static path-length discriminator restores the full-URL offset win for mixed tables when the request pathname length cannot match any installed static route: CP4-C reaches `0.9335x` raw and `0.9393x` JSON versus production.
2. The same-length guard behaves correctly. When a static exact lookup is still required, CP4-C remains near production (`1.0056x`) rather than obtaining an invalid win by skipping precedence.
3. The remaining static-only overhead (`1.0224x`) is avoidable because a method table with no trailing fast routes has no reason to enter the full-URL/discriminator path at all.
4. The `Set<number>` itself is not justified as the final production representation. The diagnostic established that negative length discrimination works; a cheaper range discriminator can preserve correctness while reducing static-hit, registration, and metadata cost.
5. Generic routing remains around `1.0260x` versus production in this sample. The next candidate should bypass URL-offset logic for generic tables and retain a conservative generic guard.
6. CP4-B remains rejected. CP4-C is decomposition evidence only and does not imply promotion.

## Classification

**CP4-C LOCAL STATIC PATH-LENGTH DISCRIMINATOR: VALID / AUTHORITATIVE / ACCEPTED AS DECOMPOSITION EVIDENCE.**
