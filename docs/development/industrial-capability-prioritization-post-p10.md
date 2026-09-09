# Gelis Industrial Capability Prioritization — Post-P10

**Status:** ACCEPTED PLANNING DIRECTION  
**Date:** 2026-09-09  
**Owner:** `gelisjs/gelis` master ecosystem roadmap  
**Basis:** `industrial-capability-matrix-v0.1.md` plus post-P10 competitor re-check

## Decision context

P10 OpenAPI & Contract Integration is complete.

The next work is not release engineering. The next work is to close the highest-value production capability gaps while preserving Gelis performance, type scalability, portability, and pay-for-use architecture.

The reference roles remain:

```text
Hono     -> portable Web Standards + compact built-in helpers/middleware
Elysia   -> Bun-first typed DX + official performance-oriented integrations
Fastify  -> broad maintained official plugin ecosystem
NestJS   -> enterprise capability/documentation breadth
```

Recent official documentation re-check confirms these remain useful reference roles. Fastify continues to expose the broadest first-party package catalog among the selected performance-oriented references, while Hono exposes a particularly dense set of HTTP middleware/helpers and Elysia maintains a typed Bun-oriented official plugin catalog.

Competitor capability presence is evidence of production expectations, not a requirement to copy competitor APIs.

## Post-P10 ordering

The accepted implementation ordering is:

```text
Wave 1  Industrial HTTP Essentials
        ↓
Wave 2  Authentication + Stateful Security
        ↓
Wave 3  Transfer + Streaming + Realtime
        ↓
Wave 4  Observability + Operational Readiness
        ↓
Wave 5  Developer Tooling + Ecosystem Completion
```

The waves are roadmap sequencing, not promises that every capability becomes a standalone package.

## Wave 1 — Industrial HTTP Essentials

Required capability families:

```text
cookies
CORS
request/body limits
secure headers
request ID
timeout / abort policy
```

Why first:

```text
cookies
-> prerequisite for mature session / CSRF / browser auth ergonomics

request/body limits
-> prerequisite for industrial upload hardening and abuse resistance

CORS + secure headers
-> baseline browser-facing security capabilities

request ID
-> prerequisite for practical request correlation / observability

timeout / abort
-> baseline operational request control and downstream cancellation policy
```

These features are common enough that forcing every application to rebuild them manually from raw headers is not considered industrial framework maturity.

## Wave 2 — Authentication + Stateful Security

Expected capability families:

```text
Bearer extraction
JWT
rate limiting
sessions / secure sessions
CSRF strategy
```

Exact ownership is not frozen yet.

Security acceptance must prioritize protocol/security correctness before performance.

## Wave 3 — Transfer + Streaming + Realtime

Expected capability families:

```text
file-upload hardening
file count / size policy
MIME or content-type verification strategy
large-upload / streaming multipart architecture
response streaming helpers
SSE
WebSocket
```

Gelis already has managed multipart parsing and native `File` reception, but that remains distinct from an industrial large-file/upload subsystem.

## Wave 4 — Observability + Operational Readiness

Expected capability families:

```text
structured logging strategy
OpenTelemetry
Server-Timing
health/readiness
metrics hooks
load/pressure integration where justified
```

Observability must preserve the plain-route pay-for-use principle.

## Wave 5 — Developer Tooling + Ecosystem Completion

Expected capability families:

```text
@gelis/client productionization
testing utilities
OpenAPI UI integration
project scaffolding
additional schema/tooling adapters where justified
```

OpenAPI generation itself is already accepted through P10.

## Placement rule

Every capability still requires an explicit ownership decision:

```text
A. gelis core primitive
B. gelis/* runtime-coupled subpath
C. @gelis/* official package
D. community/external integration
```

Do not create an official package merely because a competitor has one.

An official abstraction should provide at least one material advantage such as:

```text
correct portable semantics
secure defaults
strong Gelis typing
lifecycle/capability integration
runtime specialization
cross-runtime normalization
benchmarkable lower overhead
meaningful ergonomics
```

## Performance rule

Each Wave 1 capability must preserve:

```text
feature absent
-> as close to zero additional request cost as practical

feature enabled
-> capability-specific execution path

feature measured
-> equivalent-semantics comparison against relevant references
```

Thresholds must be frozen before candidate benchmark results are observed.

Security semantics may not be removed or weakened to win benchmarks.

## Release rule

No wave or capability completion authorizes release.

Release remains a separate maintainer-controlled process with explicit checklist and commands.

## Decision

```text
POST-P10 INDUSTRIAL PRIORITIZATION ACCEPTED

NEXT IMPLEMENTATION FAMILY:
INDUSTRIAL HTTP ESSENTIALS
```
