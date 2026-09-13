# Competitive Performance v0.1 — CP4-X generic table request specialization balanced acceptance freeze

## Purpose

CP4-V balanced attribution showed CP4-U as the most stable basis across the key composition cells. In the later CP4-W balanced acceptance run, the CP4-U attribution anchor passed nine of ten frozen cells and missed only generic dynamic raw at `1.0210x` versus the frozen `<= 1.0200x` guard.

CP4-X therefore returns production semantics to exact CP4-U for `router-all.ts` and targets the generic URL path directly. In CP4-U, `matchRequestUrl()` resolves a `MethodRoutes` table and, when `usesDynamicTrie` is true, delegates to `this.match(method, pathname)`. That delegation performs a second method-map lookup and repeats capability dispatch before entering the generic trie.

CP4-X replaces that delegation with a table-local generic matcher. It preserves static precedence inside generic method tables and then enters the same generic trie/parameter decoding logic using the already-resolved table.

This is a new source candidate. CP4-U remains an attribution anchor only and is not eligible for retroactive acceptance.

## Frozen identity

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- CP4-I control: `c18f231374d0008b7cc3e01bacbf9f81aff9a273`
- CP4-U attribution anchor: `d00e9aa92bf36f59a4182d4602ca46392f5b3686`
- CP4-X candidate: `efaa228231c920fee78053edeb5c8c094f324aca`
- Routes: `5,000`
- Samples: `12` balanced fresh-worker triplets per cell
- Balance: all six source permutations repeated twice per cell
- Correctness probes required before local timing: `30/30`

## Frozen cells and gates

- static-only raw: `<= 1.0200x`
- mixed-static recovery: `<= 0.9963x`
- mixed dynamic raw: `<= 1.0200x`
- mixed dynamic JSON: `<= 1.0200x`
- mixed same-length dynamic raw: `<= 1.0200x`
- pure trailing dynamic raw: `<= 1.0200x`
- pure trailing dynamic JSON: `<= 1.0200x`
- generic dynamic raw: `<= 1.0200x`
- forced collision raw: `<= 1.0200x`
- ALL dynamic raw: `<= 1.0200x`

Acceptance is based only on direct `CP4-X / CP4-I` ratios. `CP4-U` is present solely as a same-run attribution anchor.

## Protocol

The first valid completed local timed run on the authoritative machine is evidence as-is. Do not rerun because the result is favorable, unfavorable, or close to a boundary. Do not change source, harness, sample count, balance, or gates after timing begins.

A full PASS authorizes direct production revalidation. It does not itself promote production.
