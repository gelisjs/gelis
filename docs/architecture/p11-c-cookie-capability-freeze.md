# P11-C Cookie Capability Freeze

**Status:** ARCHITECTURE + API + GATES FROZEN  
**Date:** 2026-09-09  
**Phase:** P11-C  
**Public owner:** `gelis/cookie`

## Purpose

P11-C delivers the first P11 production capability as a portable, pure HTTP cookie helper surface.

Cookie support must not require app installation, middleware, request-scope state, or changes to the Gelis request hot path.

## Standards basis

The implementation follows the well-behaved server profile and current browser-security expectations derived from RFC6265bis-era cookie semantics plus current Partitioned/CHIPS behavior.

Important accepted rules include:

```text
cookie name must be a valid HTTP token
cookie value emitted by Gelis must fit cookie-value constraints after encoding
Set-Cookie attributes must reject header-injection characters
__Secure- requires Secure
__Host- requires Secure + Path=/ + no Domain
SameSite=None requires Secure
Partitioned requires Secure
Max-Age / Expires must not exceed 400 days
multiple same-name Cookie pairs may exist
server code must not rely on duplicate-cookie wire order for security
```

P11-C does not attempt to implement a browser cookie jar, Domain matching, Path matching, SameSite enforcement, or public-suffix logic. Those are user-agent responsibilities.

---

# 1. Public subpath

```ts
import {
  getCookie,
  getCookies,
  generateCookie,
  setCookie,
  deleteCookie,
  getSignedCookie,
  verifySignedCookie,
  generateSignedCookie,
  setSignedCookie,
} from "gelis/cookie";
```

The root `gelis` entrypoint does not re-export these helpers.

## Types

The subpath exports the types required by this API, including conceptually:

```ts
CookieOptions
CookieDeleteOptions
CookieSecret
CookieSecrets
SignedCookieResult
```

Exact internal helper types remain private unless required by public signatures.

---

# 2. Cookie input model

Read helpers accept a Web Standards `Request`.

```ts
getCookie(request, name)
getCookies(request, name?)
```

`getCookie()` is the convenience fast path for a single name.

`getCookies()` preserves duplicate values rather than silently collapsing all same-name cookies into one security-sensitive choice.

Accepted semantics:

```text
missing Cookie header
-> undefined / empty result as appropriate

malformed unrelated pair
-> skip that pair; do not throw the whole header away

percent-encoded valid value
-> decode to logical string

invalid percent sequence
-> preserve raw value rather than throw

duplicate same-name pairs
-> getCookies exposes all matching values
```

`getCookie()` may return the first syntactically valid matching pair as a convenience API, but documentation must warn that security-sensitive code should use signed-cookie verification or duplicate-aware APIs when same-name ambiguity matters.

Parsing must not rely on serialization order as a security property.

---

# 3. Serialization model

```ts
generateCookie(name, value, options?) -> string
```

returns one complete `Set-Cookie` field value and performs no mutation.

```ts
setCookie(headers, name, value, options?) -> void
```

appends one `Set-Cookie` field to the caller-owned `Headers` instance.

It must use `append`, never `set`, so multiple cookies survive.

```ts
deleteCookie(headers, name, options?) -> void
```

appends an expiry cookie using deletion-compatible scope options.

Deletion must include:

```text
empty value
Max-Age=0
Expires at Unix epoch / equivalent past date
```

and preserve relevant `Domain`, `Path`, `Secure`, and SameSite-style scope options supplied by the caller.

## Value encoding

Logical string values are encoded with a deterministic URI-component-compatible encoding before serialization so arbitrary UTF-8/application values cannot inject `;`, comma, whitespace, CR, or LF into the Set-Cookie field.

Read helpers perform the corresponding forgiving decoding.

No implicit JSON serialization is part of P11-C.

Applications serialize structured state explicitly.

---

# 4. Cookie options

Accepted option surface:

```text
domain?: string
expires?: Date
httpOnly?: boolean
maxAge?: number
path?: string
secure?: boolean
sameSite?: "Strict" | "Lax" | "None"
priority?: "Low" | "Medium" | "High"
partitioned?: boolean
```

