# Gelis Industrial Capability Matrix v0.1

**Status:** BASELINE AUDIT / PRIORITIES PRELIMINARY  
**Date:** 2026-09-09  
**Owner:** master ecosystem roadmap in `gelisjs/gelis`  
**Companion:** `industrial-readiness-strategy-v0.1.md`

## Purpose

This document establishes a concrete industrial-capability baseline for Gelis by comparing the current framework against four deliberately different reference frameworks:

```text
Hono     → portable Web Standards + compact built-in helpers
Elysia   → Bun-first typed DX + performance-oriented integration
Fastify  → mature low-overhead official plugin ecosystem
NestJS   → enterprise application capability breadth
```

The matrix is not a request to clone competitor APIs.

Its purpose is to answer:

```text
What do production backend developers reasonably expect?
Which capabilities are already present in Gelis?
Which gaps are fundamental versus ergonomic?
Which capabilities belong in core, a subpath, or @gelis/*?
Which capabilities should be benchmarked against competitors?
```

Competitor presence is evidence, not a Gelis specification.

---

# 1. Support legend

Competitor columns use the following broad classification:

```text
C   core / first-class framework capability
O   official maintained helper/plugin/package
D   officially documented integration/pattern
K   community ecosystem surfaced by official docs
—   no first-party capability identified in the reviewed official material
```

These markers do not claim identical semantics.

For example, `O` for JWT in two frameworks means both provide an official JWT capability, not that algorithms, security defaults, typing, or performance are equivalent.

Gelis status uses:

```text
YES       production-capable primitive/surface exists
PARTIAL   lower-level primitive exists but industrial ergonomics are incomplete
PROTO     prototype exists but is not yet an official production package
NO        no first-class official Gelis capability yet
```

Priority candidates:

```text
P0  industrial baseline / high-value foundation
P1  official ecosystem baseline
P2  extended ecosystem after the baseline is credible
```

Priority is architectural planning input, not a release promise.

---

# 2. HTTP + security essentials

| Capability | Gelis now | Hono | Elysia | Fastify | NestJS | Preliminary Gelis placement | Priority |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Cookies: parse/get/set/delete | NO | O | C | O | D | `gelis/cookie` or small official package | P0 |
| Signed cookies | NO | O | C | O via cookie/session ecosystem | D/pattern | same cookie capability | P0 |
| Secret rotation | NO | — in reviewed helper | C | ecosystem-dependent | D/pattern | same cookie capability | P0 |
| Modern cookie attributes/prefix constraints | NO | O | C | O | D | same cookie capability | P0 |
| CORS | NO | O | O | O | C/D | `@gelis/cors` or compact subpath | P0 |
| CSRF protection | NO | O | K | O | D | official security capability | P1 |
| Secure headers / Helmet-like policy | NO | O | K | O | D | `@gelis/secure-headers` or subpath | P0 |
| Request/body size limit | NO | O | K | core/platform + plugins | platform configuration | `gelis/body-limit` + adapter hooks | P0 |
| Compression | NO | O | K | O | D | runtime-aware official package | P1 |
| ETag / cache helpers | NO | O | K | O | D/pattern | compact helper/plugin | P1 |
| Request ID | NO | O | K | ecosystem/core patterns | D/pattern | official plugin | P0 |
| Timeout / abort policy | NO helper | O | lifecycle primitive / K | hooks/plugins | D/pattern | portable helper + adapter awareness | P0 |
| Static files | NO helper | adapter-specific helper | O | O | D | `@gelis/static`, runtime-aware | P1 |
| Proxy/IP-aware request metadata | NO first-class | adapter helper / middleware | runtime/integration | core/plugin ecosystem | platform integration | adapter boundary + helper | P1 |

### Interpretation

Gelis currently exposes raw Web Standard headers and `Request`/`Response`, so applications can manually implement many rows above.

That is not considered feature parity.

Industrial framework maturity requires:

```text
correct semantics
secure defaults
reusable APIs
clear portability boundaries
error behavior
benchmarks
maintained documentation
```

---

# 3. Authentication + state

