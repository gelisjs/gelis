# P11-G Request ID + Timeout / Abort Capability Freeze

**Status:** ARCHITECTURE + API + GATES FROZEN  
**Date:** 2026-09-15  
**Phase:** P11-G  
**Public owners:** `gelis/request-id`, `gelis/timeout`  
**Performance control source:** `457e14e491c2d27450a81ddbeb4a7db04b8f77b1`  
**Control quality gate:** `744 pass / 0 fail / 2156 expect() calls`

## Purpose

P11-G completes the final feature capability in P11 Industrial HTTP Essentials by adding:

```text
request correlation identity
+
application and route execution deadlines
+
cooperative cancellation through AbortSignal
```

The design follows the P11-A competitor audit and the accepted P11-B execution architecture.

P11-G must not:

```text
trust attacker-controlled request IDs by default
clone every Request to replace request.signal
promise forcible cancellation of arbitrary user async work
turn deadlines into transport/server timeout configuration
add request-ID or timeout state to every RouteContext generic
add a permanent branch to applications or routes that do not enable the feature
```

No production benchmark result may weaken the semantics or gates frozen here.

---

# 1. Ownership and execution lanes

Public ownership remains exactly:

```text
request ID      -> gelis/request-id
timeout / abort -> gelis/timeout
```

The root `gelis` entrypoint does not re-export the convenience APIs.

Execution ownership follows P11-B:

```text
request ID
-> Lane B application HTTP boundary
-> instance-owned request-local state
-> final response-policy propagation

application timeout
-> Lane B application deadline boundary
-> instance-owned request-local state

route timeout
-> Lane C route boundary specialization
-> same owning timeout capability instance
```

Request ID and timeout remain independent capabilities. Installing one does not implicitly install the other.

---

# 2. Request ID public surface

The frozen public direction is:

```ts
export type RequestIdGenerator = (request: Request) => string;

export type RequestIdValidator = (value: string, request: Request) => boolean;

export interface RequestIdOptions {
  readonly header?: string;
  readonly generator?: RequestIdGenerator;
  readonly acceptIncoming?: boolean | RequestIdValidator;
  readonly maxLength?: number;
}

export interface RequestIdCapability extends Plugin {
  readonly header: string;
  get(request: Request): string | undefined;
}

export function requestId(options?: RequestIdOptions): RequestIdCapability;
```

Conceptual usage:

```ts
import { requestId } from "gelis/request-id";

const ids = requestId();

app.use(ids);

app.get("/", ({ request }) => {
  return {
    requestId: ids.get(request),
  };
});
```

Only one request-ID capability may be installed per application in P11-G v0.1. Duplicate installation fails transactionally.

The same capability object may be used by separate Gelis applications. Its state remains keyed by the concrete Request object and does not create a module-global registry.

---

# 3. Request ID defaults

The frozen default policy is:

```text
header          X-Request-Id
generator       crypto.randomUUID()
acceptIncoming  false
maxLength       255
```

The default intentionally differs from middleware that automatically adopts an incoming request-ID header.

Reason:

> Request correlation identity must not become caller-controlled by default.

Applications that terminate trusted infrastructure before Gelis may explicitly enable inbound adoption.

---

# 4. Request ID value grammar

Every resolved request ID must satisfy the Gelis baseline grammar before it can enter request-local state or a response header.

Frozen baseline:

```text
length >= 1
length <= maxLength
characters only from:
A-Z a-z 0-9 . _ : -
```

The grammar deliberately excludes whitespace, control characters, quotes, backslashes, separators such as comma/semicolon, and arbitrary Unicode.

It is a correlation-ID grammar, not a generic HTTP field-value grammar.

The default UUID representation is valid under this grammar.

`maxLength` must be a finite safe positive integer. The default is `255`.

The configured response header name must be a valid HTTP field name and must not be empty.

---

# 5. Inbound request-ID trust policy

Inbound adoption is disabled by default.

Semantics:

```text
acceptIncoming omitted / false
-> ignore inbound header completely
-> generate a framework-owned ID

acceptIncoming: true
-> adopt a single inbound value only when it satisfies the Gelis baseline grammar
-> otherwise generate a new framework-owned ID

acceptIncoming: validator
-> first require the Gelis baseline grammar
-> then call validator(value, request)
-> adopt only when validator returns true
-> otherwise generate a new framework-owned ID
```

Malformed, duplicated, ambiguous, overlong, or otherwise invalid inbound IDs do not produce a client error in v0.1. They are treated as untrusted input and replaced with a generated ID.

A custom validator may make inbound policy stricter. It may not weaken the baseline grammar.

If the validator throws, the error follows the application `onError` path.

---

# 6. Request ID generation

The generator is synchronous in P11-G v0.1.

Reasons:

```text
request-local preparation remains synchronous for the common path
crypto.randomUUID() is synchronous
request ID must exist before onRequest and CORS preflight handling
async generation would force a Promise boundary onto every enabled request
```

A custom generator receives the original Request and returns a string.

The returned value must satisfy the same baseline grammar and configured `maxLength`.

An invalid generated value is a framework/application configuration execution error, not a silently repaired identifier. The failure is observable by `onError`.

P11-G does not auto-truncate generated or inbound IDs.

---

# 7. Request ID request-local state

Request ID uses the P11-B accepted model:

```text
explicit RequestIdCapability instance
        ↓
instance-owned WeakMap<Request, string>
        ↓
ids.get(request)
```

No request header mutation is performed merely to expose the ID to handlers.

The original inbound Request remains semantically the original transport input.

The resolved ID is available to:

```text
onRequest
route lifecycle
handler
onError
```

for execution occurring after successful request-ID preparation.

The WeakMap does not strongly retain Request objects. State lifetime follows Request reachability.

Separate capability instances remain isolated even when they receive the same Request object.

---

# 8. Request ID response propagation

Every successfully resolved request ID is propagated to the final Response using the configured header name.

The same resolved value is used for handler access and response propagation.

Request-ID finalization covers:

```text
normal route responses
raw handler Response
404
405
implicit HEAD
automatic OPTIONS
CORS preflight
body-limit early response
successful onError handled response
timeout response
```

A framework-managed request-ID field overrides a conflicting response field supplied by a handler or earlier response policy.

This preserves one correlation identity for the complete Gelis request execution.

Immutable response headers use the existing mutable-copy/reconstruction strategy only when mutation is actually rejected.

The request-ID field is applied exactly once.

---

# 9. Request-ID application boundary order

P11-B execution order remains authoritative:

```text
request-ID resolution + request-local storage
        ↓
CORS / safe protocol guards
        ↓
application timeout boundary when enabled
        ↓
onRequest
        ↓
routing + route execution
        ↓
CORS response finalization
        ↓
secure-header finalization
        ↓
request-ID propagation
        ↓
final Response
```

Therefore a valid CORS preflight receives a request ID even though ordinary routing and `onRequest` do not execute for that preflight.

Request-ID generation itself is not governed by the application execution timeout.

---

# 10. Timeout public surface

The frozen public direction is:

```ts
export type TimeoutSource = "application" | "route";

export class GelisTimeoutError extends Error {
  readonly duration: number;
  readonly source: TimeoutSource;
}

export type TimeoutHandler = (
  request: Request,
  error: GelisTimeoutError,
) => Response | PromiseLike<Response>;

export interface TimeoutOptions {
  readonly duration?: number;
  readonly onTimeout?: TimeoutHandler;
}

export interface TimeoutRoutePolicy {
  readonly /* opaque brand */ __gelisTimeoutRoutePolicy: unique symbol;
}

export interface TimeoutCapability extends Plugin {
  route(duration: number): TimeoutRoutePolicy;
  signal(request: Request): AbortSignal | undefined;
}

export function timeout(options?: TimeoutOptions): TimeoutCapability;
```

The route-policy brand shown above is conceptual. The implementation may use a private symbol/opaque type rather than exposing a forgeable public property.

