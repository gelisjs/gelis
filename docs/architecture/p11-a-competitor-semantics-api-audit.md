# P11-A Competitor Semantics + API Audit

**Status:** COMPLETE  
**Date:** 2026-09-09  
**Phase:** P11-A  
**Parent:** `p11-industrial-http-essentials-roadmap-freeze.md`

## Purpose

P11-A studies production semantics and ecosystem expectations for the six P11 Industrial HTTP Essentials capability families before Gelis chooses package boundaries or APIs.

References:

```text
Hono
Elysia
Fastify
NestJS
```

The audit intentionally studies semantics, security behavior, lifecycle topology, and ownership rather than copying competitor syntax.

## Reference roles

```text
Hono
portable Web Standards reference
small helpers + built-in middleware

Elysia
Bun-first typed DX reference
strong cookie integration and official CORS

Fastify
low-overhead mature-core/ecosystem reference
server/route-level operational controls

NestJS
enterprise documentation/workflow reference
adapter-backed integration breadth
```

---

# 1. Cookies

## Hono

Hono exposes an official cookie helper rather than requiring a global middleware.

Reviewed behavior includes:

```text
get/set/delete
generate cookie strings without mutating response
signed cookies using WebCrypto HMAC SHA-256
HttpOnly
Secure
SameSite
Domain
Path
Max-Age / Expires
Priority
Partitioned
__Secure- / __Host- prefix handling
cookie-bis / CHIPS-oriented validation
```

Notable behavior:

```text
invalid signed value can be distinguished from missing value
prefix constraints are enforced
excessive Max-Age / Expires values are rejected
signed operations are async because WebCrypto is async
```

Design lesson:

> Cookie parsing/serialization can remain a small portable helper instead of becoming a permanent request middleware cost.

## Elysia

Elysia makes cookies a first-class typed/reactive handler context surface.

Reviewed behavior includes:

```text
reactive get/set
remove
typed cookie schemas
structured/object values
cookie attributes
signed cookies
per-cookie signing selection
global cookie signing config
secret/key rotation
unsigned-to-signed migration option
```

Design lesson:

> Type inference and secret rotation materially improve cookie DX, but Gelis should not require every request to instantiate a reactive cookie proxy when the application does not use cookies.

## Fastify

Fastify maintains official cookie and secure-session packages. Cookie parsing/setting is ecosystem-owned rather than forced into the minimal router surface.

The broader Fastify session ecosystem demonstrates key rotation and explicit cookie configuration.

Design lesson:

> Cookie/security state can remain an official capability with explicit registration while still carrying first-party compatibility responsibility.

## NestJS

Nest documents cookies through its platform adapters:

```text
Express -> cookie-parser / Response.cookie()
Fastify -> @fastify/cookie / reply.setCookie()
```

It also documents a cross-platform custom decorator pattern.

Design lesson:

> A framework may normalize developer guidance without owning every underlying cookie implementation, but Gelis has an opportunity to provide a more portable Web Standards-first surface directly.

## Gelis requirements derived

P11-C must evaluate:

```text
pure parse/generate primitives
response Set-Cookie append semantics
get/set/delete ergonomics
strict encoding/decoding behavior
modern attributes
prefix safety rules
signed-cookie security boundary
secret rotation
constant-time verification expectations
malformed/tampered value semantics
portable WebCrypto implementation
zero-unused behavior
```

Strong initial architecture hypothesis:

> Unsigned cookie parsing/serialization should be usable as pure helpers with no application installation cost. Signed-cookie capability may build on the same representation while remaining explicitly invoked or installed.

This is a hypothesis for P11-B/C, not a frozen API.

---

# 2. CORS

## Hono

Hono provides built-in CORS middleware supporting:

```text
single/multiple/dynamic origin
allowed methods
allowed headers
exposed headers
max age
credentials
dynamic method policy
preflight handling
```

Its current default allowed-method list includes QUERY, demonstrating that modern/nontraditional methods must be considered by CORS policy rather than assuming only the historical common method set.

## Elysia

Elysia provides official `@elysia/cors` with configurable:

```text
origin
methods
allowedHeaders
exposeHeaders
credentials
maxAge
preflight behavior
```

Origin policy may be boolean, string, RegExp, function, or a collection.

## Fastify

Fastify maintains official `@fastify/cors` with origin/method/header/exposure/max-age controls and plugin lifecycle integration.

