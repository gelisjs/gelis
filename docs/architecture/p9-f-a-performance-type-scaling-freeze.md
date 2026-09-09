# P9-F-A Performance + TypeScript Scalability Freeze

Status: ACCEPTED ARCHITECTURE / MEASUREMENT PENDING  
Phase: P9-F-A  
Branch: `architecture/composition-v0.1`  
P9 cumulative runtime control: `a9740f2de5e8216b96de2b112d1aa79ae4b50dfe`

## Purpose

P9-F is the close-out performance and TypeScript-scalability phase for the P9 HTTP Surface Architecture.

It is not a new feature phase and it must not redefine semantics accepted in P9-B through P9-E merely to improve benchmark results.

P9-F answers two final questions:

1. Did the accumulated P9 HTTP-surface work materially regress request execution paths that already existed before P9?
2. Do the final P9 method and rich-route surfaces remain scalable in TypeScript through 5,000 routes without causing app-level generic growth or disproportionate compiler cost?

All gates in this document are frozen before P9-F measurement results are observed. They must not be relaxed after results.

## Runtime cumulative control

The cumulative runtime control is:

```text
a9740f2de5e8216b96de2b112d1aa79ae4b50dfe
feat: freeze public lifecycle API
```

This commit closes P8 immediately before the P9 HTTP Surface Architecture begins.

The control already supports the common route surface required for like-for-like comparison:

```text
GET / POST / PUT / PATCH / DELETE / OPTIONS / HEAD
query Standard Schema
body Standard Schema
managed response contracts
route beforeHandle / afterHandle lifecycle
```

P9-only semantics such as QUERY, ALL/custom-method fallback, automatic method semantics, and the expanded content-type parser surface are not fabricated in the control.

Therefore the cumulative A/B gate uses only workloads whose route behavior can be expressed identically by both control and candidate.

## Runtime protocol

P9-F-B uses the process-isolated mirrored protocol already established by previous Gelis acceptance work.

Per workload:

```text
routes:        5,000
samples:       41 mirrored samples
workers:       four persistent Bun processes
orientations:  control/candidate + candidate/control
pair shape:    semantic ABBA / BAAB
warmup:        10,000 app.fetch calls/worker
measurement:   20,000 app.fetch calls/measurement
GC:            Bun.gc(true) immediately before measured work
canonical:     geometric mean of the two candidate/control orientation ratios
summary:       median of canonical mirrored deltas
```

Each worker imports exactly one Gelis module graph from either the control worktree or candidate worktree.

Order-specific buckets are diagnostic only.

The candidate must be clean. The harness must print both control SHA and candidate SHA.

## Runtime workload matrix

### 1. `plain-static`

5,000 static GET routes:

```text
/r/0
...
/r/4999
```

The target route returns one shared `Response("ok")` instance.

Purpose:

- cumulative plain-route zero-unused regression;
- catches permanent method/content-type branches that leak into applications not using those features.

### 2. `plain-dynamic`

5,000 trailing-parameter GET routes:

```text
/r/0/:id
...
/r/4999/:id
```

The target request resolves the final route with a concrete parameter and returns one shared Response instance.

Purpose:

- cumulative dynamic-router regression;
- catches method-semantics costs that may not appear on exact static lookup.

### 3. `query-json`

5,000 static POST routes with:

```text
query Standard Schema
body Standard Schema
application/json Content-Type
shared Response handler result
```

Both schemas perform minimal successful validation/identity transformation.

Purpose:

- cumulative request-input regression on the request-body surface that existed before P9;
- the candidate is required to perform its accepted P9 content-type semantics with a valid JSON media type.

### 4. `rich-managed`

5,000 trailing-parameter POST routes with:

```text
path params
query Standard Schema
body Standard Schema
explicit managed JSON response contract
beforeHandle
handler
 afterHandle
```

The request uses a valid JSON Content-Type and valid query/body input. The response contract uses the same Standard Schema object and serialization semantics in control and candidate.

Purpose:

- integrated large-endpoint gate across routing, input validation, route lifecycle, and managed response execution;
- represents an endpoint with multiple pre-P9 capabilities active simultaneously rather than measuring one isolated feature.

## Runtime acceptance gates

For every workload:

```text
mirrored median candidate/control delta <= +3.0%
```

There is no looser special gate for the rich workload.

A failure in any workload fails P9-F-B.

Negative deltas are no-regression evidence only and are not accepted as general speedup claims.

If a workload fails, diagnose and optimize the implementation. Do not change the gate after observing results.

## Runtime exclusions

The following are not cumulative A/B acceptance workloads because the pre-P9 control does not implement equivalent semantics:

```text
QUERY
ALL fallback
custom methods
automatic OPTIONS / Allow behavior introduced by P9
new non-JSON request-body parsers
managed AOT request-body binding
```

