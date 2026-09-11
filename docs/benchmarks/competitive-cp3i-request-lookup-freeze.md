# Competitive Performance v0.1 — CP3-I Request Lookup Strategy Freeze

Date: 2026-09-11

## Purpose

CP3-H isolated a large request-derived path penalty and showed that most of the remaining dynamic-route gap appears only after `Request.url` is converted into a pathname and that pathname participates in routing.

CP3-I tests whether inexpensive existing mechanisms can remove most of that cost before any production router redesign is attempted.

No production source is changed in this phase.

## Frozen production source

`98d8c00bfda8913a951bdf8780e136672646a90c`

## Environment

- Bun 1.4.2 required.
- 5,000 routes per routing scenario.
- 11 fresh worker processes per timing cell.
- Local machine timing is authoritative.
- GitHub CI is correctness and reproducibility evidence only.

## Cells

CP3-I measures four groups.

### URL extraction lower bounds

- index-only request URL path bounds without pathname substring materialization;
- current `pathnameFromUrl(request.url)`;
- a deliberately minimal request-URL pathname extractor used only as an architectural lower bound.

The minimal extractor is not a production candidate and does not establish full URL semantic equivalence.

### Lookup structure

- request-derived static path lookup through `Map`;
- the same lookup through a null-prototype object dictionary;
- request-derived trailing-prefix lookup through `Map`;
- the same trailing-prefix lookup through a null-prototype object dictionary.

### Existing Gelis routing structures

- the current trailing-parameter fast-map router with a stable pathname;
- the current generic dynamic trie with a stable pathname;
- the current trailing-parameter fast-map router with a request-derived pathname;
- the current generic dynamic trie with a request-derived pathname.

The generic-trie scenario contains exactly 5,000 routes: one dummy multi-parameter route forces generic mode and the remaining 4,999 routes are trailing-parameter routes. The measured target remains `/r/4999/:id`.

### Handler dispatch

The same trailing-map and generic-trie scenarios are measured through synchronous handler dispatch for stable and request-derived pathname input.

## Correctness gate

Every timing cell has a correctness probe. Timing is forbidden until:

1. `bun run check` succeeds;
2. `--probe-only` succeeds for all 18 cells;
3. GitHub Quality succeeds on the same harness SHA;
4. the worktree is clean;
5. `src/**` remains identical to the frozen production source.

## Interpretation rules

The measurements are non-additive.

A null-prototype object dictionary is interesting only if it materially improves request-derived lookup without creating a meaningful stable-path or memory regression in a later candidate gate.

The existing generic trie is interesting only if it materially reduces the fresh-path penalty enough to offset any regression it introduces on stable-path direct dispatch.

The minimal pathname extractor and index-only path bounds are lower-bound probes only. They cannot be promoted without separate semantic coverage for absolute URLs, queries, fragments, supported schemes, percent encoding, and portability.

If neither existing lookup structures nor a narrower extractor explain a practical path to removing most of the CP3-H penalty, the next phase should prototype routing directly over the full request URL or path bounds without materializing and hashing a complete pathname string.
