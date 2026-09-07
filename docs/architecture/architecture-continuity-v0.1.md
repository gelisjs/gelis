# Gelis Architecture Continuity v0.1

**Status:** Accepted architecture direction / implementation roadmap  
**Repository:** `gelisjs/gelis`  
**Purpose:** Permanent source of truth for package boundaries, framework growth principles, and the next HTTP surface architecture phases.

> This document records decisions that must survive chat/session changes.
> It distinguishes **accepted architectural constraints** from **implementation candidates that still require benchmark and correctness validation**.

---

## 1. Project identity and package namespace

Gelis uses different names for its GitHub organization and its official npm package scope.

### GitHub organization

```text
gelisjs
```

Primary repository:

```text
gelisjs/gelis
```

### npm packages

Core package:

```text
gelis
```

Official Gelis package scope:

```text
@gelis/*
```

Examples:

```text
@gelis/bun
@gelis/client
@gelis/openapi
```

### Superseded naming

Any older example using:

```text
@gelisjs/*
```

as the npm package scope is **superseded** and must not be used for official Gelis packages.

The canonical convention is:

```text
GitHub organization: gelisjs
npm package scope:   @gelis
```

---

## 2. Repository strategy

An npm package boundary does **not** imply a separate GitHub repository.

Tightly coupled official runtime packages may live in the same repository:

```text
gelisjs/gelis
```

while still publishing as separate npm packages.

Target direction:

```text
gelisjs/gelis
│
├── packages/
│   ├── gelis/
│   ├── bun/
│   └── client/
│
├── bench/
├── test/
├── docs/
└── ...
```

Expected public packages:

```text
packages/gelis   -> gelis
packages/bun     -> @gelis/bun
packages/client  -> @gelis/client
```

Other official packages may live in their own repositories when their ownership, release cadence, implementation size, or coupling justify it.

Example already consistent with this convention:

```text
GitHub: gelisjs/openapi
npm:    @gelis/openapi
```

Repository placement must be decided by architecture and maintenance boundaries, not by npm naming alone.

---

## 3. Core and adapter boundary

### Accepted rule

The Bun adapter is an **official Gelis package**, but it is **not part of the portable Gelis core**.

Dependency direction:

```text
@gelis/bun
    │
    ▼
  gelis
```

The reverse dependency is forbidden:

```text
gelis
  ✕
  ▼
@gelis/bun
```

The core package must not require Bun-specific APIs such as:

```text
Bun.serve
Bun.Server
Bun.Serve.*
```

The portable core remains based on Web Standards.

Runtime-specific packages may optimize aggressively for their target runtime as long as they preserve Gelis contracts.

### Performance rule

Package separation must not introduce permanent per-request abstraction cost.

The Bun adapter may perform startup-time work, readiness coordination, or transport ownership outside the request hot path, but the steady-state request path should remain as direct as the validated runtime permits.

---

## 4. `prototype/bun` graduation is mandatory

The current Bun adapter lives under:

```text
prototype/bun
```

because it began as an architecture/performance prototype.

That location is temporary.

Before final zero-unused performance validation, the Bun adapter must graduate into a production package boundary.

Required transition:

```text
prototype/bun
    ↓
production package boundary
    ↓
@gelis/bun
```

The production package architecture must be validated before Gelis treats adapter performance results as release-representative.

---

## 5. P8-D lifecycle roadmap

The required order is:

```text
P8-D6-A  AOT Startup Safety                 ✅ accepted
P8-D6-B  Bun Adapter Lifecycle              current
P8-D6-C  Production Package Architecture    REQUIRED
P8-D7    Zero-unused + Performance
P8-D8    Public Lifecycle API Freeze
```

### P8-D6-C is not optional

P8-D6-C must happen before P8-D7.

Its purpose is to ensure P8-D7 benchmarks and type-scaling validation measure the production-oriented package layout rather than a prototype location.

At minimum P8-D6-C must cover:

- official package namespace:
  - `gelis`
  - `@gelis/*`
- Bun adapter graduation
- dependency direction
- package-local TypeScript configuration
- package exports
- package build/typecheck boundaries
- benchmark imports from the production package path
- no runtime-specific dependency leakage into portable core

P8-D6-C must not be silently skipped.

---

## 6. Framework growth principle

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
- runtime/package boundaries

over:

- permanent request branches
- universal middleware chains
- always-on parsers
- always-on adapters
- large dependency graphs in core
- abstractions added only for aesthetic folder structure

---

## 7. Source organization principle

Source files should be organized according to real runtime, tooling, composition, and package boundaries.

Gelis must **not** refactor merely to imitate enterprise folder conventions.

A large file is not automatically an architecture defect.

A refactor is justified when it improves one or more of:

- hot-path clarity
- runtime specialization
- package isolation
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

## 8. Future HTTP Surface Architecture is required

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