| Capability | Gelis now | Hono | Elysia | Fastify | NestJS | Preliminary Gelis placement | Priority |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Bearer token extraction | NO | O | O | O | D | compact helper or `@gelis/bearer` | P0 |
| JWT sign/verify | NO | O | O | O | D | `@gelis/jwt` | P0 |
| Session abstraction | NO | — first-party in reviewed core docs | K/pattern | O | D | `@gelis/session` | P1 |
| Secure stateless cookie session | NO | custom pattern | core cookie + pattern | O | D/pattern | `@gelis/session` + cookie capability | P1 |
| Rate limiting | NO | third-party/community commonly used; not built-in list reviewed | K | O | D | `@gelis/rate-limit` | P0 |
| Authorization composition | plugin foundation only | middleware/pattern | guard/macro/plugin patterns | O auth ecosystem | C/D guards | core/plugin composition + optional package | P1 |
| OAuth/OIDC integration | NO | integrations/community | K/integrations | O OAuth2 + ecosystem | D | strategy first; vendor-neutral helper or integrations | P2 |

### Security rule

JWT, sessions, CSRF, cookie signing, and rate limiting must never be accepted based on throughput alone.

Their gate ordering must be:

```text
protocol/security correctness
        ↓
attack/misconfiguration tests
        ↓
type/API correctness
        ↓
zero-unused regression
        ↓
performance comparison
```

---

# 4. File transfer + realtime

| Capability | Gelis now | Hono | Elysia | Fastify | NestJS | Preliminary Gelis placement | Priority |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Multipart parsing | YES | C/helper | C | O | D | core remains | already present |
| Native `File` reception | YES | C/helper | C | O | D | core remains | already present |
| Multiple file fields | YES primitive | C/helper | C | O | D | core remains | already present |
| Per-file size validation | NO ergonomic policy | body-limit is request-level | C schema support | O multipart config | D upload interceptors | core limit primitive + upload layer | P0 |
| File count limits | NO | manual/body limit | C schema support | O multipart config | D upload config | upload layer | P0 |
| MIME/magic-number validation | NO | manual | C utility / typed validator support | application/plugin | application integration | `gelis/file` helper or upload package | P0 |
| Streaming multipart / large upload architecture | NO | stream/runtime-dependent | Bun/runtime dependent | O multipart streaming patterns | platform-dependent | separate architecture milestone | P0 |
| Storage adapters | NO | external | external | ecosystem | integrations | optional `@gelis/storage-*` only if justified | P2 |
| Generic response streaming helper | raw `Response` only | O | C | core/stream plugins | D | `gelis/streaming` over Web Streams | P0 |
| Server-Sent Events | NO helper | O | C | O | C/D | `gelis/sse` or official package | P0 |
| WebSocket | NO official surface | adapter helper | C | O | C/D | runtime adapter capability; Bun fast path first | P1 |

### Current upload verdict

Gelis can already receive uploaded files.

It is **not** yet an industrial upload subsystem.

Current managed multipart parsing buffers the request body before native `FormData` normalization. Large-file behavior, request limits, streaming, MIME verification, and storage policy remain separate work.

---

# 5. Observability + operations

| Capability | Gelis now | Hono | Elysia | Fastify | NestJS | Preliminary Gelis placement | Priority |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Request logger | NO official | O | K | core logger ecosystem | C/D | logger integration, not necessarily own logging engine | P0 |
| Structured application logging | NO | basic logger + integrations | K | strong built-in logger model | C/D | `@gelis/logger` integration strategy | P0 |
| OpenTelemetry tracing | NO | external/third-party | O | O | ecosystem/integration | `@gelis/opentelemetry` | P0 |
| Server-Timing | NO | O timing middleware | O | plugins/patterns | pattern | `@gelis/server-timing` or subpath | P1 |
| Health endpoint helper | NO | simple route pattern | pattern | ecosystem | Terminus/integration patterns | `@gelis/health` | P1 |
| Readiness/liveness dependency checks | NO | pattern | pattern | O under-pressure + ecosystem | D | `@gelis/health` capability dependencies | P1 |
| Load/pressure protection | NO | custom | custom/plugin | O `under-pressure` | integration | runtime/adapter-aware plugin | P2 |
| Metrics integration | NO | external | OTel/community | ecosystem | ecosystem | OTel metrics first; dedicated package only if needed | P1 |

### Observability principle

Gelis should avoid forcing logging/tracing checks through every plain route.

Official observability packages should compile/install through the existing application/plugin lifecycle so that applications not using them retain the plain execution path as closely as possible.

