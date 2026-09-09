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

## P9-E2 direction

The next phase freezes the public managed-body descriptor and its type inference.

Candidate built-in parser set:

```text
json
text
urlencoded
formData
arrayBuffer
```

The descriptor must:

- preserve Standard Schema input/output inference
- keep the current JSON shorthand source-compatible
- make parser selection registration-time information
- carry accepted media-type metadata for contract/client/OpenAPI projection
- compile into a direct runtime body parser rather than interpreting descriptor strings on every request

P9-E2 is not frozen until its public type surface and TypeScript scalability are validated.

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
