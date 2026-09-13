# CP4-AO ALL-only method-miss elision — authoritative production acceptance evidence

## Classification

**VALID / AUTHORITATIVE / PASS / ELIGIBLE FOR PRODUCTION PROMOTION**

This was the first valid completed local timed CP4-AO direct-production acceptance run. It is authoritative and must not be rerun for result selection.

The result makes the exact candidate eligible for production promotion. It does not by itself mutate or promote production source.

## Frozen identities

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- CPU: `Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz`
- Harness SHA: `c41431f9e8279ea8430f99baca4bba691cacc38d`
- Production source: `af4e5102046def1b163435333563b8d08f919bf5`
- CP4-AK attribution source: `658c22c0d12322e278d996f47c4373831d61ba9b`
- CP4-AO candidate source: `8734bc5a88749f107efd5925f70e304370261d17`
- Routes: `5,000`
- Balanced fresh-worker triplets/cell: `12`

Local correctness probe before timing: **PASS (36/36)**.

## Authoritative direct-production timing

| cell                          | production median | CP4-AK median | candidate median | candidate / production | frozen limit | result |
| ----------------------------- | ----------------: | ------------: | ---------------: | ---------------------: | -----------: | ------ |
| static-only raw               |       784.0 ns/op |   801.8 ns/op |      788.6 ns/op |                1.0058x |   <= 1.0200x | PASS   |
| mixed static raw              |       801.2 ns/op |   823.1 ns/op |      806.8 ns/op |                1.0070x |   <= 1.0200x | PASS   |
| mixed dynamic raw             |       986.8 ns/op |   878.4 ns/op |      878.4 ns/op |                0.8901x |   <= 1.0200x | PASS   |
| mixed dynamic JSON            |       732.1 ns/op |   682.5 ns/op |      688.0 ns/op |                0.9398x |   <= 1.0200x | PASS   |
| mixed same-length dynamic raw |       946.5 ns/op |   869.7 ns/op |      875.6 ns/op |                0.9251x |   <= 1.0200x | PASS   |
| pure trailing dynamic raw     |       964.2 ns/op |   882.9 ns/op |      882.0 ns/op |                0.9148x |   <= 0.9400x | PASS   |
| pure trailing dynamic JSON    |       743.8 ns/op |   670.9 ns/op |      674.1 ns/op |                0.9062x |   <= 0.9500x | PASS   |
| generic dynamic raw           |      1175.1 ns/op |  1153.5 ns/op |     1160.2 ns/op |                0.9873x |   <= 1.0300x | PASS   |
| forced collision raw          |      1045.1 ns/op |   977.6 ns/op |      970.9 ns/op |                0.9289x |   <= 1.1500x | PASS   |
| ALL dynamic raw               |       959.4 ns/op |   878.1 ns/op |      874.7 ns/op |                0.9117x |   <= 1.0500x | PASS   |
| static registration           |          1.275 ms |      1.256 ms |         1.236 ms |                0.9690x |   <= 1.0500x | PASS   |
| static retained heap          |      619117 bytes |  618519 bytes |     618368 bytes |                0.9988x |   <= 1.0500x | PASS   |

Mixed dynamic raw/JSON geomean: `0.9146x` against frozen limit `<= 0.9800x` — **PASS**.

**CP4-AO ALL-ONLY METHOD-MISS ELISION DIRECT PRODUCTION ACCEPTANCE GATE: PASS**

## Same-run attribution

| comparison                    | AK / production | candidate / production | candidate / AK |
| ----------------------------- | --------------: | ---------------------: | -------------: |
| static-only raw               |         1.0227x |                1.0058x |        0.9835x |
| mixed static raw              |         1.0273x |                1.0070x |        0.9802x |
| mixed dynamic raw             |         0.8901x |                0.8901x |        1.0000x |
| mixed dynamic JSON            |         0.9323x |                0.9398x |        1.0080x |
| mixed same-length dynamic raw |         0.9189x |                0.9251x |        1.0068x |
| pure trailing dynamic raw     |         0.9158x |                0.9148x |        0.9989x |
| pure trailing dynamic JSON    |         0.9019x |                0.9062x |        1.0048x |
| generic dynamic raw           |         0.9816x |                0.9873x |        1.0058x |
| forced collision raw          |         0.9354x |                0.9289x |        0.9931x |
| ALL dynamic raw               |         0.9153x |                0.9117x |        0.9961x |
| static registration           |         0.9851x |                0.9690x |        0.9836x |
| static retained heap delta    |         0.9990x |                0.9988x |        0.9998x |

## Interpretation

CP4-AO is the first candidate in the CP4-AI → CP4-AK → CP4-AN line to satisfy every frozen direct-production gate simultaneously.

The result confirms that the static-leading-mask line can retain near-production static behavior while preserving large dynamic and trailing-route gains. The ALL-only method-miss elision also survives direct production comparison: candidate ALL dynamic raw is `0.9117x` production while static-only raw remains `1.0058x` and mixed static raw remains `1.0070x`.

The exact source `8734bc5a88749f107efd5925f70e304370261d17` is therefore eligible for the production-promotion procedure. Promotion must preserve this exact source tree, run the normal repository Quality gate, and retain this evidence without changing the frozen benchmark classification.