Default behavior must be minimal and predictable.

P11-C does not silently set `HttpOnly`, `Secure`, or `SameSite` for every ordinary cookie because not every cookie is an authentication/session cookie.

Security-sensitive higher-level session capabilities may later provide stricter defaults.

`Path` default is frozen to:

```text
/
```

because this pure server helper cannot infer the browser default-path algorithm from the response URL and an explicit host-wide path is more predictable.

---

# 5. Validation and security constraints

Serialization throws synchronously for invalid configuration before a header is appended.

Required validation:

```text
empty/invalid cookie name -> reject
CTL / semicolon / CR / LF injection in attributes -> reject
invalid Date -> reject
non-finite/non-integer Max-Age -> reject
Max-Age > 34,560,000 seconds -> reject
Expires > now + 400 days -> reject
SameSite=None without Secure -> reject
Partitioned without Secure -> reject
```

## Prefixes

Prefix matching is case-insensitive for validation while preserving the caller-provided cookie name bytes.

```text
__Secure-
-> Secure required

__Host-
-> Secure required
-> Path must be /
-> Domain forbidden
```

P11-C does not yet add emerging `__Http-` / `__Host-Http-` server validation to the frozen v0.1 surface because they are not part of the accepted RFC6265bis server-prefix pair used as the baseline here. They may be evaluated in a later compatibility update.

## Partitioned

`Partitioned` is serialized only when explicitly requested and requires `Secure`.

---

# 6. Signed cookie cryptography

Signed cookies provide **integrity/authenticity, not confidentiality**.

Algorithm is frozen:

```text
WebCrypto HMAC
SHA-256
```

No Node `crypto` dependency is used by the portable implementation.

Accepted secret input:

```text
string
or BufferSource
```

A secret array enables rotation.

```text
secrets[0] -> active signing secret
secrets[1..] -> previous verification-only secrets
```

Empty secret arrays are invalid.

The implementation must reject obviously weak string/byte secrets shorter than 32 bytes for the high-level signed-cookie helpers.

This is a secure-default choice, not a cryptographic claim that exactly 32 bytes is universally sufficient for every threat model.

## Signed wire format

The frozen signed logical value format is:

```text
<logical-value>.<base64-hmac-sha256>
```

The complete logical signed value is cookie-encoded by the normal cookie serializer.

The HMAC input is the **logical value bytes**, not the serialized Set-Cookie string or cookie attributes.

Cookie attributes therefore remain unsigned configuration selected by the server at issuance time.

Verification uses WebCrypto `verify`; no manual JavaScript byte-by-byte signature comparison is used.

---

# 7. Signed result model

P11-C deliberately does not overload `false` and `undefined` for security state.

`SignedCookieResult` is a discriminated result with states conceptually equivalent to:

```ts
| { status: "valid"; value: string; secretIndex: number }
| { status: "missing" }
| { status: "invalid" }
| { status: "ambiguous" }
```

Semantics:

```text
missing
-> no matching cookie

invalid
-> malformed signed format, wrong key, or tampered signature

ambiguous
-> multiple same-name cookie values are present and a single security identity cannot be chosen safely

valid
-> exactly one candidate verifies
```

`secretIndex` identifies which rotation secret verified the cookie:

```text
0 -> current active secret
>0 -> previous secret; application may reissue with current secret
```

`verifySignedCookie(value, secrets)` verifies one already-extracted signed logical value and therefore does not produce `missing`/`ambiguous` unless its input type explicitly represents them.

Exact TypeScript signatures must preserve this discrimination without throwing for ordinary signature failure.

Crypto/runtime configuration errors may throw.

---

# 8. Header mutation semantics

`setCookie()` and `setSignedCookie()` accept caller-owned `Headers` and append `Set-Cookie`.

They do not mutate a Gelis context or install response middleware.

This ensures:

```text
works with Response constructor
works in tests without Gelis application
works in Web Standards runtimes
zero framework request integration cost
```

