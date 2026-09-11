# P11-H Cumulative Acceptance Freeze

**Status:** FROZEN  
**Date:** 2026-09-11  
**Phase:** P11-H  
**Predecessor:** `p11-g-request-id-timeout-acceptance.md`

## Purpose

P11-H is the cumulative close for P11 Industrial HTTP Essentials.

It does not add a new HTTP capability. It verifies that the accepted P11-C through P11-G capabilities still satisfy the architecture as one system:

```text
cookies
CORS
request/body limits
secure headers
request ID
timeout / abort
```

P11-H must prove both:

```text
plain application with every P11 capability unused

representative production application with several accepted P11 capabilities enabled together
```

Individual capability acceptance is necessary but not sufficient for P11 completion.

## Immutable baselines

### Cumulative pre-capability control

The cumulative zero-unused and plain-type control is the P11-B architecture-freeze commit:

```text
0df4f1e20bef3e9fa7c9a554be022bc241536424
```

This commit predates production implementation of P11-C through P11-G and therefore measures the cumulative cost of adding the P11 capability family rather than only the last subphase.

### Initial P11-H runtime candidate

The initial cumulative runtime candidate is the final P11-G production candidate:

```text
1dd5f94cf0e9ad884ca44e537ee287587cd8baab
```

P11-G acceptance documentation was later added and formatted without changing production source. Its accepted documentation tree is:

```text
43b70cbf385a0bc9b78657a1766c2edbc756460f
```

P11-H documentation and benchmark harness commits do not replace the runtime candidate being measured.

If P11-H discovers a real production defect and production source changes, that new source commit becomes the candidate only after correctness is green. Every candidate-sensitive downstream gate must then be rerun on the same exact source candidate.

## Governing rules

P11-H preserves the P11-B architecture:

```text
portable Web Standards root
Bun-specific behavior isolated to gelis/bun
stable root Gelis type
no route-collection generic accumulation
no hidden module-global request state
no universal always-on middleware chain
plain-route zero-unused fast path
registration-time specialization where possible
AOT/prebuilt compatibility
explicit security semantics
```

No correctness, security, type, AOT, zero-unused, direct-performance, HTTP-performance, or route-scale gate may be weakened after candidate results are observed.

A failed valid result remains a failure. A rerun is allowed only when the previous run is demonstrably invalid or the production candidate/harness is legitimately changed for a documented reason.

## Frozen phase sequence

```text
H1  cumulative architecture/type/performance gate freeze
H2  cumulative correctness + security composition
H3  package + AOT/prebuilt + documentation boundary
H4  cumulative TypeScript scaling acceptance
H5  cumulative zero-unused performance acceptance
H6  representative enabled composition performance acceptance
H7  full bun run check
H8  P11 cumulative acceptance documentation
```

Authoritative promotion occurs only after the relevant gate is green.

A production source change after H2 invalidates every later candidate-sensitive result. A public generic/type-surface change additionally requires H4 to be rerun.

---

# H2 — cumulative correctness and security composition

H2 adds targeted cumulative tests rather than replacing the complete existing test suite.

At minimum, the cumulative composition suite must cover the following.

## Application-boundary composition

The representative application boundary enables:

```text
CORS
secure headers
request ID
application timeout
```

Tests must exercise at least canonical and reverse plugin registration order so correctness does not depend on installation order where the frozen architecture defines semantic ordering.

A successful actual CORS request must prove:

```text
route result preserved
CORS grant applied once
secure-header policy applied once
resolved request ID propagated once
application deadline does not alter successful under-deadline execution
unrelated response headers preserved
```

## Preflight short circuit

A valid CORS preflight must prove:

```text
preflight resolves before ordinary routing
route handler does not run
managed body parsing does not run
application timeout deadline does not wrap ordinary route work
secure headers still finalize the response
request ID still propagates
CORS headers appear exactly once
```

Ordinary non-preflight `OPTIONS` remains under the accepted P9 method semantics.

## Synthetic and error responses

With cumulative response policies enabled, permanent tests must cover:

```text
404
405 + Allow
implicit HEAD
automatic OPTIONS
handled onError response
```

Applicable CORS, secure-header, and request-ID policies must finalize exactly once without changing the underlying protocol status semantics.

## Timeout outcome composition

When the application or route timeout wins, the cumulative suite must prove:

```text
TimeoutError remains the error authority
user onError may still handle TimeoutError
unhandled timeout uses the accepted 504 fallback
request ID propagates
secure headers finalize
applicable CORS headers finalize
HEAD remains bodyless
late fulfillment cannot replace the timeout result
late rejection is observed
incoming abort reason is not relabeled as framework timeout
```

## Body-limit composition

A managed-body route under cumulative application policies must prove:

```text
oversized body -> 413 before schema/handler execution
request ID propagates on the 413
secure headers finalize on the 413
applicable CORS headers finalize on the 413
route/application timeout policy does not weaken the body ceiling
stricter route limit cannot be extended by a looser application policy
```

