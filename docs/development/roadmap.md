# Gelis Engineering Roadmap

**Status:** Active working roadmap  
**Current milestone:** OpenAPI and Contract Serialization v0.1

This roadmap records engineering order and architectural priorities, not release dates.

Gelis is developed milestone-by-milestone.

A milestone is not considered complete merely because its API exists.

Completion requires the relevant combination of:

```text
architecture
correctness
type-system verification
runtime verification
zero-unused verification
performance verification
real HTTP verification
documentation
```

depending on the capability being implemented.

## North star

Build Gelis into a production-grade TypeScript backend framework suitable for:

```text
small services
large applications
multi-team systems
security-sensitive systems
critical production workloads
```

while preserving a minimal request path when advanced capabilities are unused.

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

Performance remains a first-class requirement, but optimizations must preserve:

```text
correctness
understandable semantics
portability
maintainability
predictable behavior
```

The architectural principle is:

> Enterprise capability must not require enterprise overhead when unused.

Features should compile into the execution plans that enable them rather than becoming permanent checks on every request.

A plain route should not pay for:

```text
validation
response contracts
lifecycle hooks
error handling
request context
observability
security middleware
dependency injection
plugins
OpenAPI
metadata
```

unless those capabilities are actually enabled.

---

# Completed foundations

## 1. Type-system architecture — accepted

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

Accepted principle:

> Application type growth should reflect public contract structure, not every internal implementation detail.

---

## 2. Portable runtime — accepted

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

Runtime-specific APIs should remain outside the portable core unless architecture explicitly proves otherwise.

---

## 3. Portable runtime benchmark — accepted

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

The benchmark suite exists to detect architectural cost, not merely to produce headline throughput numbers.

---

## 4. Real HTTP comparison baseline — accepted

Same-machine Bun/oha comparisons were established against:

- Hono;
- Elysia;
- Elysia precompile mode.

Performance claims remain workload-specific and evidence-driven.

The benchmark infrastructure distinguishes framework behavior from:

```text
machine variation
runtime variation
JIT behavior
HTTP stack behavior
benchmark ordering
measurement noise
```

A single local benchmark must never be presented as a universal framework ranking.

---

## 5. Bun adapter prototype — accepted

Completed work includes:

- isolated Bun typing boundary;
- runtime adapter tests;
- Bun server-option forwarding;
- direct Gelis fetch integration;
- negligible measured adapter overhead.

The portable Gelis core does not depend on Bun-specific APIs.

Runtime-specific optimizations may exist at adapter boundaries when they provide measurable value without contaminating the portable core.

Bun remains the primary performance reference runtime during current development.

---

## 6. Validation Architecture v0.1 — accepted

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

Accepted execution principle:

```text
route registration
      ↓
compile validation capability
      ↓
request
      ↓
execute only the validation plan
required by that route
```

Validation remains optional and route-local.

---

## 7. Validation performance and regression verification — accepted

Validation workloads were benchmarked across:

- Gelis;
- Hono with Standard Schema validation integration;
- Elysia;
- Elysia precompile mode.

Plain-route regression was repeated after validation architecture changes.

No material unused-validation regression was accepted.

The Validation Optimization Rewind retained only optimizations with reproducible evidence.

Accepted production optimizations include:

```text
fused query parser
canonical application/json fast path
```

Rejected optimization ideas remain rejected unless materially new evidence appears.

The validation implementation is considered stable enough to serve as a lower-level primitive for future framework features.

---

## 8. Route lifecycle v0.1 — accepted

Route and global lifecycle foundations include:

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

Lifecycle capability is compiled rather than implemented as unavoidable generic middleware.

---

## 9. Global onRequest Architecture v0.1 — accepted

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

---

## 10. Global onError Architecture v0.1 — accepted

`onError` provides the outer application error boundary.

Accepted composition is:

```text
onError
  ↓
onRequest
  ↓
routing
  ↓
input validation
  ↓
beforeHandle
  ↓
handler
  ↓
afterHandle
  ↓
response finalization
```

Accepted intercepted failures include:

