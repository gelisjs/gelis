# Competitive Performance v0.1 — CP2-H HTTP Crown Supplement Freeze

**Status:** FROZEN BEFORE CP2-H TIMING  
**Parent protocol:** `docs/benchmarks/competitive-cp2-core-crown-freeze.md`  
**Authoritative CP2-D evidence:** `docs/benchmarks/competitive-cp2d-local-authoritative.md`  
**Frozen Gelis production source:** `1dd5f94cf0e9ad884ca44e537ee287587cd8baab`  
**Bun:** `1.4.2`  
**oha:** `1.16.0`

This supplement freezes the CP2-H details that were intentionally left unspecified in the parent CP2 freeze. No CP2-H timing had been executed when this file was created.

## Lanes

The real-HTTP matrix includes:

- raw `Bun.serve({ routes })` reference ceiling;
- Gelis;
- Hono `4.13.7`;
- Elysia `1.4.30` default;
- Elysia `1.4.30` with `precompile: true`;
- Elysia `2.0.0-beta.14` source runtime;
- Elysia `2.0.0-beta.14` official build-time AOT artifact.

Raw Bun is a ceiling/reference, not a framework competitor.

## Workloads

Each lane owns exactly `5,000` routes for each independent workload:

1. static raw;
2. dynamic raw;
3. static JSON;
4. dynamic JSON.

The timed request targets the last registered route and uses the same response contracts already accepted in CP1 and CP2-D.

## Elysia 2 AOT

AOT is built separately for each of the four workloads with all `5,000` routes present at build time. The generated server artifact is built once before the timed matrix and then started fresh for every sample. Build time itself is not part of CP2-H request-throughput timing.

The AOT dependency island must contain package `elysia@2.0.0-beta.14` under its real package name; the invalid alias/stable-resolution coexistence experiment from CP1 is not reused.

## HTTP sampling

For every `(comparator, workload)` cell:

- `7` mirrored fresh-server pairs;
- pair order alternates by sample;
- even pair: Gelis then comparator;
- odd pair: comparator then Gelis;
- a new server process is started for every side of every pair;
- readiness and exact response correctness are verified before load;
- untimed warmup: `1s`, `10` connections;
- measured interval: `5s`, `50` connections;
- `oha --wait-ongoing-requests-after-deadline` is used;
- success rate must be exactly `1`;
- primary ratio is the median of pairwise `Gelis req/s / comparator req/s` values;
- Gelis-first and comparator-first medians are retained as order diagnostics;
- absolute median req/s and p50/p95/p99 latency diagnostics are retained.

No performance gate exists. An unfavorable valid result is evidence, not a failed test.

## Correctness guard

Every fresh server is verified before warmup:

- status exactly `200`;
- body bytes exactly equal the frozen workload response;
- raw media type normalizes to `text/plain`;
- JSON media type normalizes to `application/json`;
- `Content-Encoding` absent.

A correctness failure invalidates that harness execution before promotable timing for the affected sample.

## Environment and identity guards

The acceptance harness must reject timing unless:

- Bun is exactly `1.4.2`;
- oha reports `1.16.0`;
- repository worktree is clean;
- `src/**` has no diff from Gelis production source `1dd5f94cf0e9ad884ca44e537ee287587cd8baab`;
- Hono is exactly `4.13.7`;
- Elysia stable is exactly `1.4.30`;
- Elysia next is exactly `2.0.0-beta.14`;
- Elysia AOT island is exactly `2.0.0-beta.14`.

## Authority

Only the first valid run on the user's local Windows / Intel i5-10500H machine is authoritative CP2-H performance evidence. CI may build AOT artifacts and run correctness/type/format probes but must not run or promote HTTP timing as authoritative evidence.
