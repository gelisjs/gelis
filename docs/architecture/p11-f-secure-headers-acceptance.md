# P11-F Secure Headers Capability Acceptance

**Status:** COMPLETE  
**Date:** 2026-09-11  
**Repository:** `gelisjs/gelis`  
**Public owner:** `gelis/secure-headers`

## Purpose

P11-F adds an official secure-headers capability with compact framework-owned defaults, explicit application-specific opt-ins, configuration-time validation, pay-for-use execution, and no secure-header cost on applications that do not install the capability.

The accepted design deliberately does not synthesize application-specific CSP or cross-origin-isolation policy. Those fields remain explicit because the framework cannot infer safe application policy universally.

## Final phase tree

```text
P11-F  Secure Headers                               COMPLETE
├── F1   architecture/API/performance freeze        FROZEN
├── F2   static policy compiler + validation        ACCEPTED
├── F3   application response-policy integration    ACCEPTED
├── F4   response coverage + composition tests      ACCEPTED
├── F5   package/type boundary                      ACCEPTED
├── F6   AOT/prebuilt preservation                  ACCEPTED
├── F7   zero-unused benchmark acceptance           ACCEPTED
├── F8   enabled Hono + HTTP benchmark acceptance   ACCEPTED
├── F9   full bun run check                         ACCEPTED
└── F10  acceptance documentation                   ACCEPTED
```

## Accepted public capability

The public capability remains:

```ts
import { secureHeaders } from "gelis/secure-headers";

app.use(secureHeaders());
```

The root `gelis` entrypoint does not re-export `secureHeaders`.

The default managed response policy is:

```text
Strict-Transport-Security: max-age=31536000
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
X-Frame-Options: SAMEORIGIN
X-XSS-Protection: 0
X-Powered-By: removed
```

The following application-specific fields are not emitted by default:

```text
Content-Security-Policy
Content-Security-Policy-Report-Only
Cross-Origin-Embedder-Policy
Cross-Origin-Opener-Policy
Cross-Origin-Resource-Policy
Origin-Agent-Cluster
Permissions-Policy
```

They may be configured explicitly through `SecureHeadersOptions`.

Example explicit policy:

```ts
app.use(
  secureHeaders({
    strictTransportSecurity: {
      maxAge: 31_536_000,
      includeSubDomains: true,
      preload: true,
    },
    contentSecurityPolicy: "default-src 'self'",
    crossOriginOpenerPolicy: "same-origin",
    crossOriginResourcePolicy: "same-origin",
    originAgentCluster: true,
  }),
);
```

## Override and disable semantics

For default-managed fields:

```text
option omitted
-> use the frozen Gelis default

option false / disabled value
-> Gelis does not manage the field
-> preserve an application/handler-provided value

explicit supported value
-> Gelis owns and finalizes that field
```

A managed application-level field overwrites a conflicting handler-provided value during response finalization. `removePoweredBy` is the explicit deletion policy.

Secure headers are applied exactly once at the final application response-policy boundary.

## Validation and security semantics

Configuration is compiled and validated before serving requests.

Accepted validation includes:

```text
known token options
-> exact supported-token membership

HSTS maxAge
-> finite safe non-negative integer

HSTS preload
-> includeSubDomains required
-> maxAge >= 31536000 required

raw CSP / CSP-Report-Only / Permissions-Policy
-> non-empty legal HTTP field value
-> control-character / CRLF injection rejected
```

Invalid configuration fails closed rather than being silently repaired.

Cross-origin isolation is never silently coupled. Applications that require COOP, COEP, CORP, and Origin-Agent-Cluster configure the needed combination explicitly and own the resulting resource-compatibility requirements.

## Execution architecture

The accepted capability uses the P11-B application HTTP policy lane:

```text
secureHeaders() plugin
        ↓
official application HTTP marker
        ↓
RuntimeApplicationHttpPlan.secureHeaders
        ↓
compiled response-policy finalization
```

The static policy has no request preparation work:

```text
prepare
-> no-op

finalize
-> apply precompiled static field mutations/deletions
```

There is no request-local secure-header state, nonce state, WeakMap, route sidecar, route-option surface, or handler-context generic introduced by P11-F.

When CORS and secure headers coexist, the accepted finalization order is invariant to plugin registration order:

```text
route/onError normalized response
        ↓
CORS finalization
        ↓
secure-header finalization
        ↓
final Response
```

CORS preflight responses also receive secure headers.

## Response and AOT coverage

Permanent correctness coverage includes secure-header finalization for:

```text
normal route responses
handled onError responses
CORS preflight responses
CORS + secureHeaders in both plugin registration orders
managed field overwrite semantics
disabled-field preservation
X-Powered-By deletion
duplicate secureHeaders installation rejection
configuration validation
```

