# Gelis onError Benchmark v0.1

**Status:** Accepted.

## Purpose

This benchmark measures the runtime and HTTP cost of global error interception and compares equivalent observable error-handling workloads across:

- Gelis;
- Hono;
- Elysia;
- Elysia with precompile enabled.

The benchmark accompanies the accepted `onError` Architecture v0.1.

The primary goals are:

1. verify that applications without `onError` retain the plain Gelis execution path;
2. measure successful-request overhead when `onError` is enabled but unused;
3. measure synchronous handled errors;
4. measure asynchronous handler rejections;
5. measure asynchronous `onError` handlers;
6. measure errors originating from the global request phase;
7. verify the final optimized execution plans against the pre-optimization baseline.

## Runtime environment

HTTP benchmark:

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
Hono:    4.13.5
Elysia:  1.4.30
```

Framework execution order is rotated between samples.

All cases use the same machine and benchmark harness.

## Framework mapping

### Gelis

Uses:

```ts
app.onError(({ request, error }) => {
  return new Response("handled");
});
```

Gelis implements `onError` as an application-level boundary around `onRequest` and routed execution.

### Hono

Uses its native global error-handler mechanism.

The HTTP comparison uses one global error handler because this is the common observable workload supported naturally by both frameworks.

Hono exposes a single global error-handler slot rather than Gelis-style ordered multiple global handlers.

Multi-handler Gelis execution is therefore measured separately in the Gelis runtime benchmark and is not presented as a cross-framework parity case.

### Elysia

Uses its native error lifecycle.

Both normal Elysia mode and Elysia precompile mode are measured.

The benchmark explicitly sets the intended successful handled-error status where required so all frameworks return equivalent successful benchmark responses.

## Workload

The accepted HTTP cases are:

```text
plain
on-error-unused
handler-error-sync
handler-error-async
async-on-error
request-phase-error
```

### `plain`

No error lifecycle is registered.

This establishes the HTTP ceiling for the same route set.

### `on-error-unused`

A global error handler is registered, but the route completes successfully.

This measures the successful request cost of an enabled but unused error boundary.

### `handler-error-sync`

The route handler synchronously throws a preallocated error.

The global error handler converts it into the same successful observable response across frameworks.

### `handler-error-async`

The route handler returns an asynchronous rejection using the same preallocated error.

The global error handler converts the rejection into the handled response.

### `async-on-error`

The route throws synchronously, but the registered error handler resolves asynchronously.

This isolates the cost of crossing an asynchronous boundary inside error handling.

### `request-phase-error`

An error is produced during the global request interception phase and handled by the global error lifecycle.

This case requires a framework-mechanism fairness caveat because Hono does not expose a dedicated pre-routing primitive equivalent to Gelis `onRequest`.

## Error construction

Handled error cases use preallocated errors.

The benchmark does not repeatedly construct a new `Error` merely to inflate exception-path allocation cost.

Conceptually:

```ts
const HANDLER_ERROR = new Error("benchmark handler error");
```

and the same error object is thrown or rejected repeatedly during measurement.

This keeps the benchmark focused on framework execution behavior.

## HTTP throughput

Accepted full-run medians:

| Case                |  Gelis |   Hono | Gelis vs Hono |
| ------------------- | -----: | -----: | ------------: |
| plain               | 16,935 | 16,735 |        +1.20% |
| on-error-unused     | 16,999 | 16,788 |        +1.26% |
| handler-error-sync  | 15,869 | 15,771 |        +0.62% |
| handler-error-async | 15,696 | 14,015 |       +12.00% |
| async-on-error      | 15,516 | 15,493 |        +0.15% |
| request-phase-error | 16,813 | 15,267 |       +10.12% |

Small differences around one percent are treated as near parity rather than as meaningful performance wins.

The accepted interpretation is therefore:

```text
plain
-> Gelis / Hono near parity

on-error-unused
-> Gelis / Hono near parity
-> no measurable HTTP throughput penalty

handler-error-sync
-> Gelis / Hono near parity

handler-error-async
-> Gelis materially faster in this local workload

async-on-error
-> Gelis / Hono near parity

