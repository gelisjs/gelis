# Gelis Architecture Continuity v0.1

**Status:** Accepted architecture direction / implementation roadmap  
**Repository:** `gelisjs/gelis`  
**Purpose:** Permanent source of truth for package boundaries, framework growth principles, and the next HTTP surface architecture phases.

> This document records accepted architectural constraints and implementation directions that must remain consistent across development phases.
> It distinguishes **accepted architectural constraints** from **implementation candidates that still require benchmark and correctness validation**.

---

## 1. Project identity and package namespace

Gelis uses different names for its GitHub organization, core npm package, and official standalone ecosystem package scope.

### GitHub organization

```text
gelisjs
```

Primary repository:

```text
gelisjs/gelis
```

### Core npm package

```text
gelis
```

### Official standalone ecosystem scope

```text
@gelis/*
```

Examples:

```text
@gelis/openapi
@gelis/client
```

Additional standalone packages may use the same scope when their ownership, dependency graph, release cadence, or implementation size justify an independent npm package.

### Runtime integrations

Tightly coupled runtime integrations should normally be exposed as subpaths of the core package rather than separate npm packages.

Canonical Bun import:

```ts
import { Gelis } from "gelis";
import { serve } from "gelis/bun";
```

Canonical installation:

```bash
bun add gelis
```

### Superseded naming

The following Bun package naming is superseded:

```text
@gelis/bun
```

Likewise, older examples using:

```text
@gelisjs/*
```

as the npm scope are superseded.

The canonical convention is:

```text
GitHub organization:            gelisjs
Core npm package:               gelis
Runtime integration subpaths:   gelis/*
Standalone ecosystem packages:  @gelis/*
```

---

## 2. Repository and package strategy

An internal source boundary does **not** require a separate npm package.

An npm package boundary does **not** require a separate GitHub repository.

Gelis should use the smallest boundary that provides real architectural value.

The primary repository remains:

```text
gelisjs/gelis
```

Target production direction:

```text
gelisjs/gelis
│
├── packages/
│   └── gelis/
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts
│           ├── app.ts
│           ├── runtime/
│           ├── lifecycle/
│           ├── tooling/
│           ├── internal/
│           └── adapter/
│               └── bun/
│                   └── index.ts
│
├── bench/
├── test/
├── docs/
├── scripts/
├── package.json
└── bun.lock
```

The exact folder layout is still subject to D6-C validation, but the public package direction is accepted:

```text
npm package:
  gelis

public subpaths:
  gelis
  gelis/bun
```

Standalone official ecosystem packages may remain separately publishable:

```text
@gelis/openapi
@gelis/client
```

Repository placement for those packages is decided by architecture and maintenance boundaries, not by npm naming alone.

Example already consistent with this convention:

```text
GitHub: gelisjs/openapi
npm:    @gelis/openapi
```

---

## 3. Portable core and runtime adapter boundary

### Accepted rule

The Bun adapter is an **official Gelis runtime integration**, but Bun-specific APIs must not leak into the portable root import graph.

The public package may be one npm package:

```text
gelis
```

while exposing:

```text
gelis/bun
```

as a separate subpath.

### Required dependency direction inside the package

Conceptually:

```text
gelis/bun
    │
    ▼
portable Gelis internals/public contracts
```

The reverse dependency is forbidden:

```text
portable Gelis root
        ✕
        ▼
     gelis/bun
```

The portable root graph must not require Bun-specific APIs such as:

```text
Bun.serve
Bun.Server
Bun.Serve.*
```

The root package surface remains based on Web Standards.

Runtime-specific subpaths may optimize aggressively for their target runtime as long as they preserve Gelis contracts.

### Type isolation rule

A portable consumer:

```ts
import { Gelis } from "gelis";
```

must not require Bun types solely because the package also contains `gelis/bun`.

Only a consumer of:

```ts
import { serve } from "gelis/bun";
```

may enter the Bun-specific declaration graph.

D6-C must explicitly test this boundary.

### Performance rule

