# Competitive Performance v0.1 — CP3-A Core Hot-Path Cost Decomposition Freeze

**Status:** FROZEN BEFORE TIMING  
**Parent CP2 acceptance SHA:** `eb2c817dd6c9310feacbe348a7d60647ecdc174a`  
**Frozen Gelis production source:** `1dd5f94cf0e9ad884ca44e537ee287587cd8baab`  
**Bun:** `1.4.2`  
**Authoritative machine:** Windows / Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz

## Purpose

CP2 established two facts that must be reconciled before changing production code:

1. Gelis' direct-dispatch JSON path is materially more expensive than Elysia 2 beta.14 in several CP2-D cells.
2. The same gap contracts to only a few percent on the CP2-H real-HTTP path at 5,000 routes.

CP3-A therefore does **not** compare frameworks and does **not** attempt an optimization. It decomposes the exact accepted Gelis core hot path so the next production change can target a measured cost center instead of a benchmark artifact.

No `src/**` file may change during CP3-A.

## Frozen production path

For a plain successful request, the accepted runtime path is conceptually:

```text
request.url
  -> pathnameFromUrl()
  -> Router.match()
  -> params materialization when dynamic
  -> plain route context allocation
  -> route handler
  -> normalizeResponse()
  -> Response construction / JSON serialization
```

The benchmark imports and measures the real production helpers from the frozen source tree. It must not copy/reimplement the algorithms under measurement.

## Workload identity

The decomposition uses the same 5,000-route target shape as CP2-H.

```text
route count: 5,000
target: final registered route
method: GET
static target:  /r/4999
dynamic target: /r/4999/value-42
absolute URL:    http://gelis.test<target>
```

Payload contracts remain identical to CP2:

```text
static raw:   GET
dynamic raw:  value-42
static JSON:  { method: "GET", route: 4999 }
dynamic JSON: { method: "GET", id: "value-42" }
```

No validation, middleware, lifecycle hook, CORS, secure headers, request ID, timeout, compression, or body parsing is enabled.

## Measurement domains

CP3-A contains two domains. Their numbers must be reported separately.

### Domain A — isolated production primitives

Each primitive runs as its own fresh worker process.

Required cells:

1. `pathname` — `pathnameFromUrl()` on the frozen absolute target URL.
2. `router-static` — `Router.match("GET", "/r/4999")` over 5,000 static routes.
3. `router-dynamic` — `Router.match("GET", "/r/4999/value-42")` over 5,000 trailing-param routes. This includes the production dynamic param object/value materialization performed by `Router.match()`.
4. `handler-static-json` — allocate the exact plain runtime context shape and invoke the representative static JSON handler; consume the returned payload without response normalization.
5. `handler-dynamic-json` — same for the representative dynamic JSON handler using `{ id: "value-42" }` params.
6. `json-stringify-static` — `JSON.stringify()` the representative static payload.
7. `json-stringify-dynamic` — `JSON.stringify()` the representative dynamic payload.
8. `response-json-static` — native `Response.json()` for the representative static payload.
9. `response-json-dynamic` — native `Response.json()` for the representative dynamic payload.
10. `response-preserialized-static` — construct `new Response(preSerializedJson, ...)` using a pre-serialized static JSON body and the effective JSON content type.
11. `response-preserialized-dynamic` — same for dynamic JSON.
12. `normalize-static-json` — production `normalizeResponse()` for the representative static payload.
13. `normalize-dynamic-json` — production `normalizeResponse()` for the representative dynamic payload.
14. `response-raw-static` — `new Response("GET")`.
15. `response-raw-dynamic` — `new Response("value-42")`.
16. `normalize-existing-response` — production `normalizeResponse()` on an already-created `Response`, verifying the caller-owned raw escape hatch returns the same response identity.

Primitive cells answer questions about scale and relative cost. They do **not** prove that a primitive's standalone ns/op is exactly the amount it contributes inside `app.fetch()`.