request-phase-error
-> Gelis materially faster in this local workload
-> fairness caveat applies
```

## Elysia comparison

Accepted full-run medians:

| Case                |  Gelis | Elysia | Elysia precompile |
| ------------------- | -----: | -----: | ----------------: |
| plain               | 16,935 | 10,659 |            10,805 |
| on-error-unused     | 16,999 | 10,592 |            10,810 |
| handler-error-sync  | 15,869 |  9,782 |            10,018 |
| handler-error-async | 15,696 |  9,596 |             9,765 |
| async-on-error      | 15,516 |  9,685 |             9,764 |
| request-phase-error | 16,813 |  9,851 |            10,290 |

Gelis remained ahead of both tested Elysia modes for every measured case on this machine and workload.

These results are local benchmark evidence rather than universal framework rankings.

## HTTP latency and variance

Accepted full-run Gelis results:

| Case                |    CV |      p50 |      p95 |      p99 |
| ------------------- | ----: | -------: | -------: | -------: |
| plain               | 0.69% | 2.822 ms | 4.174 ms | 6.876 ms |
| on-error-unused     | 3.30% | 2.819 ms | 4.178 ms | 6.921 ms |
| handler-error-sync  | 0.48% | 2.992 ms | 4.737 ms | 7.211 ms |
| handler-error-async | 1.02% | 3.022 ms | 4.636 ms | 7.264 ms |
| async-on-error      | 0.66% | 3.055 ms | 4.836 ms | 7.300 ms |
| request-phase-error | 0.59% | 2.830 ms | 4.302 ms | 6.816 ms |

The `on-error-unused` full run contained one lower Gelis sample and therefore showed higher variance than the surrounding cases.

That case was repeated independently instead of deleting or manually excluding the sample.

## Isolated HTTP verification

Two cases received isolated filtered reruns:

```text
on-error-unused
handler-error-sync
```

These were selected because:

- `on-error-unused` contained higher variance in the full run;
- `handler-error-sync` was the primary optimization target relative to Hono.

No samples were manually removed.

### Unused onError

Accepted isolated result:

```text
Gelis
median     17,002 req/s
min        16,707 req/s
max        17,429 req/s
CV          1.24%

Hono
median     16,903 req/s
min        16,513 req/s
max        17,162 req/s
CV          1.32%
```

Observed Gelis difference:

```text
+0.59%
```

This is treated as near parity.

The isolated run confirms that an enabled but unused single Gelis `onError` handler does not impose a measurable HTTP throughput penalty on this workload.

### Synchronous handled error

Accepted isolated result:

```text
Gelis
median     16,175 req/s
min        16,006 req/s
max        16,315 req/s
CV          0.61%

Hono
median     16,057 req/s
min        15,429 req/s
max        16,296 req/s
CV          1.73%
```

Observed Gelis difference:

```text
+0.73%
```

This is also treated as near parity.

The final conclusion remains:

```text
Gelis synchronous handled error
≈
Hono synchronous handled error
```

for this HTTP workload.

## Gelis success-path overhead

The full-run Gelis results were:

```text
plain              16,935 req/s
on-error-unused    16,999 req/s
```

Observed difference:

```text
+0.38%
```

An unused error handler does not actually make request execution intrinsically faster.

The positive difference is benchmark variation.

The supported conclusion is:

> Enabling one unused `onError` handler introduced no measurable HTTP throughput penalty in this run.

This is the important result for Gelis' zero-unused-overhead architecture.

## Runtime microbenchmark

A separate benchmark isolates Gelis request execution from the Bun HTTP server and load-generator overhead.

Each scenario runs in a fresh Bun process to reduce cross-case JIT contamination.

Final representative results:

| Scenario                            | Mode       | ns/op |
| ----------------------------------- | ---------- | ----: |
| plain-sync                          | sync       |   138 |
| on-error-unused-sync                | sync       |   134 |
| two-on-error-unused-sync            | sync       |   138 |
| three-on-error-unused-sync          | sync       |   162 |
| handler-error-handled-sync          | sync       |   876 |
| handler-error-unhandled-sync        | sync throw | 1,246 |
| handler-error-async-on-error        | async      | 1,296 |
| plain-async-handler                 | async      |   358 |
| on-error-unused-async-handler       | async      |   397 |
| two-on-error-unused-async-handler   | async      |   396 |
| three-on-error-unused-async-handler | async      |   411 |
| async-handler-error-handled         | async      |   442 |
| on-request-error-handled            | sync       |   641 |

The response-normalization-error diagnostic is intentionally omitted from the primary table because it measures an unusually expensive circular JSON serialization failure rather than normal request-path behavior.

## Multi-handler execution plans

The accepted Gelis plan is:

```text
0 handlers
-> original routed fetch

1 handler
-> specialized single-handler boundary

2 handlers
-> specialized successful-request boundary
-> cold ordered error executor

