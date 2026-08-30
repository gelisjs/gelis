# Gelis Runtime Baseline v0.1

**Status:** Prototype runtime milestone  
**Date:** 2026-08-31

## Scope

The first Gelis runtime milestone intentionally implements only:

- runtime route registration;
- exact static-route matching;
- required `:param` dynamic-route matching;
- module runtime mounting;
- Web Standard `app.fetch(request)`;
- direct handler invocation;
- minimal `reply.status()` runtime support;
- direct response normalization;
- 404 handling;
- duplicate route detection.

The following remain deliberately out of scope for this baseline:

- middleware;
- request validation;
- query/body parsing;
- cookies;
- error hooks;
- not-found hooks;
- OpenAPI;
- WebSockets;
- Bun-specific server fast paths;
- Node-specific adapters.

## Router strategy

Each HTTP method owns two routing structures:

1. an exact static-path `Map`;
2. a segment trie for routes containing required named parameters.

Static routes are checked first.

This gives static routes an exact-path fast path while dynamic routes scale with path depth rather than the number of registered routes.

Dynamic matching prefers static trie edges over parameter edges. If a more-specific static branch cannot complete the match, the matcher may fall back to a parameter branch.

Optional parameters and wildcards remain unsupported.

## Runtime contract separation

Public `RouteRef` types continue to contain only compact public contract information.

Runtime handlers and route options are stored in internal runtime records and do not become part of public route contract types.

Modules carry runtime registrations through an internal symbol while retaining their existing compact public `ModuleRef` type.

## `app.fetch()`

The portable runtime boundary is:

```ts
const response = await app.fetch(request);
```

The first request pipeline is:

```text
Request
  ↓
URL pathname
  ↓
method route table
  ↓
static exact lookup
  ↓ if needed
dynamic trie lookup
  ↓
runtime context
  ↓
handler
  ↓
response normalization
  ↓
Response
```

## Response normalization

The baseline behavior is:

- `Response` → pass through unchanged;
- `undefined` → `204`;
- `string` → text response;
- other values, including objects, arrays, numbers, booleans, and `null` → JSON response;
- `reply.status(status, body)` → normalize the body using the supplied status.

## Current limitations

Routes declaring query or body schemas are registered but are not yet executable through the complete contract pipeline because parsing and validation are intentionally deferred to the validation milestone.

The runtime must not silently pretend validated query/body values exist before that pipeline is implemented.

## Performance process

Before adding middleware or validation, establish runtime baselines for:

- static route dispatch;
- dynamic parameter route dispatch;
- route-table scaling;
- response normalization;
- direct `app.fetch()` cost.

Only after the Gelis-only baseline is stable should identical workloads be compared against Hono and Elysia on the same Bun version, hardware, route set, and benchmark tool.
