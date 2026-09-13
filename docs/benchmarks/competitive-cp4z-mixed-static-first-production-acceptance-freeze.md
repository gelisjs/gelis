# Competitive Performance v0.1 — CP4-Z Mixed-Static-First Direct Production Acceptance Freeze

Date: 2026-09-13

Production source: `af4e5102046def1b163435333563b8d08f919bf5`.

CP4-Z candidate source: `1b4057ad9d12bc28d2ab2ca7917924368fe99444`.

Runtime is Bun `1.4.2`, revision `744846f844374847c902b5e7fd59b4342a51ef99`, with `5,000` routes and `12` mirrored fresh-worker pairs per cell pair. Pair order is balanced 6/6.

Production thresholds are unchanged from CP4-Y / CP4-J: static-only `<=1.0200x`; mixed static `<=1.0200x`; mixed dynamic raw `<=1.0200x`; mixed dynamic JSON `<=1.0200x`; mixed dynamic geomean `<=0.9800x`; mixed same-length `<=1.0200x`; trailing raw `<=0.9400x`; trailing JSON `<=0.9500x`; generic raw `<=1.0300x`; collision `<=1.1500x`; ALL `<=1.0500x`; registration `<=1.0500x`; retained heap `<=1.0500x`.

PASS requires every gate to pass in the first valid completed local timed run. CI timing is non-authoritative.