Conceptual application default:

```ts
import { timeout } from "gelis/timeout";

const deadlines = timeout({
  duration: 5_000,
});

app.use(deadlines);
```

Conceptual route policy:

```ts
const deadlines = timeout();

app.get(
  "/slow",
  {
    timeout: deadlines.route(1_000),
  },
  async ({ request }) => {
    const signal = deadlines.signal(request);

    return doWork({ signal });
  },
);
```

A timeout capability with no application `duration` creates no application-wide deadline.

---

# 11. Route timeout representation

Route-level timeout is not a bare number in P11-G.

The route option is frozen conceptually as:

```ts
interface RouteOptions {
  readonly timeout?: TimeoutRoutePolicy;
}
```

The policy is created by the owning capability instance:

```ts
const deadlines = timeout();
const oneSecond = deadlines.route(1_000);
```

Reasons:

```text
route execution must know which capability owns request-local AbortSignal state
handler code needs an explicit instance accessor
route declarations remain non-generic
no module-global timeout state is required
application installation order does not determine policy identity
```

A route policy may be reused across routes.

Within one Gelis application, all application and route timeout policies must resolve to one TimeoutCapability instance. Mixing distinct timeout capability owners in one application is a configuration error.

The same TimeoutCapability instance may be reused by a separate application.

A plain route without `timeout` receives no route timeout sidecar/property allocation.

---

# 12. Timeout duration validation

Every framework deadline duration must be:

```text
finite
safe integer
> 0
milliseconds
```

`0` is not overloaded to mean disabled.

Disabling an application default is done by not configuring `duration`.

A route without a route policy has no route-specific deadline.

Invalid durations fail synchronously when `timeout()` or `capability.route()` is configured.

---

# 13. Application and route deadline composition

Application and route deadlines are distinct scopes.

Application timeout:

```text
starts after pre-routing protocol guards
covers onRequest + routing + route execution + response normalization
```

Route timeout:

```text
starts only after a route has been selected
covers that route's specialized execution boundary
including managed input, request scope, lifecycle, handler and response plan
```

If both exist, the effective framework deadline is the earlier deadline.

A route may therefore tighten an application deadline but cannot extend or disable an already-running application deadline.

This avoids restarting the application clock after expensive pre-route work and preserves one predictable outer execution bound.

The framework uses one deadline AbortController per timeout capability/request execution. A tighter route deadline may reschedule the same framework deadline controller rather than replacing the signal object exposed earlier by application `onRequest`.

---

# 14. Cooperative AbortSignal semantics

Timeout never clones the Request merely to replace `request.signal`.

The cooperative signal is derived conceptually from:

```text
incoming request.signal
        +
framework deadline AbortController.signal
        ↓
combined signal
```

`capability.signal(request)` returns the combined signal while timeout state exists for that Request under the capability.

If no timeout state has been established for that Request, it returns `undefined`.

When the incoming request is already aborted, the combined signal is already aborted with the incoming reason.

When the incoming request aborts later, the combined signal aborts with the incoming reason.

When the Gelis deadline fires first, the framework controller aborts with the same `GelisTimeoutError` that describes the deadline source and configured duration.

Client abort by itself does not manufacture a Gelis 503 timeout response.

The framework does not claim to stop asynchronous work that ignores the provided signal.

---

# 15. Timeout response race

A framework deadline races the owned execution Promise.

Frozen rule:

> The first terminal result wins.

If request execution completes first:

```text
clear deadline timer
remove internal abort listeners when applicable
return the completed response
```

If the framework deadline fires first:

```text
abort framework deadline signal
ignore any later execution result for response selection
produce timeout response policy
```

Late user work may continue if it ignores cancellation. Gelis does not falsely claim otherwise.

Timer and abort-listener cleanup is mandatory on every terminal path to avoid retaining completed request execution state.

---

# 16. Default timeout response

The default Gelis execution-deadline response is:

```text
status: 503 Service Unavailable
body:   Service Unavailable
```

