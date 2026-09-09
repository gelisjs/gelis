# P11-B Ownership + Execution Architecture Freeze

**Status:** ACCEPTED / FROZEN  
**Date:** 2026-09-09  
**Phase:** P11-B  
**Predecessor:** `p11-a-competitor-semantics-api-audit.md`

## Purpose

P11-B decides where the P11 Industrial HTTP Essentials live and how they may integrate with Gelis request execution before any production implementation begins.

The phase is intentionally architectural.

It does not freeze final function names or every option field. Individual P11-C through P11-G subphases own those public API details after their semantic gates are declared.

## Governing constraints

P11 must preserve:

```text
portable Web Standards root
Bun-specific behavior isolated to gelis/bun
stable root Gelis type
no route-collection generic accumulation
no hidden module-global request state
no universal always-on middleware chain
plain-route zero-unused fast path
registration-time specialization where possible
AOT compatibility
explicit security semantics
```

---

# 1. Repository and package ownership

All six P11 capability families are owned by the **core `gelisjs/gelis` repository**.

They are not split into standalone `@gelis/*` repositories in P11.

Reason:

```text
small protocol/runtime surface
strong coupling to request execution semantics
strong zero-unused requirements
shared core compatibility cadence
little or no third-party dependency weight
need for private runtime specialization hooks
```

Accepted public package placement:

```text
cookies                 -> gelis/cookie
CORS                    -> gelis/cors
request/body limits     -> gelis/body-limit
secure headers          -> gelis/secure-headers
request ID              -> gelis/request-id
timeout / abort         -> gelis/timeout
```

These names are frozen as package ownership/subpath targets.

The exact exported function/type names inside each subpath are frozen only by the owning capability subphase.

## Root export policy

The root:

```text
gelis
```

must not re-export the P11 convenience/helper APIs merely for discoverability.

Applications pay dependency/module surface only when importing the corresponding subpath.

Root types may gain only genuinely runtime-fundamental primitives when unavoidable for direct route declaration. Such additions must remain non-accumulating and must pass TypeScript scalability evidence.

---

# 2. Four execution lanes

P11 does **not** force six unrelated capabilities through one abstraction.

The accepted internal topology has four lanes.

## Lane A — pure protocol helpers

Primary owner:

```text
gelis/cookie
```

Characteristics:

```text
no app installation
no plugin
no request wrapper
no route flag
no request-time work unless helper is called
```

Unsigned cookie parse/serialize/delete operations belong here.

Signed-cookie operations may remain async WebCrypto helpers in the same subpath. They still execute only when explicitly called.

## Lane B — compiled application HTTP boundary

Primary users:

```text
CORS
secure headers
request ID
application-level timeout
selected application-level body guards where semantically valid
```

A structured application HTTP plan is allocated only when at least one such capability is installed.

The plan is configuration state, not a generic middleware array.

The application compiler specializes a request boundary from the active structured slots.

Applications with no P11 application capability retain the existing prototype `Gelis.fetch` path and existing `compileApplicationFetch()` topology.

## Lane C — route boundary specialization

Primary users:

```text
route-level timeout
future route-scoped P11 policy where required
```

A route requiring around-execution policy receives an optional route-boundary sidecar and a dedicated non-plain runtime flag/plan.

Routes without a route boundary retain their existing runtime record shape and existing exact flag fast paths.

The framework must not add a new route-boundary lookup before the existing `RUNTIME_ROUTE_PLAIN` return.

For routes that need a boundary together with input/lifecycle/response behavior, registration compiles the underlying existing route executor into the boundary plan rather than creating a combinatorial permanent switch matrix.

## Lane D — managed input specialization

Primary owner:

```text
gelis/body-limit
```

Managed request-body limits belong as close as possible to `RuntimeInputPlan` and its registration-time body reader.

The limited reader owns actual byte enforcement for managed bodies.

A Content-Length check may be an early fast rejection, but it is never the only enforcement.

---

# 3. Private official-subpath integration

P11 official subpaths may use private core integration hooks because they ship from the same `gelis` package/repository.

The public community plugin API is **not** expanded with a generic `next()` middleware or generic `onResponse()` solely to implement P11.

Instead, P11 may introduce a private symbol-keyed integration available to official subpath implementations that can register structured HTTP-plan slots with the owning `Gelis` application.

The private integration may be carried through `PluginSetupContextRuntime` or an equivalent private application capability.

Requirements:

```text
not exported from gelis root
not part of community plugin compatibility contract
one structured slot per capability instance/type
configuration-time duplicate/conflict detection
no module-global application registry
```

Official subpaths may still present ordinary `Plugin` objects to users where `app.use(...)` is the natural public DX.

