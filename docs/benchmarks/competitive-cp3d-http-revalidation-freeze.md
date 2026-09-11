# Competitive Performance v0.1 — CP3-D HTTP Revalidation Freeze

**Status:** FROZEN BEFORE CP3-D TIMING  
**Parent protocol:** `docs/benchmarks/competitive-cp2h-http-freeze.md`  
**Previous authoritative HTTP/direct evidence:** `docs/benchmarks/competitive-cp2d-local-authoritative.md`  
**Accepted CP3-C candidate source:** `9af3f056c004151473ef6ad5535600ba47f39e0a`  
**Previous production source:** `1dd5f94cf0e9ad884ca44e537ee287587cd8baab`  
**Bun:** `1.4.2`  
**oha:** `1.16.0`

CP3-C established same-run causal evidence that removing the redundant explicit status-200 `ResponseInit` from ordinary JSON success normalization materially reduces Gelis normalization and integrated pipeline cost. CP3-D asks a separate question: does that accepted micro-level optimization improve real HTTP Core Crown behavior without regressing raw lanes?

No CP3-D timing had been executed when this freeze was created.

## Frozen change under evaluation

Relative to production source `1dd5f94cf0e9ad884ca44e537ee287587cd8baab`, CP3-C changes production code only in:

- `src/runtime/response.ts`

Ordinary successful object responses now use Bun's default-status `Response.json(value)` path. Explicit `reply.status(...)` responses continue through `normalizeResponseWithStatus`, and raw `Response`, direct `undefined`, string responses, bodyless statuses, response contracts, and HEAD suppression retain their existing semantics.

## Protocol inheritance

CP3-D inherits the CP2-H HTTP protocol without changing workload or comparator semantics:

- raw `Bun.serve({ routes })` reference ceiling;
- Gelis CP3-C candidate;
- Hono `4.13.7`;
- Elysia `1.4.30` default;
- Elysia `1.4.30` with `precompile: true`;
- Elysia `2.0.0-beta.14` source runtime;
- Elysia `2.0.0-beta.14` official build-time AOT artifact;
- `5,000` routes;
- static raw, dynamic raw, static JSON, dynamic JSON;
- `7` mirrored fresh-server pairs per comparator/workload cell;
- alternating pair order;
- response correctness before every warmup;
- untimed warmup `1s` / `10` connections;
- measured interval `5s` / `50` connections;
- `oha --wait-ongoing-requests-after-deadline`;
- success rate exactly `1`;
- primary ratio median of pairwise `Gelis req/s / comparator req/s`;
- p50/p95/p99 and order-split ratios retained as diagnostics.

Comparator versions, route count, request targets, response bodies, connection count, durations, pair ordering, and correctness requirements are deliberately unchanged after observing CP3-C.

## Acceptance interpretation

CP3-D is evidence, not a benchmark-to-pass-by-any-means gate.

The CP3-C production candidate remains accepted at the micro/pipeline level because its same-run baseline comparison already established the causal improvement. CP3-D determines whether the optimization should be promoted as an HTTP Core Crown improvement.

Interpretation rules:

1. JSON lanes are the expected beneficiary. Improvement must be evaluated from the first valid local run; an unfavorable result is retained.
2. Raw lanes are regression guards. The optimization should not materially degrade static-raw or dynamic-raw behavior because those paths bypass JSON normalization.
3. Comparator ratios are evaluated as workload evidence, not universal framework superiority claims.
4. Cross-run absolute throughput versus historical CP2-H evidence is secondary because machine state can drift. Mirrored same-run competitor ratios and raw-lane controls are retained to diagnose drift.
5. Raw Bun remains a runtime ceiling/reference, not a framework competitor.

## Environment and identity guards

The acceptance harness must reject timing unless:

- Bun is exactly `1.4.2`;
- oha reports `1.16.0`;
- repository worktree is clean;
- `src/**` is identical to accepted CP3-C source `9af3f056c004151473ef6ad5535600ba47f39e0a`;
- Hono is exactly `4.13.7`;
- Elysia stable is exactly `1.4.30`;
- Elysia next is exactly `2.0.0-beta.14`;
- Elysia AOT island is exactly `2.0.0-beta.14`.

CI may install, typecheck, build AOT artifacts, and execute correctness probes, but must not execute or promote CP3-D timing as authoritative performance evidence.

## Authority

Only the first valid CP3-D run on the user's local Windows / Intel i5-10500H machine is authoritative CP3-D performance evidence. Do not rerun merely because results are unfavorable or surprising.