3+ handlers
-> generic ordered error plan
```

The final successful synchronous results were:

```text
1 handler    134 ns
2 handlers   138 ns
3 handlers   162 ns
```

The final successful asynchronous-handler results were:

```text
plain        358 ns
1 handler    397 ns
2 handlers   396 ns
3 handlers   411 ns
```

The second registered error handler is therefore approximately free relative to the first on the measured asynchronous successful path and adds only a few nanoseconds in the synchronous run.

The three-handler configuration retains the generic-plan penalty.

## Three-handler optimization investigation

A dedicated three-handler specialization was investigated during the optimization phase.

Several hypotheses were tested, including:

```text
captured cold-plan state size

object property call behavior

repeated fetch replacement

Object.defineProperty replacement

direct final-fetch invocation

captured final-fetch invocation
```

Synthetic boundary diagnostics did not reproduce the full real-application three-hook cliff.

A paired same-application diagnostic reduced the apparent difference substantially, showing that some earlier results were sensitive to JIT and benchmark shape.

However, repeated isolated Gelis benchmarks still produced a consistent real three-hook successful-path penalty.

Representative repeated synchronous results:

```text
run 1
1 hook    133 ns
2 hooks   137 ns
3 hooks   162 ns

run 2
1 hook    133 ns
2 hooks   133 ns
3 hooks   158 ns

run 3
1 hook    133 ns
2 hooks   132 ns
3 hooks   158 ns
```

The three-hook increment remained approximately:

```text
+24 to +26 ns
```

in those isolated runs.

The dedicated triple specialization therefore did not provide enough stable benefit to justify additional production complexity.

The accepted implementation uses the generic plan for three or more error handlers.

## Pre-optimization runtime baseline

Before the final optimization pass, representative runtime results were:

```text
plain-sync                         147 ns
on-error-unused-sync               152 ns

handler-error-handled-sync         989 ns
handler-error-unhandled-sync      1354 ns
handler-error-async-on-error      1337 ns

plain-async-handler                387 ns
on-error-unused-async-handler      467 ns
async-handler-error-handled        474 ns
```

Important initial observations:

```text
unused sync onError
-> approximately +5 ns

unused onError on async success
-> approximately +80 ns
```

Those measurements motivated the optimization phase.

## Optimization result

The final representative optimized runs commonly produced:

```text
unused synchronous onError
-> approximately plain successful-request cost

unused onError on async success
-> approximately +30 to +40 ns

two-handler successful async path
-> approximately same cost as one handler
```

Synchronous handled-error runtime also moved materially lower than the initial isolated baseline.

Absolute nanosecond values varied between benchmark runs, so this document does not claim that every difference between the pre-optimization and final numbers is caused exclusively by one source-code change.

The stable architectural improvements are the relevant result.

## Accepted optimizations

The final implementation retains:

```text
native Promise detection at the internal RuntimeFetch boundary

direct Response fast path for a synchronous handled error

specialized one-handler error boundary

specialized two-handler successful-request boundary

cold multi-handler error execution for the pair plan

generic ordered plan for three or more handlers
```

The internal runtime boundary is:

```ts
type RuntimeFetch = (request: Request) => Response | Promise<Response>;
```

This allows the successful application boundary to avoid generic Promise-like detection where Gelis itself already guarantees a native `Promise<Response>`.

Public `onError` return values continue supporting Promise-like values.

## Rejected optimizations

The optimization process also evaluated and rejected:

```text
native Promise-only handling for arbitrary public onError return values

manual inlining of the single synchronous error executor

naive dedicated two-handler plan

naive dedicated three-handler plan

separate three-handler specialization

runtime source generation / new Function
```

These candidates either:

- failed to improve the target path consistently;
- moved cost between cases rather than reducing it;
- depended too strongly on JSC benchmark shape;
- or added complexity without sufficient production-level benefit.

## Zero-unused regression

After finalizing the error execution candidate, the complete portable runtime benchmark was repeated.

Representative 5,000-route results:

| Scenario           | ns/op |
| ------------------ | ----: |
| router static      |    34 |
| router dynamic     |   191 |
| dispatch static    |    48 |
| dispatch dynamic   |   209 |
| fetch static raw   |   174 |
| fetch dynamic raw  |   359 |
| fetch static JSON  |   570 |
| fetch dynamic JSON |   825 |

Previous accepted reference values were approximately:

```text
router static             34 ns
router dynamic           185 ns

