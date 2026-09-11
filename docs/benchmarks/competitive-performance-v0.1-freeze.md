# Competitive Performance Protocol v0.1 — Freeze

**Status:** FROZEN BEFORE RESULTS  
**Date:** 2026-09-11  
**Base repository tree:** `949c1d181a06de0deb55b9836c8303ea24cc747a`  
**Production runtime candidate:** `1dd5f94cf0e9ad884ca44e537ee287587cd8baab`

## Purpose

This protocol defines the next competitive performance evaluation for Gelis after P11 Industrial HTTP Essentials acceptance.

It is intentionally separate from feature-acceptance benchmarks. Its purpose is to measure current Gelis against current Bun-oriented competitors across runtime speed, HTTP throughput, tail latency, startup cost, memory use, validation/body handling, production policy composition, route-count scaling, and TypeScript cost.

Results are descriptive evidence for the frozen workloads. They are not universal framework rankings.

## Version snapshot at freeze

Latest public versions verified at the time of this freeze:

```text
Bun stable:       1.4.2
TypeScript stable: 7.0.2
Hono stable:      4.13.7
Elysia stable:    1.4.30
Elysia next:      2.0.0-beta.14
oha local tool:   1.16.0
```

The competitive suite must pin exact versions. Semver ranges are not accepted for measured competitor identities.

Raw `Bun.serve` is included as a runtime ceiling/reference. It is not classified as a framework competitor.

Elysia `next` is reported separately from stable and must never replace the stable comparison.

## Authority and reproducibility

Machine-sensitive performance acceptance is authoritative only on the established local machine:

```text
OS:  Windows
CPU: Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz
```

GitHub Actions may be used for:

- formatting;
- typechecking;
- correctness/equivalence probes;
- benchmark harness reproducibility;
- supplemental performance evidence.

Hosted-run timing, throughput, latency, startup, or RSS results are supplemental only.

Every measured run must record:

- exact Gelis source SHA;
- exact Bun version and revision;
- exact competitor versions;
- exact oha version where applicable;
- CPU and OS;
- route count;
- concurrency;
- warmup;
- duration;
- sample count;
- execution order;
- success/error rate;
- p50/p95/p99 where HTTP is involved.

## Non-negotiable fairness rules

1. Correctness and semantic equivalence are checked before timing.
2. Gates, workloads, sample counts, and aggregation rules are frozen before candidate results are inspected.
3. A failed or noisy run is retained as evidence and is not rerun merely to obtain a favorable number.
4. Framework-specific behavior that adds work not required by the frozen workload must be disabled only when the public framework API explicitly permits it and equivalence remains intact.
5. Required framework behavior must not be bypassed with private/internal APIs merely to improve benchmark results.
6. Server transport must use the framework's normal supported Bun path.
7. Raw Bun is a lower-bound/reference path and is labeled separately.
8. HTTP success must be 100% unless the workload explicitly tests an error path.
9. Ratios below `1.00x` describe only that frozen workload and environment.
10. A single aggregate score cannot hide a severe per-case regression.
11. Memory comparisons must measure equivalent lifecycle points and retain process-level RSS as the primary cross-framework metric.
12. Production correctness, security semantics, portability, AOT/prebuilt identity, and TypeScript scalability may not be weakened to improve competitive numbers.

## Phase CP0 — runtime/toolchain refresh

Before competitive timing, validate the accepted Gelis production candidate on Bun `1.4.2`.

Required checks:

```text
bun install with frozen dependency identities
bun run check
package-export tests
AOT/prebuilt tests
P11 cumulative correctness/security suite
representative Bun adapter HTTP smoke test
```

The CP0 objective is compatibility, not optimization.

P11 remains historically authoritative on Bun `1.4.0`; CP0 does not rewrite P11 evidence.

If Bun `1.4.2` exposes a Gelis correctness regression, competitive benchmarking stops until the regression is understood.

## Phase CP1 — competitor equivalence audit

Freeze exact implementations for:

```text
Gelis
Hono 4.13.7
Elysia 1.4.30
Elysia 2.0.0-beta.14
raw Bun.serve reference
```

For each workload, document response status, body bytes, content type, relevant headers, routing semantics, validation semantics, and lifecycle behavior before timing.

No result from CP2 onward is promotable unless CP1 equivalence passes for that workload.

## Phase CP2 — core HTTP/runtime matrix

Route-count matrix:

```text
1
100
1,000
5,000
```

Cases:

```text
static raw/text
dynamic parameter raw/text
static JSON
dynamic parameter JSON
```

Required metrics:

```text
in-process ns/op where equivalent
HTTP req/s
p50
p95
p99
success rate
```

HTTP protocol baseline:

```text
client:       oha 1.16.0
connections:  50
warmup:       2 seconds
measurement:  10 seconds
samples:      7 per framework/case
order:        rotating/alternating across frameworks
```

The existing `bench/http/run-oha.mts` methodology should be reused where it already satisfies this protocol rather than replaced gratuitously.

A second connection-scaling diagnostic is deferred to CP7.

## Phase CP3 — validation and request-body cost

Measure equivalent valid and invalid request handling for:

```text
JSON body parsing only
Standard Schema body validation
path/param validation where equivalence exists
validation failure response path
medium JSON body
```

Schema objects and accepted/rejected payloads must be semantically identical across frameworks.

Do not compare Elysia-native schema compilation against a different schema contract and describe it as an equivalent Standard Schema result. Native-schema performance may be measured as a separately labeled framework-optimized lane.

Metrics:

```text
in-process ns/op
HTTP req/s
p50/p95/p99
RSS after sustained workload
```

## Phase CP4 — production composition

Measure a common-equivalent application policy set:

```text
CORS fixed origin
secure response headers
request ID with deterministic generator
60,000 ms timeout
JSON response
```

Where semantically equivalent, add a managed POST lane with:

```text
JSON body
body limit
validation
timeout
```

Cookie performance remains a separate lane unless a truly equivalent built-in path exists across all compared frameworks.

The P11-H6 comparator is historical evidence only; CP4 must use the version snapshot frozen in this document.

## Phase CP5 — startup and registration

Measure fresh-process behavior at:

```text
1 route
100 routes
1,000 routes
5,000 routes
```

Required metrics:

```text
process launch -> application ready
route registration time
server listen readiness
first request latency
```

AOT/precompiled competitors must be reported in explicitly separate lanes from source-runtime modes.

Build time is reported separately and cannot be hidden outside an AOT/precompiled result.

## Phase CP6 — memory/RSS

Cross-framework primary metric:

```text
process RSS
```

Lifecycle checkpoints:

```text
fresh runtime baseline
application constructed
routes registered
server listening after warmup
after sustained HTTP load
post-load settled RSS
peak observed RSS during load
```

Route counts:

```text
1
1,000
5,000
```

At least one plain lane and one representative production-composition lane are required.

Heap-specific metrics may be recorded as diagnostics but must not replace RSS for cross-framework ranking.

Each framework must run in a fresh process. A process cannot be reused between framework samples.

## Phase CP7 — latency under increasing concurrency

Use the same simple successful HTTP route for all frameworks and measure at:

```text
1
10
50
100
250 connections
```

Primary metrics:

```text
req/s
p50
p95
p99
success rate
```

The goal is to detect throughput/latency tradeoffs and collapse under load, not only peak throughput at one concurrency.

If the local machine becomes saturated before 250 connections in a way that invalidates the comparison, the saturation point is reported rather than silently discarded.

## Phase CP8 — TypeScript and developer-cost scaling

Keep Gelis' stable-root type guarantees under the same TypeScript `7.0.2` toolchain.

For competitors, compare only equivalent public typed route declarations where a meaningful apples-to-apples fixture can be constructed.

Route sizes:

```text
100
500
1,000
5,000
```

Metrics:

```text
instantiations
memory used by tsc
check time
```

Type-level ergonomics or expressiveness differences must be documented rather than normalized away.

## Phase CP9 — result classification

Final reporting must classify each case independently:

```text
WIN
STATISTICAL / PRACTICAL TIE
LOSS
INVALID / NOT EQUIVALENT
```

A public claim may only summarize measured cases actually included in the final accepted suite.

Acceptable wording example:

```text
Gelis led X of Y frozen Bun workloads on the stated hardware and versions.
```

Unacceptable wording without substantially broader evidence:

```text
Gelis is universally the fastest JavaScript framework.
```

## Optimization boundary

The first complete CP2-CP8 pass is a discovery baseline.

No Gelis production optimization may be introduced halfway through that baseline while retaining earlier candidate measurements as though they belonged to one source identity.

If a measured weakness justifies optimization:

1. preserve the original baseline;
2. identify the bottleneck;
3. create a new exact Gelis candidate SHA;
4. rerun correctness/equivalence affected by the change;
5. rerun every candidate-sensitive competitive case required for the new comparison set;
6. retain both before and after evidence.

Benchmark implementation changes must not be used to manufacture an improvement.

## Repository hygiene

This document is intended as durable, public engineering methodology. It contains no private strategy or AI-workflow material.

Raw generated benchmark output belongs in ignored result directories unless a specific accepted snapshot is intentionally promoted to durable documentation.

Temporary diagnostic workflows and branches are not part of the eventual release surface.
