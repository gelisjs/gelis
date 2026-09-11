# P11-H3 Package, AOT/Prebuilt, and Documentation Boundary Audit

**Status:** AUDIT COMPLETE / H3 RUNTIME EVIDENCE PENDING  
**Date:** 2026-09-11  
**Phase:** P11-H3  
**Final P11 runtime candidate:** `1dd5f94cf0e9ad884ca44e537ee287587cd8baab`  
**H2 accepted evidence head:** `bc09560b82d0c8ef872b27b46a6e9e564647376c`

## Purpose

H3 verifies that the cumulative P11 Industrial HTTP Essentials remain isolated at the package boundary, preserve supported AOT/prebuilt behavior, and have documentation consistent with the final public API.

This document records the static package/documentation audit. H3 runtime acceptance remains gated by the cumulative AOT test and the repository Quality workflow on the H3 evidence commit.

## Package surface audit

The current package export map exposes the portable P11 subpaths independently:

```text
gelis/cookie         -> src/cookie/public.ts
gelis/cors           -> src/cors/index.ts
gelis/body-limit     -> src/body-limit/index.ts
gelis/secure-headers -> src/secure-headers/index.ts
gelis/request-id     -> src/request-id/index.ts
gelis/timeout        -> src/timeout/index.ts
```

The Bun adapter remains isolated at:

```text
gelis/bun -> src/adapter/bun/index.ts
```

The root `gelis` export remains separate and does not re-export the P11 convenience/helper APIs.

The H2 authoritative Quality run on exact SHA `bc09560b82d0c8ef872b27b46a6e9e564647376c` passed the root typecheck, portable package typecheck, Bun package typecheck, package tests, and runtime tests.

The package tests explicitly cover independent resolution of all six portable P11 subpaths and root-export isolation.

## Cumulative AOT/prebuilt evidence target

Permanent H3 coverage is owned by:

```text
test/runtime/p11-h-aot-composition.test.ts
```

The cumulative suite verifies:

```text
application CORS + secure headers + request ID + timeout before hydration
application CORS + secure headers + request ID + timeout after hydration
managed body-limit specialization under cumulative application policies
route-timeout specialization when timeout capability is installed after hydration
router topology identity with cumulative execution policy installed
public contract isolation from P11 execution policy
```

The test deliberately composes capabilities that already have individual AOT coverage instead of replacing their existing focused regression suites.

H3 is not accepted until this cumulative suite and the complete repository Quality gate pass on the same H3 evidence tree.

## Documentation consistency audit

The accepted capability documents were checked against the final package/API surface.

| Phase | Acceptance document                      | Public owner                        | Audit result |
| ----- | ---------------------------------------- | ----------------------------------- | ------------ |
| P11-C | `p11-c-cookie-capability-acceptance.md`  | `gelis/cookie`                      | consistent   |
| P11-D | `p11-d-cors-capability-acceptance.md`    | `gelis/cors`                        | consistent   |
| P11-E | `p11-e-request-body-limit-acceptance.md` | `gelis/body-limit`                  | consistent   |
| P11-F | `p11-f-secure-headers-acceptance.md`     | `gelis/secure-headers`              | consistent   |
| P11-G | `p11-g-request-id-timeout-acceptance.md` | `gelis/request-id`, `gelis/timeout` | consistent   |

No stale public subpath or capability name was found.

The documented public usage remains aligned with the final API:

```text
cookie helpers
-> explicit helpers imported from gelis/cookie

CORS
-> app.use(cors(...)) from gelis/cors

body limit
-> app.use(bodyLimit(...)) plus route bodyLimit and explicit readBody

secure headers
-> app.use(secureHeaders(...)) from gelis/secure-headers

request ID
-> requestId(...) capability with capability.get(request)

timeout
-> timeout(...) capability with capability.signal(request)
-> route option timeout
-> TimeoutError for framework deadline outcomes
```

Historical benchmark and implementation SHAs inside capability acceptance documents remain phase-specific evidence and are not rewritten to the final cumulative P11 SHA.

## Contract boundary

P11 runtime execution policy is not public API-contract metadata.

The H3 cumulative runtime suite therefore requires that representative route contracts do not expose execution-only fields such as:

```text
timeout
bodyLimit
requestId
cors
secureHeaders
```

Managed input schema metadata remains ordinary contract data; the execution ceiling/policy does not become contract metadata merely because P11 is enabled.

## Release boundary

H3 acceptance does not authorize:

```text
npm publication
Git tag creation
GitHub Release creation
release branch promotion
```

P11 remains incomplete until H4 through H8 are independently accepted.
