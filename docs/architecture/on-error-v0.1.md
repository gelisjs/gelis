# Gelis onError Architecture v0.1

**Status:** Accepted.

## Goals

`onError` provides a global application-level error interception phase.

The design goals are:

1. Applications that do not use `onError` pay no measurable runtime cost.
2. Successful synchronous requests remain synchronous.
3. Error handling preserves the original request.
4. Synchronous and asynchronous failures follow the same public semantics.
5. Multiple handlers preserve registration order.
6. The first non-`undefined` result handles the error.
7. Errors thrown by `onError` itself do not recursively re-enter the error lifecycle.
8. `onError` composes outside `onRequest` and routed execution.
9. Registration order relative to `onRequest` and routes does not change error semantics.
10. Core behavior remains portable and independent of the Bun adapter.

## Lifecycle position

The accepted application execution order is:

```text
request
  |
  v
global onError boundary
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

`onError` is the outer application error boundary.

Conceptually:

```text
onError
  -> onRequest
  -> routed fetch
```

This composition is independent of registration order.

For example:

```ts
const app = new Gelis();

app.onError(errorHandler);
app.onRequest(requestHook);
```

and:

```ts
const app = new Gelis();

app.onRequest(requestHook);
app.onError(errorHandler);
```

produce equivalent error-boundary semantics.

## Public API

```ts
app.onError(({ request, error }) => {
  return new Response("Internal Server Error", {
    status: 500,
  });
});
```

The method returns `this`:

```ts
app
  .onError(firstErrorHandler)
  .onError(secondErrorHandler)
  .get("/users/:id", handler);
```

## Context

The v0.1 context deliberately contains only values guaranteed to exist for every intercepted application error:

```ts
interface OnErrorContext {
  readonly request: Request;
  readonly error: unknown;
}
```

Route-specific values are intentionally absent.

An error may occur before route matching or before route lifecycle state exists, so v0.1 does not expose:

```text
params
validated query
validated body
route metadata
route-specific reply state
```

This keeps the context valid for every supported error source.

## Errors intercepted

`onError` intercepts exceptions and Promise rejections originating from application execution.

Accepted sources include:

```text
onRequest throw
onRequest rejection

router internal throw

validator throw
validator rejection

beforeHandle throw
beforeHandle rejection

handler throw
handler rejection

afterHandle throw
afterHandle rejection

response normalization throw
```

This means an error originating from any of these phases can be handled by the global `onError` lifecycle.

## Values that are not errors

`onError` does not convert normal framework results into errors.

The following do not invoke `onError`:

```text
404 response

400 malformed-input response

415 unsupported-media-type response

422 validation-failure response

normal returned Response

normal returned status result

normal early lifecycle result
```

A normal validation failure is therefore different from a validator implementation throwing an exception.

For example:

```text
schema reports invalid input
-> normal 422
-> onError does not run
```

while:

```text
schema implementation throws
-> onError runs
```

## Handler-result semantics

Multiple `onError` handlers run in registration order.

The handling rule is:

```text
result !== undefined
```

means the error has been handled.

For example:

```ts
app.onError(() => undefined);

app.onError(() => {
  return new Response("handled");
});
```

executes the first handler, continues because it returned `undefined`, and stops at the second handler.

Falsy non-`undefined` values are valid handled results:

```ts
return null;
return false;
return 0;
return "";
```

They are passed through normal Gelis response normalization.

Only:

```ts
return undefined;
```

continues to the next error handler.

## Unhandled errors

If every registered `onError` handler returns `undefined`, Gelis rethrows or rejects with the original error.

Conceptually:

```text
original error
  |
  v
onError #1 -> undefined
  |
  v
onError #2 -> undefined
  |
  v
onError #3 -> undefined
  |
  v
original error propagates
```

The original error identity is preserved.

## Errors inside onError

Errors produced by an `onError` handler itself are not recursively handled.

For example:

```ts
app.onError(() => {
  throw new Error("secondary failure");
});
```

results in:

```text
original error
  |
  v
onError
  |
  | throws secondary error
  v