## NestJS

Nest exposes `enableCors()` and delegates to Express `cors` or `@fastify/cors` based on the active platform adapter.

Design lesson:

> CORS is universally treated as a production baseline, but ownership ranges from built-in middleware to official plugin to adapter delegation.

## Gelis requirements derived

P11-D must cover:

```text
simple request response headers
preflight detection
origin matching
credentials
allowed methods
allowed headers
exposed headers
max age
Vary correctness
wildcard + credentials constraints
dynamic policy
QUERY/custom method awareness
existing automatic OPTIONS/Allow interaction
route/application scope
```

Critical Gelis-specific rule:

> CORS must not create a second contradictory OPTIONS router. Preflight behavior must integrate with the P9 method-semantics architecture.

---

# 3. Request/body limits

## Hono

Hono body-limit behavior uses a two-stage strategy:

```text
Content-Length available
-> fast rejection when oversized

Content-Length absent
-> enforce while reading the body stream
```

The middleware returns/permits explicit 413 handling.

Its Bun guidance also distinguishes framework limits from Bun transport `maxRequestBodySize`.

## Fastify

Fastify treats body limits as core server/route configuration.

Reviewed behavior:

```text
global bodyLimit
route bodyLimit
1 MiB default
parser-enforced oversized-body error
limit applied to stream returned by preParsing hook
```

## Elysia

The reviewed official plugin catalog does not list a first-party body-limit plugin; body-limit capability is surfaced through the community ecosystem and Bun/runtime constraints remain relevant.

## NestJS

Nest's effective request limit is adapter/platform dependent. It primarily documents HTTP capabilities through Express/Fastify integration rather than defining one portable limit model itself.

## Gelis current state

Gelis managed body parsers exist, including multipart/native `File` handling, but there is no first-class route/application request limit.

`gelis/bun` forwards `Bun.Serve.HostnamePortServeOptions`, so Bun transport-level `maxRequestBodySize` can already be configured by the application. That is a transport hard ceiling, not a portable Gelis semantic limit.

## Gelis requirements derived

P11-E must distinguish:

```text
transport hard ceiling
framework application/route policy
managed parser enforcement
stream enforcement
```

Required semantics:

```text
Content-Length fast reject where valid
never trust Content-Length as the only enforcement
missing Content-Length
streamed/chunked body
managed JSON/text/form/multipart/arrayBuffer readers
413 response
route-level and application-level policy
Bun adapter interaction
body already consumed / unusable body handling
```

Critical rule:

> A Gelis body limit must remain correct even when Content-Length is absent or dishonest.

This capability becomes a prerequisite for later large-file/upload hardening.

---

# 4. Secure headers

## Hono

Hono provides built-in secure-headers middleware with configurable default policy and support for CSP, HSTS, frame policy, and related browser-security headers. It also supports CSP nonce generation/propagation.

## Fastify

Fastify maintains official `@fastify/helmet`.

## Elysia

The reviewed official Elysia plugin list does not currently include a first-party secure-headers/Helmet package; community Helmet integrations are prominently surfaced.

## NestJS

Nest documents Helmet integration and delegates to `helmet` or `@fastify/helmet` depending on platform.

## Gelis requirements derived

P11-F should begin from a conservative static-policy model:

```text
safe security-header defaults
enable/disable individual headers
explicit value override
no false claim that one CSP fits every application
no accidental collision with OpenAPI/docs UI or user HTML
portable Headers mutation
route/application scope decision
```

Dynamic CSP nonce support is valuable but must not be included merely to match Hono if it would force request-time state into applications that use only static headers.

Potential architecture:

```text
static precompiled header set fast path
+
optional dynamic policy path
```

This remains a P11-B/F design hypothesis.

---

# 5. Request ID

## Hono

Hono request-id middleware:

```text
generates with crypto.randomUUID() by default
supports custom header name
may accept an incoming request ID
supports custom generator
limits incoming ID length
exposes ID to handlers
```

## Fastify

Fastify makes request IDs a core request/server concept.

Reviewed behavior includes:

```text
request.id
genReqId
requestIdHeader
requestIdLogLabel/log integration
encapsulated generator override
```

Fastify explicitly warns that trusting an incoming request-id header allows callers to choose the ID and performs no validation by default.

## NestJS

Nest's observability SDK now documents trace correlation with a default generator that adopts incoming `x-request-id` or generates a UUID, then attaches the trace identifier to logging/tracing context.

