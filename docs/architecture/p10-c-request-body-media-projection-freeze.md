# P10-C Request Body + Media Projection Freeze

**Status:** ACCEPTED / FROZEN  
**Phase:** P10-C  
**Date:** 2026-09-09  
**Depends on:** P9-E request-body architecture, P10-A audit, P10-B OpenAPI version/method freeze

## Purpose

This document freezes how the post-P9 Gelis managed request-body contract projects into OpenAPI before `@gelis/openapi` implementation changes begin.

P10-C does not change request parsing, runtime validation, route typing, or P9 media admission semantics.

The source of truth remains the semantic contract snapshot:

```text
body
bodyParser
bodyContentTypes
openapi.request.body metadata
```

The central rule is:

> OpenAPI projection follows the runtime contract facts that Gelis can represent faithfully, and fails closed on contradictory metadata rather than rewriting runtime semantics.

---

# 1. Frozen Gelis runtime facts

For a managed request body, Gelis supports:

```text
json
text
urlencoded
multipart
arrayBuffer
```

The frozen P9 rule is:

```text
bodyParser
→ decoding grammar

bodyContentTypes
→ accepted media aliases
```

`bodyContentTypes` is either:

```text
undefined
→ parser defaults

explicit normalized list
→ exact accepted media essences, replacing parser defaults
```

A managed body always has a body schema.

Parser/media metadata without a body schema remains invalid in core and is not a tooling concern.

---

# 2. Parser default OpenAPI content keys

When `bodyContentTypes` is `undefined`, P10-C freezes the following canonical OpenAPI content keys:

| Gelis parser  | OpenAPI content key                 |
| ------------- | ----------------------------------- |
| `json`        | `application/json`                  |
| `text`        | `text/plain`                        |
| `urlencoded`  | `application/x-www-form-urlencoded` |
| `multipart`   | `multipart/form-data`               |
| `arrayBuffer` | `application/octet-stream`          |

For all parsers except default JSON, this is the direct canonical media type used by the runtime default policy.

---

# 3. JSON structured-suffix admission

The Gelis default JSON reader accepts the canonical JSON media type and the runtime's accepted `+json` structured-suffix family.

OpenAPI request-body `content` keys are media types or HTTP media ranges.

HTTP media-range wildcard syntax supports:

```text
*/*
type/*
type/subtype
```

It does **not** define a suffix wildcard such as:

```text
application/*+json
```

as a media range.

Therefore P10-C explicitly rejects emitting `application/*+json` as if it were a standards-defined OpenAPI content range.

The v0.1 canonical projection for default Gelis JSON is:

```text
application/json
```

This intentionally under-describes the runtime's broader structured-suffix admission rather than emitting a non-standard or over-broad media range.

OpenAPI 3.2's media-type guidance still treats concrete `+json` media types as JSON-compatible. That affects how a concrete media type is interpreted; it does not create a suffix-wildcard content key.

If an API requires exact vendor JSON media types to appear in generated OpenAPI, the route should declare them explicitly with `bodyContentTypes`, for example:

```ts
bodyContentTypes: ["application/json", "application/vnd.example+json"];
```

That route then accepts exactly the explicit normalized list under the frozen P9 replacement semantics.

P10 v0.1 does not add a Gelis-specific OpenAPI extension solely to encode the implicit `+json` admission family.

---

# 4. Explicit bodyContentTypes

When `bodyContentTypes` is present, the OpenAPI request-body `content` map has one entry for every normalized runtime media essence.

Example:

```ts
bodyParser: "json",
bodyContentTypes: [
  "application/json",
  "application/vnd.example+json",
]
```

projects to:

```yaml
content:
  application/json:
    # same semantic body schema
  application/vnd.example+json:
    # same semantic body schema
```

The contract snapshot already normalizes and deduplicates explicit media essences.

Projection preserves that snapshot order.

Object order is not OpenAPI request semantics; preserving contract order simply avoids introducing a second ordering policy.

The same rule applies to custom aliases for every parser.

A custom media alias does not change parser grammar.

For example:

```text
bodyParser: text
bodyContentTypes: [application/vnd.example]
```

still means Gelis decodes the wire body with the text reader and then validates the resulting string/value according to the body schema.

OpenAPI must not infer a different runtime parser from the media type name.

---

# 5. Schema projection by parser

## json

Automatic Standard JSON Schema input projection remains enabled.

The resolved body schema is used for every projected JSON/custom media occurrence.

## text

Automatic Standard JSON Schema input projection remains enabled.

The schema describes the value passed to validation after text decoding.

If the schema converter cannot serialize the runtime schema, the existing aggregate OpenAPI generation issue model applies.

## urlencoded