secondary error propagates immediately
```

Remaining `onError` handlers are skipped.

The same rule applies to asynchronous rejection:

```ts
app.onError(async () => {
  throw new Error("secondary failure");
});
```

There is intentionally no recursive error lifecycle.

This prevents:

```text
onError
-> throws
-> onError
-> throws
-> onError
-> ...
```

and keeps failure behavior predictable.

## Sync awareness

A synchronous successful request remains synchronous when `onError` is enabled.

```text
sync routed fetch
-> Response
-> Response
```

No Promise is introduced merely because the application has an error handler.

A synchronous error handled synchronously also remains synchronous:

```text
handler throws
-> onError returns Response
-> Response
```

Promise continuation is introduced only when the underlying execution or error handler is asynchronous.

## Runtime boundary contract

Internally, application fetch execution uses the following contract:

```ts
type RuntimeFetch = (request: Request) => Response | Promise<Response>;
```

By the time execution reaches the application-level `onError` boundary, arbitrary route-handler Promise-like values have already been normalized into this internal contract.

The specialized `onError` boundary can therefore use the native Promise path for successful asynchronous execution:

```text
Response
or
Promise<Response>
```

without repeatedly performing generic Promise-like detection on the successful request path.

Public `onError` handler results remain more flexible and continue supporting Promise-like values.

## Response fast path

A common handled-error result is already a `Response`:

```ts
app.onError(() => {
  return new Response("handled", {
    status: 500,
  });
});
```

The accepted implementation passes this result through directly instead of sending it through unnecessary response normalization work.

Other handled values still use normal Gelis response normalization.

## Zero-unused-feature strategy

Applications without `onError` do not receive a generic error wrapper.

Gelis does not place logic such as:

```ts
try {
  // every request
} catch (error) {
  if (onErrorEnabled) {
    // ...
  }

  throw error;
}
```

inside the permanent plain request path.

Instead, application-level features are compiled only when registered.

Without application-level lifecycle features:

```text
Gelis.fetch
-> router
-> route execution
```

With `onRequest`:

```text
compiled onRequest fetch
-> routed fetch
```

With `onError`:

```text
compiled onError boundary
-> routed fetch
```

With both:

```text
compiled onError boundary
-> compiled onRequest fetch
-> routed fetch
```

The original routed fetch is preserved as the application compiler baseline.

Recompilation always starts from that baseline rather than wrapping previously compiled application executors repeatedly.

## Compiled execution plans

The accepted `onError` specialization strategy is:

```text
0 handlers
-> original fetch

1 handler
-> specialized single-handler boundary

2 handlers
-> specialized pair boundary
-> cold multi-handler executor

3+ handlers
-> generic multi-handler plan
```

### Zero handlers

No `onError` wrapper exists.

```text
request
-> routed fetch
```

### One handler

The common single-handler configuration receives a specialized boundary.

Its successful path is approximately:

```text
try innerFetch(request)

Response
-> return directly

Promise<Response>
-> attach rejection handler
```

The error path invokes the single error handler directly.

### Two handlers

Two handlers use a specialized application boundary while keeping multi-handler execution outside the hot successful path.

Conceptually:

```text
hot success boundary
      |
      +---- success ----> return
      |
      +---- error ------> cold two-handler executor
```

This avoids imposing the generic multi-handler-plan cost on successful requests.

### Three or more handlers

Three or more handlers use the generic ordered error plan.

A dedicated three-handler specialization was evaluated during optimization but did not provide a justified successful-request improvement on Bun/JSC.

The simpler generic plan is therefore retained for `3+`.

## Why the pair plan is specialized

Runtime measurements showed that the generic multi-handler plan introduced a fixed successful-request penalty.

Separating the successful error boundary from the cold multi-handler executor allowed two registered handlers to remain approximately as cheap as one handler.

Representative successful-path results were:

```text
synchronous:

1 handler    ~134 ns
2 handlers   ~138 ns
3 handlers   ~162 ns

asynchronous handler:

1 handler    ~397 ns
2 handlers   ~396 ns
3 handlers   ~411 ns
```

The two-handler specialization therefore has measurable value on both synchronous and asynchronous successful paths.

A three-handler specialization was investigated separately and rejected because it did not remove the observed Bun/JSC execution-plan penalty reliably enough to justify additional production complexity.

## Registration semantics

`onError` may be registered before or after routes.

For example:

```ts
const app = new Gelis();

app.onError(errorHandler);
app.get("/x", handler);
```

and:

```ts
const app = new Gelis();

app.get("/x", handler);
app.onError(errorHandler);
```

have equivalent error semantics.

Application-level compilation does not require recompiling every registered route.

Its configuration cost depends on the application-level hook plan rather than route count.

Dynamic lifecycle mutation after an application has already been handed to a runtime adapter is not part of the v0.1 contract.

## Interaction with onRequest

`onError` always surrounds `onRequest`.

```text
onError
  |
  v
onRequest
  |
  v
routing
```

Therefore both synchronous throws and asynchronous rejections from `onRequest` can be handled by `onError`.

An early result returned normally by `onRequest` is not an error and does not invoke `onError`.

If response normalization of that early result throws, the normalization error is intercepted by `onError`.

## Interaction with response normalization

Errors from normal routed response normalization are intercepted.

For example, if a returned value cannot be serialized:

```text
handler
-> raw result
-> normalize response
-> serialization throws
-> onError
```

However, if an `onError` handler itself returns a value whose normalization throws, that new normalization error propagates immediately.

It does not recursively re-enter `onError`.

This preserves the non-recursive error-handler rule.

## Correctness gate

Accepted runtime coverage includes:

```text
synchronous handler errors
asynchronous handler rejections
synchronous onRequest errors
asynchronous onRequest rejections
validator throws
validator rejections
beforeHandle throws
afterHandle throws
response normalization errors
multiple onError registration order
falsy handled results
all handlers returning undefined
onError throwing a new error
onError rejecting with a new error
404 exclusion
normal validation-failure exclusion
successful synchronous request preservation
onError/onRequest composition independent of registration order
```

Final verification result:

```text
87 pass
0 fail
177 expect calls
```

## Zero-unused regression gate

The portable runtime benchmark was repeated after the final `onError` optimization candidate.

Representative 5,000-route results:

```text
router static             34 ns
router dynamic           191 ns

dispatch static           48 ns
dispatch dynamic         209 ns

fetch static raw         174 ns
fetch dynamic raw        359 ns

fetch static JSON        570 ns
fetch dynamic JSON       825 ns
```

Differences relative to previous accepted plain-route runs remained within observed benchmark and JIT variation.

Most importantly, applications without `onError` structurally retain the original routed fetch rather than paying an application error-boundary cost.

The zero-unused-feature requirement is therefore accepted.

## Isolated runtime result

The isolated benchmark uses a fresh Bun process for each case to reduce cross-case JIT contamination.

Representative final optimization result:

```text
plain-sync                          138 ns

on-error-unused-sync               134 ns
two-on-error-unused-sync           138 ns
three-on-error-unused-sync         162 ns

handler-error-handled-sync         876 ns
handler-error-unhandled-sync      1246 ns
handler-error-async-on-error      1296 ns

plain-async-handler                358 ns
on-error-unused-async-handler      397 ns
two-on-error-unused-async-handler  396 ns
three-on-error-unused-async-handler
                                    411 ns

async-handler-error-handled        442 ns
on-request-error-handled           641 ns
```

Important observations:

```text
single onError successful sync path
-> approximately plain-path cost

second onError successful sync path
-> only a few additional nanoseconds

second onError successful async path
-> approximately zero additional cost

three or more handlers
-> generic-plan penalty remains