Malformed or forged `Content-Length` must remain subject to actual-byte enforcement according to the accepted P11-E semantics.

## Cookie-helper composition

A route that explicitly uses `gelis/cookie` while cumulative response policies are installed must prove:

```text
request cookie parsing retains accepted security semantics
Set-Cookie survives CORS/secure-header/request-ID finalization
multiple Set-Cookie behavior is not collapsed by response-policy composition
secure cookie-prefix invariants remain enforced
```

P11-H does not convert cookie helpers into middleware or application state.

## Security invariants

The cumulative suite must not weaken the permanent individual security guarantees, including:

```text
request-ID inbound trust remains opt-in and validated
malformed CORS origin/preflight input fails closed
secure-header managed fields cannot be bypassed by handler conflicts
body-limit actual-byte enforcement remains authoritative
cookie Unicode/header-injection/prefix protections remain intact
incoming AbortSignal reason remains distinguishable from TimeoutError
```

H2 acceptance requires the new cumulative tests and all directly affected existing tests to pass.

---

# H3 — package, AOT/prebuilt, and documentation boundary

H3 verifies the cumulative packaging and build/runtime boundaries.

## Package surface

The portable subpaths must remain independently resolvable:

```text
gelis/cookie
gelis/cors
gelis/body-limit
gelis/secure-headers
gelis/request-id
gelis/timeout
```

The root `gelis` entrypoint must not re-export P11 convenience/helper APIs merely for discoverability.

Portable typechecks must not acquire Bun-only types because of P11.

## AOT/prebuilt cumulative composition

Permanent cumulative tests must verify representative combinations with supported hydration/prebuilt boundaries, including:

```text
application CORS + secure headers + request ID + timeout
managed body limit
route timeout
```

At least one composition must be installed before hydration and one after hydration where the owning capability supports both orders.

Required invariants:

```text
route topology semantics unchanged
body-limit specialization restored/preserved
route timeout specialization restored/preserved
application response policies remain active
request-local policies remain application runtime state
P11 execution policy does not leak into public contract snapshots
```

## Documentation consistency

H3 audits the frozen and acceptance documents for P11-C through P11-G against the actual package/API surface. A stale document must be corrected before P11-H completion.

---

# H4 — cumulative TypeScript scaling acceptance

P11 added route-level body-limit and timeout primitives, so P11-H does not waive the cumulative type-scaling rerun.

Environment is frozen to:

```text
Bun 1.4.0
TypeScript 7.0.2
3 runs per case
median reported
route counts 100 / 500 / 1,000 / 5,000
```

H4 has two matrices.

## Matrix A — plain route cumulative no-regression

Compile equivalent plain route declarations on:

```text
control   0df4f1e20bef3e9fa7c9a554be022bc241536424
candidate final P11-H runtime candidate
```

The generated route source must be semantically equivalent on both roots and must not import any P11 subpath.

Per-size hard gates:

```text
candidate/control type instantiations <= 1.15x
candidate/control peak memory         <= 1.15x
candidate/control check time          <= 1.25x
5,000-route check time                <= 1.20x control
```

Candidate growth gates from 1,000 to 5,000 routes:

```text
type instantiation growth <= 5.5x
check-time growth         <= 6.0x
```

## Matrix B — combined P11 route-policy scaling

Within the same final candidate, compare equivalent managed-body route declarations:

```text
baseline
-> managed POST body schema
-> no P11 route policy

P11 route-policy case
-> same managed POST body schema
-> bodyLimit enabled
-> timeout enabled
```

The same schema object/shape, handler shape, route-count sequence, and TypeScript version must be used in both cases.

Feature/baseline gates are:

```text
type instantiations <= 1.15x
peak memory         <= 1.15x
check time          <= 1.25x
5,000 check time    <= 1.20x
```

Feature-case 1,000-to-5,000 growth gates remain:

```text
type instantiation growth <= 5.5x
check-time growth         <= 6.0x
```

A stable-root-type assertion must also compile, proving that repeated P11 route declarations do not accumulate route/capability state into the root `Gelis` generic.

Any H-phase production change to public route/plugin generics invalidates H4 and requires a rerun.

---

# H5 — cumulative zero-unused performance acceptance

H5 measures whether adding all P11-C through P11-G production support changed ordinary applications that import/use none of those capabilities.

Control:

```text
0df4f1e20bef3e9fa7c9a554be022bc241536424
```

Candidate:

```text
exact final P11-H runtime candidate
```

Protocol:

```text
Bun 1.4.0
5,000 mixed routes
static raw
dynamic raw
static JSON
dynamic JSON
11 mirrored fresh-process pairs per case
alternating control/candidate order
warmup
calibrated timed window
median pairwise candidate/control ratio
order diagnostics retained
```

The benchmark worker must execute plain Gelis routes only. No P11 subpath may be imported by the measured application.