### Domain B — integrated staged plain pipeline

The staged pipeline uses the real `pathnameFromUrl`, real `Router`, representative real `RuntimeRouteRecord` shape, exact plain context shape, production `runtimeReply`, and production `normalizeResponse`.

For each of the four CP2 scenarios (`static-raw`, `dynamic-raw`, `static-json`, `dynamic-json`), measure these stages:

1. `url-router` — pathname extraction plus route match.
2. `url-router-handler` — above plus exact plain context allocation and handler invocation; consume the handler result without response normalization.
3. `url-router-handler-normalize` — above plus production `normalizeResponse()`.
4. `app-fetch` — actual public `Gelis#fetch()` with 5,000 routes and the same reusable `Request` identity used by CP2-D.

`url-router-handler-normalize` is a transparent manual assembly of the same frozen plain-path helpers. Its correctness result must be byte-equivalent to `app-fetch` before timing is accepted.

## Sampling protocol

Every `(domain, cell)` uses:

```text
11 fresh worker processes
warmup: 20,000 operations per worker
target measured duration: ~120 ms
minimum calibration interval: 20 ms
```

Each worker measures exactly one cell, then exits.

The accepted statistic is the median ns/op across the 11 fresh-process workers. Also retain p25/p75 and minimum/maximum as stability diagnostics.

There is no pass/fail performance threshold in CP3-A. An unfavorable or surprising result is evidence, not a reason to rerun.

## Correctness guard

Before timing each worker must validate its cell.

At minimum:

- pathname equals the frozen target pathname;
- router cells resolve route 4999;
- dynamic router cells return `id === "value-42"`;
- handler cells return the exact representative payload;
- JSON serialization bytes exactly equal the CP2 JSON body;
- response cells return status 200 and expected body/media type;
- `normalize-existing-response` returns the same `Response` object identity;
- staged integrated final responses match the expected CP2 response contract;
- `url-router-handler-normalize` and `app-fetch` are byte-equivalent for their scenario.

A correctness failure makes that run invalid and emits no promotable timing.

## Interpretation boundary

CP3-A explicitly forbids naive additive attribution.

For example:

```text
app-fetch - url-router-handler
```

may be printed as an **incremental diagnostic**, but it must not be described as the exact cost of response normalization. JIT inlining, escape analysis, allocation behavior, hidden-class specialization, and cross-function optimization can make independently timed stages non-additive.

Optimization decisions require agreement between:

1. primitive evidence;
2. integrated staged evidence;
3. CP2-D direct evidence;
4. CP2-H real-HTTP evidence.

## Source and environment guards

Before authoritative timing, the harness must verify:

- Bun exactly `1.4.2`;
- benchmark worktree is clean;
- `src/**` is byte-identical to production source `1dd5f94cf0e9ad884ca44e537ee287587cd8baab`;
- harness SHA is printed;
- CPU identity is printed;
- route count is exactly 5,000.

GitHub Actions may run correctness, typecheck, formatting, and structural validation. GitHub-hosted timing is not authoritative.

## CP3-A decision output

CP3-A ends with a ranked engineering target list, not a performance crown.

The acceptance report must identify:

- dominant isolated primitives;
- dominant integrated stages;
- static-vs-dynamic differences;
- raw-vs-JSON differences;
- whether `normalizeResponse()` adds material overhead over native `Response.json()`;
- whether `Response.json()` itself dominates JSON handling;
- whether routing/params remain material at 5,000 routes;
- which production hypothesis is eligible for CP3-B implementation.

No optimization may be promoted solely because it improves an isolated primitive benchmark.

## Sequence

1. freeze this document before timing;
2. implement worker + acceptance harness without changing `src/**`;
3. validate correctness/typecheck/repository Quality without authoritative timing;
4. run CP3-A once on the authoritative local machine;
5. preserve the first valid local result;
6. write CP3-A acceptance/decomposition report;
7. only then freeze CP3-B optimization hypothesis and gates.
