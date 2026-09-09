# Content-Type Architecture v0.1

Status: Draft — P9-E2 request body contract frozen
Phase: P9-E  
Framework: Gelis

## Goals

P9-E defines a portable, contract-driven Content-Type architecture for Gelis.

The architecture must support:

- JSON APIs
- text payloads
- HTML / SSR responses
- URL-encoded forms
- multipart form data and file uploads
- binary payloads
- custom media types
- raw Web Standards `Request` / `Response` escape hatches

Plain routes and routes without managed bodies must retain zero-unused behavior.

## P9-E1 — Current behavior audit

### Request bodies

The current Gelis managed body contract is:

```ts
{
  body: StandardSchema;
}
```

A managed body currently means JSON.

Runtime behavior:

- `application/json` is accepted
- `application/json; ...` parameters are accepted
- `application/*+json` structured media types are accepted
- missing or non-JSON Content-Type returns `415 Unsupported Media Type`
- malformed JSON returns `400 Bad Request`
- schema rejection returns `422 Unprocessable Content`
- routes without `body` do not parse a request body

This behavior remains the backward-compatible shorthand for JSON.

### Responses

Current managed response behavior already has a useful Content-Type foundation:

- strings normalize to `text/plain; charset=utf-8`
- non-string managed values normalize as JSON
- explicit response descriptors support JSON and text serializers
- explicit response descriptors can override `contentType`
- raw `Response` bypasses managed response normalization

HTML therefore does not require a special wire serializer: it is a string representation with `text/html; charset=utf-8`.

P9-E4 will decide whether Gelis exposes an ergonomic HTML-specific public shorthand.

## Standards constraints

`Content-Type` is a singleton HTTP field.

Gelis must not implement a "take the first" or "take the last" policy for an ambiguous combined Content-Type value.

A managed route with an ambiguous, malformed, missing, or unsupported Content-Type must not sniff the body to guess its representation.

Media type type/subtype matching is case-insensitive.

Parameters are not part of the media type essence. Parser-specific parameters, such as the multipart boundary, remain significant to decoding.

## Bun 1.4 probe

Environment:

```text
Bun 1.4.0
Windows x64
```

Observed:

- duplicate `Content-Type` header appends are exposed as one comma-combined value
- `Request.json()` parses `application/problem+json`
- `Request.json()` parses JSON with a charset parameter
- `Request.formData()` parses `application/x-www-form-urlencoded`
- URL-encoded duplicate keys are preserved
- URL-encoded `+` is decoded as space
- `Request.formData()` parses multipart fields and files
- malformed multipart without a boundary rejects with `TypeError`
- `Request.text()` works for text bodies
- `Request.arrayBuffer()` preserves arbitrary bytes
- `Response.json()` preserves an explicit custom Content-Type
- `new Response(string)` does not automatically add Content-Type in this Bun version

The probe also observed that constructing a `Request` directly with a `FormData` body did not expose an automatically generated multipart Content-Type header in Bun 1.4.

Gelis must therefore base server-side managed-body dispatch on the actual incoming request header. It must not synthesize a multipart boundary that it cannot derive from the encoded body.

## P9-E1 frozen decisions

1. Existing `body: schema` remains the JSON shorthand.
2. Managed body parsing is driven by the declared route contract and incoming Content-Type.
3. Gelis performs no request-body content sniffing.
4. Duplicate/combined singleton Content-Type values are rejected rather than resolved by first/last-member heuristics.
5. Missing or unsupported Content-Type on a managed body returns 415.
6. Parser/decoder failures remain distinct from schema validation failures:
   - unsupported media type: 415
   - malformed representation: 400
   - schema validation failure: 422
7. Media type essence matching is case-insensitive.
8. Parameters are ignored for ordinary essence matching but remain available to parser-specific decoding.
9. Plain routes and routes without managed body parsing must not read Content-Type or allocate parser state.
10. Raw `Request` and raw `Response` remain escape hatches.
11. HTML / SSR is an explicit P9-E response requirement.
12. Full `Accept` negotiation and multiple response representations per status remain outside P9-E v0.1 unless later evidence requires them.

