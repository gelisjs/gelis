# CP4-AN — ALL-only method-miss elision viability freeze

## Purpose

CP4-AN tests a new composition on top of CP4-AK: preserve AK's canonical request-URL matcher and static-leading-mask behavior, while removing the guaranteed concrete-method miss for routers whose only method table is the ALL (`*`) table.

This phase is viability-only. Passing does not imply production promotion; it only permits a later direct production acceptance phase. The first valid completed local timing run is authoritative.

## Frozen identities

```text
CP4-AK control: 658c22c0d12322e278d996f47c4373831d61ba9b
CP4-AN candidate: 8734bc5a88749f107efd5925f70e304370261d17
Routes: 5,000
Bun: 1.4.2
Bun revision: 744846f844374847c902b5e7fd59b4342a51ef99
Authoritative CPU: Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz
```

Candidate source differs from CP4-AK only in:

```text
src/runtime/router-all.ts
src/runtime/router.ts
```

The canonical CP4-AK `matchRequestUrl()` implementation remains unchanged. CP4-AN adds a separate ALL-fallback entry point used only after `app.all()` activates the wrapper. When the router contains only the ALL method table, it directly calls the canonical matcher for `*`; when concrete method tables exist, it preserves exact-method-first then ALL-fallback behavior.

## Frozen protocol

- 8 cells:
  - static-only raw
  - mixed-static raw
  - mixed-dynamic raw
  - mixed same-length dynamic raw
  - pure trailing dynamic raw
  - generic dynamic raw
  - ALL dynamic raw
  - static registration
- 4 blocks.
- 6 mirrored fresh-worker pairs per block.
- 24 measurements per source per cell.
- Every block contains exactly 3 `control→candidate` and 3 `candidate→control` pairs.
- Local correctness probe must pass 16/16 before timing.
- CI may run correctness-only probes; CI timing is not acceptance evidence.
- No rerun because a result is close, noisy, surprising, or unfavorable.

## Frozen viability gates

All ratios are direct `CP4-AN candidate / CP4-AK control` from the same authoritative run.

```text
static-only raw                 <= 1.0200x
mixed-static raw                <= 1.0100x
mixed-dynamic raw               <= 1.0200x
mixed same-length dynamic raw   <= 1.0200x
pure trailing dynamic raw       <= 1.0200x
generic dynamic raw             <= 1.0200x
ALL dynamic raw                 <= 0.9850x
static registration             <= 1.0200x
```

`ALL dynamic raw <= 0.9850x` is the primary recovery requirement. Every guard must pass. A failure of any gate rejects the exact candidate at viability.

## Interpretation contract

- CP4-AK remains an authoritative failed viability candidate and is used only as the direct control.
- CP4-AL and CP4-AM remain authoritative failed candidates; CP4-AN does not reopen them.
- Ratios from earlier runs must not be multiplied into this result.
- A PASS permits only a later direct production acceptance under separately frozen production gates.
- A FAIL closes this exact candidate without rerun or post-hoc threshold changes.