A same-package subpath must not introduce permanent per-request abstraction cost.

The presence of `gelis/bun` in the published package must not change the request path of:

```ts
import { Gelis } from "gelis";
```

The Bun adapter may perform startup-time work, readiness coordination, or transport ownership outside the request hot path, but the steady-state request path should remain as direct as the validated runtime permits.

---

## 4. `prototype/bun` graduation is mandatory

The current Bun adapter lives under:

```text
prototype/bun
```

because it began as an architecture and performance prototype.

That location is temporary.

Before final zero-unused performance validation, the Bun adapter must graduate into the production `gelis` package as an official Bun subpath.

Required conceptual transition:

```text
prototype/bun
    ↓
production adapter source
    ↓
gelis/bun
```

A likely source direction is:

```text
packages/gelis/src/adapter/bun
```

but the exact internal path must be validated during D6-C rather than frozen prematurely.

The production package architecture must be validated before Gelis treats adapter performance results as release-representative.

---

## 5. P8-D lifecycle roadmap

The required order is:

```text
P8-D6-A  AOT Startup Safety                 ✅ accepted
P8-D6-B  Bun Adapter Lifecycle              ✅ accepted
P8-D6-C  Production Package Architecture    REQUIRED
P8-D7    Zero-unused + Performance
P8-D8    Public Lifecycle API Freeze
```

### P8-D6-C is not optional

P8-D6-C must happen before P8-D7.

Its purpose is to ensure P8-D7 benchmarks and type-scaling validation measure the production-oriented package layout rather than prototype imports.

At minimum P8-D6-C must cover:

- core package:
  - `gelis`
- Bun runtime subpath:
  - `gelis/bun`
- standalone official package convention:
  - `@gelis/*`
- Bun adapter graduation from `prototype/bun`
- root-to-adapter dependency prohibition
- adapter-to-core dependency direction
- package-local TypeScript configuration
- package exports
- declaration graph isolation
- build/typecheck boundaries
- benchmark imports from production package paths
- no Bun-specific dependency leakage into the portable root graph
- no runtime overhead merely because Bun support exists in the package

P8-D6-C must not be silently skipped.

---

## 6. Why Bun is a subpath rather than `@gelis/bun`

The accepted Bun packaging model is:

```text
gelis/bun
```

rather than:

```text
@gelis/bun
```

because Bun support is considered a tightly coupled runtime integration of the Gelis framework rather than an independently evolving ecosystem product.

This gives the user:

```bash
bun add gelis
```

instead of:

```bash
bun add gelis @gelis/bun
```

and:

```ts
import { Gelis } from "gelis";
import { serve } from "gelis/bun";
```

instead of requiring users to understand a second package before they can run Gelis on Bun.

### Accepted rationale

The subpath model reduces:

- installation friction
- version compatibility questions
- adapter/core release mismatch
- ecosystem discovery overhead
- onboarding decisions

while still allowing strict source and type isolation.

### Versioning benefit

Because `gelis` and `gelis/bun` come from the same published package version:

```text
gelis@x.y.z
```

the runtime adapter is guaranteed to match the lifecycle and internal contracts of that Gelis release.

No separate Bun/core compatibility matrix is required.

### Competitive precedent

This general model is consistent with mature framework patterns such as:

```text
hono/bun
elysia/adapter/bun
```

Gelis may use a simpler public surface:

```text
gelis/bun
```

while retaining its own runtime architecture and performance model.

---

## 7. Standalone `@gelis/*` packages remain valid

The decision to make Bun a subpath does **not** remove the official `@gelis/*` package scope.

The scope remains the canonical namespace for official components that are sufficiently independent from the core runtime.

Examples:

```text
@gelis/openapi
@gelis/client
```

Potential future examples may include:

```text
@gelis/opentelemetry
@gelis/swagger-ui
```

only when architecture justifies them.

A feature should not become an independent package merely to make the repository look modular.

---

## 8. Framework growth principle

Gelis is expected to grow into a professional, full-featured backend framework.

However, **feature growth must not imply universal runtime cost**.

