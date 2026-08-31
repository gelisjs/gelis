# Gelis Runtime Architecture v0.1

**Status:** Active portable runtime direction

## Portable boundary

```ts
app.fetch(request);
```

returns:

```ts
Response | Promise<Response>;
```

so synchronous handlers and synchronous validators can remain synchronous.

## Router

Each HTTP method owns:

1. an exact static-path `Map`;
2. a dynamic segment trie.

Dynamic matching scans the pathname directly, prioritizes static edges, falls back to parameter edges, records parameter boundaries, and slices values only after a successful match.

## Request execution

```text
Request
  ↓
pathname extraction
  ↓
method router
  ↓
route match
  ↓
compiled input plan
  ↓
handler
  ↓
response normalization
  ↓
Response
```

### Plain fast path

If a route has no query/body schema, `route.input` is `undefined` and the request skips parsing and validation.

### Input plans

```text
plain       = no plan
query       = 1
body        = 2
query+body  = 3
```

The plan is created during registration, not rediscovered on every request.

## Sync/async strategy

Gelis does not unconditionally `await` handlers or Standard Schema validators.

Ordinary values continue synchronously; promise-like results use an async continuation.

## Query transport

Query parsing performs URL transport decoding only.

```text
?page=2       -> { page: "2" }
?tag=a&tag=b  -> { tag: ["a", "b"] }
```

Application-level coercion belongs to schemas.

## JSON body handling

A declared body schema currently activates JSON parsing.

- malformed JSON -> 400
- unsupported JSON media type -> 415
- schema issues -> 422

## Response normalization

- `Response` -> passthrough
- `undefined` -> 204
- string -> text
- ordinary values -> JSON
- `reply.status()` -> explicit status

## Bun adapter

The portable core does not call `Bun.serve()`.

The Bun prototype forwards:

```ts
fetch: app.fetch.bind(app);
```

to Bun and has measured negligible throughput overhead.

## Current exclusions

Middleware/lifecycle, centralized error hooks, cookies, WebSockets, response-schema validation, and OpenAPI runtime tooling remain later milestones.