---

# 6. Contract + developer tooling

| Capability | Gelis now | Hono | Elysia | Fastify | NestJS | Preliminary Gelis placement | Priority |
| --- | --- | --- | --- | --- | --- | --- | --- |
| OpenAPI generation | PARTIAL: official package exists, post-P9 update pending | ecosystem/integrations | O | O | O/D | `@gelis/openapi` | P0 / active P10 |
| API documentation UI | NO official Gelis integration yet | integrations | O OpenAPI UI | O Swagger UI | O Swagger | `@gelis/openapi-ui` or provider option | P1 |
| Typed client | PROTO | C/RPC client helper | O Eden | external ecosystem | generated clients via OpenAPI/ecosystem | `@gelis/client` | P0 |
| Testing helpers | general `app.fetch()` testing; no focused package | O helper | Bun/testing patterns | inject/testing APIs | C testing utilities | `gelis/testing` or `@gelis/testing` | P0 |
| Project scaffolding | NO | `create-hono` | community/create tooling | CLI/ecosystem | Nest CLI | `create-gelis` | P1 |
| Schema provider adapters | Standard Schema + OpenAPI resolver architecture | validator ecosystem | TypeBox/Standard Schema | type-provider ecosystem | class-validator/Zod integrations | keep Standard Schema core; optional tooling adapters | P1 |
| Contract serialization | core snapshot exists | RPC/types | OpenAPI/Eden | schemas/OpenAPI | decorators/OpenAPI | core semantic contract + official tooling | P0 |

---

# 7. Plugin/ecosystem architecture comparison

Gelis is not starting from zero.

Current plugin architecture already provides:

```text
definePlugin
capability provide/require
explicit dependency failure
plugin-owned routes
onRequest
onError
beforeHandle
afterHandle
application scope
request scope
startup
cleanup
AOT capture integration
```

This means the next problem is catalog maturity rather than plugin-system invention.

## Reference lessons

### Hono

Useful lesson:

> Small portable helpers and middleware can provide a broad production surface without requiring a heavyweight container/runtime architecture.

Gelis should study Hono particularly for:

```text
cookie ergonomics
body limit
secure headers
CORS
request ID
timeout
streaming/SSE
portable adapter boundaries
```

### Elysia

Useful lesson:

> Strong typed DX can make common backend features feel native without necessarily making them global runtime costs.

Gelis should study Elysia particularly for:

```text
typed cookies
secret rotation
file schema ergonomics
magic-number validation
WebSocket typing
SSE/stream ergonomics
Bun-native integration
Eden-style client DX
official OpenTelemetry
```

### Fastify

Useful lesson:

> A framework can keep a focused core while maintaining a very broad first-party ecosystem with explicit compatibility responsibility.

Fastify is the strongest current reference in this matrix for official package breadth, including maintained packages for areas such as:

```text
cookie
CORS
CSRF
compression
ETag
helmet
JWT
multipart
OAuth2
OpenTelemetry
rate limiting
sessions
secure sessions
SSE
static files
Swagger/OpenAPI
WebSocket
under-pressure
Redis/Postgres/MySQL/MongoDB integrations
```

Gelis should copy the maintenance discipline, not automatically the package count.

### NestJS

Useful lesson:

> Industrial developers expect documented solutions not only for HTTP routing but for security, files, state, jobs, queues, realtime, testing, and operations.

NestJS is primarily a breadth and enterprise-workflow reference for Gelis, not a request-hot-path architecture reference.

---

# 8. Preliminary Gelis industrial baseline

The audit identifies a credible first baseline of capabilities that should be resolved before Gelis is marketed as broadly production-ready.

This is not yet a numbered roadmap freeze.

## P0 capability set

```text
OpenAPI post-P9 integration          active P10
cookie primitives + security
CORS
secure headers
request/body limits
request ID
timeout / abort ergonomics
Bearer helper
JWT
rate limiting
file-upload hardening
streaming helpers
SSE
structured logging strategy
OpenTelemetry
typed client
testing helpers
```

## P1 capability set

```text
CSRF package/strategy
compression
ETag/cache helpers
static files
sessions / secure sessions
WebSocket official integration
Server-Timing
health/readiness
OpenAPI UI
project scaffolding
schema/tooling adapters
```

