# Competitive Performance v0.1 — CP2 Core Crown Freeze

**Status:** FROZEN BEFORE TIMING  
**Parent CP1 acceptance SHA:** `8aae26f546a52013e78fccf419dda8849a79a5c7`  
**Frozen Gelis production source:** `1dd5f94cf0e9ad884ca44e537ee287587cd8baab`  
**Bun:** `1.4.2`  
**Hono:** `4.13.7`  
**Elysia stable:** `1.4.30`  
**Elysia next:** `2.0.0-beta.14`

## Purpose

CP2 measures the successful core HTTP path after CP1 proved semantic equivalence. It does not change production source and it does not establish universal framework superiority.

Two measurement domains are kept separate:

1. **CP2-D — direct dispatch**: framework public fetch/dispatch cost without sockets.
2. **CP2-H — real HTTP**: Bun server + loopback TCP with an external load generator.

Direct-dispatch numbers and HTTP throughput numbers must never be combined into one aggregate.

## Evidence authority

The authoritative performance evidence is the first valid run on the user's local Windows / Intel i5-10500H machine.

GitHub Actions may validate formatting, typechecking, correctness probes, build reproducibility, and harness execution shape. GitHub-hosted timing is supplemental only and must not be promoted as authoritative performance evidence.

A valid local run is not repeated merely because a result is unfavorable or noisy. A rerun is allowed only when the original run is harness-invalid or externally invalidated, and that invalid evidence must be retained.

## Frozen workloads

All framework lanes use the CP1 response contracts:

| workload | request target | response body |
| --- | --- | --- |
| static raw | `/r/<last>` | `GET` |
| dynamic raw | `/r/<last>/value-42` | `value-42` |
| static JSON | `/r/<last>` | `{"method":"GET","route":<last>}` |
| dynamic JSON | `/r/<last>/value-42` | `{"method":"GET","id":"value-42"}` |

No compression, middleware, validation, body parsing, CORS, secure headers, request ID, timeout, or other production policy is enabled in CP2.

The request method is GET. Query strings are excluded from timed requests because CP1 already proved query-insensitive route matching and CP2 isolates dispatch/serialization cost.

## CP2-D — direct dispatch crown

### Framework lanes

Direct dispatch includes only framework modes with a public/runtime dispatch API that can be measured without starting a socket server:

- Gelis
- Hono 4.13.7
- Elysia 1.4.30 default
- Elysia 1.4.30 `precompile: true`
- Elysia 2.0.0-beta.14 source runtime

Raw `Bun.serve({ routes })` is **not** represented in CP2-D because Bun's native server route table has no equivalent public direct-dispatch API. Inventing a synthetic Bun router would not be a fair ceiling.

Elysia 2 build-time AOT is not used in CP2-D. Its official deployment artifact is evaluated in CP2-H, where the generated server artifact is exercised in its intended environment.

### Route-count matrix

Each workload is measured independently at:

```text
1
100
1,000
5,000 routes
```

The timed target is the final registered route in the selected matrix.

### Pairing and sampling

Gelis is the reference lane for pairwise direct measurements.

For every `(competitor, route-count, workload)` cell:

- 11 mirrored fresh-process pairs;
- pair order alternates by sample;
- even samples: Gelis then competitor;
- odd samples: competitor then Gelis;
- each worker performs its own warmup and calibration;
- worker process exits after one measured cell;
- pooled result is the median pairwise latency ratio;
- control-first and competitor-first ratio medians are retained as order diagnostics.

The primary direct ratio is:

```text
competitor ns/op / Gelis ns/op
```

Interpretation:

- `> 1.0000x`: Gelis is faster on that workload/cell;
- `< 1.0000x`: competitor is faster on that workload/cell;
- `= 1.0000x`: equal measured latency.

Absolute median ns/op for both sides is also retained.

No per-case performance gate exists: CP2 is a measurement phase, not a benchmark that Gelis is allowed to pass only when it wins.

### Sync and async completion

The worker measures the framework's actual public dispatch completion semantics.

- If the selected dispatch path completes synchronously, the synchronous timing loop is used.
- If it returns a Promise/thenable, the async timing loop awaits each request sequentially.