P11-G does not use `408 Request Timeout` because the capability is not a transport receive timeout.

P11-G does not describe the deadline as a gateway/upstream timeout.

For a HEAD request, ordinary Gelis body-suppression semantics still apply to the timeout response.

A timeout response proceeds through the installed application response-policy finalizers, including CORS, secure headers, and request-ID propagation.

---

# 17. Custom timeout response

`onTimeout` may replace the default 503 response.

It receives:

```text
the original Request
+
the GelisTimeoutError used as the framework abort reason
```

The callback may return a Response synchronously or asynchronously.

If `onTimeout` throws or rejects, the failure follows application `onError` semantics. A successful `onError` response receives ordinary installed response policies exactly once.

P11-G does not retry `onTimeout`.

---

# 18. Timeout error identity

`GelisTimeoutError` exists so cancellation-aware code can distinguish a framework deadline from an unrelated abort reason.

Required properties:

```text
name      GelisTimeoutError
duration  configured duration that created the winning deadline
source    application | route
```

The same error object is used as the framework AbortSignal reason and supplied to `onTimeout`.

If an incoming client abort wins the signal race, its original abort reason is preserved instead.

---

# 19. Transport timeout boundary

`gelis/timeout` does not configure Bun or Node transport timeout settings.

The layers remain:

```text
gelis/bun / runtime server options
-> connection / receive / transport constraints

 gelis/timeout
-> Gelis application and route execution deadline
```

Applications may configure both.

P11-G documentation must not imply that a framework deadline protects a server from every slow-client or socket-level transport behavior.

---

# 20. Application error and response-policy integration

P11-B remains authoritative:

```text
onError
-> application error authority

response policies
-> apply once to the final normalized response
```

P11-G must prove composition with:

```text
CORS
body limit
secure headers
request ID
timeout
onRequest
onError
HEAD
OPTIONS
404 / 405
AOT/prebuilt routing
```

Request-ID propagation occurs after secure headers.

Timeout response selection occurs before final response-policy application.

---

# 21. AOT requirements

Request ID and application default timeout are application policies and are not serialized into route contract artifacts.

Route timeout is execution metadata and must remain AOT-preservable.

Required behavior:

```text
requestId installed before hydrated/prebuilt runtime
-> remains active

requestId installed after hydrated/prebuilt runtime where allowed
-> remains active

application timeout installed before/after hydrated runtime where allowed
-> remains active

canonical route timeout declaration
-> source AOT preserves the timeout sidecar and owner identity

unsupported route-timeout source shape
-> analyzer rejects explicitly
-> timeout semantics are never silently dropped

OpenAPI / typed-client snapshots
-> no request-ID or timeout execution metadata
```

The AOT implementation may use a declaration-time binding sidecar analogous to other accepted runtime-only route metadata. It must not serialize live WeakMap or AbortController state.

---

# 22. Zero-unused structural gates

Control source:

```text
457e14e491c2d27450a81ddbeb4a7db04b8f77b1
```

When request ID and timeout are unused:

```text
root gelis does not import their implementations
no request-ID WeakMap exists
no timeout WeakMap exists
no AbortController exists
no timer is scheduled
no application HTTP plan exists because of P11-G
no response policy exists because of P11-G
plain route runtime records do not gain a timeout sidecar/property
Gelis.prototype.fetch plain path remains structurally unchanged
```

A route without timeout must not perform a timeout-owner or timeout-sidecar lookup before the existing plain-route fast return.

---

# 23. Correctness and security gates — request ID

Permanent tests must cover at least:

```text
default UUID generation
default inbound header ignored
default X-Request-Id propagation
explicit inbound adoption
invalid inbound value replaced
inbound over maxLength replaced
duplicate/ambiguous inbound value replaced
custom validator accepts and rejects
custom validator throw -> onError
custom generator
invalid generated value -> onError
custom header name
invalid header name
invalid maxLength
baseline allowed characters
whitespace/control/unicode rejected
same resolved ID visible to handler and response
handler conflicting response ID overwritten
normal route
404
405
HEAD
automatic OPTIONS
CORS preflight
body-limit early response
handled onError response
timeout response
immutable response-header fallback
duplicate capability installation rejected transactionally
separate application/capability state isolation
```

