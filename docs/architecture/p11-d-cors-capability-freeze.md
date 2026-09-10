# P11-D CORS Capability Freeze

**Status:** ARCHITECTURE + API + GATES FROZEN  
**Date:** 2026-09-10  
**Phase:** P11-D  
**Public owner:** `gelis/cors`  
**Performance control source:** `f2b104df8ffbe96348c51271a1868a1c4f9141c7`

## Purpose

P11-D introduces the first P11 capability that integrates with the compiled Gelis application HTTP boundary.

The capability must provide production CORS behavior without creating a universal middleware chain, without installing a second OPTIONS router, and without adding request-time work to applications that do not enable CORS.

This document freezes semantics, public API shape, correctness requirements, zero-unused requirements, and performance gates **before production benchmark results are observed**.

---

# 1. Standards and competitor basis

P11-D follows the Fetch CORS protocol model:

```text
CORS request
-> request includes Origin

CORS preflight
-> method OPTIONS
-> Origin present
-> Access-Control-Request-Method present

credentialed response
-> wildcard origin is invalid
-> wildcard method/header/expose semantics are not relied upon

non-wildcard origin decision
-> response varies by Origin
```

Reviewed competitor behavior includes:

```text
Hono
-> origin string/array/function
-> allowed methods/headers
-> exposed headers
-> credentials
-> max age
-> 204 preflight
-> Vary behavior

Elysia
-> official CORS plugin
-> static/dynamic origin policy
-> method/header controls
-> credentials/max age
-> explicit preflight handling

Fastify
-> official CORS plugin
-> static/dynamic origin policy
-> strict preflight option
-> route integration
-> Vary handling
```

Gelis deliberately does not copy a competitor's hard-coded default method list.

---

# 2. Public subpath and installation

Public usage is frozen conceptually as:

```ts
import { cors } from "gelis/cors";

const app = new Gelis();
app.use(cors());
```

The root `gelis` entrypoint does not re-export CORS helpers.

`cors()` returns an ordinary Gelis `Plugin` to users, but its implementation registers a private official application HTTP-plan slot rather than generic `onRequest`/`onAfterHandle` middleware.

Only one CORS application policy may be installed on one Gelis application in P11-D v0.1.

A second CORS policy must fail at configuration time rather than silently override or nest the first.

Route-scoped multiple CORS policies are **not** part of P11-D v0.1. The decision is explicit: P11-D owns one application policy. A future scoped-policy extension must define conflict/precedence semantics separately.

---

# 3. Frozen public types

Conceptual public surface:

```ts
export type CorsOriginResolver = (
  origin: string,
  request: Request,
) => boolean | PromiseLike<boolean>;

export type CorsOrigin = "*" | string | readonly string[] | CorsOriginResolver;

export interface CorsOptions {
  readonly origin?: CorsOrigin;
  readonly methods?: readonly string[];
  readonly allowHeaders?: readonly string[] | "request";
  readonly exposeHeaders?: readonly string[];
  readonly credentials?: boolean;
  readonly maxAge?: number;
}

export function cors(options?: CorsOptions): Plugin;
```

Exact exported aliases may be named consistently with this surface, but no additional public runtime abstraction is required for v0.1.

Defaults:

```text
origin       = "*"
methods      = route-aware actual Gelis methods
allowHeaders = "request"
exposeHeaders= []
credentials  = false
maxAge       = omitted
```

---

# 4. Origin policy

## Wildcard

```text
origin: "*"
credentials: false
-> Access-Control-Allow-Origin: *
-> no Vary: Origin required solely for CORS
```

The following configuration is rejected synchronously:

```text
origin: "*"
credentials: true
```

Gelis does not silently convert that configuration into "reflect every origin with credentials" because that would turn an invalid configuration into a materially broader trust policy.

## Fixed origin

A fixed origin only grants the request when the incoming `Origin` exactly matches the configured origin after configuration validation.

Allowed response:

```text
Access-Control-Allow-Origin: <incoming-origin>
Vary: Origin
```