Hard gates:

```text
each case median candidate/control <= 1.03x
four-case geometric mean           <= 1.015x
```

Structural assertions accompany the benchmark:

```text
no installed P11 application capability -> no application HTTP plan
plain route -> existing RUNTIME_ROUTE_PLAIN fast path
no body limit -> existing managed body reader path
no request-ID/timeout -> no request-local P11 state
```

Ratios below `1.00x` are treated only as no-regression evidence for the measured workload.

---

# H6 — representative enabled composition performance acceptance

H6 measures one deliberately narrow common-equivalent application-boundary composition rather than forcing every P11 feature into an unfair competitor comparison.

Primary comparator:

```text
Hono 4.13.5
```

Bun is frozen to `1.4.0`.

## Common-equivalent enabled policy

Both frameworks must enable semantically equivalent forms of:

```text
CORS fixed origin: https://client.test
secure headers: same effective Gelis default managed field set
request ID: deterministic fixed generator for benchmark equivalence
timeout: 60,000 ms framework deadline
```

The request carries:

```text
Origin: https://client.test
```

Hono framework-specific secure-header defaults that are not part of the Gelis effective policy must be explicitly disabled, as in the accepted P11-F comparator methodology.

The Hono route must use a response path that allows the official request-ID middleware to perform response propagation. Equivalence is verified before timing.

Cookie helpers and body-limit enforcement are not inserted into this direct Hono comparator merely to increase feature count. They use different execution lanes and retain their accepted individual performance evidence plus H2 cumulative correctness coverage.

## Direct cases

The frozen direct cases are:

```text
1. actual-CORS static 204
2. actual-CORS static JSON
```

Before timing, each framework must be checked for equivalent observable behavior relevant to the enabled policy:

```text
status/body semantics
Access-Control-Allow-Origin
required Vary behavior
Strict-Transport-Security
X-Content-Type-Options
Referrer-Policy
X-Frame-Options
X-XSS-Protection
X-Powered-By absent
fixed X-Request-Id value
successful under-deadline result
```

Protocol:

```text
11 mirrored fresh-process pairs per case
alternating Gelis/Hono order
warmup
calibrated timed window
median pairwise Gelis/Hono ns/op ratio
order diagnostics retained
```

Hard gates:

```text
each direct case Gelis/Hono <= 1.15x
2-case geometric mean       <= 1.10x
```

## HTTP case

The HTTP comparator uses the enabled static-204 actual-CORS case through each framework's Bun server path.

Protocol:

```text
Bun 1.4.0
oha 1.16.0
50 concurrent connections
warmup before measurement
7 alternating framework pairs
same Origin header and effective policy
```

Hard gate:

```text
median Gelis throughput >= 0.90x Hono throughput
```

Pairwise and order-separated throughput ratios remain diagnostics.

## Combined route-policy scale

H6 also verifies Gelis route-count behavior when a representative managed route combines accepted route/input policy:

```text
managed JSON body
body limit
timeout
```

The `1,000`-route and `5,000`-route applications must use identical route shapes except for route count. Requests must use unique consumable request bodies/identities rather than reusing a consumed or request-local-state-bearing `Request` object.

Protocol:

```text
11 mirrored fresh-process 5,000/1,000 pairs
alternating order
median pairwise 5000/1000 ns/op ratio
order diagnostics retained
```

Hard gate:

```text
5000/1000 median <= 1.50x
```

This route-scale gate is internal Gelis scaling evidence, not a Hono comparison.

## Interpretation boundary

H6 is not a universal framework ranking. A ratio below `1.00x` or throughput ratio above `1.00x` applies only to the frozen workload and environment.

---

# H7 — full repository quality gate

After H2 through H6 are green on the same accepted source candidate, a fresh branch must point exactly to the final P11-H repository candidate and run:

```text
bun run check
```

under Bun `1.4.0` with frozen dependency installation.

No H7 acceptance may be inferred from an earlier CI run that predates the final candidate-sensitive promotion.

---

# H8 — cumulative acceptance documentation

H8 records:

```text
immutable control/candidate SHAs
H2 correctness/security results
H3 package/AOT/docs results
H4 TypeScript scaling tables
H5 cumulative zero-unused tables
H6 enabled direct/HTTP/route-scale tables
H7 full quality run
invalid/rejected evidence retained during P11-H
final P11 Industrial HTTP Essentials decision
```

P11-H completion may state that P11 Industrial HTTP Essentials is accepted only after the H8 documentation tree itself passes the repository Quality workflow.

## Release boundary

P11-H acceptance does not authorize:

```text
npm publish
Git tag
GitHub Release
other public release automation
```

Release engineering remains an explicit maintainer-controlled action outside this acceptance phase.

## Decision

```text
P11-H CUMULATIVE ACCEPTANCE GATES FROZEN

NEXT:
H2 cumulative correctness + security composition
```
