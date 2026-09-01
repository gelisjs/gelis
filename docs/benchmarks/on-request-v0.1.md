# Gelis onRequest Benchmark v0.1

**Status:** Accepted.

## Purpose

This benchmark measures the cost of global request interception and compares equivalent native mechanisms across:

- Gelis;
- Hono;
- Elysia;
- Elysia with precompile enabled.

The benchmark accompanies the accepted `onRequest` Architecture v0.1.

## Runtime environment

```text
Runtime:      Bun 1.4.0
oha:          1.16.0
CPU:          Intel Core i5-10500H @ 2.50 GHz
Routes:       5000
Connections:  50
Samples:      7
Warmup:       2 seconds
Duration:     10 seconds
```

Framework versions:

```text
Hono:                      4.13.5
@hono/standard-validator:  0.4.0
Elysia:                    1.4.30
```

Framework execution order is rotated between samples.

All registered routes are prewarmed before measurement.

## Framework mapping

### Gelis

Uses:

```ts
app.onRequest(...)
```

Gelis executes this phase before route matching.

### Elysia

Uses its native:

```ts
app.onRequest(...)
```

This is the closest semantic comparison to Gelis because it is also an early global request lifecycle phase.

### Hono

Hono does not expose an equivalent dedicated pre-routing `onRequest` lifecycle primitive.

The benchmark therefore uses its closest native global request interception mechanism:

```ts
app.use(...)
```

The Hono result must be described as global middleware performance rather than as proof of identical internal lifecycle semantics.

No artificial adapter is introduced to make the APIs look identical.

## Workload

Cases:

```text
plain
on-request-sync
two-on-request-sync
three-on-request-sync
on-request-async
validation-on-request
early-return
```

Each request hook performs the same minimal observable phase work.

The early-return case registers route handlers that throw if executed, verifying that request interception actually stops normal route execution.

## HTTP throughput

Accepted medians:

| Case                      |  Gelis |   Hono | Gelis vs Hono |
| ------------------------- | -----: | -----: | ------------: |
| plain                     | 16,410 | 16,210 |        +1.23% |
| 1 sync request hook       | 16,326 | 15,478 |        +5.47% |
| 2 sync request hooks      | 16,398 | 15,634 |        +4.89% |
| 3 sync request hooks      | 16,345 | 15,483 |        +5.57% |
| async request hook        | 15,759 | 14,992 |        +5.11% |
| validation + request hook | 15,813 | 14,203 |       +11.33% |
| early return              | 17,208 | 15,557 |       +10.61% |

The two-hook and three-hook values come from isolated filtered reruns because the original mixed full run contained system-level outliers.

No samples were manually deleted from the accepted isolated runs.

## Elysia comparison

Accepted median throughput:

| Case                      |  Gelis | Elysia | Elysia precompile |
| ------------------------- | -----: | -----: | ----------------: |
| plain                     | 16,410 | 10,308 |            10,373 |
| 1 sync request hook       | 16,326 |  9,964 |            10,224 |
| 2 sync request hooks      | 16,398 | 10,025 |            10,352 |
| 3 sync request hooks      | 16,345 | 10,019 |            10,343 |
| async request hook        | 15,759 |  9,492 |             9,946 |
| validation + request hook | 15,813 |  9,426 |             9,604 |
| early return              | 17,208 | 10,081 |            10,506 |

Gelis remained ahead of both tested Elysia modes on this local workload.

## Multi-hook stability reruns

### Two sync hooks

```text
Gelis              16,398 req/s   CV 1.95%
Hono               15,634 req/s   CV 1.06%
Elysia             10,025 req/s   CV 1.68%
Elysia precompile  10,352 req/s   CV 0.78%
```

Gelis vs Hono:

```text
+4.89%
```

### Three sync hooks

```text
Gelis              16,345 req/s   CV 2.27%
Hono               15,483 req/s   CV 4.45%
Elysia             10,019 req/s   CV 2.44%
Elysia precompile  10,343 req/s   CV 2.65%
```

Gelis vs Hono:

```text
+5.57%
```

Hono contained one lower sample in this rerun, but the median remained consistent with the other samples and no result was discarded.

## Gelis relative overhead

Using the full-run Gelis plain result as the HTTP reference:

```text
plain                  16,410 req/s

1 sync hook            16,326
2 sync hooks           16,398
3 sync hooks           16,345
async hook             15,759
validation + hook      15,813
early return           17,208
```

The sync-hook results remain effectively near the plain HTTP throughput ceiling of this machine.

The early-return case is faster because Gelis can return before routing.

It should not be interpreted as additional routing throughput.

## Runtime microbenchmark

A separate fresh-process-per-case benchmark isolates request executor overhead from HTTP stack cost.

Accepted results:

| Scenario                  | ns/op |
| ------------------------- | ----: |
| plain sync                |   137 |
| one sync request hook     |   141 |
| two sync request hooks    |   152 |
| three sync request hooks  |   155 |
| late request hook         |   141 |
| validation only           |   492 |
| validation + request hook |   485 |
| plain async handler       |   360 |
| async request hook        |   372 |
| async early return        |   209 |

The final executor specialization reduced the second-hook penalty from an earlier experimental result of approximately +54 ns to approximately +11 ns.

That earlier number is not an accepted baseline.

## Interpretation

The benchmark supports the following conclusions for this workload and machine:

1. Enabling one synchronous Gelis `onRequest` hook has very low runtime overhead.
2. Two- and three-hook specialized plans scale without a large composition penalty.
3. Async request interception remains close to the corresponding async baseline.
4. Validation composition remains healthy.
5. Pre-routing early return successfully avoids normal route dispatch.
6. Applications that do not enable the feature retain the existing Gelis fetch path.

These results are local benchmark evidence, not a universal performance guarantee across all applications, machines, runtimes, or workloads.

## Result

`onRequest` Performance Benchmark v0.1 is accepted and frozen as the baseline for the first Gelis global pre-routing lifecycle implementation.
