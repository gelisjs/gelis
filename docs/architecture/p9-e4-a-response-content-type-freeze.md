# P9-E4-A — Response Content-Type Semantics Freeze

Status: **FROZEN / ACCEPTED ARCHITECTURE**  
Phase: P9-E4-A  
Framework: Gelis

## Scope

P9-E4 returns to the response side of the Content-Type architecture after P9-E3 completed the built-in managed request-body readers.

The purpose of P9-E4-A is to freeze response media-type semantics before any additional public shorthand or runtime behavior is considered.

This phase does not change the existing response contract type surface or runtime serializer implementation.

## Existing response architecture

Gelis already separates the logical response contract from HTTP serialization:

```text
Standard Schema
→ logical value contract

serialize
→ wire serialization strategy

contentType
→ declared media representation
```

The existing executable serializer set is:

```text
json
text
```

`AUTO` response normalization remains the ordinary route behavior rather than an explicit serializer literal.

The existing response compiler resolves executable response behavior at route registration. Request execution receives a specialized finalizer and must not repeatedly interpret response descriptors.

## HTML decision

HTML does **not** require a third wire serializer.

HTML output is a string representation using the existing strict text serializer with an HTML media type:

```ts
responses: {
  200: {
    schema: Html,
    serialize: "text",
    contentType: "text/html; charset=utf-8",
  },
}
```

For v0.1 Gelis therefore does **not** add:

```ts
serialize: "html";
```

and does not add a separate HTML response engine.

### Rationale

`serialize` describes how the logical value becomes response-body bytes. HTML and plain text both use the same strict string serialization behavior; their distinction is the media type.

Adding `"html"` as a serializer would mix representation metadata into the serializer axis and duplicate an already accepted runtime path.

The explicit two-field form is also predictable for tooling and AI agents:

```text
serialize: "text"
contentType: "text/html; charset=utf-8"
```

No hidden media inference is required.

A future helper may be evaluated only if concrete ergonomics evidence justifies another public surface. P9-E4-A does not reserve or promise such a helper.

## Frozen response Content-Type semantics

### AUTO responses

Existing AUTO normalization remains unchanged:

```text
raw Response
→ pass through

undefined
→ bodyless response

string
→ text/plain; charset=utf-8

other managed value
→ JSON response
```

P9-E4 does not add Content-Type inspection or negotiation to ordinary routes.

### Explicit JSON serializer

```ts
{
  schema: Value,
  serialize: "json",
}
```

continues to use deterministic JSON serialization.

If `contentType` is omitted, the runtime-provided `Response.json(...)` JSON Content-Type behavior remains canonical.

An explicit override is allowed, for example:

```ts
{
  schema: Problem,
  serialize: "json",
  contentType: "application/problem+json",
}
```

The override changes the declared media type; it does not change the JSON serialization grammar.

### Explicit text serializer

```ts
{
  schema: Text,
  serialize: "text",
}
```

requires the final value to be a string and defaults to:

```text
text/plain; charset=utf-8
```

Gelis does not perform `String(value)` coercion.

An explicit override is allowed, including HTML:

```ts
{
  schema: Html,
  serialize: "text",
  contentType: "text/html; charset=utf-8",
}
```

The override is emitted as declared. Gelis does not append or rewrite a charset on an explicit response `contentType` value.

Therefore:

```text
contentType: "text/html"
```

remains exactly `text/html`, while applications that want the v0.1 recommended HTML representation should declare:

```text
text/html; charset=utf-8
```

### Validation and transformations

`validate: true` remains orthogonal to media type.

For a validated HTML response:

```ts
{
  schema: Html,
  validate: true,
  serialize: "text",
  contentType: "text/html; charset=utf-8",
}
```

Standard Schema validation/transformation runs first. The resulting `result.value` must be a string and is then serialized through the same text finalizer.

### `contentType` requires an explicit serializer

The existing rule remains frozen:

```ts
{
  schema: Value,
  contentType: "text/html; charset=utf-8",
}
```

is invalid.

A custom response media type must identify the serialization strategy explicitly so the wire contract remains deterministic.

### Bodyless statuses

Bodyless statuses remain represented by `undefined` response entries.

The frozen bodyless set remains:

```text
204
205
304
```

They do not carry an executable serializer or managed Content-Type declaration.

### Raw Response escape hatch

A direct Web Standards `Response` remains caller-owned and bypasses the managed response plan, including:

```text
managed validation
managed serialization
managed status enforcement
managed Content-Type selection
```

This remains the escape hatch for streaming, SSE, files, ranges, runtime-specific bodies, and custom HTTP representation ownership.

### No Accept negotiation in P9-E4

P9-E4 does not add representation negotiation from the request `Accept` header.

A route has one declared managed representation per response status in v0.1. Multiple negotiated representations per status remain outside this phase.

## Rejected P9-E4-A candidate — `serialize: "html"`

The candidate public surface:

```ts
{
  schema: Html,
  serialize: "html",
}
```

is rejected for v0.1.

Reasons:

1. it does not introduce a distinct wire serialization algorithm;
2. it duplicates the strict string/text finalizer;
3. it mixes media representation with the serializer axis;
4. it expands public types and registration-time descriptor cases without adding capability;
5. it would require tooling/OpenAPI/client surfaces to understand an otherwise redundant literal;
6. the existing explicit text + Content-Type declaration is deterministic and already supports HTML.

The rejection is architectural; it is not based on post-hoc benchmark results.

## Zero-unused and performance boundary

P9-E4-A changes no runtime source and no public type definition.

Therefore it introduces no candidate hot-path or TypeScript-scaling delta to benchmark.

Any later P9-E4 implementation change must declare gates before measurement. At minimum:

```text
ordinary route regression          <= +3% mirrored median
existing explicit JSON regression  <= +3% mirrored median
existing explicit text regression  <= +3% mirrored median
```

A future shorthand candidate that changes public types must also preserve the existing 5,000-route TypeScript scaling discipline and may not cause route-generic growth.

The gates above may not be relaxed after candidate results are observed.

## Frozen P9-E4-A invariants

1. Response schemas and response serializers remain separate concepts.
2. `json` and `text` remain the complete explicit managed serializer set for v0.1.
3. HTML uses `serialize: "text"` plus an explicit HTML `contentType`.
4. Gelis v0.1 does not add `serialize: "html"`.
5. The recommended managed HTML media type is `text/html; charset=utf-8`.
6. Text serialization remains strict string serialization with no implicit `String(...)` coercion.
7. Explicit response `contentType` values are emitted as declared rather than having a charset silently appended.
8. JSON custom media types continue to use JSON serialization grammar.
9. Text custom media types continue to use strict text serialization grammar.
10. `contentType` without an explicit serializer remains invalid.
11. `validate: true` remains orthogonal to serializer/media selection and serializes Standard Schema `result.value`.
12. Bodyless response statuses do not gain managed Content-Type descriptors.
13. Raw `Response` remains the full response ownership escape hatch.
14. Ordinary routes retain zero-unused response behavior.
15. P9-E4 does not introduce `Accept` negotiation or multiple representations per status.
16. No public route/client type carries serializer or Content-Type metadata merely because HTML is supported.

## Next step — P9-E4-B

Add dedicated correctness coverage for the frozen HTML/text Content-Type behavior without changing runtime or public types.

If the existing implementation satisfies the frozen semantics, P9-E4 can close without adding a redundant serializer API. Managed request-body AOT/tooling projection remains P9-E5 work.