The core principle is:

> Features may grow; unused feature cost should remain as close to zero as practical.

Gelis should prefer:

- compile-time specialization
- registration-time planning
- lazy sidecar state
- instance specialization
- route-specific execution plans
- runtime subpath isolation
- standalone package boundaries where justified

over:

- permanent request branches
- universal middleware chains
- always-on parsers
- always-on adapters
- large dependency graphs in core
- abstractions added only for aesthetic folder structure

---

## 9. Source organization principle

Source files should be organized according to real runtime, tooling, composition, and package boundaries.

Gelis must **not** refactor merely to imitate enterprise folder conventions.

A large file is not automatically an architecture defect.

A refactor is justified when it improves one or more of:

- hot-path clarity
- runtime specialization
- package or subpath isolation
- testability
- tooling isolation
- type-system scalability
- ownership boundaries
- maintainability without measurable performance regression

Avoid abstractions that add:

- extra per-request calls
- closure allocation
- unnecessary indirection
- circular dependencies
- hidden hot-path work

without a concrete architectural benefit.

---

## 10. Future HTTP Surface Architecture is required

After P8 lifecycle/package work, Gelis must have a dedicated HTTP surface architecture phase.

Required roadmap:

```text
P9        HTTP Surface Architecture
├── P9-A  HTTP method audit
├── P9-B  QUERY / RFC 10008
├── P9-C  ALL + custom methods
├── P9-D  method semantics
│         HEAD / OPTIONS / Allow
├── P9-E  content-type architecture
└── P9-F  performance + TypeScript scalability
```

P9 is a required architecture phase, not a backlog suggestion.

---

## 11. HTTP `QUERY` is required as a first-class method

### Standards basis

`QUERY` is defined by **RFC 10008, The HTTP QUERY Method**, published as a Standards Track RFC in June 2026.

References:

- RFC 10008: <https://www.rfc-editor.org/rfc/rfc10008>
- RFC information page: <https://www.rfc-editor.org/info/rfc10008>

The method is designed for safe query operations that carry request content.

Its relevant properties include:

```text
safe
idempotent
cacheable
supports request content
```

### Gelis requirement

Gelis must support `QUERY` as a first-class HTTP method.

Expected ergonomic direction:

```ts
app.query("/search", ...)
```

The exact overloads and signatures must still follow Gelis type-scaling and API-surface validation.

### QUERY must integrate with

- router
- route contracts
- request body/content validation
- Standard Schema
- typed client
- OpenAPI
- CORS behavior
- runtime adapters
- AOT
- benchmarks
- type-scaling tests

`QUERY` must not be implemented as only a convenience alias that bypasses the rest of Gelis architecture.

---

## 12. OpenAPI and QUERY

OpenAPI 3.2 includes `query` as a Path Item operation.

Reference:

- OpenAPI 3.2 specification: <https://spec.openapis.org/oas/v3.2.0.html>

The official Gelis OpenAPI integration must eventually represent first-class `QUERY` routes correctly.

This requirement applies to:

```text
@gelis/openapi
```

Compatibility with older OpenAPI versions must be handled deliberately rather than silently losing the method.

---

## 13. Bun compatibility for QUERY

Bun 1.4.0 has been verified upstream to preserve the `QUERY` method and its request body through:

```text
fetch
Bun.serve
node:http
```

Relevant upstream issue:

- oven-sh/bun#34839: <https://github.com/oven-sh/bun/issues/34839>

Gelis must still maintain its own runtime compatibility tests.

External runtime support is evidence, not a replacement for Gelis correctness gates.

---

## 14. `app.all()` support is required

Gelis must eventually support routing that handles all HTTP methods for a path.

Expected ergonomic direction:

```ts
app.all("/path", handler);
```

The final public API name may be frozen during P9, but support for this capability is required.

### Precedence requirement

An explicitly registered method route must take precedence over an all-method fallback.

Example:

```ts
app.all("/users", () => "fallback");
app.get("/users", () => "GET");
```

Then:

```text
GET /users
```

