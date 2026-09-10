# P11-F Secure Headers Capability Freeze

**Status:** ARCHITECTURE + API + GATES FROZEN  
**Date:** 2026-09-10  
**Phase:** P11-F  
**Public owner:** `gelis/secure-headers`  
**Performance control source:** `281757be11fe3e2073bac9d7d7bf2cc24904dba6`

## Purpose

P11-F adds a compact browser-security response policy without turning Gelis
into a generic response-middleware framework, adding request-local state for
static policies, or pretending that one Content Security Policy can be correct
for every application.

The ordinary execution shape is frozen as:

```text
configuration-time validation
        ↓
precompiled static header policy
        ↓
compiled application response-policy slot
        ↓
final normalized Response
```

No production benchmark result may weaken the semantics or gates frozen here.

## Security basis

P11-F follows the accepted P11-A/P11-B audit and current browser-security
semantics reviewed from OWASP, MDN, Hono 4.13.5, and Helmet.

The relevant conclusions are:

```text
X-Content-Type-Options: nosniff
-> broadly useful when Content-Type is correct

Referrer-Policy
-> useful privacy/security boundary

Strict-Transport-Security
-> useful only when delivered over HTTPS
-> includeSubDomains expands policy beyond the current host
-> preload is an external operational commitment

X-XSS-Protection
-> deprecated legacy browser filter
-> when emitted, the safe policy is to disable it with 0

CSP
-> powerful but application-specific
-> Gelis cannot infer resource/script/style requirements safely

COOP / COEP / CORP / Origin-Agent-Cluster
-> useful isolation controls
-> can materially alter embedding, popup, or resource-loading behavior

Permissions-Policy
-> browser-feature policy is application-specific
```

Gelis therefore does not copy the complete default set of another framework.

## Public ownership and installation

Public usage is frozen conceptually as:

```text
import { secureHeaders } from "gelis/secure-headers";

const app = new Gelis();
app.use(secureHeaders());
```

`secureHeaders()` returns an ordinary Gelis `Plugin`, while its implementation
registers the private P11-B application HTTP response-policy slot rather than a
generic `next()` middleware.

The root `gelis` entrypoint does not re-export the secure-header convenience
surface.

Only one secure-header application policy may be installed per application in
P11-F v0.1. Duplicate installation fails transactionally at configuration time.
Route-scoped secure-header policy is not part of v0.1.

## Frozen public surface

```text
export type SecureHeadersReferrerPolicy =
  | "no-referrer"
  | "no-referrer-when-downgrade"
  | "origin"
  | "origin-when-cross-origin"
  | "same-origin"
  | "strict-origin"
  | "strict-origin-when-cross-origin"
  | "unsafe-url";

export type SecureHeadersCrossOriginEmbedderPolicy =
  | "unsafe-none"
  | "require-corp"
  | "credentialless";

export type SecureHeadersCrossOriginOpenerPolicy =
  | "unsafe-none"
  | "same-origin"
  | "same-origin-allow-popups"
  | "noopener-allow-popups";

export type SecureHeadersCrossOriginResourcePolicy =
  | "same-origin"
  | "same-site"
  | "cross-origin";

export interface SecureHeadersStrictTransportSecurityOptions {
  readonly maxAge?: number;
  readonly includeSubDomains?: boolean;
  readonly preload?: boolean;
}

export interface SecureHeadersOptions {
  readonly contentSecurityPolicy?: string | false;
  readonly contentSecurityPolicyReportOnly?: string | false;
  readonly crossOriginEmbedderPolicy?:
    | SecureHeadersCrossOriginEmbedderPolicy
    | false;
  readonly crossOriginOpenerPolicy?:
    | SecureHeadersCrossOriginOpenerPolicy
    | false;
  readonly crossOriginResourcePolicy?:
    | SecureHeadersCrossOriginResourcePolicy
    | false;
  readonly originAgentCluster?: boolean;
  readonly permissionsPolicy?: string | false;
  readonly referrerPolicy?: SecureHeadersReferrerPolicy | false;
  readonly strictTransportSecurity?:
    | SecureHeadersStrictTransportSecurityOptions
    | false;
  readonly xContentTypeOptions?: boolean;
  readonly xFrameOptions?: "DENY" | "SAMEORIGIN" | false;
  readonly xXssProtection?: boolean;
  readonly removePoweredBy?: boolean;
}

export function secureHeaders(options?: SecureHeadersOptions): Plugin;
```