```text
onRequest throw/rejection
router internal throw
validator throw/rejection
beforeHandle throw/rejection
handler throw/rejection
afterHandle throw/rejection
response finalization throw/rejection
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

An error thrown or rejected by an `onError` handler propagates immediately and does not recursively re-enter the error lifecycle.

Handled `onError` results also do not re-enter route response contracts.

---

## 11. Application lifecycle compiler — accepted foundation

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

Future capabilities should reuse this compiler model rather than introducing independent permanent request wrappers.

---

## 12. Lifecycle performance verification — accepted

Lifecycle implementation passed:

- correctness tests;
- type tests;
- zero-unused runtime regression checks;
- isolated runtime microbenchmarks;
- real HTTP benchmarks;
- Hono comparison;
- Elysia comparison.

The accepted `onError` execution strategy is:

```text
0 handlers
→ original fetch

1 handler
→ specialized single-handler boundary

2 handlers
→ specialized successful-request boundary
→ cold ordered error executor

3+ handlers
→ generic ordered error plan
```

Dedicated triple-handler specialization was investigated and rejected because it did not provide enough stable benefit to justify production complexity.

For the accepted local workload:

```text
synchronous handled errors
→ Gelis / Hono near parity

asynchronous handler errors
→ Gelis materially ahead of Hono

asynchronous onError
→ Gelis / Hono near parity
```

Applications without lifecycle capability continue to retain the plain execution path.

---

## 13. Response Contracts & Serialization v0.1 — accepted and frozen

Response Contracts & Serialization v0.1 is complete.

The accepted architecture is recorded in:

[`../architecture/response-contracts-v0.1.md`](../architecture/response-contracts-v0.1.md)

Completed behavior includes:

```text
contract-only response metadata
optional runtime response validation
Standard Schema Input → Output response transformation
bodyless response contracts
explicit JSON serialization
explicit text serialization
raw Response escape hatch
compiled executable response plans
response-contract error integration
typed status responses
compact wire-only public contracts
typed-client response projection
zero-unused response capability
```

### Accepted response algebra

Handler results support:

```text
direct structured value
→ HTTP 200 JSON

direct string
→ HTTP 200 text

undefined
→ HTTP 204 bodyless

reply.status(status, body)
→ explicit typed status

Response
→ caller-owned raw response
```

`undefined` and `null` remain semantically distinct.

`undefined` represents a bodyless result.

`null` remains a JSON body.

### Runtime execution

Executable response behavior is compiled at registration time.

Conceptually:

```text
handler
  ↓
afterHandle
  ↓
response finalizer
  ├ raw Response bypass
  ├ optional output validation
  ├ explicit serializer
  └ AUTO normalization
  ↓
Response
```

Important lifecycle invariant:

```text
handler
  ↓
afterHandle observes raw handler result
  ↓
response validation
  ↓
serialization
```

`beforeHandle` early results remain outside the route response plan.

Raw `Response` bypasses managed validation and serialization.

### Response validation

Response validation is opt-in.

A response schema alone is metadata.

Runtime validation occurs only when explicitly enabled.

For validated response contracts:

```text
handler produces Schema Input
        ↓
Standard Schema validation
        ↓
result.value
        ↓
serializer
        ↓
wire Schema Output
```

Validation issues are server response-contract failures rather than client input errors.

Validator throws and rejections preserve their original identity.

Synchronous validators preserve synchronous route execution.

### Serialization

Supported explicit serializers in v0.1 are:

```text
json
text
```

JSON serialization follows Web `Response.json` semantics.

Text serialization requires a string and does not silently coerce arbitrary values.

Binary and streaming response behavior remains available through raw `Response`.

### Zero-unused verification

Contract-only response declarations create no executable response plan.

A route does not pay response-contract execution overhead unless executable behavior is enabled.

The zero-unused benchmark found no reproducible metadata-only request-time regression.

### Performance verification

Response performance passed:

```text
runtime correctness
zero-unused benchmark
runtime microbenchmark
internal HTTP managed-vs-control benchmark
optimization rewind
cross-framework HTTP comparison
```

Internal HTTP evidence showed:

```text
raw Response bypass
→ effectively direct-path performance

explicit JSON
→ near direct Response.json performance