must resolve to the explicit GET route.

An otherwise unmatched method may resolve to the all-method route.

The detailed interaction between:

- exact/static
- exact/dynamic
- all/static
- all/dynamic

must be specified and tested in P9.

---

## 15. ALL must preserve zero-unused performance

The implementation of `all()` is **not yet frozen**.

The following are candidates:

### Candidate A — registration expansion

Register the same route into a known set of method tables.

Potential benefit:

```text
no extra runtime fallback branch
```

Potential problem:

```text
HTTP method space is extensible, so true "all" cannot be represented by a permanently closed list.
```

### Candidate B — universal fallback table

Lookup:

```text
exact method
    ↓ miss
ALL table
```

Potential problem:

```text
permanent extra work on every request
```

### Candidate C — specialized router/application path

Applications that never use `all()` retain the current exact-method hot path.

Applications that use `all()` receive a specialized fallback path.

This direction is currently preferred conceptually because it matches Gelis zero-unused architecture, but it is **not frozen** until benchmarks and correctness tests validate it.

### Hard rule

Plain applications that do not use `all()` must not pay a permanent request-time branch solely because the framework supports `all()`.

---

## 16. Custom HTTP method escape hatch is required

HTTP methods are extensible.

Gelis must not permanently restrict the runtime router to only a closed union of known methods.

First-class helpers may exist for common or standardized methods:

```text
GET
POST
PUT
PATCH
DELETE
OPTIONS
HEAD
QUERY
...
```

but an escape hatch is required for methods such as:

```text
PURGE
PROPFIND
REPORT
SEARCH
M-SEARCH
```

Possible API shapes include:

```ts
app.on("PURGE", "/cache", handler);
```

or:

```ts
app.route("PURGE", "/cache", handler);
```

The final API name is **not frozen**.

### Runtime rule

The internal method representation should remain extensible, e.g. string-based method keys, unless benchmark evidence proves a better design without losing extensibility.

---

## 17. HTTP method architecture must remain modern

P9 must audit at least:

- GET
- HEAD
- POST
- PUT
- DELETE
- CONNECT
- OPTIONS
- TRACE
- PATCH
- QUERY
- custom methods
- all-method fallback

It must also define:

- HEAD fallback/response-body semantics
- OPTIONS behavior
- `Allow` header behavior
- method-not-allowed strategy
- route precedence
- custom method routing
- CORS interaction
- AOT representation
- typed client behavior

Do not assume legacy framework method lists are sufficient.

---

## 18. Content-Type architecture must expand

Gelis must grow beyond JSON-only ergonomics.

Required future investigation includes at least:

```text
application/json
text/plain
application/x-www-form-urlencoded
multipart/form-data
application/octet-stream
```

and Web Platform body types such as:

```text
FormData
Blob
ArrayBuffer
Uint8Array
ReadableStream
URLSearchParams
```

The architecture must remain extensible to custom media types.

---

## 19. Content parsing must be route-specific

Gelis must avoid a universal content-type parser branch on requests that do not need body parsing.

Preferred architecture:

```text
route declaration
      ↓
input/body requirements known
      ↓
registration/AOT plan
      ↓
specialized request execution
```

Examples:

```text
GET /health
  -> no body parser
  -> no Content-Type parser

POST /users
  -> JSON body plan
  -> JSON-specific parsing/validation path

POST /upload
  -> multipart body plan
  -> multipart-specific execution path
```

This is a required performance principle.

The exact implementation is not yet frozen.

---

## 20. Professional framework growth areas

Gelis is expected to investigate and support professional backend capabilities over time.

Potential architecture areas include:

### HTTP

- modern methods
- QUERY
- ALL
- custom methods
- HEAD
- OPTIONS / Allow
- content negotiation
- conditional requests
- range requests

### Request content

- JSON
- text
- form-urlencoded
- multipart
- binary
- streams

### Response

- JSON
- text
- binary/file
- Blob
- streams
- SSE
- redirects

### Transport/runtime

- Web Standards
- Bun
- Node.js
- compatible edge runtimes where justified

