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
7. Non-JSON parser execution and custom media-type matching are implemented in P9-E3; P9-E2 uses fail-fast transitional guards rather than silently treating them as JSON.
8. Routes without a managed body retain the zero-unused design: they do not inspect Content-Type or allocate parser state.

## Next step — P9-E2-B

P9-E2-B compiles the frozen request-body contract into registration-time runtime parser metadata.

The runtime plan must:

- preserve `body: schema` as the JSON shorthand
- compile parser selection once at registration
- compile accepted media-type matching once where practical
- avoid interpreting parser names on the successful request hot path
- preserve 415 / 400 / 422 error separation
- preserve zero-unused behavior for routes without managed bodies
- provide the runtime foundation for P9-E3 parser implementations