explicit text
→ small bounded overhead

response validation
→ small sub-1% local managed overhead

typed status response
→ near direct-response performance
```

### Cross-framework HTTP evidence

The accepted local cross-framework matrix used:

```text
Bun 1.4.0
oha 1.16.0
Intel Core i5-10500H
5,000 static routes
50 connections
7 samples
2 second warmup
10 second measurement
```

Representative median throughput:

```text
raw-response

Gelis              16,835 req/s
Hono               16,666 req/s
Elysia             10,588 req/s
Elysia precompile  10,743 req/s


JSON

Gelis              15,808 req/s
Hono               15,587 req/s
Elysia              9,764 req/s
Elysia precompile   9,827 req/s


text

Gelis              15,531 req/s
Hono               15,593 req/s
Elysia             10,163 req/s
Elysia precompile  10,208 req/s


validate + JSON

Gelis              15,621 req/s
Hono               15,503 req/s
Elysia              9,731 req/s
Elysia precompile   9,936 req/s


status + JSON

Gelis              15,710 req/s
Hono               15,388 req/s
Elysia              9,708 req/s
Elysia precompile   9,877 req/s
```

Accepted interpretation:

> Gelis and Hono belong to approximately the same response-performance class on the tested workload.

Low-single-digit differences between Gelis and Hono are treated as local benchmark variation rather than universal ranking evidence.

Elysia was materially slower on this specific benchmark, but that result must remain workload-specific.

### Accepted response optimizations

The optimization rewind retained:

```text
response-only specialized execution path
AUTO HTTP 200 specialization
```

Several narrower optimizations were deliberately rejected.

Rejected experiments include:

```text
direct canonical 200/204 finalizers
fused single-status finalizer
fused validation + JSON finalizer
Standard Schema interface lookup hoist
```

Reasons included:

```text
insufficient reproducibility
JIT sensitivity
HTTP gain too small
regression in neighboring workloads
production complexity not justified
```

The response runtime should not be reopened merely to pursue another sub-percent micro-optimization.

Reopening requires:

```text
a correctness issue
a reproducible regression
new profiling evidence
a materially different runtime
or a materially different workload
```

Response Contracts & Serialization v0.1 is now frozen.

---

# Current milestone

## 14. OpenAPI and Contract Serialization v0.1

**Current phase:** Architecture definition.

The next milestone builds contract serialization from the compact public contracts established by previous work.

The central rule is:

> Runtime validation, type projection, and contract serialization are related capabilities, but they are not the same capability.

They must remain separable.

Conceptually:

```text
route definition
      ↓
compact public contract
      ├── runtime execution metadata
      ├── typed-client projection
      └── serializable contract metadata
                 ↓
              OpenAPI
```

OpenAPI must not become part of request execution.

Applications that do not enable documentation or contract serialization must pay:

```text
zero request-time OpenAPI overhead
```

## 14.1 Architectural goals

The architecture must determine how Gelis represents serializable information for:

```text
HTTP method
path
path parameters
query parameters
request body
response status
response body
content type
operation metadata
schema metadata
```

The representation must remain bounded as route count grows.

It must also avoid coupling portable runtime execution to one particular OpenAPI implementation.

## 14.2 Schema serialization boundary

Standard Schema defines runtime validation semantics.

It does not guarantee JSON Schema or OpenAPI metadata.

Therefore this must remain valid:

```text
schema can validate at runtime
        ≠
schema can necessarily be serialized to OpenAPI
```

Gelis must explicitly distinguish:

```text
runtime-capable schema

and

contract-serializable schema
```

The framework should not inspect arbitrary validation-library internals.

Schema serialization must use explicit, stable capability boundaries.

## 14.3 Required separation

The following capabilities must stay independent:

```text
runtime validation
OpenAPI serialization
typed-client projection
```

Examples:

```text
runtime validation enabled
OpenAPI disabled
→ valid configuration

OpenAPI enabled
runtime validation disabled
→ valid when serializable contract metadata exists

typed client generated
OpenAPI disabled
→ valid

