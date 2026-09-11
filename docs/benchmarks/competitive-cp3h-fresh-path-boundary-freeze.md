# Competitive Performance v0.1 — CP3-H Fresh-Path Boundary Freeze

Date: 2026-09-11

## Purpose

CP3-G showed that parameter object shape and handler handoff do not explain the remaining dynamic-path penalty. CP3-H isolates the boundary between `Request.url`, pathname extraction, string materialization, route lookup, and handler dispatch.

No production source is changed in this phase.

## Frozen production source

`98d8c00bfda8913a951bdf8780e136672646a90c`

## Environment

- Bun 1.4.2 required.
- 5,000 routes.
- 11 fresh worker processes per timing cell.
- Local machine timing is authoritative.
- GitHub CI is correctness/reproducibility evidence only.

## Cells

CP3-H measures:

- direct `Request.url` access for static and dynamic URLs;
- pathname extraction from stable URL constants;
- pathname extraction from `request.url`;
- plain static `Map.get` with stable pathname versus request-derived pathname;
- plain trailing-prefix `Map.get` with stable prefix versus request-derived prefix;
- Gelis static and trailing-param router lookup with stable pathname versus request-derived pathname;
- handler dispatch with pre-extracted pathname versus pathname extracted from `request.url` inside the measured operation.

## Correctness gate

Every timing cell has a correctness probe. Timing is forbidden until:

1. `bun run check` succeeds;
2. `--probe-only` succeeds for all cells;
3. GitHub Quality succeeds on the same harness SHA;
4. the worktree is clean;
5. `src/**` remains identical to the frozen production source.

## Interpretation rule

The cells are decomposition evidence and are non-additive. The key decision is whether request-derived pathname materialization materially increases route lookup and dispatch cost relative to stable pathname strings.

If the fresh-path penalty is large and repeatable, the next candidate may specialize the URL-to-router boundary. If it is small, CP3-H must reject that hypothesis and continue decomposing another stage.

No production optimization may be accepted from CP3-H alone.