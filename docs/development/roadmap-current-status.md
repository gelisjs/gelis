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

P10  OpenAPI & Contract Integration        COMPLETE
├── A  post-P9 contract/OpenAPI audit      COMPLETE
├── B  version + method strategy           FROZEN
├── C  request-body/media strategy         FROZEN
├── D  @gelis/openapi integration          ACCEPTED
├── E  provider compatibility              ACCEPTED
├── F  generation scalability              ACCEPTED
├── G  zero-runtime-overhead               ACCEPTED
└── H  public API + documentation freeze   ACCEPTED

P11  Industrial HTTP Essentials            ACTIVE
├── A  competitor semantics + API audit    ACTIVE
├── B  ownership + execution architecture  PLANNED
├── C  cookie capability                   PLANNED
├── D  CORS capability                     PLANNED
├── E  request/body limit capability       PLANNED
├── F  secure headers capability           PLANNED
├── G  request ID + timeout/abort           PLANNED
└── H  cumulative acceptance/docs freeze   PLANNED
```

## P10 completion

Implementation repository:

```text
gelisjs/openapi
```

Accepted integration branch:

```text
architecture/post-p9-integration-v0.1
```

Final P10-H exact checked candidate:

```text
0ea37471af520c4a19c826187786c09021c8ce37
```

Final package gate:

```text
84 pass
0 fail
463 expect() calls
```

P10-F accepted measured source:

```text
85765908b91a400f01fa891f9ae64b7c15a376fa
```

P10-G accepted measured source:

```text
6e84bd324fb83de228e17c99736deea92e23d070
```

P10-G package import/generate isolation produced a canonical geomean of `1.0055x`, passing the frozen `<= 1.02x` gate. Ratios below `1.0x` remain no-regression evidence only.

Package-side final acceptance:

```text
gelisjs/openapi
docs/p10-h-public-api-documentation-acceptance.md
```

Core milestone acceptance:

```text
docs/architecture/p10-openapi-contract-integration-acceptance.md
```

## P11 Industrial HTTP Essentials

P11 is the first numbered phase derived from the post-P10 industrial capability prioritization.

Roadmap freeze:

```text
docs/architecture/p11-industrial-http-essentials-roadmap-freeze.md
```

Planning basis:

```text
docs/development/industrial-capability-matrix-v0.1.md
docs/development/industrial-capability-prioritization-post-p10.md
```

P11 owns:

```text
cookies
CORS
request/body limits
secure headers
request ID
timeout / abort policy
```

These capabilities are sequenced before auth/state and upload/realtime because they provide foundational browser security, abuse resistance, state/cookie primitives, request correlation, and cancellation/deadline behavior.

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
structured logging package
typed client productionization
```

## Active P11-A objective

P11-A performs capability-specific semantic/API research against:

```text
Hono
Elysia
Fastify
NestJS
```

The audit must classify for every P11 capability:

```text
semantic requirements
security defaults
configuration surface
error behavior
portable vs runtime-specific behavior
request-time topology
type/DX model
core vs official package vs documented integration
```

P11-A is research/architecture work. It must not copy competitor syntax or begin production implementation before the ownership/execution boundary is established in P11-B.

## Post-P11 waves

Current accepted sequencing after P11 is capability-family based; phase codes are not yet frozen:

```text
Authentication + Stateful Security
        ↓
Transfer + Streaming + Realtime
        ↓
Observability + Operational Readiness
        ↓
Developer Tooling + Ecosystem Completion
```

Likely capability families include:

```text
Bearer / JWT / rate limiting / sessions / CSRF

industrial upload hardening / streaming / SSE / WebSocket

structured logging / OpenTelemetry / Server-Timing / health / metrics

@gelis/client / testing utilities / OpenAPI UI / scaffolding
```

Every capability still requires explicit classification as core, `gelis/*`, `@gelis/*`, or external/community integration.

## Performance policy

For P11 and later official capabilities:

```text
feature absent
-> as close to zero request-time cost as practical

feature enabled
-> specialized capability path

feature benchmarked
-> equivalent semantics against relevant competitors
```

Security semantics are not weakened to improve benchmark results.

Thresholds are frozen before measurements and are not relaxed after failure.

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
