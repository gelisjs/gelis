# Gelis Industrial Readiness Strategy v0.1

**Status:** Accepted direction / detailed capability matrix pending  
**Branch:** `architecture/composition-v0.1`  
**Recorded after:** P9 HTTP Surface Architecture acceptance

## Purpose

Gelis is not being developed only as a fast router or benchmark project.

The product target is a production-grade TypeScript backend framework that can be adopted for industrial workloads while preserving Gelis's defining constraints:

```text
correctness
predictability
security
composability
runtime performance
TypeScript scalability
near-zero unused-feature cost
```

Industrial maturity requires both a strong core and a credible official ecosystem.

Capability parity with established frameworks is a roadmap input, but Gelis must not clone competitor APIs or architectures blindly.

## Release authority rule

Publishing is always a deliberate maintainer action.

The assistant or automation must not independently perform any release action, including:

```text
npm publish
Git tag creation for a release
GitHub Release publication
release branch publication
package-version publication
registry promotion
```

When Gelis reaches a release phase, the required process is:

1. prepare the release candidate and complete all frozen release gates;
2. present the maintainer with the exact release checklist;
3. present the exact commands and expected outputs;
4. identify irreversible or externally visible actions clearly;
5. require the maintainer to execute or explicitly authorize each release action.

No release is inferred from phrases such as "ready", "accepted", "freeze", "complete", or "continue".

## Competitive reference set

The initial industrial-capability audit must study at least:

```text
Hono     portable / Web Standards / low-overhead ergonomics
Elysia   Bun-first / typed DX / performance-oriented feature integration
Fastify  mature low-overhead plugin ecosystem and production operations
NestJS   enterprise capability breadth and production application patterns
```

Additional frameworks may be studied when they provide a materially relevant architecture or ecosystem pattern.

Competitor study has two independent goals:

1. determine which capabilities developers reasonably expect from a modern backend framework;
2. identify implementation strategies and costs Gelis can avoid or improve.

Competitor behavior is evidence, not specification. Gelis semantics must be designed deliberately.

## Performance position

The performance target is aggressive.

For comparable capabilities, Gelis should aim to equal or outperform competing frameworks on representative workloads while retaining stronger or equivalent correctness and type-system guarantees.

However:

- benchmark gates must be declared before results;
- comparisons must use equivalent semantics where possible;
- runtime and framework versions must be recorded;
- negative deltas are not universal speed claims;
- security or correctness must never be weakened to win a microbenchmark;
- unused capabilities should remain as close to zero-cost as practical.

The objective is not benchmark marketing. The objective is an industrial framework whose architecture remains fast as its capability surface grows.

## Current capability observations after P9

### Multipart / file reception

Gelis already has managed `multipart/form-data` request parsing.

The runtime representation preserves Web Standard `File` values:

```text
string | File | Array<string | File>
```

Therefore Gelis can already receive uploaded files as multipart fields.

This is an HTTP parsing primitive, not yet a complete industrial upload subsystem.

The industrial capability audit must separately evaluate:

```text
request/body limits
per-file limits
file-count limits
streaming versus buffering
MIME/content sniffing policy
file metadata validation
temporary-file behavior
storage adapters
large-upload behavior
abort/cancellation behavior
security limits
```

Storage concerns such as local disk, S3-compatible object storage, cloud object stores, NAS, and application-specific persistence should not automatically become core responsibilities.

### Cookies

No first-class cookie helper or cookie subsystem is currently part of the Gelis source surface.

Raw Web Standard headers remain available, but industrial ergonomics require deliberate design for at least:

```text
parse/get
set
delete
attributes
signed cookies
secret rotation
prefix constraints
SameSite / Secure / HttpOnly
partitioned cookies where applicable
```

Cookie support must be designed with current cookie security semantics rather than as a simple string helper.

### Plugin foundation

Gelis already has a production-oriented plugin foundation including:

```text
definePlugin
capability provide/require
plugin dependency enforcement
plugin-owned routes
onRequest / onError composition
beforeHandle / afterHandle composition
application scope
request scope
startup callbacks
cleanup callbacks
AOT capture integration
```

The next ecosystem problem is therefore not merely "create a plugin system".

The problem is to define, implement, benchmark, document, and maintain a useful official plugin/capability catalog on top of this foundation.