No security test may be weakened for performance.

---

# 24. Correctness gates — timeout / abort

Permanent tests must cover at least:

```text
application timeout non-firing success
application timeout firing
route timeout non-firing success
route timeout firing
route timeout tightens application deadline
route timeout cannot extend application deadline
synchronous handler
asynchronous handler
managed input / validation under route deadline
beforeHandle / handler / afterHandle under route deadline
request-scope async work under route deadline
already-aborted incoming Request
incoming abort after execution begins
incoming abort reason preserved
framework timeout reason is GelisTimeoutError
GelisTimeoutError source application
GelisTimeoutError source route
capability.signal returns combined signal
capability.signal absent when no state exists
user work that ignores signal may continue after timeout
late result cannot replace timeout response
completion clears pending timer
timeout clears/cleans abort listener state
default 503 response
custom synchronous onTimeout
custom asynchronous onTimeout
onTimeout throw/reject -> onError
HEAD timeout body suppression
request-ID propagation on timeout response
secure headers on timeout response
CORS headers on timeout response where applicable
distinct timeout capability owners conflict within one app
same capability reusable across applications
plain route receives no timeout sidecar
```

Timer-sensitive tests must use deterministic short controlled scheduling rather than broad wall-clock assumptions.

---

# 25. Package and type gates

Required package behavior:

```text
package export resolves gelis/request-id
package export resolves gelis/timeout
portable consumer imports both without Bun types
root gelis does not re-export requestId or timeout convenience APIs
RequestIdOptions / RequestIdCapability compile
TimeoutOptions / TimeoutCapability / TimeoutRoutePolicy compile
invalid literal shapes fail where TypeScript can represent them
root Gelis generic remains stable
route timeout does not accumulate route collection generics
```

If the shared route-option public generic surface changes materially, P11-G or P11-H reruns the accepted TypeScript scaling suite at:

```text
100
500
1,000
5,000 routes
```

---

# 26. Zero-unused performance gate

Authoritative local runtime for new P11-G measurements:

```text
Bun 1.4.2
revision 744846f844374847c902b5e7fd59b4342a51ef99
Intel i5-10500H
12 logical CPUs
```

Control:

```text
457e14e491c2d27450a81ddbeb4a7db04b8f77b1
```

Mirrored direct `app.fetch()` cases:

```text
static raw
dynamic raw
static JSON
dynamic JSON
```

Protocol:

```text
5,000 mixed routes
fresh-process mirrored pairs
balanced order
CPU affinity / priority controls matching the accepted local benchmark doctrine
warmup
calibrated timed window
paired ratio estimator
bootstrap confidence interval where the harness supports it
```

Frozen hard gates:

```text
each candidate/control median <= 1.03x
four-case geometric mean      <= 1.015x
```

Ratios below `1.00x` are no-regression evidence only unless a separately frozen optimization protocol establishes a stronger claim.

---

# 27. Request-ID enabled competitor gate

Primary direct comparator:

```text
Hono 4.13.5 requestId middleware
```

Hono must be configured for equivalent work rather than its default inbound-adoption policy when that differs from Gelis.

Equivalent direct cases must include at least:

```text
generated ID + propagated response field on static 204
generated ID + propagated response field on static JSON
trusted valid inbound ID + propagated response field
handler conflicting response request-ID overwritten by final resolved ID
```

If Hono requires a small response-finalization helper to propagate the same resolved ID, that helper is part of the comparator workload.

Frozen hard gates:

```text
each Gelis/Hono direct median <= 1.10x
geometric mean                <= 1.05x
```

Non-equivalent security cases such as Gelis-specific baseline rejection are diagnostic/correctness evidence, not unfair competitor timing cases.

---

# 28. Timeout enabled competitor gate