No generic public response-policy abstraction is added.

## Frozen default policy

`secureHeaders()` with no options manages exactly:

```text
Strict-Transport-Security: max-age=31536000
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
X-Frame-Options: SAMEORIGIN
X-XSS-Protection: 0
X-Powered-By: removed when present
```

It intentionally does not emit by default:

```text
Content-Security-Policy
Content-Security-Policy-Report-Only
Cross-Origin-Embedder-Policy
Cross-Origin-Opener-Policy
Cross-Origin-Resource-Policy
Origin-Agent-Cluster
Permissions-Policy
Clear-Site-Data
Cache-Control
Server
X-DNS-Prefetch-Control
X-Download-Options
X-Permitted-Cross-Domain-Policies
```

CSP and Permissions Policy cannot be inferred safely from generic framework
state. Cross-origin isolation can break legitimate integrations. Cache and
clear-site-data are response/business semantics. A transport or proxy may add
`Server` after Gelis returns a response, so Gelis does not claim removal it
cannot guarantee.

## HSTS

Defaults:

```text
maxAge = 31536000
includeSubDomains = false
preload = false
```

Default serialization:

```text
Strict-Transport-Security: max-age=31536000
```

Validation is synchronous:

```text
maxAge
-> finite safe non-negative integer

preload: true
-> requires includeSubDomains: true
-> requires maxAge >= 31536000
```

`maxAge: 0` is valid.

Gelis does not branch on request URL scheme and does not trust forwarded proxy
headers to infer external TLS. Browsers determine whether HSTS is honored.
`preload: true` only emits the token and does not imply preload-list submission
or acceptance.

## X-Content-Type-Options

Default:

```text
X-Content-Type-Options: nosniff
```

`xContentTypeOptions: false` leaves the field unmanaged. Arbitrary override is
not exposed because `nosniff` is the supported security directive. Correct
response `Content-Type` remains the serializer/application responsibility.

## Referrer-Policy

Default:

```text
Referrer-Policy: no-referrer
```

Only the frozen valid policy tokens are accepted. Runtime validation protects
JavaScript/untyped callers. `false` leaves the field unmanaged.

## Frame policy

Default:

```text
X-Frame-Options: SAMEORIGIN
```

Supported values:

```text
DENY
SAMEORIGIN
false
```

`ALLOW-FROM` is not supported. Gelis does not synthesize CSP `frame-ancestors`;
an application-owned CSP must be configured explicitly.

## Legacy XSS filter

Default:

```text
X-XSS-Protection: 0
```

P11-F only supports disabling the deprecated filter:

```text
xXssProtection: true
-> emit X-XSS-Protection: 0

xXssProtection: false
-> leave unmanaged
```

Gelis does not describe this field as modern XSS protection.

## X-Powered-By

Default:

```text
removePoweredBy = true
```

The normalized application response has `X-Powered-By` removed when present.
`false` preserves it. Gelis makes no claim about fields attached later by a
transport or proxy.

## Explicit CSP

P11-F accepts caller-owned static values:

```text
contentSecurityPolicy: string | false
contentSecurityPolicyReportOnly: string | false
```

No CSP is emitted by default. Strings are validated as non-empty legal HTTP
field values and precompiled as static response policy. Gelis does not parse a
CSP DSL and does not claim syntactic validity means the policy is secure for an
application.

Dynamic nonce generation and request-local nonce access are deferred beyond
P11-F v0.1. A future nonce capability must separately justify entropy,
request-local state, API shape, and runtime cost.

## Explicit cross-origin isolation

These fields are opt-in only:

```text
Cross-Origin-Embedder-Policy
Cross-Origin-Opener-Policy
Cross-Origin-Resource-Policy
Origin-Agent-Cluster
```