---

# 4. Application boundary execution order

P11 application capabilities must compose through one compiled boundary, not nested arbitrary middleware wrappers.

The semantic order is frozen as:

```text
request-local preparation
    request ID / deadline state when enabled
        ↓
pre-routing protocol guards
    CORS preflight
    safe early body-length rejection where applicable
        ↓
application deadline boundary when enabled
        ↓
existing onRequest pipeline
        ↓
router + specialized route execution
        ↓
response policy finalization
    CORS response headers
    secure headers
    request-ID propagation
        ↓
final Response
```

`onError` remains the application error authority.

The compiled implementation must satisfy both:

```text
errors thrown by preparation/guards/deadline/onRequest/routing/response policy
-> may be observed by onError

response returned by a successful onError handler
-> receives the applicable P11 response policies exactly once
```

P11 must not double-apply response policies.

The no-P11 path must continue using the already accepted application lifecycle compiler without an extra request branch.

---

# 5. Response-policy architecture

CORS, secure headers, and request-ID propagation all need access to the **normalized final Response**, including early and handled-error responses.

P11 therefore freezes a private compiled response-policy stage for installed official HTTP capabilities.

It is not a public generic middleware API in P11.

Requirements:

```text
configuration-time composition
structured slots rather than arbitrary arrays where possible
synchronous fast path when every active policy is synchronous
Promise continuation only when an active policy actually requires async work
HEAD semantics preserved
multiple Set-Cookie remains unrelated to this stage unless a future capability explicitly needs it
```

Static secure-header policy should be precomputed where possible.

Dynamic CORS origin policy may require a dynamic branch only when configured.

---

# 6. Request-local capability state

Request ID and timeout/deadline need request-local state that handlers may inspect.

P11 rejects a module-global `WeakMap<Request, ...>` as hidden global state.

Accepted model:

```text
explicit capability instance
        ↓
instance-owned WeakMap<Request, RequestLocalState>
        ↓
public accessor on that capability instance
```

Conceptually:

```ts
const capability = /* create official request capability */;
app.use(capability);

// handler may ask the explicit capability instance
// for state associated with context.request
```

Exact API names are deferred to P11-G.

Properties:

```text
state lifetime follows Request reachability
no strong global registry
multiple Gelis applications can own independent capability instances
handler context generics do not grow
plain RouteContext does not gain always-present requestId/deadline fields
```

This model may also be used by other future request-local official capabilities when appropriate, but P11 does not freeze it as a universal public context container.

---

# 7. Request ID architecture

Accepted baseline direction:

```text
default -> framework-generated ID
optional explicit policy -> adopt/validate inbound ID
response propagation -> same resolved ID
handler access -> explicit request-ID capability instance
```

Blind trust of arbitrary inbound request IDs is not the default.

P11-G must freeze:

```text
validation constraints
generator contract
header naming
collision/invalid behavior
inbound trust policy
response propagation
```

Request ID does not mutate the request headers merely to make the ID discoverable to handlers.

That avoids conflating original transport input with framework request-local metadata.

---

# 8. Timeout / abort architecture

Transport timeouts and framework deadlines remain different layers.

```text
gelis/bun options
-> transport/server timeout controls

 gelis/timeout
-> Gelis application/route execution deadline
```

A framework deadline may race request execution and return a timeout response even though user asynchronous work may continue if it ignores cancellation.

Cancellation is cooperative.

P11 does not clone every Request merely to replace `request.signal`.

Reason:

Creating/copying Request objects around live body streams can clone/tee body streams and alter buffering/backpressure behavior. Timeout must not introduce that architecture into every timed request without compelling evidence.

Accepted request-local signal model:

```text
incoming request.signal
        +
framework deadline AbortController
        ↓
combined cooperative signal
        ↓
explicit timeout capability accessor keyed by Request
```

P11-G must test client abort + deadline combination and already-aborted requests.

Route-level timeout is implemented through Lane C route boundary specialization; application default timeout uses Lane B.

No timeout feature is allowed to add a permanent branch to routes/applications that do not enable it.

---

# 9. Body-limit architecture

Three distinct ceilings/policies are frozen conceptually:

```text
transport hard ceiling
    e.g. Bun maxRequestBodySize

application Gelis limit
    framework default policy

route Gelis limit
    route-specific tightening/policy
```

The effective accepted limit must never exceed a stricter outer policy.

A route-specific policy must not silently bypass an application hard limit.

## Managed bodies

Gelis-managed body routes receive full framework enforcement:

```text
Content-Length fast rejection when valid
+
actual streamed/read byte enforcement
+
413 semantics
```

The limit is compiled into the route input/body reader rather than checked through a universal middleware chain.