## Capability placement rule

Every new capability must be classified before implementation.

### A. Core primitive

Use core only when the capability is fundamental to ordinary HTTP/runtime behavior and can remain compact and portable.

### B. Core subpath

Use a `gelis/*` subpath for tightly coupled runtime/framework integration that should version with core but should not enlarge the portable root graph unnecessarily.

### C. Official ecosystem package

Use `@gelis/*` when the capability has an independent dependency graph, substantial implementation, separate integrations, or a reason to evolve outside the core request path.

### D. Community / external integration

Do not make every database, queue, auth vendor, or infrastructure client an official package merely to increase package count.

Official status must represent a maintenance and compatibility commitment.

## Preliminary industrial capability families

The detailed audit will determine exact priority and package placement. The following families must be evaluated before Gelis is considered industrially mature.

### HTTP and security essentials

```text
cookies
CORS
CSRF strategy
secure headers
request/body limits
compression
ETag/cache helpers
request ID
IP/proxy-aware request metadata
timeout / abort handling
static files
```

### Authentication and state

```text
Bearer utilities
JWT
sessions
secure cookie sessions
rate limiting
authorization composition
OAuth/OIDC integration strategy
```

### Data transfer and realtime

```text
multipart/file-upload ergonomics
streaming helpers
Server-Sent Events
WebSocket
large payload handling
```

### Observability and operations

```text
structured logging
OpenTelemetry
server timing
health/readiness
load/pressure signals
metrics integration
```

### Contract and developer tooling

```text
@gelis/openapi
@gelis/client
OpenAPI UI strategy
testing helpers
contract/schema adapters
scaffolding / project creation strategy
```

### Extended official ecosystem candidates

These require separate architecture decisions and are not automatically core requirements:

```text
cron/scheduling
queues
GraphQL
Redis/cache integrations
database/ORM integrations
message brokers
serverless/runtime adapters
proxy support
HTML/view integrations
```

## Minimum-ecosystem principle

The first official ecosystem baseline should cover the capabilities a professional API team is likely to need repeatedly without requiring developers to reconstruct security-sensitive or protocol-sensitive behavior by hand.

The baseline must not be defined by package count.

A smaller set of high-quality, fast, tested, maintained official capabilities is preferred over a large shallow catalog.

Every official capability should have the relevant subset of:

```text
architecture specification
correctness tests
type tests
zero-unused verification
runtime benchmark
real HTTP benchmark
security tests / threat analysis
compatibility tests
documentation
examples
version compatibility policy
```

## Roadmap relationship

P9 HTTP Surface Architecture is complete.

The immediate next implementation milestone remains:

```text
P10 — OpenAPI & Contract Integration
```

P10 should synchronize the final P9 HTTP/contract surface with `@gelis/openapi` before new industrial features multiply the contract surface further.

In parallel with P10 architecture work, a competitor capability matrix must be completed and used to define the post-P10 industrial roadmap.

A likely macro sequence is:

```text
P10  OpenAPI & Contract Integration
  ↓
Industrial HTTP Essentials
  ↓
Official Ecosystem Baseline
  ↓
Performance Architecture Re-evaluation
  ↓
Router Grammar & Matching v0.2
  ↓
Industrial Release Readiness
  ↓
maintainer-controlled release
```

Names and exact phase numbers after P10 remain provisional until the competitor capability matrix is frozen.

## Release-readiness meaning

"Ready for release" must eventually mean more than passing core runtime tests.

At minimum the release-readiness phase must cover:

```text
public API stability review
package exports and declaration output
installation from packed artifact
portable and Bun consumer tests
security review
compatibility matrix
documentation and examples
migration/versioning policy
CI/release automation review
changelog/release notes
benchmark evidence
npm package metadata
license/provenance checks
manual maintainer release procedure
```

Passing those gates permits the maintainer to release. It does not itself publish anything.

## Current conclusion

Gelis already has strong foundations in routing, validation, lifecycle, response contracts, HTTP method semantics, content-type handling, AOT, TypeScript scalability, and plugin composition.

The next maturity gap is ecosystem breadth and productized industrial capability.

The framework should now grow deliberately from a fast core into a complete official ecosystem while preserving the architecture that made the core fast in the first place.
