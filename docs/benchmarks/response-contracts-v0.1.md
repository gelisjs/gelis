# Gelis Response Contracts & Serialization Performance v0.1

**Status:** Accepted  
**Reference runtime:** Bun 1.4.0  
**HTTP benchmark:** oha 1.16.0  
**CPU:** Intel Core i5-10500H  
**Route count:** 5,000  
**Connections:** 50  
**Samples:** 7

## Scope

This document records the accepted performance verification and optimization rewind for Response Contracts & Serialization v0.1.

The response architecture was designed around an important invariant:

> Response capabilities must impose no request-time cost when they are unused.

Executable response behavior is created only for routes that enable capabilities such as:

```text
validate: true
serialize: "json"
serialize: "text"
```

Contract-only response metadata remains non-executable.

The performance process covered:

```text
correctness
  ↓
zero-unused verification
  ↓
runtime microbenchmarks
  ↓
HTTP managed-vs-control benchmarks
  ↓
optimization experiments
  ↓
cross-framework HTTP comparison
  ↓
accept / reject
```

Small microbenchmark improvements were not sufficient for acceptance.

## Correctness baseline

The accepted implementation completed the response milestone with:

```text
124 runtime tests
0 failures
264 expect() calls
```

Coverage includes:

- synchronous response validation;
- asynchronous response validation;
- Standard Schema transformation;
- explicit JSON serialization;
- explicit text serialization;
- JSON serialization failure handling;
- raw `Response` bypass;
- bodyless response statuses;
- undeclared managed-status rejection;
- lifecycle integration;
- `onError` integration;
- module mounting;
- metadata-only response contracts.

## Zero-unused behavior

Response metadata alone does not create a runtime response plan.

The permanent paired benchmark compares:

```text
plain application

vs

application containing response metadata
without executable response behavior
```

The accepted result showed no reproducible request-time regression.

The direction changed with benchmark ordering and the paired difference remained within local measurement noise.

Accepted conclusion:

> Contract-only response metadata does not impose measurable response machinery on unrelated plain routes in this benchmark.

## Accepted response execution strategy

Executable response behavior is compiled at route registration.

Conceptually:

```text
handler result
  ↓
raw Response?
  ├ yes → direct bypass
  ↓
managed result
  ↓
status dispatch
  ↓
optional validation
  ↓
serializer
  ↓
Response
```

Direct `Response` values bypass the complete managed response plan.

Small response contracts use registration-time specialized status dispatch:

```text
1 status
→ direct comparison

2 statuses
→ two comparisons

3 statuses
→ three comparisons

4+ statuses
→ Map lookup
```

The comparison-chain strategy was benchmarked and retained.

## Accepted optimizations

### Response-only top-level execution path

Routes containing only executable response behavior receive a specialized route path before the generic lifecycle switch.

This avoids unnecessary generic route-flag dispatch for the common response-only configuration.

The optimization improved the broader response benchmark matrix without introducing measurable non-response regressions.

**Decision:** KEEP.

### HTTP 200 AUTO specialization

HTTP 200 is the canonical direct managed response status.

AUTO serialization for status 200 is compiled separately so the common path avoids the generic status normalization function.

The specialization preserves:

```text
undefined
Response
string
structured JSON value
```

semantics.

**Decision:** KEEP.

## Rejected optimization experiments

### Direct canonical 200 / 204 finalizers

A candidate attempted to preselect canonical direct-result finalizers for statuses 200 and 204.

Measured gains were small and inconsistent, while some validation and status workloads regressed.

The additional specialization was not justified.

**Decision:** REJECTED and restored.

### Fused single-status response finalizer

A candidate fused the one-status status dispatcher into the outer response finalizer.

The experiment produced inconsistent JIT-sensitive results and several runtime regressions.

It did not provide reliable HTTP evidence.

**Decision:** REJECTED and restored.

### Fused validation + JSON serialization

A candidate compiled:

```text
Standard Schema validation
+
explicit JSON serialization
```

into one finalizer to remove an intermediate serializer closure.

Correctness remained intact.

The HTTP acceptance result remained approximately:

```text
managed response
~0.7% slower than
hand-written equivalent control
```

The gain over the generic implementation was insufficient to justify duplicated validation and serialization logic.

**Decision:** REJECTED and restored.

### Standard Schema interface lookup hoist

A candidate moved:

```ts
schema["~standard"];
```

from request execution to registration time.

Runtime results did not show a stable improvement.

