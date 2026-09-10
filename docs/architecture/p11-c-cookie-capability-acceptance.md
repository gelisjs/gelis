# P11-C Cookie Capability Acceptance

**Status:** ACCEPTED  
**Date:** 2026-09-10  
**Phase:** P11-C  
**Public owner:** `gelis/cookie`  
**Accepted implementation candidate:** `f2b104df8ffbe96348c51271a1868a1c4f9141c7`

## Result

P11-C is accepted.

The capability satisfies the frozen architecture, security, package-isolation, type-system, and competitor-performance requirements from:

```text
docs/architecture/p11-c-cookie-capability-freeze.md
```

The maintainer followed the frozen execution order and ran the project correctness gate before the final benchmark candidate.

## Accepted public capability

`gelis/cookie` provides portable Web Standards helpers for:

```text
cookie lookup
duplicate-aware cookie lookup
Set-Cookie generation
Set-Cookie append mutation
deletion cookies
HMAC-SHA256 signed cookies
secret rotation
explicit signed-cookie result discrimination
```

The root `gelis` entrypoint does not re-export cookie helpers and the capability adds no request-time framework integration when unused.

## Security semantics retained

Acceptance includes permanent coverage for:

```text
RFC OWS-only name trimming
Unicode/NBSP name-confusion resistance
malformed pair tolerance
duplicate same-name preservation
header-injection rejection
__Secure- enforcement
__Host- enforcement
SameSite=None -> Secure
Partitioned -> Secure
400-day Max-Age/Expires limits
short-secret rejection
HMAC tamper/wrong-secret rejection
secret rotation
ambiguous signed-cookie rejection
BufferSource secrets
Unicode logical-value round trip
```

No security requirement was removed or weakened to satisfy performance gates.

## Benchmark protocol

Frozen benchmark command:

```text
bun run bench:cookie:p11-c
```

Environment reported by the acceptance harness:

```text
Bun:      1.4.0
CPU:      Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz
Samples:  15 mirrored fresh-process pairs
Reference: pinned Hono package dependency
Scope:    public helper calls only; router setup outside timed loops
```

Frozen gates:

```text
unsigned per-case Gelis/Hono <= 1.10x
unsigned geomean            <= 1.05x
signed per-case Gelis/Hono  <= 1.15x
```

## First measured candidate: rejected

The first measured implementation failed the frozen performance gates:

| scenario | Gelis/Hono | result |
| --- | ---: | --- |
| get-8 | 1.6919x | FAIL |
| get-32 | 2.3407x | FAIL |
| generate-basic | 1.7574x | FAIL |
| generate-rich | 0.9482x | PASS |
| signed-generate | 0.9474x | PASS |
| signed-verify | 0.9924x | PASS |

```text
unsigned geomean: 1.6028x <= 1.05x => FAIL
P11-C ACCEPTANCE: FAIL
```

The gates were not modified after this result.

## Failure diagnosis and optimization

The failure was concentrated in ordinary unsigned hot paths.

The accepted optimization preserved semantics while specializing work:

```text
getCookie(request, name)
-> requested-name scanner
-> unrelated pairs avoid generic object/callback construction
-> return immediately after the first syntactically valid matching pair

getCookies(request, name)
-> specialized named scanner
-> still scans the complete header to preserve duplicate detection

generateCookie(name, value)
-> ordinary no-options fast path
-> still validates name
-> still URI-encodes the value
-> still emits Path=/
-> security-prefixed names remain on validated full path

conditional TypeScript argument constraints
-> remain public overload semantics
-> implementation no longer pays rest-array allocation on each call
```

Optimization commit:

```text
f2b104df8ffbe96348c51271a1868a1c4f9141c7
perf: specialize cookie read and basic serialization fast paths
```

## Final measured candidate: accepted

Final benchmark:

| scenario | category | Gelis ns/op | Hono ns/op | Gelis/Hono | gate |
| --- | --- | ---: | ---: | ---: | --- |
| get-8 | unsigned | 613.1 | 1165.8 | 0.5275x | PASS |
| get-32 | unsigned | 1625.4 | 3358.5 | 0.4736x | PASS |
| generate-basic | unsigned | 136.6 | 213.3 | 0.6128x | PASS |
| generate-rich | unsigned | 552.8 | 583.1 | 0.9568x | PASS |
| signed-generate | signed | 41313.8 | 45042.4 | 0.9268x | PASS |
| signed-verify | signed | 41425.7 | 42511.1 | 0.9781x | PASS |

```text
unsigned geomean: 0.6186x <= 1.05x => PASS
P11-C ACCEPTANCE: PASS
```

Ratios below `1.00x` are evidence for these measured workloads only. They are not a generalized claim that Gelis cookie handling is universally faster than Hono.

## Package isolation

P11-C remains a portable helper subpath:

```text
gelis/cookie
```

It does not add middleware, lifecycle hooks, application state, route metadata, or request-runtime branches to ordinary Gelis applications.

## Decision

```text
P11-C COOKIE CAPABILITY ACCEPTED

NEXT:
P11-D CORS capability
```

Milestone acceptance does not authorize release, tagging, GitHub Release creation, or npm publication.