OpenAPI generated
typed client unused
→ valid
```

No capability should require unrelated request-time execution machinery.

## 14.4 Route contract source

OpenAPI generation should consume compact public route contracts rather than runtime implementation closures.

The public contract should provide enough information to project:

```text
method
path
input contract
response contract
status map
```

without retaining every handler implementation detail.

This protects type-system scalability and avoids turning documentation into runtime reflection.

## 14.5 Response contract reuse

The response-contract architecture should become the canonical source for documented response statuses.

For example:

```text
responses: {
  200: UserSchema,
  404: ErrorSchema
}
```

should be projectable into documentation when those schemas expose serializable metadata.

Executable response behavior such as:

```text
validate: true
serialize: "json"
```

must remain separate from the documentation representation.

## 14.6 Request contract reuse

Existing input contracts should provide the source structure for:

```text
query
body
path params
```

OpenAPI serialization must not require a second unrelated route-definition API.

However, runtime-only schemas may require explicit documentation metadata when automatic schema serialization is unavailable.

## 14.7 OpenAPI metadata

The architecture should define an optional route-level documentation surface for information not inferable from types alone.

Potential metadata includes:

```text
summary
description
operationId
tags
deprecated
```

The initial API should remain minimal.

Do not design a large documentation DSL before proving the smallest useful contract.

## 14.8 Registration-time behavior

Documentation metadata may be collected during registration.

It must not create permanent request-time checks.

Preferred architecture:

```text
route registration
       ↓
runtime plan
       +
public contract
       +
optional documentation metadata
```

rather than:

```text
request
  ↓
inspect route metadata
  ↓
build documentation behavior
```

## 14.9 OpenAPI generation

Generation should occur outside normal request execution.

Potential forms include:

```text
app.openapi()
generateOpenAPI(app)
plugin-provided document endpoint
build-time serialization
```

The exact public API remains an architecture decision for this milestone.

The architecture should be selected before implementation.

## 14.10 Missing schema metadata

A runtime-valid schema that cannot be serialized must not silently produce an incorrect OpenAPI schema.

The framework must choose deterministic behavior such as:

```text
explicit omission
explicit opaque schema
registration/generation error
user-provided serialization metadata
```

The exact policy must be defined before implementation.

Silent incorrect documentation is not acceptable.

## 14.11 OpenAPI version

The initial implementation should target one clearly defined OpenAPI version rather than attempting multiple specification versions simultaneously.

Version support should be explicit and testable.

The exact supported version is decided during architecture design.

## 14.12 Correctness requirements

The milestone must verify at least:

```text
static path serialization
dynamic path serialization
query contract serialization
request body serialization
multiple response statuses
bodyless responses
explicit content types
validated response Output projection
metadata-only response contracts
module-mounted routes
duplicate operation handling
unsupported schema metadata behavior
```

Runtime semantics must remain unchanged when OpenAPI capability is unused.

## 14.13 Type-system requirements

OpenAPI support must not cause root application types to accumulate unbounded schema internals.

The milestone should verify:

```text
large route sets
declaration emission
editor behavior
public contract projection
module composition
```

Type-level convenience is not allowed to destroy application-scale compiler behavior.

## 14.14 Performance requirements

The primary performance requirement is zero-unused request cost.

Required verification:

```text
plain application
vs
application with OpenAPI capability available but unused
```

and, where applicable:

```text
plain routes
inside an application containing documented routes
```

OpenAPI generation speed itself is secondary to correctness and startup/build behavior, but should still be measured for large route sets.

## 14.15 Acceptance order

OpenAPI and Contract Serialization v0.1 proceeds in this order:

```text
architecture
  ↓
public serialization capability
  ↓
schema metadata boundary
  ↓
route metadata projection
  ↓
OpenAPI document model
  ↓
correctness tests
  ↓
type-system verification
  ↓
large-route generation benchmark
  ↓
zero-unused request regression
  ↓
documentation
  ↓
accept / revise
```

Do not implement a runtime documentation endpoint before the underlying serialization architecture is stable.

---

# Next milestones

## 15. Application module architecture

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

Target principle:

```text
small application
→ minimal composition model