## P2 capability candidates

```text
OAuth/OIDC provider ecosystem
pressure/load shedding
storage adapters
cron/scheduling
queues
GraphQL
Redis/cache packages
database connector packages
Kafka/messaging integrations
```

P2 items are not automatically official packages.

---

# 9. Capability placement rule

Before implementation every row must be classified as one of:

```text
A. core primitive
B. gelis/* subpath
C. @gelis/* official package
D. community/external integration
```

Placement must consider:

```text
portable Web Standards feasibility
runtime-specific dependencies
dependency graph size
security maintenance burden
release cadence
hot-path integration needs
type-system coupling
AOT integration
whether a wrapper adds real value
```

Examples that currently look plausible, but are not frozen:

```text
gelis/cookie
@gelis/cors
gelis/body-limit
@gelis/jwt
@gelis/session
@gelis/rate-limit
gelis/streaming
gelis/sse
@gelis/static
@gelis/opentelemetry
@gelis/openapi
@gelis/client
gelis/testing
create-gelis
```

Exact package names and boundaries require dedicated architecture phases.

---

# 10. Performance policy for ecosystem features

Each capability must define gates before benchmark results are observed.

A general acceptance template is:

```text
correctness
security/protocol semantics where relevant
TypeScript correctness
zero-unused regression
feature-enabled runtime benchmark
real HTTP benchmark where meaningful
competitor comparison with equivalent semantics
startup/memory/build cost where meaningful
documentation
```

The target remains aggressive:

> For comparable capability and semantics, Gelis should attempt to equal or outperform the relevant reference framework while preserving stronger or equivalent correctness and type guarantees.

However:

```text
security checks are not removed to improve throughput
benchmarks are workload-specific
negative deltas are not universal speedup claims
thresholds are frozen before measurement
```

---

# 11. Release relationship

This matrix does not authorize a release.

It also does not imply that every P0/P1 row must exist before any experimental package version can ever be published.

Instead it establishes the distinction between:

```text
package can be published
        ≠
framework can be marketed as industrially mature
```

A future release-readiness phase must explicitly define which industrial capability set is required for that release label.

All actual npm/tag/GitHub release actions remain maintainer-authorized only.

---

# 12. Official sources reviewed

## Hono

```text
https://hono.dev/docs/api
https://hono.dev/docs/concepts/middleware
https://hono.dev/docs/helpers/cookie
https://hono.dev/docs/middleware/builtin/body-limit
https://hono.dev/docs/helpers/streaming
https://hono.dev/docs/helpers/websocket
```

## Elysia

```text
https://elysiajs.com/plugins/overview
https://elysiajs.com/patterns/cookie
https://elysiajs.com/essential/validation
https://elysiajs.com/patterns/websocket
https://elysiajs.com/essential/handler
https://elysiajs.com/plugins/cors
https://elysiajs.com/plugins/openapi
https://elysiajs.com/plugins/server-timing
```

## Fastify

```text
https://fastify.dev/docs/latest/Guides/Ecosystem/
https://fastify.dev/ecosystem/
```

## NestJS

```text
https://docs.nestjs.com/techniques
https://docs.nestjs.com/security/authentication
https://docs.nestjs.com/websockets/gateways
https://docs.nestjs.com/microservices/basics
https://docs.nestjs.com/openapi/introduction
```

---

# 13. Baseline verdict

```text
INDUSTRIAL CAPABILITY MATRIX v0.1 ESTABLISHED
```

The current conclusion is:

1. Gelis already has a serious runtime, contract, lifecycle, AOT, type-scaling, and plugin foundation.
2. Gelis already has multipart/native-File reception but not yet industrial upload handling.
3. Gelis does not yet expose a first-class cookie capability.
4. The largest maturity gap is the official capability catalog, not the existence of a plugin architecture.
5. Hono, Elysia, Fastify, and NestJS provide complementary reference points and should remain part of capability-specific research.
6. Fastify is the strongest reference for official ecosystem breadth; Hono for portable compact middleware/helpers; Elysia for Bun-native typed DX; NestJS for enterprise breadth.
7. P10 OpenAPI integration remains the immediate engineering milestone.
8. After P10, the matrix should be converted into numbered industrial-readiness phases with frozen capability boundaries and benchmarks.
9. No release action is authorized by this matrix.