Tightly coupled runtime support should generally be evaluated first as `gelis/*` subpaths.

### Real-time

- WebSocket

### Platform

- startup/shutdown lifecycle
- observability
- logging integrations
- tracing
- metrics

### Security

- CORS
- CSRF
- secure headers
- body limits

### Tooling/ecosystem

- OpenAPI
- typed client
- AOT
- development tooling
- official runtime integrations

This list is a direction map, not a requirement that every item belongs in the portable root graph.

---

## 21. Core subpath vs standalone package rule

When adding a professional framework feature, ask:

1. Is this tightly coupled to Gelis runtime semantics?
2. Must it remain version-locked with core?
3. Is it primarily a runtime integration?
4. Can it remain isolated behind an export subpath?
5. Does it require independent dependencies or release cadence?
6. Would making users install another package create unnecessary friction?
7. Can it live as an official `@gelis/*` package without compromising ergonomics?
8. Can unused feature cost remain effectively zero?

### Prefer a `gelis/*` subpath when

the feature is tightly coupled to the Gelis runtime and should version together with core.

Examples:

```text
gelis/bun
```

Potential future runtime subpaths may include:

```text
gelis/node
gelis/cloudflare
```

only after dedicated architecture validation.

### Prefer `@gelis/*` when

the feature is a sufficiently independent ecosystem component with its own dependency graph, tooling concerns, or release needs.

Examples:

```text
@gelis/openapi
@gelis/client
```

A professional ecosystem is allowed to be large.

The portable root graph should remain disciplined.

---

## 22. Performance remains a hard architecture constraint

"Professional" must not become synonymous with "heavy".

Every major HTTP/runtime architecture phase must validate:

- correctness
- no unexpected request allocations
- direct-runtime performance
- HTTP throughput/latency where relevant
- zero-unused behavior
- TypeScript instantiation growth
- TypeScript memory
- TypeScript check time
- AOT behavior
- runtime adapter behavior
- package/subpath graph isolation where relevant

Architecture decisions must be evidence-driven.

Do not weaken frozen benchmark thresholds after observing results.

---

## 23. Competitor research policy

Gelis should actively study frameworks and runtimes including:

- Hono
- Elysia
- Fastify
- NestJS where architecture comparison is useful
- Bun
- Web Standards
- current HTTP RFCs
- OpenAPI

The purpose is not to clone competitor APIs.

The process should be:

```text
study competitor/runtime/standard
        ↓
identify useful architecture and bottlenecks
        ↓
adapt to Gelis constraints
        ↓
implement smallest viable design
        ↓
benchmark + correctness + type tests
        ↓
accept or reject
```

Gelis should be willing to adopt a proven ecosystem pattern when it improves user experience without violating Gelis constraints.

Gelis should also be willing to differ from competitors when portability, inference, AOT, or performance evidence justifies a better design.

---

## 24. Decisions accepted by this document

The following are architecture decisions, not casual suggestions:

1. GitHub organization remains `gelisjs`.
2. Core npm package is `gelis`.
3. Official standalone npm scope is `@gelis/*`.
4. `@gelisjs/*` npm naming is superseded.
5. Bun support is not a separate npm package.
6. `@gelis/bun` is superseded.
7. Bun is exposed as the official `gelis/bun` subpath.
8. Users should need only the `gelis` package to use Gelis on Bun.
9. Bun-specific source and types must remain isolated from the portable root graph.
10. The portable root graph must not import or depend on the Bun adapter.
11. Bun adapter and core are version-locked through the same `gelis` package release.
12. `prototype/bun` must graduate into production adapter source before P8-D7.
13. P8-D6-C Production Package Architecture is mandatory before P8-D7.
14. Same-package Bun support must not create permanent request overhead for portable/plain applications.
15. `@gelis/*` remains valid for standalone ecosystem packages such as `@gelis/openapi`.
16. Gelis is expected to grow into a professional framework.
17. Growth must preserve zero-unused architecture.
18. P9 HTTP Surface Architecture is required.
19. RFC 10008 `QUERY` support is required as a first-class Gelis method.
20. `all()`-style routing support is required.
21. Exact method routes must take precedence over all-method fallback.
22. Unused `all()` support must not add permanent plain-request overhead.
23. A generic/custom HTTP method escape hatch is required.
24. Runtime HTTP method representation must remain extensible.
25. Content-Type/body support must grow beyond JSON.
26. Body/content parsing should be route-specific and specialization-driven.
27. Competitor/standards research must precede major design freezes.
28. Performance, correctness, AOT safety, and TypeScript scalability remain hard gates.