successful async handler with one onError
-> approximately +40 ns in this run
```

The optimization phase intentionally stopped after the pair specialization.

Additional complexity for the three-handler case was not justified by stable production-level gains.

## HTTP benchmark result

The accepted HTTP comparison used:

```text
Runtime:       Bun 1.4.0
Load tool:     oha 1.16.0
Routes:        5,000
Connections:   50
Samples:       7
Warmup:        2 seconds
Duration:      10 seconds per sample
Hono:          4.13.5
Elysia:        1.4.30
```

Representative full-run medians:

| Case                |  Gelis |   Hono | Elysia | Elysia precompile | Gelis vs Hono |
| ------------------- | -----: | -----: | -----: | ----------------: | ------------: |
| plain               | 16,935 | 16,735 | 10,659 |            10,805 |        +1.20% |
| on-error-unused     | 16,999 | 16,788 | 10,592 |            10,810 |        +1.26% |
| handler-error-sync  | 15,869 | 15,771 |  9,782 |            10,018 |        +0.62% |
| handler-error-async | 15,696 | 14,015 |  9,596 |             9,765 |       +12.00% |
| async-on-error      | 15,516 | 15,493 |  9,685 |             9,764 |        +0.15% |
| request-phase-error | 16,813 | 15,267 |  9,851 |            10,290 |       +10.12% |

Small percentage differences around one percent are treated as near parity rather than headline performance advantages.

Therefore the accepted interpretation is:

```text
plain
-> Gelis / Hono near parity

unused onError
-> no measurable Gelis HTTP throughput penalty
-> Gelis / Hono near parity

synchronous handled error
-> Gelis / Hono near parity

asynchronous handler rejection
-> Gelis materially faster in this local workload

asynchronous onError
-> Gelis / Hono near parity

request-phase error
-> Gelis faster in this local workload
-> primitive/fairness caveat applies
```

## Isolated HTTP verification

Two potentially noisy or important cases were repeated independently.

### Unused onError

```text
Gelis     17,002 req/s
Hono      16,903 req/s

Gelis CV  1.24%
Hono CV   1.32%
```

Observed difference:

```text
+0.59% Gelis
```

This is treated as near parity.

The important conclusion is that an enabled but unused single `onError` handler showed no measurable HTTP throughput penalty.

### Synchronous handled error

```text
Gelis     16,175 req/s
Hono      16,057 req/s

Gelis CV  0.61%
Hono CV   1.73%
```

Observed difference:

```text
+0.73% Gelis
```

This also remains near parity.

The runtime optimization substantially reduced internal error-boundary overhead, but the improvement does not become a large throughput difference once the complete Bun HTTP workload is measured.

## Fairness notes

The benchmark compares equivalent observable workloads rather than identical internal framework mechanisms.

Hono exposes a single global error-handler slot.

Gelis supports ordered multiple global `onError` handlers.

Cross-framework HTTP comparisons therefore use the common single-handler workload.

The `request-phase-error` case also requires an explicit caveat:

```text
Gelis
-> error may occur inside pre-routing onRequest

Hono
-> closest native comparison uses global middleware
-> routing behavior is not internally identical
```

The result remains useful as a local workload measurement but should not be presented as proof that Gelis error handling is intrinsically a fixed percentage faster.

Likewise, the fact that a request-phase failure can benchmark faster than a successful plain request does not mean errors are inherently faster.

It means that the measured failure can terminate before later work such as routing and handler execution.

## Optimization decisions

The accepted optimization phase evaluated several implementation strategies.

Accepted:

```text
native Promise path at the internal RuntimeFetch boundary

direct Response fast path for handled errors

specialized single-handler error boundary

specialized two-handler success boundary with cold error executor

generic multi-handler plan for three or more handlers
```

Rejected:

```text
extra native-Promise specialization for arbitrary public onError results

manual inlining of the single synchronous error executor

naive two/three-handler specialization

dedicated three-handler specialization

runtime-generated source / new Function
```

The rejected experiments either failed to improve the target path consistently or added complexity without sufficient production-level benefit.

## Result

`onError` Architecture v0.1 is accepted.

The final design provides:

```text
global application error interception
ordered multiple error handlers
sync-aware execution
async failure handling
non-recursive handler failures
normal-result / error separation
onRequest composition
zero-unused-feature behavior
specialized common execution plans
```

The primary Gelis requirement remains preserved:

> Features that are not enabled must not impose measurable cost on the plain request path.

Pass 5 `onError` correctness, performance optimization, regression verification, and HTTP comparison are complete.
