# Gelis Engineering Roadmap

**Status:** Active working roadmap  
**Current milestone:** Response Contracts & Serialization Architecture v0.1

This roadmap records engineering order and architectural priorities, not release dates.

## North star

Build Gelis into a production-grade TypeScript backend framework suitable for both small services and large, security-sensitive systems while preserving a minimal request path when advanced capabilities are unused.

The engineering priority order is:

```text
Correct
  ↓
Predictable
  ↓
Secure
  ↓
Composable
  ↓
Fast
```

Performance remains a first-class requirement, but optimizations must preserve correctness, understandable semantics, portability, and maintainability.

The architectural principle is:

> Enterprise capability must not require enterprise overhead when unused.

Features should compile into the execution plans that enable them rather than becoming permanent checks on every request.

A plain route should not pay for:

```text
validation
lifecycle hooks
error handling
request context
observability
security middleware
dependency injection
plugins
metadata
```

unless those capabilities are actually enabled.

## Completed foundations

### 1. Type-system architecture — accepted

Completed work includes:

- stable root `Gelis` type;
- local path inference;
- compact `RouteRef`;
- Standard Schema input/output distinction;
- typed status responses;
- bounded module composition;
- explicit public contracts;
- typed-client prototype;
- 5,000-route compiler benchmarks;
- lazy client projection validation.

The type system is expected to scale with application size without turning the root application type into an unbounded accumulation of route implementation detail.

### 2. Portable runtime — accepted

Completed runtime behavior includes:

- static exact routing;
- dynamic scanner trie;
- static-over-dynamic precedence;
- dynamic fallback;
- module mount;
- duplicate-route detection;
- 404 handling;
- response normalization;
- synchronous handler fast path;
- asynchronous handler support;
- decoded path parameters;
- query-string-independent route matching;
- fast pathname extraction.

The portable runtime remains based on Web Standard request and response primitives.

### 3. Portable runtime benchmark — accepted

Regression baselines were established for:

```text
route registration
router matching
route dispatch
raw Response fetch
JSON response normalization
static routes
dynamic routes
```

These measurements are used as regression gates before accepting new runtime capabilities.

### 4. Real HTTP comparison baseline — accepted

Same-machine Bun/oha comparisons were established against:

- Hono 4.13.5;
- Elysia 1.4.30;
- Elysia precompile mode.

Performance claims remain workload-specific and evidence-driven.

The benchmark infrastructure distinguishes framework behavior from machine, runtime, JIT, and HTTP-stack variation.

### 5. Bun adapter prototype — accepted

Completed work includes:

- isolated Bun typing boundary;
- runtime adapter tests;
- Bun server-option forwarding;
- direct Gelis fetch integration;
- negligible measured adapter overhead.

The portable Gelis core does not depend on Bun-specific APIs.

Runtime-specific optimizations may exist at adapter boundaries when they provide measurable value without contaminating the portable core.

### 6. Validation Architecture v0.1 — accepted

Completed work includes:

- Standard Schema integration;
- compiled input plans;
- synchronous-schema fast path;
- asynchronous-schema support;
- query parsing;
- JSON body parsing;
- malformed-input handling;
- unsupported-content-type handling;
- validation failure handling;
- typed validated handler inputs;
- combined query/body validation.

Plain routes do not execute validation machinery when schemas are absent.

### 7. Validation performance and regression verification — accepted

Validation workloads were benchmarked across:

- Gelis;
- Hono with `@hono/standard-validator`;
- Elysia;
- Elysia precompile mode.

Plain-route regression was repeated after validation architecture changes.

No material unused-validation regression was accepted.

### 8. Route lifecycle v0.1 — accepted

Route and global lifecycle foundations now include:

```text
global beforeHandle
local beforeHandle

handler

local afterHandle
global afterHandle
```

Accepted semantics include:

- deterministic phase order;
- synchronous execution preservation;
- asynchronous hook support;
- early return from `beforeHandle`;
- falsy non-`undefined` early values;
- validated input visibility;
- observational `afterHandle`;
- local/global composition;
- registration-order preservation.

Execution plans are specialized so routes without lifecycle hooks retain the plain route path.

### 9. Global onRequest Architecture v0.1 — accepted

`onRequest` provides application-level interception before routing.

Accepted behavior includes:

- execution before route matching;
- execution for eventual 404 requests;
- original `Request` access;
- synchronous execution preservation;
- asynchronous hooks;
- ordered multiple hooks;
- early return before routing;
- registration before or after routes;
- no route-by-route recompilation requirement.

Application-level compilation preserves the original routed fetch as its baseline.

Applications without `onRequest` do not pay for an `onRequest` feature check.

### 10. Global onError Architecture v0.1 — accepted

`onError` provides the outer application error boundary.

Accepted composition is:

```text
onError
  ↓
onRequest
  ↓
routing
  ↓
validation
  ↓
beforeHandle
  ↓
handler
  ↓
afterHandle
  ↓
response normalization
```

Accepted intercepted failures include:

```text
onRequest throw/rejection
router internal throw
validator throw/rejection
beforeHandle throw/rejection
handler throw/rejection
afterHandle throw/rejection
response normalization throw
```

Normal framework responses such as:

```text
404
400
415
422
```

do not automatically become `onError` events.

Multiple error handlers preserve registration order.

The first result where:

```text
result !== undefined
```

handles the error.

If every handler returns `undefined`, the original error propagates.

An error thrown or rejected by an `onError` handler itself propagates immediately and does not recursively re-enter the error lifecycle.

### 11. Application lifecycle compiler — accepted foundation

Application-level features compile from a stable routed-fetch baseline.

Conceptually:

```text
routed fetch
     |
     +-- onRequest enabled
     |      ↓
     |   compiled onRequest fetch
     |
     +-- onError enabled
            ↓
       compiled outer error boundary
```

Re-registration recompiles from the original application baseline rather than layering arbitrary wrapper-on-wrapper chains.

This mechanism is the foundation for future application-level capabilities.

### 12. Lifecycle performance verification — accepted

The lifecycle implementation has passed:

- correctness tests;
- type tests;
- zero-unused runtime regression checks;
- isolated runtime microbenchmarks;
- real HTTP benchmarks;
- Hono comparison;
- Elysia comparison.

The final `onError` execution strategy is:

```text
0 handlers
-> original fetch

1 handler
-> specialized single-handler boundary

2 handlers
-> specialized successful-request boundary
-> cold ordered error executor

3+ handlers
-> generic ordered error plan
```

Dedicated triple-handler specialization was investigated and rejected because it did not provide enough stable benefit to justify production complexity.

For the accepted local HTTP workload:

```text
synchronous handled errors
-> Gelis / Hono near parity

asynchronous handler errors
-> Gelis materially ahead of Hono

asynchronous onError
-> Gelis / Hono near parity
```

Applications without the lifecycle feature continue to retain the plain execution path.

## Current milestone

### 13. Response Contracts & Serialization Architecture v0.1

The next architecture milestone defines how Gelis represents, validates, serializes, and exposes response contracts without forcing generic serialization machinery onto every route.

Questions to resolve include:

```text
How are response contracts represented?

How do status-specific response schemas interact with:
reply.status(...)

When is output validation performed?

Should output validation be opt-in, development-oriented,
or part of selected route contracts?

How are serializers selected?

Can serialization plans be compiled at registration time?

How are Response objects passed through?

How are strings, JSON values, undefined, and typed status results handled?

How are serialization failures exposed to onError?

How are runtime response contracts reused by OpenAPI
and typed-client tooling?
```

The architecture must preserve current behavior for routes that do not enable additional response-contract capabilities.

### Acceptance requirements

Response-contract architecture must satisfy:

1. existing response semantics remain correct;
2. typed status results remain predictable;
3. plain `Response` pass-through remains cheap;
4. plain JSON routes do not gain unnecessary generic dispatch;
5. serializers are selected or compiled outside the request hot path where practical;
6. response-validation capability does not imply mandatory response validation;
7. errors integrate consistently with the accepted `onError` lifecycle;
8. runtime contracts remain portable;
9. OpenAPI metadata requirements do not contaminate runtime-only schemas;
10. type-system growth remains bounded.

### Acceptance process

```text
architecture
  ↓
correctness tests
  ↓
type tests
  ↓
zero-unused regression
  ↓
runtime benchmark
  ↓
HTTP benchmark
  ↓
accept / revise
```

No optimization should be added before a measurable cost or architectural need has been demonstrated.

## Next milestones

### 14. OpenAPI and contract serialization

Build OpenAPI and other contract tooling from compact public contracts when schemas expose serializable metadata.

Keep these capabilities separate:

```text
runtime validation
OpenAPI serialization
typed-client projection
```

A runtime-valid schema is not automatically guaranteed to expose enough metadata for OpenAPI generation.

### 15. Application module architecture

Expand the existing route-mount capability into explicit application composition suitable for larger codebases.

Areas to design include:

- module boundaries;
- lifecycle ownership;
- configuration boundaries;
- plugin installation;
- capability exposure;
- initialization ordering;
- teardown ownership;
- isolation between independently mounted application components.

Module architecture must not require a heavyweight dependency-injection container for simple applications.

### 16. Plugin architecture

Define stable extension contracts for framework and ecosystem capabilities.

Potential plugin classes include:

```text
observability
security
rate limiting
CORS
OpenAPI
authentication integration
database integration
runtime adapters
```

Plugins must declare their runtime impact explicitly and should not introduce hidden global request work.

### 17. Request context

Design request-scoped context without forcing allocation or lookup overhead onto applications that do not use it.

Potential requirements include:

- typed values;
- lifecycle visibility;
- module/plugin ownership;
- predictable inheritance;
- asynchronous safety;
- tracing integration.

Request context must remain optional.

### 18. Observability

Add production observability primitives with OpenTelemetry compatibility.

Target capabilities include:

- tracing;
- request spans;
- error recording;
- metrics integration;
- structured logging integration;
- correlation IDs;
- lifecycle instrumentation.

Observability must remain removable from the plain request execution plan when disabled.

### 19. Security primitives

Design production security behavior explicitly.

Areas include:

- trusted proxy handling;
- client IP resolution;
- host validation;
- request-size limits;
- CORS;
- CSRF integration;
- security headers;
- rate-limit integration;
- malformed transport behavior;
- secure defaults where the framework has enough context to provide them safely.

Security features must be composable rather than implemented as an unavoidable monolithic middleware layer.

### 20. Resource limits and resilience

Add explicit operational controls for:

- request timeouts;
- body-size limits;
- backpressure;
- connection draining;
- bounded queues where applicable;
- cancellation;
- overload behavior;
- graceful failure.

Behavior under resource pressure should be deterministic and testable.

### 21. Startup, shutdown, and draining

Define application lifecycle beyond individual requests.

Target capabilities include:

```text
startup hooks
readiness
graceful shutdown
connection draining
resource cleanup
termination deadlines
```

Adapters should expose runtime-specific behavior without moving runtime-specific dependencies into portable core contracts.

### 22. Health and readiness

Define minimal, composable primitives for:

- liveness;
- readiness;
- dependency readiness;
- draining state.

These should support orchestration environments without forcing a specific deployment platform.

### 23. Testing API

Provide first-class testing helpers for:

- direct request execution;
- lifecycle assertions;
- validation behavior;
- error behavior;
- module composition;
- plugin integration;
- startup/shutdown behavior.

Testing should remain possible without opening a real network socket for ordinary framework tests.

### 24. Typed client hardening

Continue validating the client architecture against large real-world route sets.

Measure:

- declaration emission;
- editor latency;
- package-boundary behavior;
- route projection cost;
- large application inference;
- status-response typing;
- contract serialization reuse.

### 25. Additional runtime adapters

Potential targets include:

- Node.js;
- other Web Standard-compatible runtimes.

Adapter work should occur only after the portable contract is sufficiently stable.

Bun remains the primary performance reference runtime during current development.

### 26. Package promotion and repository restructuring

The current temporary structure may eventually move toward:

```text
packages/
  gelis/
  bun/
  client/
  cors/
  opentelemetry/
  rate-limit/
  security/
```

Only perform this migration when package boundaries reflect stable architecture.

Do not restructure the repository merely for cosmetic organization.

### 27. Stability, compatibility, and release policy

Before 1.0, establish:

- semantic-versioning policy;
- deprecation policy;
- compatibility guarantees;
- adapter compatibility expectations;
- public/private API boundaries;
- migration documentation;
- supported runtime matrix.

Enterprise suitability requires predictable upgrades as much as raw performance.

### 28. Broader benchmark matrix

Before making broad public performance claims, expand benchmarking across:

- Linux;
- a second physical machine;
- additional Bun versions;
- route-count sweeps;
- concurrency sweeps;
- startup time;
- memory usage;
- body sizes;
- validation workloads;
- lifecycle workloads;
- error workloads;
- serialization workloads;
- realistic application compositions;
- observability-enabled applications;
- security-enabled applications.

A single-machine local benchmark is useful engineering evidence, not a universal ranking.

## Enterprise direction

The long-term architecture should support large collaborative systems without turning every Gelis application into an enterprise stack.

Target layers are:

```text
ecosystem / enterprise capabilities
------------------------------------
observability
security
rate limiting
CORS
OpenAPI
runtime integrations

application primitives
------------------------------------
modules
plugins
request context
lifecycle
error model
startup / shutdown

portable runtime core
------------------------------------
router
dispatch
validation plans
response plans
compiled execution plans
```

Higher layers may depend on lower layers.

Lower layers should not permanently absorb higher-layer overhead.

A system operated by many teams should be able to enable stronger architecture, security, and observability without changing the semantics of unrelated plain routes.

## Optimization rule

The accepted optimization process is:

```text
correctness
  ↓
baseline
  ↓
competitor architecture study
  ↓
diagnostic / profile
  ↓
optimize measured cost
  ↓
zero-unused regression
  ↓
runtime verification
  ↓
HTTP verification
  ↓
accept or reject
```

Do not optimize by intuition alone.

Do not keep an optimization merely because one microbenchmark improved.

A production optimization must justify its complexity across correctness, architecture, runtime behavior, and realistic workload evidence.

## Performance policy

Gelis should pursue high performance aggressively, including outperforming established TypeScript frameworks when architecture and evidence permit.

However:

```text
+0.5%
```

in one local benchmark is not a meaningful framework claim.

Likewise:

```text
microbenchmark improvement
```

does not automatically imply:

```text
HTTP throughput improvement
```

Performance documentation should distinguish:

- measurable regression;
- near parity;
- material advantage;
- benchmark noise;
- semantic fairness limitations.

The goal is not to win benchmark tables through workload-specific tricks.

The goal is to build an architecture whose efficiency remains visible as Gelis gains production capabilities.