## Elysia

The reviewed official Elysia catalog does not list request ID as a first-party plugin; community request-ID packages are surfaced.

## Gelis requirements derived

P11-G request ID must explicitly decide trust policy rather than silently accepting arbitrary incoming IDs.

Required design questions:

```text
always generate by default vs adopt inbound header
trusted inbound header policy
length/character validation
header name
custom generator
response propagation
handler/lifecycle exposure
logging/OTel future integration
request-scope representation
zero-unused cost
```

Recommended security direction for P11-B:

> Default to generating a Gelis request ID unless inbound adoption is explicitly enabled or validated by policy.

This avoids making log/trace identity attacker-controlled by default.

---

# 6. Timeout / abort

## Hono

Hono provides timeout middleware with configurable duration and timeout error behavior.

## Fastify

Fastify distinguishes multiple timeout layers:

```text
connectionTimeout
requestTimeout
handlerTimeout
```

`handlerTimeout` applies to the full route lifecycle, sends an error response when the deadline is exceeded, and aborts `request.signal`.

Fastify explicitly documents cooperative cancellation: aborting the signal does not magically stop async work that ignores it.

Route-level handler timeout can override server configuration.

## Elysia

No equivalent first-party timeout plugin was identified in the reviewed official plugin list. Elysia lifecycle composition can implement policies, while Bun transport behavior remains a separate layer.

## NestJS

Nest commonly expresses application deadlines through interceptors/RxJS or underlying platform behavior rather than a single portable core timeout primitive.

## Gelis requirements derived

P11-G must separate:

```text
transport receive/connection timeout
application handler deadline
cooperative cancellation
```

Required semantics:

```text
route/application duration
AbortSignal available to user work
already-aborted request
combined client disconnect + framework deadline
handler/lifecycle timeout boundary
response race
cleanup
timeout response code/policy
adapter-specific transport options remain distinct
```

Critical rule:

> Gelis must never promise that timeout forcibly terminates arbitrary user async work. Cancellation is cooperative through AbortSignal.

Fastify's explicit documentation of this boundary is a strong reference.

---

# 7. Cross-capability architecture observations

## Observation A — not everything should be middleware

Competitors expose similar features through different shapes:

```text
pure helper
middleware
core request/server option
official plugin
adapter integration
```

Gelis should choose the cheapest truthful topology per capability.

## Observation B — application/global chains are not free

Gelis should avoid solving P11 by introducing one universal always-on middleware chain.

Potential split worth evaluating in P11-B:

```text
pure helpers
cookie parse/generate
possibly static secure-header generation

registration/application specialization
CORS
request ID
timeout
secure-header application

runtime input-plan specialization
request/body limit
```

## Observation C — transport and framework policy are different

Especially for:

```text
body limits
timeouts
client disconnect/cancellation
```

Bun/Node/server transport limits must remain distinct from Gelis semantic route/application policies.

## Observation D — security defaults must be explicit

High-value security findings:

```text
cookie prefix constraints matter
cookie expiration bounds matter
signed cookie failure must be distinguishable
secret rotation matters
inbound request IDs are untrusted by default
body limits cannot trust Content-Length alone
CORS wildcard/credentials combinations need deliberate handling
CSP cannot be safely inferred for every application
```

---

# 8. Ownership questions handed to P11-B

P11-A does not freeze package names.

P11-B must answer:

```text
1. Are unsigned cookie primitives root exports or gelis/cookie?
2. Does signed-cookie crypto live with the cookie helper or an official package?
3. Does CORS use the existing plugin/lifecycle system or a dedicated compiled application capability?
4. How does CORS preflight compose with automatic OPTIONS/Allow?
5. Where is route/application body-limit metadata stored without growing the root Gelis generic?
6. Can body-limit enforcement reuse/create specialized RuntimeInputPlan readers?
7. Are secure headers best as static compiled response policy plus optional dynamic path?
8. How is request ID exposed without globally polluting every RouteContext type?
9. How is framework timeout signal combined with the incoming Request signal?
10. Which features require Bun adapter hints/options in addition to portable core behavior?
```

---

# 9. P11-A decision

```text
P11-A COMPETITOR SEMANTICS + API AUDIT COMPLETE

NEXT:
P11-B OWNERSHIP + EXECUTION ARCHITECTURE
```

No production feature implementation is authorized by P11-A alone.
