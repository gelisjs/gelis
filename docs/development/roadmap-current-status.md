# Gelis Engineering Roadmap — Current Status

**Status:** Active roadmap status overlay  
**Date:** 2026-09-09  
**Master roadmap repository:** `gelisjs/gelis`

This file records the current milestone state while the longer historical `roadmap.md` remains in place.

The master ecosystem roadmap remains owned by the Gelis core repository even when official packages are implemented in separate repositories.

Package repositories own package-specific architecture, tests, benchmarks, and detailed implementation milestones.

At documentation-freeze boundaries, accepted package status is consolidated back into the master roadmap.

## Current macro state

```text
P9   HTTP Surface Architecture             COMPLETE

P10  OpenAPI & Contract Integration        ACTIVE
├── A  post-P9 contract/OpenAPI audit      COMPLETE
├── B  version + method strategy           FROZEN
├── C  request-body/media strategy         FROZEN
├── D  @gelis/openapi integration          ACCEPTED
├── E  provider compatibility              ACCEPTED
├── F  generation scalability              ACCEPTED
├── G  zero-runtime-overhead               ACCEPTED
└── H  public API + documentation freeze   ACTIVE
```

## P10 package ownership

Implementation repository:

```text
gelisjs/openapi
```

Current integration branch:

```text
architecture/post-p9-integration-v0.1
```

Accepted package evidence includes:

```text
P10-D
post-P9 OpenAPI 3.1.2 / 3.2.0 integration
QUERY + custom methods
ALL fail-closed
managed request-body parser/media projection

P10-E
Zod
ArkType
Valibot
Standard Schema / Standard JSON Schema provider boundary

P10-F
legacy B21 generation regression matrix
post-P9 rich 100 / 1,000 / 5,000 route scaling
OpenAPI 3.1.2 / 3.2.0 version-overhead gate
generated-document structural-growth gate

P10-G
metadata-only request-time isolation
package import-only request-time isolation
generate-once request-time isolation
plain + rich documented applications
5,000 routes
41 mirrored ABBA/BAAB samples
```

P10-F accepted measured source:

```text
85765908b91a400f01fa891f9ae64b7c15a376fa
```

The first P10-F candidate failed the frozen plain-route generation gate. The gate was not relaxed. The accepted candidate restored a standard-method fast path and made QUERY/custom-method representation pay-for-use.

P10-G accepted measured source:

```text
6e84bd324fb83de228e17c99736deea92e23d070
```

P10-G request-time results all passed the frozen `<= 1.03x` per-case gate. Package import/generate isolation produced a canonical geomean of `1.0055x`, passing the frozen `<= 1.02x` gate. Ratios below `1.0x` are treated as no-regression evidence only.

## Active P10-H objective

P10-H is the public API and documentation freeze boundary for OpenAPI & Contract Integration v0.1.

P10 does not complete merely because generation works.

P10-H must consolidate:

```text
accepted public API
OpenAPI 3.1.2 compatibility behavior
OpenAPI 3.2.0 full-fidelity behavior
QUERY/custom-method documentation semantics
managed body/media semantics
provider compatibility guidance
zero-runtime-overhead evidence
user-facing examples
migration/compatibility notes
package README
core master roadmap status
```

Internal phase labels may remain in historical architecture documents, but user-facing package documentation should describe features rather than requiring users to understand P10 labels.

P10-H must not introduce new runtime semantics unless a correctness issue requires reopening an earlier accepted phase. Documentation-only and packaging-surface work should preserve accepted D/E/F/G evidence.

## After P10

The next ecosystem planning work remains evidence-driven and is informed by the industrial capability matrix.

Near-term capability families include:

```text
HTTP essentials
cookies
CORS
body/request limits
secure headers
CSRF strategy
compression
ETag/cache
request ID
timeout/abort
static files

auth/state
bearer
JWT
sessions
rate limiting

data/realtime
industrial file upload
streaming
SSE
WebSocket

observability
structured logging
OpenTelemetry
server timing
health/readiness
metrics hooks

tooling
@gelis/openapi
@gelis/client
testing utilities
project scaffolding
```

Prioritization must continue to study Hono, Elysia, Fastify, and NestJS as different maturity/performance/ecosystem references rather than copying one framework wholesale.

## Repository rule

```text
gelisjs/gelis
= master ecosystem direction and cross-package dependencies

individual official package repositories
= detailed package architecture and execution roadmap
```

Cross-repository dependencies and ecosystem sequencing remain visible from the core roadmap.

## Release rule

Milestone completion is not release authorization.

No tag, GitHub Release, npm publish, or other public release action is automatic.

At release readiness, the assistant prepares the release checklist and exact commands. The maintainer performs or explicitly authorizes the release action.