Automatic Standard JSON Schema input projection remains enabled.

The schema describes the normalized application value after form decoding.

P10 v0.1 does not invent per-property OpenAPI Encoding Objects unless explicit future requirements justify them.

## multipart

Automatic Standard JSON Schema input projection remains enabled when the schema provider can serialize the body schema.

Native Gelis multipart values may contain Web Standard `File` objects.

Standard Schema runtime validation capability does not guarantee that a provider can serialize `File` semantics into JSON Schema/OpenAPI.

Therefore:

```text
runtime multipart + File support
        ≠
automatic OpenAPI File schema guaranteed
```

Resolver failure remains a deterministic generation issue.

Explicit OpenAPI schema metadata or `opaque: true` is the escape hatch for schemas that are valid at runtime but not serializable automatically.

## arrayBuffer

Automatic Standard JSON Schema conversion is **not** used by default for `arrayBuffer` request bodies.

Reason:

```text
ArrayBuffer is a runtime binary value
Standard JSON Schema conversion is not a portable binary-contract guarantee
```

The default OpenAPI media entry is therefore an opaque binary representation:

```yaml
application/octet-stream: {}
```

or the equivalent Media Type Object without a schema.

If the user needs a more specific OpenAPI binary schema, explicit `openapi.request.body.schema` metadata may provide it.

This avoids pretending arbitrary Standard Schema validators for `ArrayBuffer` have a portable JSON Schema representation.

---

# 6. Resolver work and occurrence ownership

For a managed route that projects the same semantic body schema under multiple media keys:

```text
resolve the input schema once per route/generation where possible
prepare fresh caller-owned schema occurrences for each content entry
```

The implementation must preserve the existing resource/reference correctness guarantees of `@gelis/openapi`.

This rule is intended to avoid repeated provider conversion work without sharing mutable projected output structures between media entries.

The exact internal memoization shape is not public API.

---

# 7. OpenAPI body metadata precedence

The existing metadata shape contains:

```text
description
mediaType
required
schema
opaque
```

P10-C freezes separate behavior for documentation-only and runtime-managed bodies.

## Documentation-only body

When `route.body` is absent but `openapi.request.body` metadata exists, existing documentation-only behavior remains valid:

```text
metadata.mediaType ?? application/json
metadata.required as declared
metadata.schema if provided
opaque if requested
```

This metadata describes documentation only and cannot change runtime behavior because no managed runtime body contract exists.

## Runtime-managed body

When `route.body` exists, runtime parser/media facts own the `content` keys.

Metadata cannot replace or hide those runtime facts.

Frozen precedence:

```text
content keys
→ runtime bodyParser/bodyContentTypes

schema content
→ opaque
   > explicit OpenAPI schema
   > automatic resolver where enabled for parser

body description
→ OpenAPI metadata

required
→ runtime contract truth
```

---

# 8. Managed mediaType metadata rule

For a runtime-managed body, the legacy singular:

```ts
openapi: {
  request: {
    body: {
      mediaType: "...";
    }
  }
}
```

is no longer allowed to override the runtime media map.

It is accepted only as a redundant consistency assertion when the automatic/runtime projection has exactly one content key and the normalized metadata media type equals that key.

Otherwise generation reports a deterministic media-type conflict.

Examples:

```text
runtime text default → text/plain
metadata text/plain
→ accepted/redundant

runtime text default → text/plain
metadata application/json
→ conflict

runtime explicit [application/json, application/vnd.example+json]
metadata application/json
→ conflict: singular metadata cannot represent the full runtime media set
```

For default JSON, metadata such as `application/vnd.example+json` does not replace the canonical `application/json` projection even though that concrete vendor type is accepted by the runtime default family.

If exact vendor media documentation is required, use explicit `bodyContentTypes` so the runtime and documentation contracts become identical and finite.

No new plural OpenAPI metadata field is added in P10 v0.1 because `bodyContentTypes` already owns managed runtime media declarations.

---

# 9. Managed required semantics

A Gelis managed body is a runtime request-body contract.

P10-C therefore freezes:

```text
managed route body
→ OpenAPI requestBody.required = true
```

Metadata may omit `required` or set it to `true`.

For a managed body:

```text
required: false
```

is a contradiction and must produce a deterministic generation issue equivalent to:

```text
OPENAPI_REQUEST_BODY_REQUIRED_CONFLICT
```

This intentionally tightens the old documentation package behavior, which previously allowed metadata to mark a runtime JSON body as optional.

The new rule reflects post-P9 runtime truth rather than preserving inaccurate metadata precedence.

Documentation-only bodies may still use either required value.

---

# 10. opaque metadata

For a managed body with:

```ts
openapi.request.body.opaque = true;
```

P10 still projects all runtime-owned content keys, but no schema is attached to those Media Type Objects.

Example:

```yaml
required: true
content:
  multipart/form-data: {}
```

`opaque` suppresses schema projection.

It does not suppress or rewrite runtime media admission facts.

---

# 11. Explicit OpenAPI schema metadata

For a managed body with explicit:

```ts
openapi.request.body.schema;
```

that schema takes precedence over automatic Standard JSON Schema conversion.

The explicit schema is projected independently under every runtime-owned content key.

This applies to all parsers, including `arrayBuffer`.

This mechanism is the preferred v0.1 path for runtime body schemas whose wire/documentation shape cannot be inferred portably from Standard Schema alone.

---

# 12. Metadata conflict philosophy

P10 keeps the generator all-or-error.

Contradictory metadata is not silently repaired.

Examples of conflicts include:

```text
managed required:false
managed singular mediaType that differs from the sole runtime content key
managed singular mediaType with multiple runtime content keys
bodyless/runtime contradictions already handled by response projection
```

The generator reports all collected issues through the existing `OpenAPIGenerationError` model.

---

# 13. OpenAPI 3.1 vs 3.2 body parity

P10-B version differences concern method representation.

P10-C freezes the request-body semantic projection as version-neutral for the current managed parser set.

For the body features in P10-C, 3.1.2 and 3.2.0 should receive equivalent content keys/schema semantics unless an explicit OpenAPI version rule requires otherwise.

No body behavior should diverge merely because the user selects 3.2.

---

# 14. Query/body terminology boundary

Gelis HTTP method:

```text
QUERY
```

and Gelis URL query validation:

```text
options.query
```

are independent concepts.

P10-C does not alter URL query parameter projection.

OpenAPI 3.2's `querystring` parameter location is not adopted automatically by this phase.

---

# 15. Correctness requirements for implementation

P10-D/E must eventually cover at minimum:

```text
JSON shorthand → application/json
explicit JSON vendor media
multiple explicit JSON media keys
text default
text custom alias
urlencoded default
urlencoded custom alias
multipart default
multipart custom alias
multipart provider-convertible schema
multipart non-serializable/File schema error path
multipart opaque
arrayBuffer default opaque binary media
arrayBuffer explicit OpenAPI schema
managed body required true
managed required:false conflict
managed redundant matching mediaType
managed mismatching mediaType conflict
managed mediaType + multiple runtime content types conflict
documentation-only body legacy behavior
explicit schema precedence
opaque precedence
3.1/3.2 request-body semantic parity
fresh projected schema occurrences for multiple media keys
```

Cross-library provider testing must remain at least:

```text
Zod
ArkType
Valibot
```

where applicable.

---

# 16. Runtime/type/performance disposition

P10-C is a tooling architecture freeze.

It authorizes no core request-path changes.

The current Gelis contract snapshot already exposes:

```text
bodyParser
bodyContentTypes
```

so the required integration work belongs primarily in `@gelis/openapi`.

No route generic change is required by this design.

Generation performance gates will be declared before P10-F measurement.

Zero-runtime-overhead will be reverified later in P10-G.

---

# 17. Standards basis

OpenAPI 3.1.2 Request Body / Media Type Objects:

```text
https://spec.openapis.org/oas/v3.1.2.html
```

OpenAPI 3.2.0 Request Body / Media Type Objects and media-type registry:

```text
https://spec.openapis.org/oas/v3.2.0.html
https://spec.openapis.org/registry/media-type/
```

HTTP media-range grammar:

```text
https://www.rfc-editor.org/rfc/rfc9110.html
```

Structured syntax suffixes:

```text
https://www.rfc-editor.org/rfc/rfc6839.html
```

---

# 18. Freeze decision

The following is now frozen for P10 request-body projection:

```text
runtime parser/media facts own managed content keys
parser defaults map to canonical media keys
explicit bodyContentTypes projects every normalized accepted media essence
default JSON projects application/json; no fake application/*+json wildcard
automatic schema projection remains for json/text/urlencoded/multipart
arrayBuffer defaults to opaque binary media unless explicit OpenAPI schema is provided
managed metadata cannot override runtime media keys
managed body is always OpenAPI required:true
managed required:false is a generation conflict
opaque suppresses schema, not runtime media keys
explicit OpenAPI schema overrides automatic schema conversion
documentation-only body metadata retains its existing independent behavior
3.1/3.2 body semantics remain equivalent
no core request-path or route-type change is authorized
```

Therefore:

```text
P10-C ACCEPTED / FROZEN
```

Next:

```text
P10-D — update @gelis/openapi against the frozen post-P9 contract
```