Example intended shape:

```ts
const headers = new Headers();

setCookie(headers, "theme", "dark", {
  sameSite: "Lax",
});

return new Response("ok", { headers });
```

Exact examples are finalized after implementation passes tests.

---

# 9. Type-system requirements

Where practical without pathological type cost, literal cookie names/options should reject invalid security combinations at compile time in addition to runtime validation.

Minimum type tests:

```text
Partitioned true requires Secure true
SameSite=None requires Secure true
literal __Secure-* requires Secure true
literal __Host-* requires Secure true and Domain absent
literal __Host-* accepts only Path=/ when specified
```

Runtime validation remains authoritative for dynamic strings/objects.

Cookie helper types are isolated to `gelis/cookie`; they do not change the root `Gelis` generic or route registration inference.

---

# 10. Correctness/security gates

Permanent tests must include:

```text
single cookie read
multiple cookies
whitespace tolerance
empty value
percent-encoded value
invalid percent sequence
duplicate same-name values
quoted valid cookie value where accepted by grammar
malformed pair tolerance

all supported Set-Cookie attributes
multiple Set-Cookie append behavior
delete semantics
invalid name/value/attribute injection rejection
400-day Max-Age boundary
400-day Expires boundary
SameSite=None/Secure rule
Partitioned/Secure rule
__Secure- rule
__Host- rule including mixed-case prefix validation

signed valid
signed tampered
signed malformed
wrong secret
rotation current key
rotation old key
ambiguous duplicate signed cookie
short secret rejection
BufferSource secret
unicode logical value round trip
```

No security gate may be removed for performance.

---

# 11. Package/zero-unused gates

The implementation must prove:

```text
root `gelis` import does not load gelis/cookie
root public export list unchanged by cookie convenience APIs
plain Gelis runtime tests unchanged
package export test resolves `gelis/cookie`
portable package typecheck passes without Bun types
```

Because P11-C is a pure helper subpath and installs no request capability, there is no legitimate reason for a request-runtime regression.

Any measured plain-route change attributable to P11-C is a failure.

---

# 12. Performance benchmark freeze

Performance is measured only after correctness/security pass.

Primary competitor for equivalent pure-helper behavior:

```text
Hono cookie helper
```

Canonical unsigned cases:

```text
get one cookie from 8-pair header
get one cookie from 32-pair header
generate ordinary Set-Cookie string
generate security-rich Set-Cookie string
```

Canonical signed cases:

```text
HMAC-SHA256 generation with one 32+ byte secret
HMAC-SHA256 verification with one valid current secret
```

Protocol:

```text
Bun 1.4.0
same process-isolated paired harness style where practical
warmup before measurement
multiple mirrored samples
median candidate/reference ratio
```

Frozen acceptance gates for semantically comparable unsigned cases:

```text
per case Gelis/Hono median <= 1.10x
unsigned geomean <= 1.05x
```

Frozen signed valid-path gate:

```text
per comparable signed case Gelis/Hono median <= 1.15x
```

The looser signed bound acknowledges additional Gelis secret-policy/result discrimination while still requiring competitive WebCrypto behavior.

Target, distinct from acceptance gate:

```text
Gelis <= 1.00x Hono where equivalent semantics permit
```

Competitor cases that cannot be made semantically equivalent are diagnostic only and must be labeled as such.

Memory/startup are diagnostic because the subpath holds no application-global runtime state.

Thresholds above are frozen before implementation benchmark results are observed and must not be relaxed afterward.

---

# 13. AOT relationship

Cookie helpers are ordinary user-code calls and require no Gelis AOT route metadata.

AOT routes may import/use `gelis/cookie` in handlers without the AOT route compiler needing cookie-specific topology.

The subpath must remain normal portable ESM with no import-time mutable application state.

---

# 14. Decision

```text
P11-C COOKIE ARCHITECTURE/API/GATES FROZEN

NEXT:
IMPLEMENT gelis/cookie
THEN correctness/security/type gates
THEN frozen competitor benchmark
```