Those surfaces retain their already-accepted feature-specific performance evidence.

P9-F does not invalidate or replace those earlier gates.

## TypeScript scalability basis

P9-F-C extends the existing `bench/types` infrastructure rather than introducing a second type benchmark system.

Existing sizes remain:

```text
100
500
1000
5000
```

Existing comparison scenarios remain authoritative controls:

```text
routes
rich-contract
```

P9-F adds exactly two new generated scenarios.

## Type scenario 1 — `p9-method-mix`

Purpose: validate that the final HTTP method surface does not cause route-type growth beyond the existing ordinary route scenario.

Routes cycle through the final P9 method registration shapes, including:

```text
GET
POST
QUERY
HEAD
OPTIONS
custom app.route("PURGE", ...)
ALL
```

The scenario must include static and parameterized paths while keeping handlers deliberately simple so the measured delta primarily represents route/method typing.

Comparison control:

```text
p9-method-mix / routes
```

The generated source must contain a compile-time assertion that the root application type remains exactly `Gelis`.

## Type scenario 2 — `p9-rich`

Purpose: validate a large final P9 endpoint surface without allowing parser/media metadata to infect route generics.

Each generated route uses the existing rich contract dimensions:

```text
path params
query schema
body schema
explicit response contracts
```

and adds accepted P9 surface where applicable:

```text
POST / QUERY method mix
bodyParser: "json"
bodyContentTypes: ["application/json"]
```

Parser/media metadata remains registration/runtime metadata and must not become an app-level or route-collection generic accumulator.

Comparison control:

```text
p9-rich / rich-contract
```

The generated source must assert that the root application type remains exactly `Gelis`.

## TypeScript measurement protocol

Compiler:

```text
TypeScript 7.x from the repository lock/install
--noEmit
--extendedDiagnostics
```

For each scenario/size pair:

```text
runs: 3 fresh tsc processes
canonical timing: median check time
canonical memory: median memory used
instantiations: exact/median value reported by tsc diagnostics
```

All generated cases must compile with zero unexpected TypeScript errors.

No benchmark may use `skipLibCheck` or another compiler option that differs between the compared P9 scenario and its existing control scenario.

## TypeScript acceptance gates

### Per-size relative gates

For every size in `100, 500, 1000, 5000`:

#### `p9-method-mix` versus `routes`

```text
instantiations ratio <= 1.15x
median memory ratio <= 1.15x
median check-time ratio <= 1.25x
```

#### `p9-rich` versus `rich-contract`

```text
instantiations ratio <= 1.15x
median memory ratio <= 1.15x
median check-time ratio <= 1.25x
```

### 5,000-route tightening

At 5,000 routes for both P9 scenarios:

```text
median check-time ratio <= 1.20x
```

The 5,000-route tightening exists because large-project behavior is the primary purpose of P9-F.

### Growth gates

For both `p9-method-mix` and `p9-rich`:

```text
1000 -> 5000 instantiations growth <= 5.5x
1000 -> 5000 median check-time growth <= 6.0x
```

These bounds permit measurement noise and fixed compiler overhead while rejecting obvious superlinear route-type growth.

### Structural hard gates

Independent of timing:

```text
root typeof app remains exactly Gelis
no application generic accumulates registered routes
bodyParser/bodyContentTypes do not enter route-collection generics
all 100/500/1000/5000 generated cases compile
```

A structural failure fails P9-F-C even if timing happens to pass.

## External framework comparison

A final Hono/Elysia HTTP comparison may be run after internal P9-F acceptance as diagnostic context using the repository's existing HTTP benchmark discipline.

It is not a P9-F pass/fail gate because exact feature-equivalence across QUERY, ALL/custom methods, content-type admission, validation, lifecycle, and managed responses cannot be assumed across frameworks.

Any external result must state its exact workload, versions, machine, Bun version, route count, connection count, and sample count. It must not be generalized beyond that workload.

## Implementation sequence

```text
P9-F-A  freeze cumulative runtime + TypeScript gates       THIS DOCUMENT
P9-F-B  implement/run cumulative runtime acceptance
P9-F-C  implement/run P9 TypeScript scalability acceptance
P9-F-D  optional external HTTP diagnostic
P9-F-E  final P9 performance/scalability acceptance freeze
```

## Change discipline

P9-F benchmark work must consist only of permanent benchmark/type-harness files and purposeful acceptance documentation.

Do not commit:

```text
source-modifier/applicator scripts
scratch/debug scripts
one-off internal experiment logs
temporary generated benchmark results
```

If P9-F reveals an implementation regression, source changes must be direct production changes with permanent tests and must rerun all P9-F gates affected by that source change.

## Freeze conclusion

The runtime control, workloads, measurement protocols, TypeScript scenarios, comparison controls, and all thresholds in this document are frozen before P9-F results.

No threshold may be loosened after measurement results are observed.