---

## 25. Items deliberately not frozen yet

The following remain candidates until their own architecture phase validates them:

- final `serveReady()` public naming
- final Bun lifecycle server wrapper shape
- exact internal filesystem path for the Bun adapter
- final `packages/gelis` migration shape
- final package build output layout
- final package export conditions
- whether Bun types are represented through peer dependencies, development-only types, or another packaging mechanism
- final `all()` router implementation
- final custom-method API name (`on`, `route`, or another form)
- exact custom-method type API
- exact content-type declaration API
- exact multipart architecture
- exact WebSocket subpath/package boundary
- final source-folder reorganization
- whether future Node/Cloudflare integrations use `gelis/*` subpaths
- whether every official `@gelis/*` package lives in the main monorepo
- final OpenAPI compatibility strategy for pre-3.2 documents

These must not be treated as frozen merely because examples appear in this document.

---

## 26. Continuity rule

When future work conflicts with this document:

1. identify the conflicting accepted decision;
2. provide new technical evidence;
3. benchmark or validate where applicable;
4. explicitly amend this document;
5. do not silently drift architecture through implementation.

---

## 27. Public documentation hardening requirement

This document is an engineering continuity artifact.

Before Gelis is publicly launched or broadly promoted, accepted architecture must be transformed into polished public documentation.

Required release documentation hardening includes:

```text
[ ] remove development-process wording from public architecture surfaces
[ ] convert stable architecture decisions into ADRs where appropriate
[ ] separate roadmap state from architectural facts
[ ] remove obsolete candidates and superseded designs
[ ] remove prototype terminology after graduation
[ ] provide a developer-focused README
[ ] provide reproducible benchmark documentation
[ ] provide architecture overview
[ ] provide CONTRIBUTING.md
[ ] provide SECURITY.md
[ ] provide compatibility/runtime matrix
[ ] provide package/subpath documentation
[ ] manually review public API examples
[ ] ensure performance claims are backed by reproducible evidence
```

The repository may retain historical engineering documents during development, but public-facing documentation must communicate architecture, rationale, trade-offs, evidence, and compatibility rather than conversation or workflow residue.

---

## 28. Immediate next actions

Current sequence remains:

```text
1. P8-D6-B Bun Adapter Lifecycle             ✅ complete
2. Execute P8-D6-C Production Package Architecture
3. Freeze the gelis / gelis/bun production boundary
4. Graduate Bun adapter from prototype into production source
5. Add package export and declaration-isolation tests
6. Update tests and benchmarks to production package imports
7. Run P8-D7 zero-unused/performance/type-scaling gates
8. Freeze lifecycle public API in P8-D8
9. Begin P9 HTTP Surface Architecture
```

Do not skip step 2.

---

## References

- RFC 10008 — The HTTP QUERY Method  
  <https://www.rfc-editor.org/rfc/rfc10008>

- RFC 10008 information  
  <https://www.rfc-editor.org/info/rfc10008>

- OpenAPI Specification 3.2  
  <https://spec.openapis.org/oas/v3.2.0.html>

- Bun RFC 10008 support discussion  
  <https://github.com/oven-sh/bun/issues/34839>

- Hono repository  
  <https://github.com/honojs/hono>

- Elysia repository  
  <https://github.com/elysiajs/elysia>

- Fastify repository  
  <https://github.com/fastify/fastify>

- Nest repository  
  <https://github.com/nestjs/nest>