dispatch static           45 ns
dispatch dynamic         202 ns

fetch static raw         175 ns
fetch dynamic raw        341 ns

fetch static JSON        564 ns
fetch dynamic JSON       813 ns
```

Some individual dynamic-path values moved by several percent, but router and dispatch measurements that do not execute the application `onError` boundary moved in the same run as well.

The plain fetch path remained within the observed runtime/JIT variation envelope.

More importantly, the architecture structurally preserves:

```text
application with no onError
-> no onError wrapper
-> original routed fetch
```

The zero-unused-feature gate is accepted.

## HTTP optimization impact

The primary synchronous HTTP target before optimization was approximately:

```text
Gelis    15,460 req/s
Hono     15,481 req/s

Gelis vs Hono
-0.14%
```

The accepted post-optimization full run produced:

```text
Gelis    15,869 req/s
Hono     15,771 req/s

Gelis vs Hono
+0.62%
```

and the isolated verification produced:

```text
Gelis    16,175 req/s
Hono     16,057 req/s

Gelis vs Hono
+0.73%
```

The relative position moved slightly toward Gelis, but the difference remains too small to classify as a meaningful HTTP performance advantage.

The correct conclusion is still:

> Gelis and Hono are near parity for synchronous handled errors on this local HTTP workload.

This also shows that reducing framework-internal nanosecond overhead does not necessarily produce an equally visible gain once the complete Bun HTTP stack is measured.

## Asynchronous handler error

The strongest comparable result is the asynchronous handler rejection case.

Accepted full-run medians:

```text
Gelis    15,696 req/s
Hono     14,015 req/s
```

Observed Gelis difference:

```text
+12.00%
```

Variance:

```text
Gelis CV    1.02%
Hono CV     0.67%
```

This is considered a material local-workload difference.

It remains a benchmark result for this environment rather than a universal performance guarantee.

## Asynchronous onError

Accepted medians:

```text
Gelis    15,516 req/s
Hono     15,493 req/s
```

Observed difference:

```text
+0.15%
```

Variance:

```text
Gelis CV    0.66%
Hono CV     0.21%
```

This case is treated as near parity.

## Request-phase error fairness

Accepted medians:

```text
Gelis    16,813 req/s
Hono     15,267 req/s
```

Observed Gelis difference:

```text
+10.12%
```

This result requires a semantic caveat.

Gelis uses:

```text
onError
-> onRequest
-> routing
```

so an `onRequest` failure may terminate before routing.

Hono's closest native global request-interception comparison uses middleware, whose internal routing interaction is not identical.

The benchmark therefore compares the closest native observable workload rather than identical framework internals.

The result must not be presented as proof that Gelis' error machinery itself is intrinsically 10.12% faster.

Likewise:

```text
request-phase-error throughput
>
plain throughput
```

does not mean errors are faster than successful requests.

The failing request can simply terminate before later routing and handler work occurs.

## Interpretation

The benchmark supports the following conclusions for this workload and machine:

1. Applications without `onError` retain the existing Gelis plain route execution path.
2. Enabling one unused `onError` handler has no measurable HTTP throughput penalty.
3. Gelis and Hono are near parity for synchronous handled errors.
4. Gelis is materially faster than Hono for the tested asynchronous handler-rejection workload.
5. Asynchronous `onError` handling remains near parity with Hono.
6. The specialized two-handler Gelis plan keeps successful request cost approximately equal to the single-handler plan.
7. Three or more handlers intentionally use the simpler generic plan after dedicated triple specialization failed to justify its complexity.
8. Request-phase error results require an explicit framework-mechanism fairness caveat.
9. Small one-percent-level benchmark differences are not promoted as framework performance wins.
10. Runtime microbenchmarks and real HTTP benchmarks must both be considered before accepting an optimization.

These results are local benchmark evidence, not a universal performance guarantee across all applications, machines, operating systems, runtimes, concurrency levels, or workloads.

## Result

`onError` Performance Benchmark v0.1 is accepted.

The benchmark validates the first Gelis global error lifecycle implementation with:

```text
correctness preserved

zero-unused-feature behavior preserved

single-handler successful path optimized

two-handler successful path specialized

three-plus handler complexity bounded

synchronous handled HTTP errors near Hono parity

asynchronous handler-error throughput materially ahead of Hono
on this local workload
```

The `onError` performance optimization phase is frozen at this milestone.

Further optimization should require new evidence from broader workloads, profiling, or future runtime behavior rather than continued tuning against this single benchmark.