large multi-team application
→ explicit architectural boundaries
```

without forcing the second model onto the first.

---

## 16. Plugin architecture

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

Plugins must declare their runtime impact explicitly.

Plugins should not introduce hidden global request work.

Important questions include:

```text
installation
ownership
configuration
route contribution
lifecycle contribution
application-level capability contribution
teardown
dependency ordering
duplicate installation
module isolation
```

Plugin architecture should build on application modules rather than inventing a second composition system.

---

## 17. Request context

Design request-scoped context without forcing allocation or lookup overhead onto applications that do not use it.

Potential requirements include:

- typed values;
- lifecycle visibility;
- module/plugin ownership;
- predictable inheritance;
- asynchronous safety;
- tracing integration.

The core invariant is:

> A route that does not use request context should not allocate request context.

Potential implementations must be benchmarked before acceptance.

---

## 18. Observability

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

Architecture should distinguish:

```text
framework observability primitives

from

specific observability providers
```

The portable runtime should not become permanently dependent on an observability SDK.

---

## 19. Security primitives

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

Security-sensitive behavior requires explicit semantics and dedicated tests.

Performance cannot justify ambiguous security behavior.

---

## 20. Resource limits and resilience

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

The framework should avoid APIs that imply guarantees the underlying runtime cannot actually provide.

Runtime-specific behavior should remain adapter-owned where appropriate.

---

## 21. Startup, shutdown, and draining

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

Lifecycle ownership should compose correctly across modules and plugins.

---

## 22. Health and readiness

Define minimal, composable primitives for:

- liveness;
- readiness;
- dependency readiness;
- draining state.

These should support orchestration environments without forcing a specific deployment platform.

Health behavior should distinguish:

```text
process alive

application ready

dependencies ready

application draining
```

rather than collapsing them into one endpoint.

---

## 23. Testing API

Provide first-class testing helpers for:

- direct request execution;
- lifecycle assertions;
- validation behavior;
- response-contract behavior;
- error behavior;
- module composition;
- plugin integration;
- startup/shutdown behavior.

Testing should remain possible without opening a real network socket for ordinary framework tests.

Network-based tests remain important for adapters and HTTP integration but should not be required for every application test.

---

## 24. Typed client hardening

Continue validating the client architecture against large real-world route sets.

Measure:

- declaration emission;
- editor latency;
- package-boundary behavior;
- route projection cost;
- large application inference;
- status-response typing;
- response-contract projection;
- contract serialization reuse.

The typed client must consume public contract information rather than importing server implementation detail.

Large applications should remain usable in editors and CI.

---

## 25. Additional runtime adapters

Potential targets include:

- Node.js;
- other Web Standard-compatible runtimes.

Adapter work should occur only after the portable contract is sufficiently stable.

Bun remains the primary performance reference runtime during current development.

Each adapter must verify:

```text
correct request semantics
response semantics
server option ownership
error propagation
shutdown behavior
performance overhead
```

Runtime-specific optimizations belong at adapter boundaries unless they can be expressed portably.

---

## 26. Package promotion and repository restructuring

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

Potential package boundaries should emerge from real dependency and ownership boundaries established by previous milestones.

---

## 27. Stability, compatibility, and release policy

Before 1.0, establish:

- semantic-versioning policy;
- deprecation policy;
- compatibility guarantees;
- adapter compatibility expectations;
- public/private API boundaries;
- migration documentation;
- supported runtime matrix.

Enterprise suitability requires predictable upgrades as much as raw performance.

The project must clearly distinguish:

```text
public API
experimental API
internal implementation
```

before 1.0 compatibility commitments are finalized.

---

## 28. Broader benchmark matrix

Before making broad public performance claims, expand benchmarking across:

- Linux;
- a second physical machine;
- additional Bun versions;
- additional runtimes;
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

The broader matrix should distinguish:

```text
microbenchmark
runtime dispatch benchmark
local HTTP benchmark
application workload benchmark
cross-runtime benchmark
```

because each answers a different question.

---

# Enterprise direction

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
authentication integrations
database integrations
runtime integrations


application primitives
------------------------------------
modules
plugins
request context
lifecycle
error model
startup / shutdown
health / readiness


portable runtime core
------------------------------------
router
dispatch
validation plans
response plans
compiled execution plans
Web Request / Response boundary
```