Denied origins do not receive `Access-Control-Allow-Origin`.

## Origin list

A string array is an exact allowlist.

The incoming origin is reflected only if present in the allowlist.

The response varies by `Origin`.

## Dynamic resolver

A resolver receives:

```text
incoming Origin string
original Request
```

Return semantics:

```text
true  -> allow and reflect incoming origin
false -> deny
```

A Promise-like boolean is allowed.

The static CORS path must remain synchronous. Promise allocation/continuation is allowed only when the configured resolver actually returns a Promise-like value.

P11-D does not accept arbitrary resolver-returned header strings. This prevents a dynamic policy from becoming an unchecked header-value injection API.

## Origin syntax

Static configured origins must be valid serialized origins or `*`.

`null` is not enabled by wildcard-special handling. Applications that intentionally need the opaque `null` origin must opt into it explicitly through a fixed/list/resolver policy and accept the associated security implications.

Malformed incoming origin values fail closed.

---

# 5. Actual/simple CORS response behavior

For a request with no `Origin` header:

```text
no CORS grant headers are added
ordinary Gelis response remains otherwise unchanged
```

For an allowed CORS request, response finalization may add:

```text
Access-Control-Allow-Origin
Access-Control-Allow-Credentials   when enabled
Access-Control-Expose-Headers      when configured
Vary: Origin                      when origin decision is request-dependent
```

CORS response policy applies to:

```text
normal route responses
404/405/automatic OPTIONS responses that are not actual CORS preflights
responses returned by a successful onError handler
```

It is applied exactly once.

A denied actual CORS request still runs the ordinary application route. Gelis simply omits the CORS grant headers; browser CORS enforcement then prevents cross-origin script access.

CORS is not authentication or authorization.

---

# 6. Preflight recognition

A request is an actual CORS preflight only when all are true:

```text
method === OPTIONS
Origin header exists
Access-Control-Request-Method header exists
```

Therefore:

```text
OPTIONS without Origin
-> ordinary P9 OPTIONS behavior

OPTIONS + Origin but no Access-Control-Request-Method
-> ordinary P9 OPTIONS behavior with applicable actual-response CORS policy
```

No synthetic wildcard OPTIONS route is registered.

Actual preflight interception occurs before ordinary routing through the private compiled application HTTP boundary.

---

# 7. Route-aware method policy

Gelis CORS default method policy is derived from the router's actual method topology for the requested pathname.

This avoids stale global lists and automatically understands:

```text
GET
implicit HEAD from GET
POST/PUT/PATCH/DELETE
QUERY
custom methods
explicit OPTIONS
ALL fallback
```

Internal `ALL` representation is never serialized into `Access-Control-Allow-Methods`.

For an ALL route, the requested preflight method may be advertised because the route would accept that wire method.

If `CorsOptions.methods` is supplied, it acts as an **additional CORS allowlist** intersected with methods actually routable for that pathname. It does not advertise nonexistent routes.

Configured methods:

```text
must be valid HTTP method tokens
are deduplicated deterministically
preserve custom method identity/casing
must not contain the internal ALL marker
```

The CORS method list is not the HTTP `Allow` header and does not replace P9 method semantics.

---

# 8. Preflight response

A syntactically valid recognized preflight terminates before route/user lifecycle execution and returns:

```text
204 No Content
```

No response body is produced.

For an allowed origin, the response may contain:

```text
Access-Control-Allow-Origin
Access-Control-Allow-Credentials
Access-Control-Allow-Methods
Access-Control-Allow-Headers
Access-Control-Max-Age
Vary
```

A method that is not routable or is excluded by configured `methods` simply does not appear in `Access-Control-Allow-Methods`; the browser's CORS check fails.

A denied origin receives no CORS grant headers.

P11-D does not use status code differences as the primary CORS authorization signal.

Malformed preflight syntax such as an invalid `Access-Control-Request-Method` token or invalid requested-header field-name list may return `400 Bad Request`.

