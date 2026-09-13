# Competitive Performance v0.1 — CP4-Q deferred upper-bound dispatch viability freeze

## Purpose

CP4-N identified mixed-static as the reproducible residual and showed that CP4-E ordering recovered that lane strongly before CP4-F FastMapKind specialization added part of the cost back. CP4-O and CP4-P then showed that packing the discriminator metadata, including changing its numeric polarity, does not recover mixed-static.

CP4-Q therefore isolates request-dispatch control flow rather than metadata representation. The candidate starts from exact CP4-I source, retains CP4-I registration metadata and its upper-bound-only static negative discrimination, but removes the FastMapKind branch chain from `matchRequestUrl()` and restores CP4-E-style ordering: generic-trie fallback first, exact-static upper-bound check after URL offsets, then trailing metadata.

This is a direct CP4-I control-versus-candidate decomposition. No CP4-O or CP4-P ratio chaining is used for acceptance.

## Frozen identity

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- Control source: `c18f231374d0008b7cc3e01bacbf9f81aff9a273`
- Candidate source: `b268a99f58e6c055ed0255c30ea16783f85fb5f3`
- Routes: `5,000`
- Samples: `11` mirrored fresh-worker pairs per cell pair
- Timed cells: `10` request-dispatch cells
- Correctness probes: `20/20` required before timing

## Frozen gates

- static-only raw guard: `<= 1.0200x`
- mixed-static recovery: `<= 0.9963x`
- mixed dynamic raw guard: `<= 1.0200x`
- mixed dynamic JSON guard: `<= 1.0200x`
- mixed same-length dynamic raw guard: `<= 1.0200x`
- pure trailing dynamic raw guard: `<= 1.0200x`
- pure trailing dynamic JSON guard: `<= 1.0200x`
- generic dynamic raw guard: `<= 1.0200x`
- forced collision raw guard: `<= 1.0200x`
- ALL dynamic raw guard: `<= 1.0200x`

Registration and retained-heap cells are intentionally excluded because CP4-Q changes only request dispatch; registration metadata is retained from CP4-I unchanged.

## Harness note

The CP4-Q worker is a thin import wrapper over the frozen CP4-P worker engine. The underlying worker implementation is unchanged; CP4-Q changes only orchestration identity, candidate source, selected request cells, and frozen gates. The worker still receives an explicit source root for each fresh control/candidate process.

## Protocol

The first valid completed local timed run on the authoritative machine is evidence as-is. Do not rerun because the result is unfavorable. Do not change source, harness, sample count, or gates after timing begins.

A PASS is decomposition evidence only. It authorizes later direct production revalidation; it does not itself promote production.
