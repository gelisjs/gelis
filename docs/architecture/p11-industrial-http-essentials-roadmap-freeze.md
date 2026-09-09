# P11 Industrial HTTP Essentials — Roadmap Freeze

**Status:** ROADMAP / SCOPE FROZEN  
**Date:** 2026-09-09  
**Phase:** P11  
**Implementation status:** NOT STARTED

## Purpose

P11 closes the highest-priority HTTP capability gaps identified by the industrial capability matrix after P10 OpenAPI & Contract Integration completed.

The phase target is not simply to accumulate middleware.

The target is to establish production-grade HTTP essentials with:

```text
correct semantics
secure defaults where security is involved
predictable TypeScript APIs
portable Web Standards behavior where possible
runtime-specific specialization only where justified
pay-for-use execution cost
explicit package ownership
benchmark evidence
user documentation
```

## Capability scope

P11 owns these capability families:

```text
cookies
CORS
request/body limits
secure headers
request ID
timeout / abort policy
```

P11 explicitly does not yet own:

```text
JWT
sessions
CSRF implementation
rate limiting
industrial streaming multipart
SSE
WebSocket
OpenTelemetry
structured logger package
typed client productionization
```

Those remain later waves because several depend on or benefit from P11 foundations.

## Phase tree

```text
P11    Industrial HTTP Essentials
├── A  competitor semantics + API audit
├── B  ownership + execution architecture
├── C  cookie capability
├── D  CORS capability
├── E  request/body limit capability
├── F  secure headers capability
├── G  request ID + timeout/abort capability
└── H  cumulative correctness/security/type/performance/docs freeze
```

The phase tree is frozen. Detailed APIs, package names, and benchmark thresholds are not frozen until their owning subphase architecture is completed.

## P11-A competitor audit

P11-A must study equivalent capabilities in at least:

```text
Hono
Elysia
Fastify
NestJS
```

The audit must distinguish:

```text
core vs official plugin vs documented integration
portable semantics vs runtime-specific behavior
security defaults
error behavior
configuration surface
request-time topology
type inference / developer ergonomics
known ecosystem expectations
```

P11-A must not choose Gelis APIs by copying syntax.

It must identify semantic requirements first.

## P11-B ownership and execution architecture

Before implementing the individual capabilities, classify each as:

```text
core primitive
gelis/* subpath
@gelis/* official package
external/community integration
```

The classification must consider dependency weight, runtime coupling, security maintenance, portability, AOT/plugin integration, and zero-unused behavior.

P11-B must also define whether multiple HTTP essentials share one internal execution abstraction or remain independent. Avoid a universal always-on middleware chain solely for API uniformity.

## P11-C cookies

At minimum the architecture audit must cover:

```text
parse/get
set
delete
multiple Set-Cookie headers
HttpOnly
Secure
SameSite
Path
Domain
Max-Age / Expires
cookie name/value encoding rules
signed cookies
secret rotation policy
cookie prefixes / modern attributes where standards support them
malformed input behavior
Web Standards portability
```

Signed-cookie security acceptance must precede performance acceptance.

## P11-D CORS

At minimum:

```text
simple requests
preflight
origin policy
credentials
allowed methods
allowed headers
exposed headers
max age
Vary behavior
wildcard + credentials constraints
route/global placement
OPTIONS interaction with existing Gelis method semantics
```

CORS must integrate deliberately with the P9 automatic OPTIONS/Allow architecture rather than creating contradictory OPTIONS behavior.

## P11-E request/body limits

At minimum:

```text
Content-Length fast rejection where trustworthy
stream/body reader enforcement
missing Content-Length
chunked/streamed bodies
managed parser integration
multipart behavior
413 semantics
custom limit policy
route/global placement
runtime adapter differences
```

A declared limit must not rely only on client-provided Content-Length.

This phase is a prerequisite for later industrial upload architecture.

## P11-F secure headers

At minimum study a compact secure-default policy covering appropriate modern browser security headers while allowing explicit override/disable behavior.

The design must avoid claiming protection that depends on application-specific CSP policy when the framework cannot infer that policy safely.

## P11-G request ID + timeout/abort

Request ID scope must cover:

```text
accept existing trusted header policy
generate when absent
configurable header name
expose to handler/lifecycle without global type pollution
response propagation
```

Timeout/abort scope must cover:

```text
request deadline
AbortSignal propagation
handler/lifecycle semantics
Response race behavior
cleanup
runtime portability
interaction with already-aborted requests
```

Do not invent cancellation guarantees for user code or downstream libraries that ignore AbortSignal.

## Acceptance philosophy

Every capability follows:

```text
architecture + semantics freeze
        ↓
correctness tests
        ↓
security tests where relevant
        ↓
TypeScript/API tests
        ↓
zero-unused regression
        ↓
feature-enabled runtime benchmark
        ↓
HTTP benchmark where meaningful
        ↓
competitor equivalent-semantics comparison
        ↓
documentation freeze
```

Benchmark gates are declared before candidate measurements and are never relaxed after failure.

Negative benchmark deltas are no-regression evidence only unless broader evidence supports a stronger claim.

## P11-H cumulative close

P11-H must verify that the combined presence of accepted HTTP essentials does not destroy the performance architecture established before P11.

Cumulative verification must include both:

```text
plain application with all new capabilities unused

representative production application using several capabilities together
```

TypeScript scalability must be rerun if public generic surfaces materially change.

## Release boundary

P11 completion will not authorize npm publish, tags, or GitHub Releases.

Release remains a separate explicit maintainer-controlled process.

## Freeze decision

```text
P11 INDUSTRIAL HTTP ESSENTIALS ROADMAP FROZEN
P11-A COMPETITOR SEMANTICS + API AUDIT NEXT
```