Primary Bun-side direct comparator:

```text
Hono 4.13.5 timeout middleware
```

The direct performance workload measures **non-firing deadline overhead** because a deliberately fired timer is dominated by configured waiting time rather than framework execution cost.

Equivalent direct cases must include at least:

```text
static 204 under a non-firing application timeout
static JSON under a non-firing application timeout
immediately resolved async handler under a non-firing timeout
```

Gelis provides stronger cooperative-signal semantics than the Hono timeout middleware. The comparator remains a practical Bun-side overhead guard, not a claim of identical cancellation behavior.

Frozen hard gates:

```text
each Gelis/Hono direct median <= 1.15x
geometric mean                <= 1.10x
```

Fastify's handler-timeout semantics remain the primary semantic reference for deadline + AbortSignal behavior, not the primary Bun performance comparator.

---

# 29. Combined request-ID + timeout direct gate

P11-G must also measure the two accepted capabilities together on a representative non-firing request path:

```text
request ID generation + propagation
application timeout active but not firing
static JSON response
```

The combined case is compared against the same production control with both capabilities absent.

Frozen gate:

```text
candidate/control median <= 1.30x
```

This is intentionally looser than zero-unused because UUID generation, WeakMap state, AbortController/timer creation, response header mutation, and deadline cleanup are real feature-on work.

The result is an overhead bound for this exact enabled workload, not a universal framework claim.

---

# 30. HTTP comparator gates

Two network-level guards are required.

Request ID HTTP workload:

```text
one static 204 route
request ID generation enabled
same response propagation semantics
Bun server adapter
50 concurrent connections
alternating framework samples after warmup
```

Frozen gate:

```text
median Gelis throughput >= 0.90x Hono throughput
```

Timeout HTTP workload:

```text
one static 204 route
non-firing application timeout enabled
same configured duration
Bun server adapter
50 concurrent connections
alternating framework samples after warmup
```

Frozen gate:

```text
median Gelis throughput >= 0.85x Hono throughput
```

The timeout HTTP gate is slightly wider because Gelis additionally constructs cooperative cancellation state.

No fired-timeout HTTP benchmark is used as a throughput gate.

---

# 31. Resource-cleanup gate

P11-G must include a deterministic resource-cleanup acceptance test proving that completed requests do not leave active framework timers or abort listeners behind.

The test does not attempt to prove JavaScript garbage collection timing.

It must instead instrument the P11-G-owned timer/listener lifecycle and prove:

```text
successful completion -> timer cleared
handled error completion -> timer cleared
timeout completion -> timer consumed/cleared
incoming abort -> listener cleanup after terminal response
late user completion -> cannot recreate a timer or response race
```

A WeakMap entry may remain observable while the Request itself remains strongly reachable by application code. That is expected and is not a leak by itself.

---

# 32. Implementation sequence

P11-G implementation is frozen as:

```text
G1   architecture/API/performance freeze
G2   request-ID validation + generator + capability state
G3   request-ID application preparation + response propagation
G4   timeout signal combiner + GelisTimeoutError + cleanup primitive
G5   application deadline boundary + timeout response policy
G6   route timeout policy + Lane C specialization
G7   correctness/security/composition tests
G8   package/type boundary + AOT/prebuilt preservation
G9   zero-unused benchmark acceptance
G10  request-ID enabled Hono + HTTP acceptance
G11  timeout enabled Hono + HTTP + combined acceptance
G12  full bun run check
G13  acceptance documentation
```

Each benchmark gate is declared before candidate measurements and is never relaxed after failure.

Benchmark-only commits must not silently alter the measured production candidate.

---

# 33. Release boundary

P11-G completion does not authorize npm publish, a Git tag, or a GitHub Release.

Release engineering remains an explicit maintainer-controlled phase.

---

# 34. Decision

```text
P11-G REQUEST ID + TIMEOUT / ABORT ARCHITECTURE + API + GATES FROZEN

NEXT:
G2 request-ID validation + generator + capability state
```