Supported tokens are configuration-time validated. `originAgentCluster: true`
emits `Origin-Agent-Cluster: ?1`.

Gelis does not silently couple COOP and COEP. Applications that require
cross-origin isolation configure the combination explicitly and own resource
compatibility.

## Explicit Permissions-Policy

`permissionsPolicy` accepts a static string or `false`. No field is emitted by
default. P11-F validates legal HTTP field-value syntax rather than maintaining
a framework-owned list of evolving Permissions Policy directives.

## Disable and override semantics

```text
option omitted
-> frozen Gelis default when default-managed
-> otherwise unmanaged

option false
-> unmanaged
-> preserve an application/handler-provided value

explicit supported value
-> Gelis owns and sets the value during finalization
```

A managed application-level security field overrides a conflicting handler
value. To intentionally own a field per response, the application disables
that field in `secureHeaders()` and sets it itself. `removePoweredBy` is the
explicit deletion policy.

## Configuration-time validation

Required runtime validation includes:

```text
known token options
-> exact token membership

HSTS maxAge
-> finite safe non-negative integer

HSTS preload
-> includeSubDomains required
-> maxAge >= 31536000 required

raw CSP / CSP-Report-Only / Permissions-Policy
-> non-empty legal HTTP field value
-> CR/LF/control-character injection rejected
```

Invalid policy fails before serving requests. Gelis does not silently repair
malformed security configuration.

## Execution architecture

P11-F implements P11-B Lane B:

```text
secureHeaders() Plugin
        ↓
private official application HTTP marker
        ↓
RuntimeApplicationHttpPlan.secureHeaders
        ↓
compiled response-policy boundary
```

The static policy has no request preparation work:

```text
prepare
-> no-op

finalize
-> apply precompiled static field mutations/deletions
```

No WeakMap, nonce state, request clone, route sidecar, route option, or handler
context generic is introduced.

When CORS and secure headers coexist, finalization order is invariant to plugin
registration order:

```text
route/onError normalized response
        ↓
CORS finalization
        ↓
secure-header finalization
        ↓
final Response
```

A CORS preflight response also receives secure headers.

## Response coverage

Secure-header finalization applies exactly once to:

```text
normal route response
raw handler Response
404
405
implicit HEAD
automatic OPTIONS
CORS preflight when CORS is installed
successful onError handled response
```

HEAD suppression, status, status text, body semantics, and unrelated fields are
preserved. Immutable response headers use a mutable-copy/reconstruction
fallback. The ordinary mutable path must not reconstruct merely for convenience.

## Security boundaries

P11-F is browser response hardening, not complete application security. It does
not replace input validation, output encoding, authorization, authentication,
CSRF defenses, CORS, TLS, application-specific CSP, secure-cookie policy,
sensitive-response cache policy, or proxy hardening.

Specific non-claims:

```text
HSTS
-> does not create TLS

X-Frame-Options
-> does not replace application-specific CSP

X-XSS-Protection: 0
-> disables a legacy filter; it is not an XSS defense

removePoweredBy
-> only reduces trivial fingerprint disclosure
```

## Correctness and security gates

Permanent tests must cover at least:

```text
default exact managed field set
custom HSTS serialization
invalid HSTS maxAge
invalid HSTS preload combination
X-Content-Type-Options disable
Referrer-Policy override and invalid runtime token
X-Frame-Options DENY / SAMEORIGIN / false
X-XSS-Protection emits only 0 when enabled
X-Powered-By removal and preservation when disabled
static CSP
static CSP-Report-Only
static Permissions-Policy
invalid raw field value / injection attempt
COEP supported values
COOP supported values
CORP supported values
Origin-Agent-Cluster ?1
optional disabled fields remain unmanaged
managed fields override conflicting handler values
disabled fields preserve handler values
unrelated response fields preserved
immutable-header fallback
status / statusText / body preserved
normal response
404
405
HEAD
automatic OPTIONS
handled onError response
CORS preflight response
CORS + secureHeaders in both plugin registration orders
secure headers applied exactly once
duplicate secureHeaders installation rejected transactionally
```

