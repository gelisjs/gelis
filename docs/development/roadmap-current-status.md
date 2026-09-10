# Gelis Engineering Roadmap — Current Status

**Status:** Active roadmap status overlay  
**Date:** 2026-09-10  
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
├── A  competitor semantics + API audit    COMPLETE
├── B  ownership + execution architecture  FROZEN
├── C  cookie capability                   ACTIVE
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

Core milestone acceptance:

```text
docs/architecture/p10-openapi-contract-integration-acceptance.md
```

## P11 Industrial HTTP Essentials

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

P11 explicitly does not yet own JWT, sessions, CSRF implementation, rate limiting, industrial streaming multipart, SSE, WebSocket, OpenTelemetry, structured logging, or typed-client productionization.

## P11-A result

P11-A is complete:

```text
docs/architecture/p11-a-competitor-semantics-api-audit.md
```

Key findings:

```text
cookies
-> prefer portable pure primitives where possible;
   retain strong prefix/security semantics and plan for signing/rotation

CORS
-> production baseline; must integrate with existing P9 automatic OPTIONS/Allow semantics

request/body limits
-> distinguish transport hard ceilings from portable framework policy;
   never trust Content-Length as the only enforcement

secure headers
-> static precompiled policy is a likely cheap fast path;
   dynamic CSP state must remain optional

request ID
-> inbound IDs are security/observability input and should not be blindly trusted by default

timeout/abort
-> distinguish transport timeout from application deadline;
   cancellation must be explicitly cooperative through AbortSignal
```

## P11-B result

P11-B is frozen in:

```text
docs/architecture/p11-b-ownership-execution-architecture-freeze.md
```

P11 official capability ownership is frozen to core-repository subpaths rather than six separate packages:

```text
gelis/cookie
gelis/cors
gelis/body-limit
gelis/secure-headers
gelis/request-id
gelis/timeout
```

The root `gelis` entrypoint remains minimal. Capabilities must use pay-for-use execution shapes rather than a universal middleware chain.

## Active P11-C objective

P11-C cookie architecture/API/performance gates are frozen in:

```text
docs/architecture/p11-c-cookie-capability-freeze.md
```

Current implementation scope:

```text
portable pure `gelis/cookie` subpath
cookie parsing with duplicate preservation
Set-Cookie generation/mutation helpers
secure prefix validation
SameSite=None / Partitioned Secure constraints
400-day persistence limits
WebCrypto HMAC-SHA256 signed cookies
secret rotation with discriminated verification results
portable package export/type checks
security regression tests
Hono comparison acceptance harness
```

The public parser deliberately trims only RFC optional whitespace (`SP` / `HTAB`) and does not use JavaScript Unicode `trim()` for cookie-name normalization. This protects against same-name confusion from non-ASCII whitespace.

P11-C may move to acceptance only after:

```text
bun run check                       PASS
frozen P11-C cookie benchmark       PASS
no root Gelis runtime integration   verified
public documentation                frozen
```

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