The HTTP result remained sub-1% and showed substantial order sensitivity.

The optimization also changed behavior for schemas that replace their Standard Schema interface after route registration.

**Decision:** REJECTED and restored.

## Internal HTTP response benchmark

The paired HTTP benchmark compares Gelis managed response behavior with a hand-written equivalent fast path.

Workloads include:

```text
raw Response bypass
explicit JSON
explicit text
response validation + AUTO
response validation + JSON
reply.status + JSON
```

The benchmark uses:

```text
5,000 static routes
50 connections
7 paired samples
2 second warmup
10 second measurement
fresh server process per variant
alternating control / managed order
full-route prewarm
```

Positive throughput delta means the managed Gelis path was faster.

### Accepted interpretation

Raw `Response` bypass is effectively parity with a direct raw-response route.

Explicit JSON response handling is effectively parity with direct `Response.json`.

Explicit text serialization has only small local overhead.

Managed status responses remain within the same local performance class as the direct equivalent.

Response validation retains a small sub-1% HTTP cost relative to an equivalent hand-written Standard Schema validation path.

Multiple optimization attempts failed to reduce that remaining validation difference enough to justify production complexity.

The optimization rewind therefore stops at the generic composition.

## Cross-framework HTTP comparison

A separate benchmark compares equivalent wire behavior across:

```text
Gelis
Hono 4.13.5
Elysia 1.4.30
Elysia 1.4.30 precompile
```

The benchmark intentionally does not force Hono or Elysia through an artificial response-contract abstraction.

Their handlers use direct equivalent Web Standard response code.

For `validate-json`, all frameworks consume the same Standard Schema object.

### Throughput

| Workload      | Gelis req/s | Hono req/s | Elysia req/s | Elysia precompile req/s |
| ------------- | ----------: | ---------: | -----------: | ----------------------: |
| raw-response  |      16,835 |     16,666 |       10,588 |                  10,743 |
| json          |      15,808 |     15,587 |        9,764 |                   9,827 |
| text          |      15,531 |     15,593 |       10,163 |                  10,208 |
| validate-json |      15,621 |     15,503 |        9,731 |                   9,936 |
| status-json   |      15,710 |     15,388 |        9,708 |                   9,877 |

All results reached:

```text
100% HTTP success
```

### Gelis and Hono

Gelis and Hono belong to the same performance class for these response workloads.

The full matrix produced differences of roughly:

```text
raw-response
Gelis +1.66%

json
Gelis +1.82%

text
Hono +0.60%

validate-json
Gelis +0.75%

status-json
Gelis +2.05%
```

These small differences should not be generalized into a universal framework ranking.

A separate JSON sanity run changed the direction of the Gelis/Hono difference, demonstrating the importance of treating low-single-digit differences as local benchmark variation.

Accepted conclusion:

> Gelis response contracts preserve approximately Hono-class HTTP performance on the tested Bun workload despite adding executable response-contract semantics.

### Elysia

Elysia and Elysia precompile produced materially lower throughput in this specific benchmark.

The observed gap was approximately:

```text
34% to 38%
```

relative to Gelis depending on workload.

This result is workload-specific.

It does not establish a universal performance ranking between Gelis and Elysia.

The benchmark exercises:

```text
Bun 1.4.0
5,000 static routes
50 concurrent connections
small response bodies
Web Standard Response objects
local loopback HTTP
```

Different route counts, response APIs, runtime versions, body sizes, concurrency levels, and application composition may produce different results.

## Performance conclusion

Response Contracts & Serialization v0.1 satisfies the performance requirements established for the milestone.

Accepted properties:

```text
metadata-only contracts
→ no measurable unused runtime cost

raw Response
→ complete response-plan bypass

explicit JSON
→ approximately direct-response performance

explicit text
→ small bounded overhead

response validation
→ small sub-1% local managed overhead

typed status responses
→ approximately direct-response performance
```

The response implementation retains registration-time compilation without introducing broad request-time feature checks.

Further micro-specialization is intentionally stopped because repeated experiments failed to provide enough reproducible HTTP benefit to justify additional runtime complexity.

## Benchmark interpretation policy

These measurements are engineering evidence, not universal marketing claims.

They are specific to:

```text
Windows
Bun 1.4.0
oha 1.16.0
Intel Core i5-10500H
5,000 routes
50 connections
local loopback HTTP
```

Broader performance claims require additional machines, operating systems, runtime versions, route-count sweeps, concurrency sweeps, body-size variation, and realistic application compositions.
