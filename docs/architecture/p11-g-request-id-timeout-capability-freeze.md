# P11-G Request ID + Timeout / Abort Capability Freeze

**Status:** ARCHITECTURE + API + GATES FROZEN  
**Date:** 2026-09-11  
**Phase:** P11-G  
**Public owners:** `gelis/request-id`, `gelis/timeout`  
**Performance control source:** `c6a65d639679464744ba3be21cfc8acb0f850d9a`

## Purpose

P11-G adds request correlation and cooperative execution deadlines without introducing a universal request context wrapper, cloning live `Request` objects, growing the root `Gelis` generic, or adding permanent work to applications that do not enable these capabilities.

The design follows the already-frozen P11-B execution lanes:

```text
request ID
-> Lane B compiled application HTTP boundary
-> capability-instance request-local state

timeout / abort
-> Lane B application deadline
-> Lane C route deadline specialization
-> capability-instance request-local state
```

Transport/server timeouts remain separate adapter/runtime controls.

---

# 1. Scope

P11-G v0.1 covers:

```text
framework-generated request IDs
explicit inbound request-ID trust policy
request-ID response propagation
request-ID handler/lifecycle access
application execution deadlines
route execution deadlines
cooperative AbortSignal access
incoming request.signal + framework deadline composition
already-aborted incoming requests
timeout response race semantics
onError integration
CORS / secure-header / request-ID response composition
AOT/prebuilt preservation
zero-unused regression
feature-enabled competitor benchmarks
HTTP benchmark gates
route-timeout request-scale gate
TypeScript route-scale gate
```

P11-G does not implement transport connection/read/write timeouts, forced thread/task termination, distributed tracing, OpenTelemetry context, structured logging, automatic traceparent generation, retry policy, rate limiting, or background-job cancellation.

A timeout does not guarantee that arbitrary user async work stops. Cancellation is cooperative and only code that observes the supplied `AbortSignal` can react to it.

---

# 2. Package ownership

Frozen public subpaths:

```text
gelis/request-id
gelis/timeout
```

The root `gelis` entrypoint does not re-export either capability.

Both remain in the core `gelisjs/gelis` repository and may use private official-subpath runtime integration.

Only one application request-ID capability and one application timeout capability may be installed per `Gelis` application. Duplicate installation fails synchronously and transactionally.

---

# 3. Request-ID public API

Conceptual public surface:

```ts
import { requestId } from "gelis/request-id";

export type RequestIdTrustIncoming =
  | boolean
  | ((value: string, request: Request) => boolean);

export interface RequestIdOptions {
  readonly headerName?: string;
  readonly maxLength?: number;
  readonly trustIncoming?: RequestIdTrustIncoming;
  readonly generator?: (request: Request) => string;
}

export interface RequestIdCapability extends Plugin {
  get(request: Request): string | undefined;
}

export function requestId(options?: RequestIdOptions): RequestIdCapability;
```

Default configuration:

```text
headerName    = X-Request-Id
maxLength     = 255
trustIncoming = false
generator     = crypto.randomUUID
```

The default is intentionally **generate, not trust**.

An inbound `X-Request-Id` therefore does not become framework correlation identity unless the application explicitly enables inbound trust.

---

# 4. Request-ID resolution semantics

Resolution order is frozen:

```text
trustIncoming = false
-> ignore inbound candidate
-> generate

trustIncoming = true
-> read configured header
-> validate built-in safe form
-> adopt when valid
-> otherwise generate

trustIncoming = predicate
-> read configured header
-> enforce baseline legal/length checks
-> predicate decides trust
-> adopt only when predicate returns true
-> otherwise generate
```

The trust predicate is synchronous in P11-G v0.1. Async trust policy is deferred because it would force an asynchronous preparation path onto every request using that configuration.

Missing, empty, over-length, syntactically invalid, or untrusted inbound values do not produce a request error. They fall back to generation.

A custom generator is also synchronous. A thrown generator error remains an application error and flows through normal `onError` handling.

The resolved ID is stored in an instance-owned `WeakMap<Request, string>` and is exposed by `capability.get(request)`.

Calling `get()` for a request that was not prepared by that capability returns `undefined`.

Gelis does not mutate request headers to expose resolved request-local identity.

---

# 5. Request-ID validation

`headerName` must be a non-empty legal HTTP field-name token.

`maxLength` must be a positive finite safe integer.

Every generated or adopted request ID must satisfy baseline response-header safety:

```text
string
non-empty
length <= maxLength
no CR / LF / control-character injection
legal HTTP field value
```

When `trustIncoming: true`, the built-in trusted form is additionally restricted to an HTTP-token-compatible value. This prevents whitespace/control-delimited attacker-controlled log identity by default.

A custom trust predicate may accept a broader legal field value, but cannot bypass the baseline length and header-safety checks.

If a custom generator returns an invalid value, request execution fails through the normal error boundary rather than silently emitting or repairing the invalid identifier.

---

# 6. Request-ID response propagation

The final resolved ID is propagated on the configured response header.

Request-ID finalization owns that response field and overwrites a conflicting handler-provided value. This guarantees that the response correlation ID equals the ID returned by `capability.get(request)`.

Propagation applies exactly once to:

```text
normal route responses
404
405
automatic OPTIONS
CORS preflight responses
handled onError responses
timeout fallback responses
```

Request-ID preparation runs before CORS preflight handling. Request-ID response finalization runs after CORS and secure-header finalization.

Frozen response-policy order:

```text
CORS
-> secure headers
-> request ID propagation
-> final Response
```

---

# 7. Timeout public API

Conceptual public surface:

```ts
import { timeout, TimeoutError } from "gelis/timeout";

export interface TimeoutOptions {
  readonly duration?: number;
}

export type TimeoutScope = "application" | "route";

export class TimeoutError extends Error {
  readonly code: "REQUEST_TIMEOUT";
  readonly duration: number;
  readonly scope: TimeoutScope;
}

export interface TimeoutCapability extends Plugin {
  signal(request: Request): AbortSignal;
}

export function timeout(options?: TimeoutOptions): TimeoutCapability;
```

`timeout({ duration })` installs an application hard deadline.

`timeout()` without an application duration is valid and exists for applications that use route-level timeouts only while still needing explicit cooperative-signal access and timeout fallback integration.

`signal(request)` returns the framework-combined signal while timeout state exists for that request. If no timeout state has been established for that request, it returns the incoming `request.signal`.

---

# 8. Timeout duration validation

Every framework timeout duration must be an integer millisecond value in:

```text
1 <= duration <= 2147483647
```

This keeps timer behavior within the broadly interoperable signed 32-bit delay range used by JavaScript timer implementations.

Invalid application duration fails synchronously when creating/installing the capability.

Invalid route duration fails synchronously at route declaration/mount specialization.

There is no implicit Gelis timeout when the capability is absent.

---

# 9. Route-level timeout API

Route timeout uses a direct non-generic route option:

```ts
const deadlines = timeout();
app.use(deadlines);

app.get(
  "/slow",
  {
    timeout: 1_000,
  },
  async ({ request }) => {
    const signal = deadlines.signal(request);
    // pass signal to cooperative downstream work
    return new Response("ok");
  },
);
```

Frozen type direction:

```ts
interface RouteOptions {
  readonly timeout?: number;
}
```

`RouteOptionsFor` carries the same non-generic field.

A route-level timeout requires an application `TimeoutCapability` installation. It must never silently execute as an untimed route merely because the capability is missing.

The implementation may support declarations before or after capability installation through configuration-time re-specialization, but before request execution every timed route must be bound to exactly one timeout capability. An unbound timed route is a configuration failure, not a best-effort fallback.

The timeout field is execution policy, not OpenAPI or typed-client contract metadata.

---

# 10. Application + route deadline precedence

The application timeout is an **outer hard deadline**.

A route timeout is an **inner tightening deadline**.

Frozen rule:

```text
application only
-> application deadline

route only
-> route deadline

application + route
-> earliest deadline wins
```

A route timeout never extends or disables an active application timeout.

This rule is required by the already-frozen execution topology: the application deadline begins before ordinary `onRequest` and routing, while the route deadline becomes known only after route resolution.

Gelis will not pre-route every request merely to discover route timeout metadata.

---

# 11. Timeout execution boundaries

Application request order is frozen as:

```text
request-ID preparation when enabled
framework timeout state preparation when enabled
        ↓
CORS preflight / protocol guards
        ↓
application deadline race when configured
        ↓
ordinary onRequest
        ↓
router
        ↓
route boundary deadline when configured
        ↓
input parsing / validation
beforeHandle
handler
afterHandle
managed response execution
        ↓
application deadline completes
        ↓
response policies
CORS -> secure headers -> request ID
        ↓
final Response
```

A successful CORS preflight is not forced through the application timeout race because it terminates in the pre-routing protocol-guard stage.

