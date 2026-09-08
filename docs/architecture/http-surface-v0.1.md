# Gelis HTTP Surface Architecture v0.1

**Status:** P9-B — QUERY / RFC 10008 frozen.

## Scope

This document defines the HTTP method surface architecture for Gelis.

P9 proceeds in bounded phases:

```text
P9-A  HTTP method audit
P9-B  QUERY / RFC 10008
P9-C  ALL + custom methods
P9-D  method semantics
      - HEAD fallback
      - OPTIONS
      - 404 vs 405
      - Allow
P9-E  content-type architecture
P9-F  performance + TypeScript scalability
```

P9-B intentionally adds QUERY without mixing in ALL, custom-method widening,
automatic HEAD/OPTIONS behavior, 405 generation, or content-type redesign.

## P9-A audit conclusions

The runtime router is already method-agnostic.

Routes are partitioned by method string, and request dispatch matches using the
incoming `Request.method`.

Therefore QUERY does not require a new routing algorithm or a new request-time
dispatch branch.

The architectural constraints are instead:

- keep the public method vocabulary explicit;
- expose convenience methods consistently across every route builder;
- preserve compact route contracts;
- keep AOT source analysis in sync with the public surface;
- preserve Web Standards transport behavior;
- avoid adding cost to applications that do not use QUERY.

## QUERY standard basis

QUERY is standardized by RFC 10008:

https://www.rfc-editor.org/rfc/rfc10008.html

For Gelis, the relevant properties are:

- QUERY is a real HTTP method, not a pseudo-method;
- QUERY is safe;
- QUERY is idempotent;
- QUERY may carry request content;
- body-bearing QUERY requests therefore use the same request-input machinery as
  other body-capable routes when a body schema is declared.

Gelis does not assign special parsing semantics merely because the method is
QUERY. Request parsing remains route-contract driven.

## Frozen public method vocabulary

The known first-class Gelis HTTP method union is:

```ts
export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "OPTIONS"
  | "HEAD"
  | "QUERY";
```

QUERY is intentionally first-class rather than represented as a custom method.

Custom method architecture remains a P9-C concern.

## Frozen QUERY convenience API

The root application exposes:

```ts
app.query(path, handler);

app.query(path, options, handler);

app.query(
  path,
  {
    responses,
    ...options,
  },
  handler,
);
```

The return contract is the same compact `RouteRef` model used by existing
methods, with:

```text
method = "QUERY"
```

The generic route API also accepts QUERY:

```ts
app.route("QUERY", "/search", handler);
```

`app.query()` is convenience syntax over the same registration machinery. It
does not create a separate runtime execution model.

## Composition surface consistency

QUERY is frozen across every public route-builder surface:

```text
Gelis
ApplicationScopeBuilder
RequestScopeBuilder
ModuleRouteBuilder
ModuleScopeBuilder
ModuleRequestScopeBuilder
PluginRouteBuilder
```

Examples:

```ts
app.query("/search", handler);

app.scope(scope).query("/search", handler);

app.requestScope(derive).query("/search", handler);

defineModule("/api", (routes) => ({
  search: routes.query("/search", handler),
}));

definePlugin("search", (setup) => {
  setup.routes.query("/search", handler);
});
```

A route method must not be available only on the root application while missing
from composition surfaces.

## Request content and validation

QUERY request content is handled by the normal Gelis input plan.

For example:

```ts
app.query(
  "/search",
  {
    body: SearchBody,
  },
  ({ body }) => {
    return search(body);
  },
);
```

The existing JSON-body rules remain unchanged:

- declared JSON body schemas use the normal content-type checks;
- malformed JSON remains an input error;
- Standard Schema validation and transformation run normally;
- handler code receives schema output rather than raw unvalidated input.

P9-B does not introduce QUERY-specific body parsing.

## Runtime transport proof

Bun 1.4.0 was tested independently from Gelis before the production API was
changed.

Reproduce with:

```bash
bun run probe:http:query
```

The probe verifies both:

```text
new Request(..., { method: "QUERY", body })
```

and the complete:

```text
fetch()
  -> Bun.serve()
```

transport path.

Accepted observation:

```text
P9-B1 QUERY transport probe
Runtime:                bun 1.4.0
Request method:         QUERY
Request body:           PASS
Bun.serve method:       QUERY
Bun.serve body:         PASS
Bun.serve pathname:     /query
HTTP response:          200

Verdict: PASS
```

The transport proof intentionally contains no Gelis routing so transport support
can be distinguished from framework behavior.

## Contract projection

QUERY uses the existing compact route-contract path.

`inspectContract()` preserves:

```text
method
path
query schema
body schema
response contracts
OpenAPI metadata
```

without special QUERY runtime metadata.

A QUERY route therefore projects:

```text
method = "QUERY"
```

through the same contract source used by tooling and future serialization.

P9-B does not add an OpenAPI document serializer or OpenAPI runtime endpoint.

## AOT compatibility

The source analyzer recognizes:

```ts
app.query("/search", handler);
```

as a canonical convenience route.

QUERY method identity is preserved into the semantic route plan.

This prevents a split architecture where QUERY works under normal registration
but disappears from AOT compilation.

No separate QUERY AOT runtime representation is required because downstream
route plans already carry HTTP method identity generically.

## Zero-unused runtime decision

P9-B does not add a new request-time branch.

The production change consists of:

- one additional known `HttpMethod` literal;
- one `RouteBuilder.query()` convenience registration surface;
- corresponding composition type surfaces;
- AOT source-recognition support.

The normal request path continues to perform the same method lookup that existed
before QUERY support.

For that reason, P9-B does not introduce a standalone throughput acceptance
benchmark. A benchmark here would primarily measure ordinary run-to-run noise
rather than a changed execution plan.

HTTP method dispatch performance is deferred to P9-F, after P9-C and P9-D add
features that can materially change dispatch behavior.

## Acceptance evidence

P9-B acceptance includes:

```text
Bun 1.4.0 QUERY transport proof
  PASS

QUERY root + generic route type contracts
  PASS

application scope QUERY runtime
  PASS

request scope QUERY runtime
  PASS

plugin QUERY runtime
  PASS

static module QUERY runtime
  PASS

scoped module QUERY runtime
  PASS

module request-scope QUERY runtime
  PASS

QUERY JSON body validation + transformation
  PASS

contract snapshot projection
  PASS

AOT source recognition
  PASS

AOT semantic-plan projection
  PASS

full Gelis check
  428 pass
  0 fail
  1213 expect() calls
```

## Deliberately not frozen by P9-B

The following remain open and must not be inferred from QUERY support:

```text
app.all()
custom HTTP method registration
custom method token validation
CONNECT / TRACE / TRACK policy
HEAD -> GET fallback
automatic OPTIONS
405 Method Not Allowed
Allow header generation
exact-method vs ALL precedence
content-type parser selection architecture
method-dispatch performance gates
```

Those decisions belong to later P9 phases.

## P9-B freeze

The following are frozen:

```text
"QUERY" is a first-class HttpMethod
app.query(...)
route("QUERY", ...)
QUERY across all public route-builder surfaces
QUERY request bodies use the ordinary Gelis input plan
QUERY contracts preserve method = "QUERY"
AOT recognizes and preserves QUERY
QUERY adds no dedicated request-time dispatch branch
```

Future work may extend the HTTP surface additively, but must not silently turn
QUERY into a pseudo-method, remove it from composition surfaces, or introduce a
separate execution model for it.