AOT/prebuilt runtime behavior preserves the same application secure-header policy before and after hydration where installation is allowed. Secure-header policy is application policy and is not serialized into route contract artifacts.

## Zero-unused performance evidence

P11-F7 compared the accepted implementation candidate with the frozen pre-P11-F control using 5,000 mixed routes and 11 mirrored fresh-process pairs on Bun 1.4.0.

Control:

```text
281757be11fe3e2073bac9d7d7bf2cc24904dba6
```

Candidate:

```text
98eae9a34fff92b3c7b40df1f67ed84aeb714cad
```

Accepted local evidence:

```text
static raw    0.9982x  PASS
dynamic raw   0.9985x  PASS
static JSON   1.0091x  PASS
dynamic JSON  0.9668x  PASS
geomean       0.9930x  PASS
```

Frozen gates remained:

```text
each candidate/control median <= 1.03x
four-case geometric mean      <= 1.015x
```

Ratios below `1.00x` are treated only as no-regression evidence, not as generalized speedup claims.

## Enabled competitor performance evidence

P11-F8 compared Gelis against Hono `4.13.5` with equivalent effective secure-header fields and 11 mirrored fresh-process pairs per direct case.

Accepted local direct evidence on Bun 1.4.0:

```text
default static 204          0.6054x  PASS
default static JSON         0.5469x  PASS
managed overwrite/delete    0.7244x  PASS
explicit isolation          0.6548x  PASS
static CSP                  0.6097x  PASS
geomean                     0.6255x  PASS
```

Frozen direct gates remained:

```text
each Gelis/Hono case <= 1.10x
geometric mean       <= 1.05x
```

Hono was configured to emit the same effective fields rather than comparing framework defaults with unequal work.

The direct ratios are evidence for these exact accepted workloads only. They do not establish a universal performance claim for all secure-header configurations or all applications.

## HTTP comparator evidence

P11-F8 also ran the frozen end-to-end HTTP comparator with one static `204` route, default equivalent secure-header policy, Bun server transport, 50 concurrent connections, warmup, and seven alternating framework pairs.

Accepted local evidence:

```text
Gelis median throughput   17,330 req/s
Hono median throughput    16,673 req/s
median Gelis/Hono          1.0394x
pairwise diagnostic        1.0337x
Hono-first diagnostic      1.0397x
Gelis-first diagnostic     1.0090x
```

Frozen gate:

```text
median Gelis throughput >= 0.90x Hono throughput
```

This HTTP result is an end-to-end guard for the measured workload, not isolated evidence about header-finalization cost alone.

## Correctness and full quality evidence

The accepted secure-header implementation source candidate is:

```text
98eae9a34fff92b3c7b40df1f67ed84aeb714cad
```

The F8/F9 acceptance head before this documentation commit is:

```text
aa2182e00985448a2659ff4f56517625ba503b03
```

F9 local `bun run check` completed with final observed test totals:

```text
722 pass
0 fail
2110 expect() calls
```

Authoritative Quality workflow run `34506566253` also completed successfully on the same F9 head and executed the repository `bun run check` chain under Bun 1.4.0.

The full gate includes formatting, root typecheck, portable package typecheck, Bun package typecheck, benchmark typecheck, type tests, runtime-test typecheck, Bun adapter typecheck, package export tests, and runtime tests.

No correctness, security, type, AOT, or performance threshold was weakened to obtain acceptance.

## Acceptance checkpoints

The final P11-F acceptance checkpoints are:

```text
F6 implementation + AOT candidate
98eae9a34fff92b3c7b40df1f67ed84aeb714cad

F7 zero-unused harness
4871872ba8e22a4f459beb2c98d3ddadb5dd4deb

F8 enabled + HTTP harness / F9 quality head
aa2182e00985448a2659ff4f56517625ba503b03
```

Benchmark-only acceptance commits do not alter the production secure-header implementation candidate being measured.

## Release boundary

P11-F completion does not authorize a release.

No npm publish, Git tag, GitHub Release, or equivalent public release action is implied by this acceptance. Release engineering remains explicit maintainer-controlled work outside this subphase.

## Next planning boundary

P11-F is complete, but P11 Industrial HTTP Essentials is not complete.

The frozen roadmap defines the next capability as:

```text
P11-G request ID + timeout/abort capability
```

P11-G must begin with its own semantics, API, ownership, portability, correctness, and performance freeze before implementation or candidate measurement.

## Decision

```text
P11-F SECURE HEADERS CAPABILITY COMPLETE

NEXT:
P11-G request ID + timeout/abort capability
```