A route deadline covers the whole specialized route executor, not only the user handler body.

---

# 12. Cooperative AbortSignal model

P11-G does not clone each `Request` to replace `request.signal`.

Timeout state is capability-instance owned:

```text
incoming request.signal
        +
application deadline AbortController when active
        +
route deadline AbortController when active
        ↓
combined cooperative AbortSignal
        ↓
TimeoutCapability.signal(request)
```

The combined signal is request-local state keyed by the original `Request` object.

Required semantics:

```text
incoming request already aborted
-> returned cooperative signal is already aborted

client/incoming abort later
-> cooperative signal aborts
-> Gelis does not relabel that event as framework timeout

framework application deadline
-> cooperative signal aborts with timeout reason
-> application TimeoutError wins the framework deadline race

framework route deadline
-> cooperative signal aborts with timeout reason
-> route TimeoutError wins the route deadline race
```

Incoming client abort does not synthesize a `504` by itself. User work may react to the aborted signal and may throw/return according to its own semantics.

Framework timeout does not forcibly terminate JavaScript execution. Work that ignores the signal may continue after the client-visible timeout response has been selected.

---

# 13. Timeout error and response semantics

A framework deadline settles with exported `TimeoutError`:

```text
code     = REQUEST_TIMEOUT
duration = configured winning duration
scope    = application | route
```

`onError` remains the application error authority.

User `onError` hooks receive the `TimeoutError` first and may return a custom response.

If no user error hook handles it, Gelis provides the default timeout fallback:

```text
HTTP 504 Gateway Timeout
```

Default body:

```json
{
  "error": {
    "code": "REQUEST_TIMEOUT",
    "message": "Request exceeded the configured timeout"
  }
}
```

A successful user `onError` timeout response and the default timeout fallback both receive active CORS, secure-header, and request-ID response finalization exactly once.

A timeout does not recursively time the `onError` handler itself in P11-G v0.1. Error handling remains outside the framework deadline race.

HEAD response body suppression remains intact.

---

# 14. Response race and cleanup semantics

The framework must make the timeout race deterministic enough that once the framework deadline wins, a late route response cannot replace the timeout outcome.

Required behavior:

```text
inner work finishes first
-> clear framework timer
-> return/continue with inner result

framework deadline fires first
-> mark timeout winner
-> abort cooperative signal
-> settle TimeoutError
-> late inner fulfillment is ignored
-> late inner rejection must not become an unhandled rejection
```

Timer cleanup is required on synchronous success, asynchronous success, ordinary error, and timeout completion.

A synchronous inner response may retain a synchronous fast path. Timeout must not force a Promise continuation when the protected work completes synchronously and the runtime can safely clear the timer immediately.

Request-local WeakMap state may remain associated with the original Request until Request reachability ends. This allows already-running cooperative user work to continue reading the same aborted signal after a timeout response has won.

---

# 15. Private runtime architecture

`RuntimeApplicationHttpPlan` gains structured request-ID and timeout slots rather than a generic middleware array.

Conceptually:

```text
RuntimeApplicationHttpPlan
├── requestId?
├── timeout?
├── cors?
└── secureHeaders?
```

Request ID uses configuration-time compiled preparation/finalization.

Timeout receives a specialized application execution boundary because `prepare/finalize` alone cannot express an execution race correctly.

The existing private official application marker may be extended with `request-id` and `timeout` kinds.

The community plugin API does not gain generic `next()` or `onResponse()` solely for P11-G.

Route timeout uses Lane C route-boundary specialization. A timed route receives optional timeout execution state only when configured. Plain routes keep the existing `RUNTIME_ROUTE_PLAIN` fast path and existing ordinary runtime record shape.

No timeout lookup may be inserted before the existing plain-route return.

---

# 16. Composition requirements

P11-G must permanently test composition with already-accepted P11 capabilities.

Required cases include:

```text
request ID + CORS in both plugin registration orders
request ID + secure headers in both plugin registration orders
request ID + CORS preflight
request ID + handled onError
request ID + timeout fallback
application timeout + CORS preflight
timeout + secure headers
timeout + CORS
timeout + request ID
application timeout + shorter route timeout
application timeout + longer route timeout
route timeout + managed input/lifecycle/response route
```

Semantic execution order, not plugin registration order, is authoritative.

---

# 17. AOT / prebuilt requirements

Request ID and timeout are runtime execution policy, not route contract metadata.

Required AOT behavior:

```text
requestId installed before hydrated/prebuilt runtime
-> remains active

requestId installed after hydrated/prebuilt runtime where application plugins are allowed
-> remains active

application timeout installed before/after hydrated runtime where allowed
-> remains active

route timeout metadata
-> preserved for AOT-eligible routes
-> bound to the timeout capability during runtime specialization

AOT route semantics
-> unchanged when request ID / timeout are absent

OpenAPI / typed-client snapshots
-> no request-ID or timeout execution metadata
```

A helper/API shape that silently makes otherwise eligible timed routes AOT-ineligible is not accepted.

---

# 18. Package and type gates

Required package/type behavior:

```text
package export resolves gelis/request-id
package export resolves gelis/timeout
portable consumer imports both without Bun types
root gelis does not re-export either convenience API
public RequestId options/capability types compile
public Timeout options/capability/error types compile
route timeout accepts legal integer literals
obvious illegal timeout literals/values fail where TypeScript can represent the constraint
root Gelis generic remains stable
no route-collection generic accumulation
```

Because P11-G adds a new direct `RouteOptionsFor.timeout` field, the accepted TypeScript route-scaling suite must be rerun with a timeout-route scenario at:

```text
100
500
1000
5000 routes
```

Comparison control:

```text
p11-timeout-route / routes
```

Frozen relative gates per size:

```text
instantiations ratio <= 1.15x
median memory ratio  <= 1.15x
median check ratio   <= 1.25x
```

At 5,000 routes:

```text
median check ratio <= 1.20x
```

Growth gates:

```text
1000 -> 5000 instantiations growth <= 5.5x
1000 -> 5000 median check growth   <= 6.0x
```

Structural hard gates remain:

```text
root typeof app remains exactly Gelis
all generated cases compile
route timeout does not enter application/route-collection generics
```

---

# 19. Zero-unused performance gate

Control source:

```text
c6a65d639679464744ba3be21cfc8acb0f850d9a
```

The control is the accepted P11-F completion head.

Structurally, when request ID and timeout are unused:

```text
root gelis does not import their implementations
no request-ID WeakMap state exists
no timeout WeakMap/controller/timer exists
no request-ID/timeout application slot exists
no route-timeout sidecar exists
plain Gelis.prototype.fetch behavior remains unchanged
plain RuntimeRouteRecord shape remains unchanged
```

Mirrored direct cases:

```text
static raw
dynamic raw
static JSON
dynamic JSON
```

Protocol:

```text
Bun 1.4.0
5,000 mixed routes
11 mirrored fresh-process pairs
alternating order
warmup + calibrated timed window
median pairwise candidate/control ratio
order diagnostics
```

Frozen gates:

```text
each candidate/control median <= 1.03x
four-case geometric mean      <= 1.015x
```

Ratios below `1.00x` are no-regression evidence only.

---

# 20. Request-ID competitor gate

Primary comparator:

```text
Hono 4.13.5 requestId
```

Comparator workloads must produce equivalent correlation behavior for the measured case. Gelis's safer default of not trusting inbound identity must not be compared against a Hono case that performs different work and then described as equivalent.

Canonical direct cases:

```text
default generated ID
explicit trusted valid inbound ID
invalid inbound ID -> generated fallback
custom synchronous generator
```

The handler must read the resolved ID in both frameworks so request-local exposure is part of measured work. The response must propagate the same resolved ID.

Protocol:

```text
Bun 1.4.0
11 mirrored fresh-process pairs per case
alternating framework order
warmup
calibrated timed window
median pairwise Gelis/Hono ns/op ratio
order diagnostics
```

Frozen hard gates:

```text
each case Gelis/Hono <= 1.10x
geometric mean       <= 1.05x
```

Request-ID HTTP gate:

```text
one static 204 route
default generated request ID
handler reads resolved ID
response propagates ID
Bun server adapter
50 connections
7 alternating warmed samples
```

Frozen HTTP gate:

```text
median Gelis throughput >= 0.90x Hono throughput
```

---

# 21. Timeout competitor gate

Primary direct comparator:

```text
Hono 4.13.5 timeout
```

Hono 4.13.5 timeout races execution against a timer but does not provide Gelis-equivalent combined cooperative AbortSignal state. Gelis must **not disable its required signal semantics merely to improve the benchmark**.

Therefore the competitor comparison is intentionally conservative against Gelis: Gelis performs the accepted full timeout bookkeeping while the Hono comparator performs its normal timeout middleware work.

Canonical successful-under-deadline direct cases:

```text
application timeout + synchronous static 204
application timeout + asynchronous static 204
route timeout + synchronous static 204
route timeout + asynchronous static 204
```

Timeout-fire latency is correctness/diagnostic evidence, not a primary ns/op competitor gate because configured duration dominates the measurement.

Protocol:

```text
Bun 1.4.0
11 mirrored fresh-process pairs per case
alternating framework order
warmup
calibrated timed window
median pairwise Gelis/Hono ns/op ratio
order diagnostics
```

Frozen hard gates:

```text
each under-deadline case Gelis/Hono <= 1.15x
geometric mean                     <= 1.10x
```

Timeout HTTP gate:

```text
one static 204 route
application timeout enabled with a duration far above request latency
Bun server adapter
50 connections
7 alternating warmed samples
```

Frozen HTTP gate:

```text
median Gelis throughput >= 0.90x Hono throughput
```

No timeout result may be accepted by weakening AbortSignal composition, timer cleanup, error integration, or response-race correctness.

---

# 22. Route-timeout request-scale gate

Route-level timeout must not introduce request-time work proportional to registered route count.

Measure the same matched timed route with:

```text
1,000 registered routes
5,000 registered routes
```

Protocol:

```text
Bun 1.4.0
11 mirrored fresh-process pairs
alternating 1000-first / 5000-first order
same timeout capability and route semantics
median pairwise 5000/1000 ratio
order diagnostics
```

Frozen gate:

```text
5000 / 1000 median <= 1.50x
```

A ratio below `1.00x` is only evidence of no route-count regression for that workload.

---

# 23. Correctness acceptance matrix

Request-ID acceptance must cover at minimum:

```text
default generated UUID
attacker-provided inbound ID ignored by default
trusted valid inbound adoption
invalid/empty/overlength inbound fallback
custom trust predicate
custom generator
header-name validation
maxLength validation
generated-value validation
request headers remain unchanged
accessor state isolation across applications
404 / 405 / OPTIONS / CORS preflight propagation
handled-error propagation
duplicate installation rejection
```

Timeout acceptance must cover at minimum:

```text
application sync completion before deadline
application async completion before deadline
application timeout fire
route timeout fire
route timeout covers input/lifecycle/handler/response execution
earliest application/route deadline wins
longer route timeout cannot extend application deadline
incoming request.signal composition
already-aborted incoming request
client abort is not relabeled as 504
framework timeout abort reason
TimeoutError fields
user onError customization
default 504 fallback
late fulfillment ignored
late rejection handled
timer cleanup
handler ignoring signal may continue without changing selected response
HEAD timeout response suppression
CORS / secure headers / request ID composition
duplicate timeout installation rejection
unbound route timeout fails closed
```

No correctness or cancellation test may be weakened to satisfy performance gates.

---

# 24. Implementation sequence

```text
G1   architecture/API/performance freeze
G2   request-ID compiler + request-local state
G3   request-ID application integration + coverage
G4   timeout state + application deadline + TimeoutError
G5   route timeout specialization + precedence
G6   abort/race/error/cross-capability correctness
G7   package/type/AOT + TypeScript scaling preservation
G8   zero-unused benchmark acceptance
G9   request-ID Hono + HTTP benchmark acceptance
G10  timeout Hono + HTTP + route-scale benchmark acceptance
G11  full bun run check
G12  acceptance documentation
```

Authoritative promotion occurs only after the relevant gate is green.

---

# 25. Release boundary

P11-G completion does not authorize npm publication, Git tags, GitHub Releases, or another public release action.

Release remains an explicit maintainer-controlled milestone outside this subphase.

---

# 26. Freeze decision

```text
P11-G REQUEST ID + TIMEOUT / ABORT
ARCHITECTURE + API + PERFORMANCE GATES FROZEN

REQUEST ID DEFAULT:
GENERATE LOCALLY; DO NOT TRUST INBOUND ID UNLESS EXPLICITLY ENABLED

TIMEOUT MODEL:
COOPERATIVE AbortSignal + deterministic framework deadline race

APPLICATION TIMEOUT:
OUTER HARD DEADLINE

ROUTE TIMEOUT:
INNER TIGHTENING DEADLINE; EARLIEST DEADLINE WINS

REQUEST CLONING:
REJECTED

FORCED USER-WORK TERMINATION CLAIM:
REJECTED

NEXT:
P11-G2 REQUEST-ID COMPILER + REQUEST-LOCAL STATE
```