No correctness/security test may be weakened to satisfy performance.

## Package and type gates

Required:

```text
package export resolves gelis/secure-headers
portable consumer imports gelis/secure-headers without Bun types
root gelis does not re-export secureHeaders
public option/token/HSTS types compile
obvious invalid literal tokens fail TypeScript where representable
root Gelis generic remains stable
no route generic accumulation
```

The route TypeScript scaling suite is required only if implementation changes
shared route generic surfaces.

## AOT requirements

Secure headers are application policy, not route contract metadata, and are not
serialized into route artifacts.

Required:

```text
secureHeaders installed before hydrated/prebuilt runtime
-> remains active

secureHeaders installed after hydrated/prebuilt runtime where allowed
-> remains active

AOT route semantics
-> unchanged

OpenAPI/typed-client contract snapshots
-> no secure-header execution metadata
```

## Zero-unused gate

Control source:

```text
281757be11fe3e2073bac9d7d7bf2cc24904dba6
```

Structurally, when secure headers are unused:

```text
root gelis does not import secure-header implementation
no secure-header policy/table is compiled
no application HTTP plan exists because of secure headers
no extra request wrapper/branch is installed
plain Gelis.prototype.fetch path remains unchanged
plain route runtime record remains unchanged
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
Bun 1.4.0
5,000 mixed routes
11 mirrored fresh-process pairs
alternating order
warmup + calibrated timed window
median pairwise ratio
order diagnostics
```

Frozen gates:

```text
each candidate/control median <= 1.03x
geometric mean <= 1.015x
```

Ratios below `1.00x` are no-regression evidence only.

## Enabled direct competitor gate

Primary comparator:

```text
Hono 4.13.5 secureHeaders
```

Hono must be configured to emit the same effective fields. Different framework
defaults are not equivalent workloads.

Canonical direct cases:

```text
default static 204
default static JSON
managed-field overwrite + X-Powered-By deletion
explicit COOP/CORP/Origin-Agent-Cluster isolation set
static CSP
```

Protocol:

```text
Bun 1.4.0
11 mirrored fresh-process pairs
alternating Gelis/Hono order
warmup
calibrated timed window
median pairwise Gelis/Hono ns/op ratio
order diagnostics
```

Frozen hard gates:

```text
each case <= 1.10x Hono
geometric mean across all cases <= 1.05x Hono
```

A non-equivalent case is diagnostic only.

## HTTP comparator gate

Equivalent network-level case:

```text
one static 204 route
secureHeaders default policy enabled
Hono configured to same effective field set
Bun server adapter
50 concurrent connections
multiple alternating samples after warmup
```

Frozen hard gate:

```text
median Gelis throughput >= 0.90x Hono throughput
```

This is an end-to-end guard, not isolated header-finalization evidence.

## Implementation sequence

```text
F1   architecture/API/performance freeze
F2   static policy compiler + validation
F3   application response-policy integration
F4   response coverage + security/composition tests
F5   package/type boundary
F6   AOT/prebuilt preservation
F7   zero-unused benchmark acceptance
F8   enabled Hono + HTTP benchmark acceptance
F9   full bun run check
F10  acceptance documentation
```

Authoritative promotion occurs only after the relevant gate is green.

## Release boundary

P11-F completion does not authorize npm publish, Git tag, or GitHub Release.
Release remains explicit maintainer-controlled work outside this subphase.

## Freeze decision

```text
P11-F SECURE HEADERS ARCHITECTURE + API + PERFORMANCE GATES FROZEN

DEFAULT:
HSTS current host + nosniff + no-referrer + SAMEORIGIN frame policy
+ legacy XSS filter disabled + X-Powered-By removal

CSP / Permissions Policy / cross-origin isolation:
STATIC EXPLICIT OPT-IN

DYNAMIC CSP NONCE / REQUEST-LOCAL SECURE-HEADER STATE:
DEFERRED

NEXT:
P11-F2 STATIC POLICY COMPILER + VALIDATION
```