Higher layers may depend on lower layers.

Lower layers should not permanently absorb higher-layer overhead.

A system operated by many teams should be able to enable stronger:

```text
architecture
security
observability
operations
```

without changing the semantics or performance characteristics of unrelated plain routes.

Gelis should support enterprise capability through composition, not through a mandatory enterprise runtime.

---

# Architectural discipline

New capabilities should normally follow:

```text
problem definition
  ↓
semantic model
  ↓
type model
  ↓
execution model
  ↓
correctness tests
  ↓
performance consequences
  ↓
implementation
```

Avoid designing the public API solely around what is easiest to implement internally.

Avoid adding generalized abstraction before a real capability requires it.

Prefer:

```text
small stable primitive
+
composition
```

over:

```text
large framework-wide mechanism
```

when both can satisfy the same requirement.

---

# Zero-unused policy

Zero-unused behavior is a permanent architectural requirement.

When a capability is optional, unrelated routes should not pay for:

```text
feature checks
allocations
metadata lookups
context construction
middleware traversal
promise creation
request-time plan construction
```

merely because the framework supports that capability.

The preferred model is:

```text
registration-time knowledge
        ↓
compiled specialization
        ↓
minimal request path
```

Zero-unused does not require every enabled feature to be free.

It requires unused features to stay absent from unrelated execution paths.

---

# Optimization rule

The accepted optimization process is:

```text
correctness
  ↓
best known implementation
  ↓
baseline
  ↓
competitor architecture study
  ↓
diagnostic / profile
  ↓
optimization hypothesis
  ↓
candidate implementation
  ↓
correctness verification
  ↓
zero-unused regression
  ↓
runtime verification
  ↓
HTTP verification
  ↓
accept or reject
```

Start from the best implementation currently known.

Then attempt to disprove that it is optimal.

Do not intentionally begin with a weak implementation merely to manufacture optimization wins.

Do not optimize by intuition alone.

Do not keep an optimization merely because one microbenchmark improved.

A production optimization must justify its complexity across:

```text
correctness
architecture
runtime behavior
realistic workload evidence
maintainability
portability
```

Rejected experiments remain valuable engineering evidence.

A rejected candidate should be restored through normal project history rather than erased from the development narrative.

---

# Optimization stop rule

Stop an optimization direction when one or more of these conditions hold:

```text
gain is not reproducible
gain exists only in a synthetic microbenchmark
HTTP behavior remains unchanged
neighboring workloads regress
complexity is disproportionate to the gain
semantics become less predictable
portability is damaged
zero-unused behavior regresses
the optimization depends on fragile JIT behavior
```

A difference of a few nanoseconds is not automatically worth new production architecture.

Optimization quality is measured by total system value, not only by the smallest benchmark number.

---

# Performance policy

Gelis should pursue high performance aggressively.

The project may aim to outperform established TypeScript backend frameworks when architecture and evidence permit.

However:

```text
+0.5%
```

in one local benchmark is not a meaningful universal framework claim.

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
- semantic fairness limitations;
- workload-specific results;
- universal claims.

Cross-framework comparisons must use observably equivalent behavior wherever possible.

Competitors must not be intentionally configured with unnecessary work merely to improve Gelis results.

When framework semantics differ, benchmark documentation must explain the limitation.

The goal is not to win benchmark tables through workload-specific tricks.

The goal is to build an architecture whose efficiency remains visible as Gelis gains production capabilities.

---

# Release direction

The current project remains pre-1.0.

Passing an internal milestone does not mean Gelis is already suitable for every enterprise or critical production deployment.

Readiness must be earned through successive milestones covering:

```text
correctness
security
observability
operational behavior
compatibility
resilience
ecosystem maturity
multi-runtime verification
```

The long-term target is a framework that can scale from:

```text
small application
```

to:

```text
large multi-team production system
```

without changing its fundamental execution philosophy.

That philosophy remains:

> Compile capability where possible. Pay for capability only where enabled. Keep semantics explicit. Measure before optimizing.
