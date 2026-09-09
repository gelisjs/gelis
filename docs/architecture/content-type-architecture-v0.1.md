# Content-Type Architecture v0.1

Status: Draft — P9-E3-B text request body reader accepted and frozen
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

## P9-E3-A — Built-in Request Body Reader Semantics Freeze

P9-E3 adds the remaining built-in managed request-body readers without changing the P9-E2-A public type surface or P9-E2-B registration-time compiled runtime architecture.

No P9-E3 reader may introduce request-time interpretation of the public `bodyParser` string.

### Built-in defaults and schema inputs

The built-in parser defaults are:

| `bodyParser` | Default accepted media type | Value passed to Standard Schema |
| --- | --- | --- |
| `json` | existing JSON defaults | parsed JSON value |
| `text` | `text/plain` | `string` |
| `urlencoded` | `application/x-www-form-urlencoded` | normalized null-prototype object |
| `multipart` | `multipart/form-data` | normalized null-prototype object |
| `arrayBuffer` | `application/octet-stream` | `ArrayBuffer` |

`text` does not implicitly accept `text/*`. Other textual representations such as `text/csv` or `text/xml` require an explicit `bodyContentTypes` declaration.

`arrayBuffer` does not implicitly accept arbitrary media types. Binary representations outside `application/octet-stream` require an explicit `bodyContentTypes` declaration.

The existing JSON shorthand and structured-JSON defaults remain unchanged.

### Parser selection and media-type aliases

`bodyParser` defines the decoding grammar. `bodyContentTypes` defines which incoming media-type essences are allowed to select that already-compiled grammar.

Therefore an explicit custom media type is an alias for the selected parser rather than a request to infer a parser from the media type:

```ts
{
  body: FormSchema,
  bodyParser: "urlencoded",
  bodyContentTypes: ["application/vnd.gelis-form"],
}
```

The payload is decoded with URL-encoded form semantics.

The same rule applies to custom aliases for `text`, `multipart`, and `arrayBuffer`.

For multipart aliases, the boundary parameter remains parser-significant even though ordinary media-type matching compares only the configured essence.

P9-E2 media-type-list semantics remain unchanged:

- `bodyContentTypes: undefined` uses parser defaults
- an explicit list replaces parser defaults
- an explicit empty list is invalid
- configured wildcards remain unsupported in v0.1
- configured essences are normalized and deduplicated at registration
- incoming ambiguous comma-combined `Content-Type` remains rejected

### Text reader semantics

The `text` reader exposes Web Body text semantics.

The body is decoded as UTF-8. A `charset` parameter does not cause Gelis to select a different transcoder.

An empty text body produces the empty string.

Text decoding does not add representation-specific syntax validation. Body-consumption failures still map to `400 Bad Request`.

### ArrayBuffer reader semantics

The `arrayBuffer` reader exposes the exact request-body bytes as an `ArrayBuffer`.

An empty binary body produces a zero-length `ArrayBuffer`.

The reader performs no representation-specific syntax validation. Body-consumption failures still map to `400 Bad Request`.

### URL-encoded reader semantics

The `urlencoded` reader follows Web `application/x-www-form-urlencoded` parsing semantics:

- `+` decodes to U+0020 SPACE
- percent-encoded bytes are decoded according to the URL-encoded parser
- form strings are decoded as UTF-8 according to the Web form parsing model
- repeated field names are preserved before normalization

The URL-encoded reader must not reuse Gelis's strict query-percent-decoding failure policy. The Web URL-encoded parser is intentionally forgiving of malformed percent triplets such as `%ZZ`; such input remains data rather than automatically becoming a `400` representation failure.

### Form normalization

Managed `urlencoded` and `multipart` bodies are normalized before Standard Schema validation.

The result is a null-prototype object so form field names cannot mutate the object's prototype chain.

URL-encoded values have the conceptual shape:

```ts
type UrlEncodedBody = Record<string, string | string[]>;
```

Multipart values have the conceptual shape:

```ts
type MultipartBody = Record<
  string,
  string | File | Array<string | File>
>;
```

Normalization rules are:

1. The first occurrence of a field name is stored as a scalar value.
2. The second occurrence promotes that field to an array containing both values in arrival order.
3. Later occurrences append to that array in arrival order.
4. Multipart fields may mix `string` and `File` values under the same field name.
5. Multipart file entries retain their native Web Standards `File` objects.
6. Field names are literal. Gelis performs no implicit bracket, dot, or nested-object coercion for names such as `user[name]`, `tags[]`, or `a.b`.
7. Empty field names and empty string values remain data rather than being dropped by normalization.

The normalized object preserves ordering among repeated values of the same field name but does not preserve global interleaving between different field names.

Applications that require the complete ordered `FormData` entry stream must use an unmanaged/raw request route and parse `context.request.formData()` directly instead of using the managed normalized form reader.

### Multipart reader semantics

Multipart decoding follows `multipart/form-data` semantics.

A valid multipart representation requires a usable `boundary` parameter. The boundary is part of decoding semantics and is not discarded merely because ordinary media-type matching ignores parameters.

Each file part is retained as a `File`. Multiple parts with the same field name remain separate values and are combined only by Gelis's explicit repeated-field normalization rule.

A missing, invalid, or unusable multipart boundary is a malformed representation and maps to `400 Bad Request`, not `415 Unsupported Media Type`, because the declared media-type essence is supported and decoding is what failed.

The implementation must not invent or synthesize a multipart boundary that is absent from the incoming request metadata.

### Error taxonomy

P9-E3 preserves the frozen error separation:

| Condition | Status |
| --- | --- |
| missing `Content-Type` on a managed body | `415` |
| unsupported media-type essence | `415` |
| ambiguous comma-combined `Content-Type` | `415` |
| accepted media type with malformed representation | `400` |
| multipart boundary missing/invalid/unusable | `400` |
| request-body consumption/decoder failure | `400` |
| Standard Schema issues | `422` |

A decoder may have no ordinary malformed-syntax state. In particular, `text` and `arrayBuffer` primarily produce `400` only when body consumption fails, while URL-encoded parsing follows its forgiving Web grammar.

### Runtime architecture freeze

P9-E3 inherits the registration-time compilation boundary from P9-E2-B.

Conceptually:

```text
route registration
  bodyParser + bodyContentTypes
    -> compile RuntimeBodyReader
    -> RuntimeInputPlan.readBody

request execution
  readBody(request)
    -> decoder promise
    -> body validation continuation
```

The successful request path must not add a request-time `switch` or equivalent dispatch over `bodyParser`.

Decoder rejection handling must remain part of the same success/rejection Promise continuation strategy accepted in P9-E2-B. The rejected `.catch(...).then(...)` shape must not return to the default JSON path.

Form normalization semantics are frozen here, but the concrete normalization implementation is not yet frozen. Candidate implementations must be measured before acceptance, especially if they introduce an additional Promise continuation or intermediate allocation.

### Zero-unused freeze

P9-E3 does not weaken zero-unused behavior.

1. Plain routes do not read `Content-Type` and do not allocate managed-body reader state.
2. Query-only routes do not read `Content-Type` and do not allocate managed-body reader state.
3. Routes using raw `context.request` without a managed body schema remain responsible for their own body parsing.
4. Adding built-in reader implementations must not move parser dispatch, parser state, or form normalization into routes that do not use them.

### Frozen regression and acceptance gates

The regression control for P9-E3 implementation is:

```text
Control SHA: 313adf97932a80b95b1d2e4f0f27039a51e74013
```

The following existing workloads must retain the frozen mirrored-median regression gate:

```text
plain           <= +3%
query-only      <= +3%
body-json       <= +3%
query-body-json <= +3%
custom-json     <= +3%
```

The process-isolated measurement discipline remains aligned with the accepted P9-E2-B workflow:

- mirrored control/candidate and candidate/control orientations
- ABBA / BAAB pairing
- geometric canonical candidate/control ratios
- warmup before measurement
- GC-controlled/process-isolated execution where used by the accepted harness
- order buckets remain diagnostic only
- a gate is never relaxed after seeing candidate results

For each new reader, the managed candidate must also be compared with a semantically equivalent manual Gelis route using the same decoder semantics, normalization semantics, and Standard Schema validation:

```text
text        managed/manual mirrored median <= +5%
urlencoded  managed/manual mirrored median <= +5%
multipart   managed/manual mirrored median <= +5%
arrayBuffer managed/manual mirrored median <= +5%
```

If a manual control is discovered not to be semantically equivalent, the benchmark is invalid and must be corrected. The threshold must not be changed to accommodate an invalid comparison.

All frozen P9-E2-A TypeScript scaling gates remain in force. P9-E3 must not turn parser metadata into new route generics or reintroduce the rejected nested body descriptor model.

### AOT boundary

P9-E3 freezes reader semantics for the normal runtime registration path, including routes introduced through composition surfaces that ultimately use the same runtime input-plan compiler.

P9-E3 does not expand the current flat/source AOT artifact to serialize managed request-body readers.

The current flat AOT path is a plain-route topology/runtime optimization and does not transport managed input-plan state. Managed-body AOT transport, source-tooling projection, and equivalent tooling parity remain P9-E5 work.

P9-E3 implementations therefore must not enlarge the AOT artifact format merely to add the four built-in readers.

### Frozen P9-E3-A invariants

1. `json`, `text`, `urlencoded`, `multipart`, and `arrayBuffer` remain the complete built-in v0.1 request-body parser set.
2. Parser defaults are fixed to the table above.
3. `bodyParser` selects decoding grammar; `bodyContentTypes` selects accepted media-type aliases.
4. `text` defaults only to `text/plain` and decodes with Web UTF-8 text semantics.
5. `arrayBuffer` defaults only to `application/octet-stream` and returns `ArrayBuffer`.
6. URL-encoded parsing follows Web form semantics and preserves repeated names before normalization.
7. Managed URL-encoded forms normalize to a null-prototype object with scalar-first / array-on-repeat semantics.
8. Managed multipart forms use the same repeated-field normalization while retaining `File` objects.
9. Form field names remain literal; no implicit nested-form coercion exists in v0.1.
10. Multipart boundary is decoder-significant; missing/invalid/unusable boundary maps to `400` after the media type is accepted.
11. Unsupported or missing managed-body media type remains `415`; schema rejection remains `422`.
12. Parser choice remains compiled at registration and is not switched over on each request.
13. The accepted default JSON Promise/Content-Type fast path must remain intact.
14. Plain and query-only routes retain zero-unused behavior.
15. Existing JSON/plain/query/custom-JSON workloads retain the frozen `+3%` mirrored-median regression gate.
16. New reader managed/manual framework overhead is gated at `+5%` mirrored median per reader.
17. Frozen TypeScript scaling gates remain unchanged.
18. Managed-body AOT transport is deferred to P9-E5; P9-E3 does not enlarge the flat AOT artifact.

## Standards basis for P9-E3-A

The semantics above are intentionally aligned with Web Standards rather than Bun-only APIs:

- WHATWG Fetch body/form parsing defines URL-encoded form parsing, multipart form parsing, native `File` entries, text consumption, and binary body consumption.
- RFC 7578 defines `multipart/form-data`, including the required boundary parameter, repeated field names, ordered form parts, and multiple files represented as separate parts with the same field name.

The Gelis normalization layer is framework policy applied after standards-compatible form decoding; it is not intended to redefine the underlying wire format.

## P9-E3-B — Text Request Body Reader Acceptance

Status: **FROZEN / ACCEPTED**

Candidate implementation SHA:

```text
11820282f9ddb9951a494f3b8936e92452240435
```

The accepted implementation adds the built-in `text` reader while preserving the P9-E3-A contract:

- parser choice is compiled at route registration
- the default reader accepts only `text/plain` by media-type essence
- parameters and case normalization follow the frozen Content-Type matching rules
- explicit `bodyContentTypes` replace the default and act as aliases for text decoding
- successful decoding uses `Request.text()`
- decoder/body-consumption rejection maps to `400`
- Standard Schema issues remain `422`
- missing, unsupported, or ambiguous Content-Type remains `415`
- the default JSON reader and JSON Content-Type fast path are not changed by text request execution

Correctness acceptance:

```text
bun run check
530 pass
0 fail
1469 expect() calls
```

### A/A calibration

The P9-E3 regression harness was calibrated by running the frozen control against itself:

```text
Control SHA:    313adf97932a80b95b1d2e4f0f27039a51e74013
Candidate SHA:  313adf97932a80b95b1d2e4f0f27039a51e74013
Samples:        41 mirrored samples
Routes:         5,000 per workload
Gate:           mirrored median <= +3%
```

Results:

```text
plain            +0.37% PASS
query-only       -0.98% PASS
body-json        -0.81% PASS
query-body-json  +1.21% PASS
custom-json      -0.06% PASS
```

The A/A calibration therefore remained inside the predeclared gate for every protected workload.

### Existing-path regression acceptance

Candidate `11820282f9ddb9951a494f3b8936e92452240435` was compared with frozen control `313adf97932a80b95b1d2e4f0f27039a51e74013` using the frozen process-isolated protocol.

Results:

```text
plain            +1.85% PASS
query-only       -3.34% PASS
body-json        +0.57% PASS
query-body-json  +0.06% PASS
custom-json      -0.54% PASS

gate             <= +3% mirrored median per workload
```

Order-specific buckets remain diagnostic only and do not replace the mirrored-median acceptance metric.

### Managed/manual text acceptance

The managed `text` reader was compared against a semantically equivalent manual Gelis route using the same text decoding, media admission, Standard Schema validation, and single success/rejection Promise continuation shape.

Protocol:

```text
Routes:         5,000 POST routes
Samples:        41 mirrored samples
Workers:        4 persistent processes
Orientations:   manual/managed + managed/manual
Pair shape:     semantic ABBA / BAAB
Warmup:         10,000 app.fetch calls per worker
Measurement:    20,000 app.fetch calls per measurement
Aggregation:    geometric mean of canonical managed/manual ratios
Gate:           mirrored median managed/manual delta <= +5%
```

Accepted result:

```text
text managed/manual  -6.74% PASS
```

The negative delta is not accepted as evidence that managed text is intrinsically faster than the manual route. The measured distribution remains noisy. The accepted conclusion is only that the managed reader does not exceed the predeclared `+5%` framework-overhead gate.

### Frozen P9-E3-B invariants

1. The `text` reader is now an accepted built-in runtime reader.
2. Its built-in media default remains exactly `text/plain`.
3. Text decoding uses Web `Request.text()` UTF-8 semantics.
4. Custom media aliases reuse text decoding grammar rather than changing parser selection at request time.
5. Decoder rejection remains `400`; schema issues remain `422`; unsupported/missing/ambiguous media remains `415`.
6. Text reader selection remains registration-time compiled.
7. The default JSON hot path is preserved.
8. Plain and query-only zero-unused behavior is preserved.
9. Existing protected workloads passed the frozen `+3%` mirrored-median regression gate.
10. Managed text passed the frozen `+5%` managed/manual overhead gate.
11. The TypeScript public contract and scaling gates remain unchanged.
12. Managed-body AOT transport remains deferred to P9-E5.

## Next step — P9-E3-C

Implement and validate the built-in `arrayBuffer` reader next.

`arrayBuffer` is intentionally sequenced before form readers because it can extend the accepted compiled-reader architecture without introducing form normalization, multipart boundary handling, or form-entry allocation policy. The same frozen `+3%` protected-workload regression gates and `+5%` managed/manual reader gate remain in force.