The harness must report which completion mode was observed. It must not force Gelis or a competitor through an artificial Promise solely to equalize implementation style.

### Warmup and calibration

For synchronous dispatch:

```text
warmup: 20,000 operations
target measured duration: ~120 ms
minimum calibration interval: 20 ms
```

For asynchronous dispatch:

```text
warmup: 2,000 awaited operations
target measured duration: ~120 ms
minimum calibration interval: 20 ms
```

The exact calibrated iteration count is recorded by every worker.

### Correctness guard

Before timing, every worker validates one fresh direct-dispatch request.

Direct dispatch and final HTTP header normalization are intentionally distinguished:

- status must be exactly `200`;
- response body bytes must exactly match the CP1 body contract;
- `Content-Encoding` must be absent;
- JSON direct responses must expose media type `application/json`;
- raw direct responses may expose no `Content-Type` because a plain Web `Response(string)` does not itself require one; if raw `Content-Type` is present it must normalize to `text/plain`.

Final over-the-wire media-type equivalence remains covered by CP1 and is revalidated in CP2-H. A direct framework must not be penalized or rewarded for server-layer header normalization that is outside the direct-dispatch domain.

This clarification was frozen after the first CP2-D correctness-only probe showed that Gelis direct `new Response("GET")` correctly returned the expected status/body but no `Content-Type`. No timing had been executed, so no candidate performance result existed when this protocol clarification was made.

If correctness fails, the worker fails and emits no promotable timing.

## CP2-H — real HTTP crown and raw Bun ceiling

### Framework lanes

CP2-H includes:

- raw `Bun.serve({ routes })` reference/ceiling
- Gelis
- Hono 4.13.7
- Elysia 1.4.30 default
- Elysia 1.4.30 `precompile: true`
- Elysia 2.0.0-beta.14 source runtime
- Elysia 2.0.0-beta.14 build-time AOT

Raw Bun is a reference ceiling, not a framework competitor.

### Route count

The crown HTTP workload uses exactly `5,000` routes for each of the four CP1 core cases. The direct matrix already quantifies route-count sensitivity at 1/100/1,000/5,000.

### Load generator

Frozen local load-generator target:

```text
oha 1.16.0
connections: 50
```

The harness must fail before timing if Bun is not `1.4.2` or if the detected `oha` version is not `1.16.0`.

### Pairing and sampling

For each framework-vs-Gelis HTTP cell:

- 7 mirrored fresh-server pairs;
- pair order alternates;
- a new framework server process is started for every sample;
- readiness is probed before load generation;
- one short untimed warmup request phase occurs before the measured load;
- throughput is taken from `oha` JSON output;
- median pairwise throughput ratio is primary;
- order-split diagnostics are retained.

Raw Bun is measured with the same fresh-server and load-generator settings and reported as a separate ceiling ratio.

The primary framework HTTP ratio is:

```text
Gelis requests/sec / competitor requests/sec
```

Interpretation:

- `> 1.0000x`: Gelis has higher measured throughput;
- `< 1.0000x`: competitor has higher measured throughput.

No performance result is discarded because it is unfavorable.

## Environment and source identity guards

Before any local timing is accepted, the harness must verify:

- Bun exactly `1.4.2`;
- competitive root lockfile is frozen;
- Elysia 2 AOT dependency-island lockfile is frozen;
- repository `src/**` is byte-identical to production source `1dd5f94cf0e9ad884ca44e537ee287587cd8baab`;
- the benchmark worktree is clean;
- package versions match the frozen comparator identities.

## Reporting boundary

CP2 may establish only workload-specific statements such as:

> On this machine, Bun version, route-count, workload, and benchmark protocol, Gelis measured X times the throughput / Y times the latency of comparator Z.

CP2 must not be summarized as "Gelis is universally faster than Hono/Elysia/Bun."

## Sequence

1. freeze this document;
2. implement CP2-D worker/acceptance harness without changing the frozen protocol;
3. validate harness correctness and repository Quality without authoritative timing;
4. run CP2-D once locally and preserve the first valid result;
5. implement/validate CP2-H against the same frozen semantics;
6. run CP2-H once locally and preserve the first valid result;
7. record a CP2 acceptance/report document with exact SHAs and both result domains kept separate.
