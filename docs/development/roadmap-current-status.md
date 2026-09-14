# Gelis Engineering Roadmap — Current Status

**Status:** Active roadmap status overlay  
**Date:** 2026-09-15  
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
├── C  cookie capability                   ACCEPTED
├── D  CORS capability                     ACCEPTED
├── E  request/body limit capability       ACCEPTED
├── F  secure headers capability           ACCEPTED
├── G  request ID + timeout/abort           ACTIVE — G1 FROZEN
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

## P11-C result

P11-C cookie capability is accepted in:

```text
docs/architecture/p11-c-cookie-capability-acceptance.md
```

Accepted source candidate:

```text
f2b104df8ffbe96348c51271a1868a1c4f9141c7
```

The first measured implementation failed the frozen unsigned performance gates and was not accepted. The gates were retained unchanged. A requested-name parser fast path, duplicate-aware specialized scan, ordinary serialization fast path, and removal of runtime rest-array allocation then produced the accepted measurement:

```text
get-8            0.5275x Hono
get-32           0.4736x Hono
generate-basic   0.6128x Hono
generate-rich    0.9568x Hono
signed-generate  0.9268x Hono
signed-verify    0.9781x Hono
unsigned geomean 0.6186x <= 1.05x PASS
```

These ratios are workload-specific acceptance evidence, not a universal speed claim.

The accepted cookie implementation remains isolated to `gelis/cookie`; root Gelis does not re-export the helper surface and ordinary application routing receives no cookie-specific request integration.

## P11-D result

P11-D CORS capability is accepted in:

```text
docs/architecture/p11-d-cors-capability-acceptance.md
```

Accepted source candidate:

```text
c2c1b9b72b776c073e7a0a0ae9429c8510a91a7a
```

Final acceptance candidate, including the benchmark ratio-direction correction:

```text
21790d2086fdbbc9fea0557e1eea62fc0fc33bd5
```

Final correctness gate:

```text
646 pass
0 fail
1798 expect() calls
```

Frozen zero-unused gates passed:

```text
static-raw     1.0040x control
dynamic-raw    1.0227x control
static-json    1.0008x control
dynamic-json   1.0243x control
geomean        1.0129x <= 1.015x PASS
```

Enabled CORS benchmark versus Hono 4.13.5 passed every frozen gate:

```text
actual-wildcard          0.4731x Hono
actual-allowlist         0.4120x Hono
actual-credentialed      0.3975x Hono
preflight-static-methods 1.0667x Hono
actual-dynamic-origin    0.4136x Hono
static geomean           0.5362x <= 1.05x PASS
```

Route-aware preflight scalability also passed:

```text
1,000 routes 2678.9 ns/op
5,000 routes 2674.7 ns/op
5000/1000   0.9955x <= 1.50x PASS
```

The first enabled-comparison acceptance output was a false negative caused by an inverted ratio in the benchmark harness. The measured nanoseconds were valid, the gating ratio was not. The harness was corrected without changing any frozen threshold and the complete benchmark was rerun.

These ratios are workload-specific acceptance evidence, not universal performance claims.

## P11-E result

P11-E request/body limit capability is accepted in:

```text
docs/architecture/p11-e-request-body-limit-acceptance.md
```

The accepted implementation preserves the frozen separation between portable framework policy and transport hard ceilings. `Content-Length` is only an early-rejection optimization; actual request-body bytes remain authoritative for Gelis-managed body reads.

P11-E also preserves route/application policy specialization, parser parity, raw limited-body reading, AOT semantics, and zero-unused behavior without turning the feature into a universal request wrapper.

## P11-F result

P11-F secure headers capability is accepted in:

```text
docs/architecture/p11-f-secure-headers-acceptance.md
```

Accepted implementation source candidate:

```text
98eae9a34fff92b3c7b40df1f67ed84aeb714cad
```

P11-F retained the frozen browser-security defaults, explicit application-owned CSP/isolation opt-ins, pay-for-use application response-policy integration, AOT preservation, zero-unused performance, and equivalent enabled comparisons against Hono 4.13.5.

P11-F completion explicitly names request ID + timeout/abort as the next P11 capability.

## Active P11-G objective

P11-G owns:

```text
gelis/request-id
gelis/timeout
```

Architecture, public API direction, security semantics, AOT requirements, resource-cleanup requirements, and performance gates are frozen in:

```text
docs/architecture/p11-g-request-id-timeout-capability-freeze.md
```

The accepted production control for P11-G is:

```text
457e14e491c2d27450a81ddbeb4a7db04b8f77b1
```

The current control quality gate is:

```text
744 pass
0 fail
2156 expect() calls
```

P11-G invariants include:

```text
request IDs are framework-generated by default
inbound request IDs require explicit adoption and validation
request-local state belongs to explicit capability instances
application and route deadlines are distinct from transport timeouts
framework timeout cancellation is cooperative through AbortSignal
route deadlines can tighten but not extend an active application deadline
Request objects are not cloned merely to replace request.signal
completed deadline paths must clean up timers and abort listeners
feature-absent applications and routes must retain the production fast path
```

Current subphase:

```text
G1  architecture/API/performance freeze  FROZEN
G2  request-ID validation + generator + capability state  NEXT
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