## Raw/unmanaged bodies

P11-B does **not** falsely claim that a portable Gelis application limit can automatically constrain arbitrary user code that directly consumes a raw Request body without a managed reader.

P11-E must choose and verify one of the following before acceptance:

```text
A. a portable safe request/body stream guard that preserves Request semantics

or

B. an explicit limited raw-body reader API plus clearly documented adapter transport hard ceiling
```

A universal Request clone/tee is not accepted merely for API uniformity.

## Application default

An application body-limit capability may store a default policy in application configuration and compile/recompile existing and future managed `RuntimeInputPlan` readers at configuration time, analogous to existing lifecycle specialization.

It must not perform an application-state lookup on every body chunk.

---

# 10. CORS architecture

`gelis/cors` is an installed application protocol capability, not a synthetic OPTIONS route generator.

A valid CORS preflight is recognized before ordinary routing by the compiled application HTTP boundary.

Rules:

```text
CORS preflight
-> handled by CORS protocol plan

ordinary OPTIONS request
-> existing P9 explicit/automatic OPTIONS semantics

method-not-allowed / Allow
-> existing P9 authority outside actual CORS preflight handling
```

P11-D must prove that enabling CORS does not produce contradictory `Allow` or OPTIONS behavior.

QUERY/custom methods must be representable in configured CORS method policy.

Response CORS headers are applied by the compiled response-policy stage.

---

# 11. Secure-header architecture

`gelis/secure-headers` uses the compiled response-policy stage.

Two execution shapes are anticipated:

```text
static policy
-> prevalidated + precompiled header set

optional dynamic policy
-> request-aware path only when explicitly configured
```

P11-F must prefer the static path for the ordinary configuration.

No universal CSP value is treated as safe for every application.

Dynamic nonce support is optional and must justify its request-local state cost separately.

---

# 12. Route-specific policy representation

P11 needs route-specific body-limit and timeout behavior without growing the root application generic.

P11-B freezes these constraints but **not the final syntax**:

```text
route policy metadata must be non-generic
route policy absent -> no runtime sidecar/property allocation
multiple P11 route policies must compose without overwrite
AOT source analysis must be able to preserve accepted route policy declarations
```

The owning subphase may choose a direct RouteOptions primitive or an analyzer-recognizable helper/fragment.

A helper syntax that causes otherwise eligible AOT routes to become silently ineligible is not acceptable as the final P11 API.

---

# 13. AOT + contract boundary

P11 runtime policy metadata is execution policy, not automatically public API-contract metadata.

OpenAPI/typed-client contract snapshots do not gain timeout/body-limit/CORS/security execution policy unless a later tooling phase explicitly defines a portable contract meaning.

P11 route/application plans must remain capturable by the Gelis AOT architecture where the corresponding feature is supported.

Feature-enabled AOT may be staged within the owning subphase, but P11-H cannot call the capability production-ready if the documented AOT behavior is ambiguous.

---

# 14. Zero-unused structural gates

Before feature-specific performance thresholds are declared, these structural requirements are already frozen:

```text
root gelis does not import P11 subpath implementations

no P11 capability enabled
-> no application HTTP plan allocated
-> no P11 request wrapper installed
-> existing prototype Gelis.fetch restored/retained

plain route with no route policy
-> existing RUNTIME_ROUTE_PLAIN path unchanged
-> no route boundary property allocated

managed route with no body limit
-> existing body readers unchanged

no request-ID/timeout capability
-> no request-local WeakMap state
```

P11-H must verify cumulative zero-unused behavior.

---

# 15. Type-system rules

P11 may not make `Gelis` accumulate capability state in its public generic type.

Public helper/plugin instance types may carry their own configuration/accessor types.

Route-level primitives must remain non-accumulating.

If P11 changes `RouteOptionsFor`, route-handler context inference, or public plugin generics materially, P11-H must rerun the accepted TypeScript scaling suite at:

```text
100
500
1,000
5,000 routes
```

---

# 16. Ownership summary

```text
Capability       Public owner           Primary execution lane
---------------------------------------------------------------
Cookies          gelis/cookie           A: pure helper
CORS             gelis/cors             B: application boundary
Body limit       gelis/body-limit       D + optional B guard
Secure headers   gelis/secure-headers   B: response policy
Request ID       gelis/request-id       B + instance request state
Timeout/abort    gelis/timeout          B + C + instance request state
```

No P11 capability becomes a separate `@gelis/*` repository.

---

# 17. Decision

```text
P11-B OWNERSHIP + EXECUTION ARCHITECTURE ACCEPTED / FROZEN

NEXT:
P11-C COOKIE CAPABILITY
```

No production implementation is accepted by this document alone.