---

# 9. Requested/allowed headers

Default:

```text
allowHeaders: "request"
```

For preflight, Gelis parses `Access-Control-Request-Headers` as a comma-separated field-name list.

Rules:

```text
OWS around list items is ignored
field names must be valid HTTP field names
comparison is ASCII case-insensitive
empty/malformed list item -> invalid preflight
```

When the default request-reflection mode is used:

```text
Access-Control-Allow-Headers
-> normalized requested header list

Vary
-> includes Access-Control-Request-Headers
```

If an explicit `allowHeaders` array is configured, Gelis emits the prevalidated configured list. Browser subset checking remains authoritative.

P11-D does not use `*` for allow-headers, allowing the same API to remain correct with credentials.

---

# 10. Exposed headers

`exposeHeaders` is an explicit list of valid HTTP field names.

When non-empty and origin is allowed:

```text
Access-Control-Expose-Headers: <precompiled-list>
```

P11-D does not use wildcard exposed-header semantics because wildcard meaning changes with credentials mode.

---

# 11. Credentials

Default:

```text
credentials = false
```

When true and origin is allowed:

```text
Access-Control-Allow-Credentials: true
```

The value is exactly lowercase `true` as required by Fetch semantics.

Credentials do not cause Gelis to trust an incoming origin automatically.

---

# 12. Max age

`maxAge`, when provided:

```text
must be a finite non-negative integer
```

It is serialized as decimal seconds only on allowed preflight responses.

No arbitrary Gelis-specific maximum is imposed in v0.1; user-agent caps remain user-agent behavior.

---

# 13. Vary correctness

CORS response mutation must preserve pre-existing `Vary` values.

Tokens are merged case-insensitively without duplication.

If existing `Vary` is `*`, Gelis leaves it as `*`.

Required additions:

```text
Origin
-> whenever CORS representation/grant depends on incoming Origin

Access-Control-Request-Headers
-> preflight when allowHeaders === "request"

Access-Control-Request-Method
-> when ALL/other route-aware resolution makes the advertised method set depend on requested method
```

No response may accidentally replace unrelated existing `Vary` tokens.

---

# 14. Application execution architecture

P11-D implements Lane B from P11-B.

Accepted internal shape:

```text
cors() Plugin
    ↓
private official application HTTP-plan registration
    ↓
AppRuntimeState optional HTTP plan
    ↓
compileApplicationFetch specialization only when present
```

No public generic middleware `next()` abstraction is introduced.

No CORS-specific property is added to every route record.

No CORS-specific lookup occurs in plain `Gelis.prototype.fetch` when CORS is absent.

## Error/response ordering

The compiled application boundary must preserve:

```text
preflight / CORS resolver errors
onRequest errors
routing errors
response-policy errors
-> observable by application onError
```

A Response returned by successful `onError` handling receives CORS finalization exactly once.

CORS finalization failure while processing an already-handled error must not recurse indefinitely.

---

# 15. Response mutation

CORS may receive a `Response` whose headers cannot be mutated in place.

Implementation must preserve response semantics by using a mutable header copy / Response reconstruction fallback when necessary.

It must preserve:

```text
status
statusText
body stream identity where Web Response construction permits
existing headers including multiple Set-Cookie behavior supported by the runtime
HEAD body suppression semantics
```

Ordinary mutable Gelis responses should use the cheapest correct path.

---

# 16. Correctness gates

Permanent runtime tests must cover at least:

```text
no Origin -> no CORS grant headers
wildcard simple request
fixed-origin allowed
fixed-origin denied
origin allowlist
dynamic sync allow/deny
dynamic async allow/deny
resolver throw/reject through onError
credentials with explicit origin
wildcard + credentials rejected at configuration
expose headers
max age
invalid max age

valid preflight 204
preflight does not execute route handler
preflight does not execute ordinary onRequest pipeline after interception
OPTIONS without preflight headers retains P9 behavior
OPTIONS + Origin without ACR-Method retains P9 behavior
GET -> implicit HEAD represented route-aware
QUERY represented
custom method represented
ALL accepts requested custom method without serializing internal marker
configured methods intersect actual route methods
missing route does not advertise fabricated methods
invalid ACR-Method rejected
invalid ACR-Headers rejected
request-reflected allow headers
explicit allow headers

Vary Origin preservation/dedup
Vary Access-Control-Request-Headers preservation/dedup
existing Vary tokens preserved
Vary * preserved

404 CORS response
405 CORS response
handled onError CORS response
HEAD response CORS headers
```

No correctness test may be removed to satisfy performance.

---

# 17. Package and type gates

Required:

```text
package export resolves gelis/cors
portable consumer can import gelis/cors without Bun types
root gelis does not re-export cors
public CorsOptions/CorsOrigin/CorsOriginResolver types compile
invalid obvious static configuration is rejected where representable by TypeScript
root Gelis generic remains stable
```

P11-D must not add route-generic accumulation.

---

# 18. Zero-unused regression gate

Because P11-D changes the application compiler/private runtime integration, zero-unused behavior receives an explicit mirrored control benchmark.

Control source is frozen to the last accepted pre-CORS source candidate:

```text
f2b104df8ffbe96348c51271a1868a1c4f9141c7
```

Canonical direct `app.fetch()` cases:

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
persistent/fresh-process mirrored order as harness supports
warmup
multiple paired samples
median candidate/control ratio
```

Frozen gates:

```text
each case <= 1.03x
geometric mean across four cases <= 1.015x
```

Ratios below `1.00x` are no-regression evidence only.

Any structural change that adds a request branch when CORS is absent is a design failure even if noise happens to satisfy the benchmark.

---

# 19. Enabled CORS performance gate

Primary equivalent competitor:

```text
Hono CORS middleware
```

Canonical direct application cases use equivalent route/result/CORS semantics and keep server networking outside timed loops:

```text
actual request / static wildcard
actual request / static allowlist
actual request / credentialed allowlist
preflight / static route methods
actual request / synchronous dynamic origin
```

Static cases gate:

```text
per-case Gelis/Hono median <= 1.10x
static-case geometric mean <= 1.05x
```

Dynamic origin case gate:

```text
Gelis/Hono median <= 1.15x
```

A case that cannot be made semantically equivalent must be labeled diagnostic rather than silently compared.

## Route-aware scalability

A static-route preflight workload is also measured at:

```text
1,000 routes
5,000 routes
```

Frozen gate:

```text
5000 / 1000 median time <= 1.50x
```

This gate reflects the expectation that route-aware preflight lookup must use the existing router topology rather than scan all registered routes.

---

# 20. AOT requirements

P11-D must define and test CORS behavior with Gelis AOT/prebuilt runtime paths.

Minimum requirement:

```text
AOT/prebuilt route topology still supplies route-aware matchingMethods
CORS application policy can be installed without corrupting hydrated router state
no CORS policy is silently dropped by AOT capture/hydration workflows
```

If CORS plugin configuration itself is not serialized into a prebuilt artifact, documentation must state that application capability installation remains ordinary startup/configuration code around the hydrated router.

No hidden unsupported AOT mode may be called production-ready.

---

# 21. Documentation requirements

Before acceptance, user-facing documentation must explain:

```text
app.use(cors())
default wildcard non-credentialed behavior
explicit credentialed allowlist
route-aware methods
QUERY/custom methods
allowHeaders request reflection
Vary behavior
preflight vs ordinary OPTIONS
CORS is not authorization
```

---

# 22. Decision

```text
P11-D CORS ARCHITECTURE/API/GATES FROZEN

NEXT:
IMPLEMENT private application HTTP-plan foundation
IMPLEMENT gelis/cors
RUN correctness/package/type/AOT gates
RUN frozen zero-unused benchmark
RUN frozen Hono comparison benchmark
```

Thresholds in this document must not be relaxed after results are observed.
