# CP4-AN ALL-only method-miss elision — authoritative viability evidence

## Classification

**VALID / AUTHORITATIVE / PASS / ELIGIBLE FOR DIRECT PRODUCTION ACCEPTANCE**

This phase is viability-only. No production promotion is inferred from this result.

The first valid completed local timed run is authoritative. It must not be rerun for result selection.

## Frozen identities

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- CPU: `Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz`
- Harness SHA: `c11cf8e3ef84afba8b6eaf702e7639dcf898c51e`
- CP4-AK control source: `658c22c0d12322e278d996f47c4373831d61ba9b`
- CP4-AN candidate source: `8734bc5a88749f107efd5925f70e304370261d17`
- Routes: `5,000`
- Blocks: `4`
- Pairs/block: `6`
- Samples/source/cell: `24` fresh-worker measurements
- Pair order/block: `3 control→candidate + 3 candidate→control`

Local correctness probe before timing: **PASS (16/16)**.

## Authoritative local timing

| cell                          | control median | candidate median | candidate / AK | frozen limit | result |
| ----------------------------- | -------------: | ---------------: | -------------: | -----------: | ------ |
| static-only raw               |    787.5 ns/op |      798.5 ns/op |        1.0140x |   <= 1.0200x | PASS   |
| mixed static raw              |    812.5 ns/op |      819.7 ns/op |        1.0089x |   <= 1.0100x | PASS   |
| mixed dynamic raw             |    894.1 ns/op |      877.3 ns/op |        0.9812x |   <= 1.0200x | PASS   |
| mixed same-length dynamic raw |    868.5 ns/op |      878.6 ns/op |        1.0116x |   <= 1.0200x | PASS   |
| pure trailing dynamic raw     |    873.7 ns/op |      873.7 ns/op |        0.9999x |   <= 1.0200x | PASS   |
| generic dynamic raw           |   1170.9 ns/op |     1173.1 ns/op |        1.0019x |   <= 1.0200x | PASS   |
| ALL dynamic raw               |    886.7 ns/op |      873.1 ns/op |        0.9847x |   <= 0.9850x | PASS   |
| static registration           |       1.256 ms |         1.240 ms |        0.9868x |   <= 1.0200x | PASS   |

**CP4-AN ALL-ONLY METHOD-MISS ELISION VIABILITY GATE: PASS**

## Blockwise candidate / AK ratios

| comparison                    | block 1 | block 2 | block 3 | block 4 | candidate-faster blocks |
| ----------------------------- | ------: | ------: | ------: | ------: | ----------------------: |
| static-only raw               | 1.0138x | 1.0043x | 1.0098x | 0.9911x |                     1/4 |
| mixed static raw              | 1.0037x | 0.9916x | 1.0135x | 0.9997x |                     2/4 |
| mixed dynamic raw             | 1.0018x | 0.9931x | 0.9425x | 0.9826x |                     3/4 |
| mixed same-length dynamic raw | 1.0276x | 1.0273x | 1.0009x | 0.9852x |                     1/4 |
| pure trailing dynamic raw     | 0.9954x | 0.9975x | 1.0201x | 1.0086x |                     2/4 |
| generic dynamic raw           | 0.9735x | 1.0036x | 1.0036x | 1.0360x |                     1/4 |
| ALL dynamic raw               | 1.0193x | 0.9446x | 1.0046x | 0.9792x |                     2/4 |
| static registration           | 0.9864x | 0.9850x | 0.9741x | 1.0040x |                     3/4 |

## Interpretation

CP4-AN is the first AK-derived ALL recovery candidate to satisfy every frozen viability gate. The primary ALL gate passed narrowly at `0.9847x` against `<= 0.9850x`; this remains a valid pass because the threshold was frozen before timing and this was the first valid completed local run.

The mechanism preserves the AK static-leading-mask line while eliminating the guaranteed concrete-method miss for an ALL-only router topology. The result is sufficient to advance the exact candidate to a direct production acceptance phase. It is not sufficient by itself to promote the source to production.