## P9-E2 Request Body Contract Freeze

### Public type surface

The v0.1 managed request-body contract keeps the Standard Schema object as the only route-level body generic:

```ts
interface RouteOptions {
  readonly body?: StandardSchemaV1;
  readonly bodyParser?: RequestBodyParser;
  readonly bodyContentTypes?: readonly string[];
}

type RequestBodyParser =
  | "json"
  | "text"
  | "urlencoded"
  | "multipart"
  | "arrayBuffer";
```

`body: schema` remains the backwards-compatible JSON shorthand.

Explicit parser and media-type declarations are sibling metadata rather than a nested generic descriptor:

```ts
app.post(
  "/message",
  {
    body: MessageSchema,
    bodyParser: "text",
    bodyContentTypes: ["text/plain"],
  },
  ({ body }) => body,
);
```

The schema continues to define both sides of the Standard Schema contract:

- schema input = request/client body
- schema output = handler body

Parser metadata does not participate in the inferred request-body type.

### Rejected nested descriptor model

P9-E2 evaluated the following candidate:

```ts
{
  body: {
    schema: BodySchema,
    parser: "json",
  },
}
```

The model was rejected because carrying the full descriptor as the route-level `Body` generic produced unacceptable TypeScript scaling cost.

At 5,000 routes, relative to candidate shorthand:

- instantiations: 1.480x
- memory: 1.443x
- check time: 1.086x
- normalized 100→5000 instantiation growth: 1.365x

This failed the predeclared instantiation, memory, and normalized-growth gates.

### Accepted flat metadata model

The accepted model is:

```ts
{
  body: BodySchema,
  bodyParser: "json",
}
```

Frozen acceptance gates were declared before measurement:

```text
candidate shorthand / P9-D shorthand
instantiations <= 1.10x
memory         <= 1.20x
check time     <= 1.25x
normalized 100→5000 instantiation growth <= 1.10x

candidate explicit / candidate shorthand
instantiations <= 1.15x
memory         <= 1.20x
check time     <= 1.30x
normalized 100→5000 instantiation growth <= 1.10x
```

The flat model passed all frozen gates at 5,000 routes.

Candidate shorthand relative to the P9-D control:

- instantiations: 1.000x
- memory: 1.001x
- check time: 1.053x
- normalized instantiation growth: 1.000x

Explicit parser metadata relative to candidate shorthand:

- instantiations: 1.000x
- memory: 1.050x
- check time: 1.004x
- normalized instantiation growth: 1.000x

The accepted design therefore adds no measured TypeScript instantiation growth through 5,000 routes.

### Frozen P9-E2-A invariants

1. `body: schema` remains valid and continues to mean managed JSON input.
2. `body` remains the only request-body schema generic carried by route inference.
3. `bodyParser` is parser-selection metadata and does not alter schema input/output inference.
4. `bodyContentTypes` is media-type metadata and does not become a route generic.
5. Managed request bodies require a Standard Schema.
6. Parser metadata without a managed body schema is invalid.
7. Non-JSON parser execution remains deferred to P9-E3. Custom JSON media-type matching is compiled in P9-E2-B.
8. Routes without a managed body retain the zero-unused design: they do not inspect Content-Type or allocate parser state.

## P9-E2-B — Registration-Time Compiled Request Body Plan

P9-E2-B compiles the frozen P9-E2-A request-body contract into runtime execution metadata at route registration.

### Runtime plan

Managed body routes retain declarative metadata for later tooling projection while request execution uses a precompiled body reader:

```ts
interface RuntimeInputPlan {
  readonly kind: number;
  readonly query: StandardSchemaV1 | undefined;
  readonly body: StandardSchemaV1 | undefined;

  readonly readBody?: RuntimeBodyReader;
  readonly readBodyError?: RuntimeBodyReadError;

  readonly bodyParser?: RequestBodyParser;
  readonly bodyContentTypes?: readonly string[];
}
```

`bodyParser` and `bodyContentTypes` are retained metadata. The request hot path does not interpret them.

