# Gelis onRequest Architecture v0.1

**Status:** Accepted.

## Goals

`onRequest` provides a global request interception phase that executes before routing.

The design goals are:

1. Applications that do not use `onRequest` pay no measurable runtime cost.
2. Synchronous hooks remain synchronous.
3. Asynchronous hooks introduce Promise continuation only when required.
4. Early return occurs before route matching.
5. Multiple hooks preserve registration order.
6. Hook registration order relative to routes does not affect semantics.
7. Core behavior remains portable and independent of the Bun adapter.

## Lifecycle position

The accepted lifecycle order is:

```text
request
  |
  v
global onRequest
  |
  | early result
  +----------------------> normalize response
  |
  v
router.match
  |
  | no match
  +----------------------> 404
  |
  v
validation
  |
  v
global beforeHandle
  |
  v
local beforeHandle
  |
  v
handler
  |
  v
local afterHandle
  |
  v
global afterHandle
  |
  v
normalize response
```

`onRequest` is intentionally pre-route.

It therefore runs for requests that eventually resolve to 404.

## Public API

```ts
app.onRequest(({ request }) => {
  // inspect the request
});
```

The method returns `this`:

```ts
app.onRequest(first).onRequest(second).get("/users/:id", handler);
```

## Context

The v0.1 context deliberately contains only the original request:

```ts
interface OnRequestContext {
  readonly request: Request;
}
```

The following values do not exist yet at this phase:

- params;
- validated query;
- validated body;
- route-specific reply state.

This keeps the API consistent with its pre-routing semantics.

## Early-return semantics

The same early-result rule used by Gelis lifecycle hooks applies:

```text
result !== undefined
```

means stop processing.

Therefore all of these are early results:

```ts
return new Response("blocked");
return null;
return false;
return 0;
return "";
```

Only:

```ts
return undefined;
```

continues processing.

An early result skips:

```text
remaining onRequest hooks
router.match
validation
beforeHandle
handler
afterHandle
```

and is passed directly through response normalization.

## Sync awareness

A synchronous hook does not make the request path asynchronous.

```text
sync onRequest
-> routed fetch
-> synchronous Response
```

An asynchronous hook introduces a Promise continuation only after the asynchronous boundary is encountered.

Mixed hook plans remain synchronous until the first Promise-like result.

## Zero-unused-feature strategy

The existing `Gelis.fetch` implementation is not changed to contain a request-time feature check.

Gelis does not use:

```ts
if (onRequestEnabled) {
  // ...
}
```

inside the normal fetch hot path.

Instead, the original routed fetch is preserved until the first `onRequest` hook is registered.

```text
no onRequest

Gelis.fetch
-> router
-> route execution
```

When `onRequest` is enabled, the application instance receives a compiled fetch executor:

```text
compiled onRequest fetch
-> routed fetch
-> router
-> route execution
```

Applications that never register `onRequest` continue using the original fetch path.

## Compiled execution plans

The accepted specialization strategy is:

```text
0 hooks
-> original routed fetch

1 hook
-> inline final executor

2 hooks
-> specialized inline pair

3 hooks
-> specialized inline triple

4+ hooks
-> generic loop
```

The compiler produces the final fetch executor rather than creating an intermediate hook executor.

This avoids an unnecessary function boundary such as:

```text
fetch wrapper
-> compiled hook plan
-> pair executor
-> hooks
-> routed fetch
```

The accepted design is instead:

```text
compiled final fetch
-> hooks
-> routed fetch
```

## Registration semantics

`onRequest` may be registered before or after routes:

```ts
const app = new Gelis();

app.onRequest(hook);
app.get("/x", handler);
```

and:

```ts
const app = new Gelis();

app.get("/x", handler);
app.onRequest(hook);
```

have equivalent request semantics.

Unlike global route lifecycle recompilation, adding an `onRequest` hook does not require recompiling every registered route.

Its configuration cost depends on the number of request hooks rather than the number of routes.

Dynamic lifecycle mutation after an application has already been handed to a runtime adapter is not part of the v0.1 contract.

## Errors

v0.1 does not introduce an error lifecycle.

Current behavior is:

```text
synchronous throw
-> fetch throws

Promise rejection
-> fetch rejects
```

Error interception is intentionally deferred to the dedicated `onError` architecture milestone.

## Correctness gate

Accepted runtime coverage includes:

- execution before validation and route lifecycle;
- execution for unmatched routes;
- original Request identity;
- synchronous fetch preservation;
- multiple hook registration order;
- synchronous early return;
- falsy non-undefined early results;
- asynchronous middle hooks;
- asynchronous early return;
- registration after routes;
- synchronous error propagation;
- asynchronous rejection propagation.

Milestone result:

```text
69 pass
0 fail
134 expect calls
```

## Zero-unused regression gate

The portable runtime benchmark was repeated after adding `onRequest`.

Applications without `onRequest` showed no measurable plain-route regression.

Representative 5,000-route result:

```text
fetch static raw      189 ns
fetch dynamic raw     374 ns
fetch static JSON     604 ns
fetch dynamic JSON    829 ns
```

Differences relative to previous accepted runs remained within observed benchmark/JIT noise.

## Accepted runtime result

The isolated benchmark uses a fresh Bun process for each case to prevent cross-case JIT contamination.

```text
plain-sync                 137 ns
on-request-sync            141 ns
two-on-request-sync        152 ns
three-on-request-sync      155 ns
late-on-request-sync       141 ns
validation-only            492 ns
validation-on-request      485 ns
plain-async-handler        360 ns
on-request-async           372 ns
async-early-return         209 ns
```

Important incremental observations:

```text
1 sync hook        +4 ns
second sync hook  +11 ns
third sync hook    +3 ns
late registration ~0 ns
async request     +12 ns
```

The validation difference is within benchmark noise.

The constant synchronous early-return microbenchmark is intentionally not treated as a public throughput claim because JIT optimization can make such a trivial constant path unrealistically small.

## Result

`onRequest` Architecture v0.1 is accepted.

The design preserves the primary Gelis requirement:

> Features that are not enabled must not impose measurable cost on the plain request path.