## 9. HTTP `QUERY` is required as a first-class method

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

## 10. OpenAPI and QUERY

OpenAPI 3.2 includes `query` as a Path Item operation.

Reference:

- OpenAPI 3.2 specification: <https://spec.openapis.org/oas/v3.2.0.html>

The official Gelis OpenAPI integration must eventually represent first-class `QUERY` routes correctly.

This requirement applies to the official:

```text
@gelis/openapi
```

ecosystem.

Compatibility with older OpenAPI versions must be handled deliberately rather than silently losing the method.

---

## 11. Bun compatibility for QUERY

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

## 12. `app.all()` support is required

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

## 13. ALL must preserve zero-unused performance

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

## 14. Custom HTTP method escape hatch is required

HTTP methods are extensible.

Gelis must not permanently restrict the runtime router to only a closed union of known methods.

First-class helpers may exist for common/standard methods:

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

## 15. HTTP method architecture must remain modern

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

## 16. Content-Type architecture must expand

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

## 17. Content parsing must be route-specific

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

## 18. Professional framework growth areas

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
- official runtime adapters

This list is a direction map, not a requirement that every item belongs in core.

---

## 19. Core vs official package rule

When adding a professional framework feature, ask:

1. Is this required for Gelis routing/execution semantics?
2. Does every application need it?
3. Can it be zero-unused if kept in core?
4. Is it runtime-specific?
5. Does it add dependencies?
6. Can it live as an official `@gelis/*` package without request-path overhead?

Features should move outside core when that gives cleaner isolation without compromising Gelis ergonomics or performance.

A professional ecosystem is allowed to be large.

The portable core should remain disciplined.

---

## 20. Performance remains a hard architecture constraint

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
- adapter behavior

Architecture decisions must be evidence-driven.

Do not weaken frozen benchmark thresholds after observing results.

---

## 21. Competitor research policy

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

Gelis should be willing to differ from competitors when its portability, inference, AOT, or performance constraints justify a better design.

---

## 22. Decisions accepted by this document

The following are architecture decisions, not casual suggestions:

1. GitHub organization remains `gelisjs`.
2. Official npm scope is `@gelis/*`.
3. Core package is `gelis`.
4. `@gelisjs/*` npm naming is superseded.
5. Bun adapter is not part of portable core.
6. Bun adapter should be an official `@gelis/bun` package.
7. Bun adapter may remain in the `gelisjs/gelis` repository as a separate package.
8. `prototype/bun` must graduate to a production package boundary.
9. P8-D6-C Production Package Architecture is mandatory before P8-D7.
10. Package separation must not create permanent request overhead.
11. Gelis is expected to grow into a professional framework.
12. Growth must preserve zero-unused architecture.
13. P9 HTTP Surface Architecture is required.
14. RFC 10008 `QUERY` support is required as a first-class Gelis method.
15. `all()`-style routing support is required.
16. Exact method routes must take precedence over all-method fallback.
17. Unused `all()` support must not add permanent plain-request overhead.
18. A generic/custom HTTP method escape hatch is required.
19. Runtime HTTP method representation must remain extensible.
20. Content-Type/body support must grow beyond JSON.
21. Body/content parsing should be route-specific and specialization-driven.
22. Competitor/standards research must precede major design freezes.
23. Performance, correctness, AOT safety, and TypeScript scalability remain hard gates.

---

## 23. Items deliberately not frozen yet

The following remain candidates until their own architecture phase validates them:

- final `serveReady()` public naming
- final Bun lifecycle server wrapper shape
- final `all()` router implementation
- final custom-method API name (`on`, `route`, or another form)
- exact custom-method type API
- exact content-type declaration API
- exact multipart architecture
- exact WebSocket package/core boundary
- final source-folder reorganization
- whether every official `@gelis/*` package lives in the main monorepo
- final OpenAPI compatibility strategy for pre-3.2 documents

These must not be treated as frozen merely because examples appear in this document.

---

## 24. Continuity rule

When future work conflicts with this document:

1. identify the conflicting accepted decision;
2. provide new technical evidence;
3. benchmark or validate where applicable;
4. explicitly amend this document;
5. do not silently drift architecture through implementation.

This document exists to prevent important Gelis decisions from becoming transient conversation context.

---

## 25. Immediate next actions

Current sequence remains:

```text
1. Finish P8-D6-B Bun Adapter Lifecycle
2. Commit and verify P8-D6-B
3. Execute P8-D6-C Production Package Architecture
4. Freeze production package boundaries in repository documentation
5. Migrate Bun adapter from prototype into the production package structure
6. Update tests and benchmarks to production package imports
7. Run P8-D7 zero-unused/performance/type-scaling gates
8. Freeze lifecycle public API in P8-D8
9. Begin P9 HTTP Surface Architecture
```

Do not skip step 3.

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