For the backwards-compatible shorthand:

```ts
{
  body: BodySchema,
}
```

registration compiles the effective parser to JSON and reuses the shared default JSON reader.

For explicit content types:

```ts
{
  body: BodySchema,
  bodyParser: "json",
  bodyContentTypes: [
    "application/vnd.gelis+json",
  ],
}
```

the configured media-type essences are normalized and deduplicated once at registration, and the matching strategy is compiled once.

### Frozen media-type semantics

1. `bodyParser` defaults to `"json"` when `body` exists.
2. `bodyContentTypes: undefined` uses the selected parser's built-in default media types.
3. An explicit `bodyContentTypes` list replaces, rather than extends, the parser defaults.
4. An explicit empty list is invalid.
5. Configured media-type essences are matched case-insensitively.
6. Ordinary matching ignores media-type parameters.
7. Wildcard configured media types are not supported in v0.1.
8. Duplicate configured essences are deduplicated at registration.
9. Ambiguous comma-combined incoming `Content-Type` values are rejected.
10. A comma inside a quoted parameter does not by itself make the field combined.
11. The exact `application/json` shorthand path keeps a dedicated fast path before the slower combined-field scan.
12. Non-JSON parser execution remains deferred to P9-E3.

### Error execution

Body decoding and validation preserve the existing error separation:

- unsupported media type: `415`
- malformed representation: `400`
- schema validation failure: `422`

Decoder rejection handling is attached as the rejection branch of the same Promise continuation used for successful body validation. The accepted implementation intentionally avoids an additional `.catch(...).then(...)` chain on the successful JSON path.

### Rejected P9-E2-B candidate v1

The first compiled-reader implementation was rejected by the predeclared runtime performance gate.

It introduced both:

- a combined-`Content-Type` scan before the canonical exact `application/json` fast path
- an additional Promise continuation through `.catch(...).then(...)`

Process-isolated candidate/control results:

```text
body-json       +9.36%  FAIL
query-body-json +11.09% FAIL
gate            <= +3%
```

The gate was not changed.

### Accepted P9-E2-B candidate v2

Candidate v2 restored the exact JSON fast path and returned decoding to a single success/rejection Promise continuation.

Frozen acceptance protocol:

```text
Control SHA:    24f58c6d365ef99aa7d7196561bde068fc8fb92e
Routes:         5,000 POST routes
Samples:        41 mirrored samples
Workers:        4 persistent processes per workload
Orientations:   control/candidate + candidate/control
Pair shape:     ABBA / BAAB
Warmup:         10,000 app.fetch calls per worker
Measurement:    20,000 app.fetch calls per measurement
Aggregation:    geometric mean of canonical candidate/control ratios
Gate:           mirrored median candidate/control delta <= +3% per workload
Order buckets:  diagnostic only
```

A/A calibration using the frozen control against itself:

```text
body-json       +1.70% PASS
query-body-json -0.85% PASS
```

Accepted candidate v2:

```text
body-json       -6.89% PASS
query-body-json +1.64% PASS
```

The negative `body-json` delta is not treated as evidence of a performance improvement because the sample distribution is noisy. The accepted conclusion is only that the candidate does not exceed the frozen +3% regression gate.

### Frozen P9-E2-B invariants

1. Request parser selection is compiled at route registration.
2. Successful request execution does not interpret the public parser string.
3. Default JSON shorthand retains a shared fast path.
4. Explicit media-type lists compile into specialized matchers.
5. Declarative parser/media-type metadata remains retained for future contract, client, and OpenAPI projection.
6. Plain routes and query-only routes do not allocate managed-body reader state.
7. Unsupported media type, malformed representation, and schema-validation failures remain distinct.
8. Runtime performance must remain within the frozen +3% mirrored-median gate for the default JSON body paths.

## Next step — P9-E3

P9-E3 implements the remaining built-in body readers:

```text
text
urlencoded
multipart
arrayBuffer
```

The P9-E2-A public type surface and P9-E2-B compiled runtime architecture remain unchanged.
