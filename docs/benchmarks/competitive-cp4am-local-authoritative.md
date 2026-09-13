# CP4-AM — AK + inline ALL fallback viability — authoritative local result

## Classification

**VALID / AUTHORITATIVE / FAIL / REJECTED AT VIABILITY / ACCEPTED AS COMPOSITION EVIDENCE**

This phase is viability-only. It does not promote production source and does not reopen prior CP4 classifications.

## Frozen identity

```text
Bun:             1.4.2
Revision:        744846f844374847c902b5e7fd59b4342a51ef99
CPU:             Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz
Harness SHA:     0d0220a340f308438b99ab4dd28014a21b1cd354
CP4-AK source:   658c22c0d12322e278d996f47c4373831d61ba9b
Candidate src:   b14c3a4e3c8cfb07c1461a0cf66a189c8b6ddb2b
Routes:          5,000
Blocks:          4
Pairs/block:     6
Samples/source:  24 fresh-worker measurements/cell
Order:           3 control→candidate + 3 candidate→control pairs per block
```

Local correctness probe completed first and passed 16/16.

## Authoritative medians

```text
cell                           AK control   candidate   unit
static-only-raw                801.1        803.4       ns/op
mixed-static-raw               819.8        810.2       ns/op
mixed-dynamic-raw              889.2        871.2       ns/op
mixed-same-length-dynamic-raw  865.1        892.2       ns/op
trailing-dynamic-raw           880.8        888.3       ns/op
generic-dynamic-raw            1176.6       1176.8      ns/op
all-dynamic-raw                887.6        880.8       ns/op
static-registration            1.256        1.240       ms
```

## Frozen gate result

```text
gate                           candidate / AK   limit       result
static-only raw                1.0029x          <= 1.0200x  PASS
mixed static raw               0.9883x          <= 1.0100x  PASS
mixed dynamic raw              0.9798x          <= 1.0200x  PASS
mixed same-length dynamic raw  1.0314x          <= 1.0200x  FAIL
pure trailing dynamic raw      1.0085x          <= 1.0200x  PASS
generic dynamic raw            1.0002x          <= 1.0200x  PASS
ALL dynamic raw                0.9924x          <= 0.9850x  FAIL
static registration            0.9878x          <= 1.0200x  PASS
```

The first valid completed local timing run is authoritative. No rerun is permitted to select a different outcome.

## Blockwise attribution

```text
comparison                     block 1   block 2   block 3   block 4   faster blocks
static-only raw                0.9430x   0.9863x   1.0080x   1.0481x   2/4
mixed static raw               1.0037x   0.9944x   1.0044x   0.9742x   2/4
mixed dynamic raw              0.9886x   0.9797x   0.9674x   0.9645x   4/4
mixed same-length dynamic raw  0.9741x   1.0185x   1.0489x   1.0552x   1/4
pure trailing dynamic raw      1.0455x   1.0164x   0.9966x   0.9808x   2/4
generic dynamic raw            0.9864x   0.9955x   1.0202x   1.0113x   2/4
ALL dynamic raw                0.9920x   0.9968x   0.9964x   0.9625x   4/4
static registration            0.9940x   1.0131x   0.9668x   0.9837x   3/4
```

## Interpretation

The AK + inline ALL table-miss composition does not satisfy the frozen viability contract.

The inline fallback is directionally useful for ALL: the candidate is faster in all four ALL blocks and improves the overall ALL median to 0.9924x versus AK. However, the required material recovery was <= 0.9850x, so the primary ALL gate still fails.

The composition also introduces a reproducible same-length dynamic regression: overall 1.0314x, with the candidate faster in only one of four blocks. This secondary failure independently rejects the candidate.

Other lanes remain acceptable: static-only stays effectively neutral, mixed-static and mixed-dynamic improve, generic remains neutral, and registration improves slightly. Those wins do not override either frozen failure.

Therefore candidate `b14c3a4e3c8cfb07c1461a0cf66a189c8b6ddb2b` must not advance unchanged. CP4-AK remains rejected at viability; CP4-AL and earlier classifications remain unchanged.

## Decision

- No rerun.
- No gate adjustment.
- No production promotion.
- Preserve CP4-AM as evidence that inline ALL table-miss fallback has a real positive ALL signal but is insufficient at the required threshold and perturbs same-length dynamic code shape.
- The next experiment must avoid adding table-miss fallback work to the shared canonical matcher hot shape while retaining AK's static-leading-mask gains.
