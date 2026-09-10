# P11-D CORS Capability Acceptance

**Status:** ACCEPTED  
**Date:** 2026-09-10  
**Phase:** P11-D  
**Public owner:** `gelis/cors`  
**Accepted source candidate:** `c2c1b9b72b776c073e7a0a0ae9429c8510a91a7a`  
**Final acceptance candidate:** `21790d2086fdbbc9fea0557e1eea62fc0fc33bd5`

## Result

P11-D is accepted.

The capability satisfies the frozen architecture, protocol-correctness, package/type-system, zero-unused, competitor-performance, and route-scalability requirements from:

```text
docs/architecture/p11-d-cors-capability-freeze.md
```

The frozen performance thresholds were not relaxed after measurement.

## Accepted public capability

`gelis/cors` provides a compiled application-boundary CORS capability with support for:

```text
wildcard origins
fixed origins
origin allowlists
sync origin resolvers
async origin resolvers
credentials
explicit allowed methods
request-reflected or explicit allowed headers
exposed headers
preflight max-age
route-aware preflight method discovery
QUERY/custom method compatibility
ALL-route compatibility
```

The root `gelis` entrypoint does not re-export the CORS capability.

When CORS is absent, the ordinary application request path does not install the application HTTP policy wrapper.

## Protocol and security semantics retained

Acceptance includes permanent coverage for:

```text
credentialed wildcard rejection
credentialed implicit wildcard rejection
serialized-origin validation
opaque null-origin handling
explicit "null" origin support
field-name token validation
requested-method token validation
Access-Control-Request-Headers validation
route-aware Access-Control-Allow-Methods
GET -> implicit HEAD advertisement
ordinary P9 OPTIONS preservation
explicit OPTIONS preservation
QUERY/custom methods
ALL without exposing literal "*"
404/405 CORS finalization
handled-error CORS finalization
HEAD body suppression preservation
Vary merge correctness
Access-Control-Request-Method variation
Access-Control-Request-Headers variation
configured-method intersection with routable methods
missing-route fail-closed behavior
non-negative finite integer maxAge validation
```

No protocol or security requirement was removed or weakened to satisfy performance gates.

## Correctness gate

Final project gate before acceptance benchmark:

```text
646 pass
0 fail
1798 expect() calls
```

The gate includes root/package/benchmark typechecking, type tests, runtime-test typechecking, Bun adapter checks, package tests, and runtime tests.

## Benchmark protocol

Frozen benchmark command:

```text
bun run bench:cors:p11-d -- --control-root=..\gelis-p11-d-control --candidate-root=.
```

Environment reported by the acceptance harness:

```text
Bun:       1.4.0
CPU:       Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz
Hono:      4.13.5
Samples:   11 mirrored fresh-process pairs
Control:   f2b104df8ffbe96348c51271a1868a1c4f9141c7
Candidate: 21790d2086fdbbc9fea0557e1eea62fc0fc33bd5
```

Frozen gates:

```text
zero-unused per case candidate/control <= 1.03x
zero-unused geomean                    <= 1.015x

enabled static per case Gelis/Hono    <= 1.10x
enabled static geomean                 <= 1.05x
enabled dynamic-origin Gelis/Hono      <= 1.15x

route-aware preflight 5000/1000        <= 1.50x
```

## Harness ratio-direction correction

The first acceptance execution produced a false-negative result for enabled CORS comparisons because the generic pair summarizer calculated `right / left` while the enabled comparison mapped:

```text
left  = Gelis
right = Hono
```

The table therefore displayed Gelis and Hono nanoseconds correctly but labeled the inverse `Hono/Gelis` ratio as `Gelis/Hono`.

This was a benchmark-harness defect, not an implementation performance failure.

The fix made ratio direction explicit per comparison family:

```text
zero-unused -> candidate/control -> right-over-left
enabled     -> Gelis/Hono        -> left-over-right
scaling     -> 5000/1000         -> right-over-left
```

Correction commit:

```text
21790d2086fdbbc9fea0557e1eea62fc0fc33bd5
fix(bench): correct P11-D framework ratio direction
```

No frozen threshold was changed.

## Final zero-unused result

| scenario     | control ns/op | candidate ns/op | candidate/control | gate |
| ------------ | ------------: | --------------: | ----------------: | ---- |
| static-raw   |         351.8 |           351.4 |           1.0040x | PASS |
| dynamic-raw  |         500.4 |           502.5 |           1.0227x | PASS |
| static-json  |         713.0 |           699.6 |           1.0008x | PASS |
| dynamic-json |         833.6 |           880.5 |           1.0243x | PASS |

```text
zero-unused geomean: 1.0129x <= 1.015x => PASS
```

This is evidence that the accepted CORS architecture preserves the frozen no-feature regression budget on these measured workloads.

## Final enabled CORS comparison

| scenario                 | Gelis ns/op | Hono ns/op | Gelis/Hono | gate |
| ------------------------ | ----------: | ---------: | ---------: | ---- |
| actual-wildcard          |      1727.5 |     3716.6 |    0.4731x | PASS |
| actual-allowlist         |      1832.2 |     4378.3 |    0.4120x | PASS |
| actual-credentialed      |      2076.7 |     5141.2 |    0.3975x | PASS |
| preflight-static-methods |      3465.4 |     3228.2 |    1.0667x | PASS |
| actual-dynamic-origin    |      1776.6 |     4361.0 |    0.4136x | PASS |

```text
enabled static geomean: 0.5362x <= 1.05x => PASS
```

Ratios below `1.00x` are evidence for these exact benchmark semantics only. They are not a generalized claim that Gelis CORS is universally faster than Hono.

The preflight static-method scenario remains within its frozen gate even though Hono is faster on that measured case.

## Route-aware scalability

Final route-aware preflight measurements:

```text
1,000 routes: 2678.9 ns/op
5,000 routes: 2674.7 ns/op
5000/1000:   0.9955x <= 1.50x => PASS
```

This satisfies the frozen route-scalability requirement for the measured workload.

## Architectural acceptance

The accepted architecture preserves the P11-B execution invariants:

```text
CORS is owned by gelis/cors
actual preflight is handled at the compiled application HTTP boundary
ordinary OPTIONS remains owned by P9 routing semantics
route topology is resolved directly from the router rather than by synthetic dispatch
no second OPTIONS router exists
AOT router replacement remains compatible through late state.router resolution
final response policy is applied once
ordinary applications without official application HTTP policy avoid the wrapper
```

The rejected intermediate CONNECT-probe design is not part of the accepted implementation.

## Decision

```text
P11-D CORS CAPABILITY ACCEPTED

NEXT:
P11-E request/body limit capability
```

Milestone acceptance does not authorize release, tagging, GitHub Release creation, or npm publication.
