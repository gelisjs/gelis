# Gelis OpenAPI & Contract Serialization Architecture v0.1

**Status:** Architecture accepted and frozen; implementation pending.

## Purpose

This document records the accepted architecture for OpenAPI and contract serialization in Gelis.

The milestone builds on the previously accepted foundations for:

```text
route contracts
Standard Schema validation
typed-client projection
response contracts
module composition
zero-unused execution
```

The primary architectural requirement is that contract tooling must grow independently from request execution.

The core invariant is:

> Runtime validation, contract inspection, typed-client projection, and OpenAPI serialization are related capabilities, but they are not the same capability.

They must remain independently usable.

The intended architecture is:

```text
                         gelis
                           │
          ┌────────────────┴────────────────┐
          │                                 │
     Runtime Core                  Contract Source Protocol
          │                                 │
          │                        inspectContract(app)
          │                                 │
          │                  ┌──────────────┼──────────────┐
          │                  ▼              ▼              ▼
          │           @gelis/openapi   @gelis/cli    future tooling
          │
          ▼
       Request
```

OpenAPI generation must never become part of normal request execution.

---

# Goals

OpenAPI and contract serialization v0.1 must:

```text
preserve zero-unused request behavior
reuse existing Gelis route contracts
avoid runtime reflection
support Standard JSON Schema
preserve Standard Schema Input/Output semantics
support explicit documentation metadata
support runtime-only schemas safely
support recursive/reference-bearing JSON Schema
remain suitable for thousands of routes
create a stable ecosystem inspection boundary
keep OpenAPI outside the core runtime dependency graph
```

The milestone must also prove that an official ecosystem package can consume Gelis application contracts without importing private runtime implementation details.

---

# Non-goals

The initial milestone does not attempt to provide:

```text
Swagger UI
Scalar
Redoc
automatic /openapi.json endpoint
automatic SDK generation
OpenAPI 3.0 compatibility
OpenAPI 3.2 support
automatic security schemes
automatic framework error responses
automatic component naming
automatic operationId generation
automatic tag generation
schema-library-specific adapters
runtime request reflection
handler execution during generation
```

These capabilities may be added later when their architecture is justified.

---

# Package and repository architecture

The accepted naming and repository model is:

```text
GitHub                         npm

gelisjs/gelis              →  gelis
gelisjs/openapi            →  @gelis/openapi
gelisjs/create-gelis       →  create-gelis
gelisjs/cli                →  @gelis/cli
```

Future ecosystem packages may include:

```text
@gelis/opentelemetry
@gelis/security
@gelis/rate-limit
```

The GitHub organization name does not define the npm scope.

The public framework brand is:

```text
Gelis
```

not:

```text
GelisJS
```

Therefore official optional packages use:

```text
@gelis/*
```

rather than:

```text
@gelisjs/*
```

The core package remains:

```text
gelis
```

and the project generator remains:

```text
create-gelis
```

with the intended future project-creation experience:

```text
npm create gelis@latest
bun create gelis@latest
```

## Repository strategy

`gelisjs/gelis` remains the core repository.

It is not converted into a monorepo merely to make room for ecosystem packages.

Repository boundaries should follow real:

```text
ownership
release cadence
dependency
maintenance
product
```

boundaries.

An independent optional capability may receive its own repository when that separation is architecturally justified.

OpenAPI meets that criterion.

However, `gelisjs/openapi` should not be created until the core contract-source protocol is implemented and proven stable enough for an external consumer.

---

# Dependency direction

The accepted dependency direction is:

```text
@gelis/openapi
       ↓
      gelis
```

The reverse direction is forbidden:

```text
gelis
  ↓
@gelis/openapi
```

The core runtime must not import:

```text
OpenAPI document builders
JSON Schema reference normalizers
documentation UI packages
OpenAPI-specific runtime machinery
```

`@gelis/openapi` must consume only public Gelis contract capabilities.

It must never import private files such as:

```text
gelis/src/runtime/types
gelis/src/runtime/response-plan
gelis/src/runtime/router
```

---

# Standard Schema boundary

Gelis distinguishes validation capability from JSON Schema serialization capability.

## Standard Schema

`StandardSchemaV1` remains the runtime validation interface.

Conceptually:

```text
StandardSchemaV1
→ validation
→ transformation
→ Input / Output typing
```

The existence of a Standard Schema does not imply that it can be converted into JSON Schema.

A runtime-valid schema remains valid even when it cannot be documented automatically.

## Standard JSON Schema

`StandardJSONSchemaV1` is the contract serialization capability.

Conceptually:

```text
StandardJSONSchemaV1
→ JSON Schema conversion
```

The two capabilities are orthogonal.

An object may implement:

```text
StandardSchema only
Standard JSON Schema only
both
```

Gelis must not modify the meaning of `StandardSchemaV1` to pretend that every validator is serializable.

## No library-specific introspection

Gelis core and `@gelis/openapi` must not inspect internal structures belonging to:

```text
Zod
Valibot
ArkType
or other validation libraries
```

There must be no Gelis logic such as:

```text
if vendor === "zod"
  inspect private Zod internals

if vendor === "valibot"
  inspect private Valibot internals
```

Automatic conversion uses the Standard JSON Schema capability.

Library-specific implementation details remain owned by the schema library.

---

# Input and output projection

Standard Schema transformations make request and response directions semantically different.

For requests:

```text
client
  ↓
Schema Input
  ↓
runtime validation
  ↓
Schema Output
  ↓
handler
```

Therefore request documentation uses:

```text
jsonSchema.input()
```

For validated responses:

```text
handler
  ↓
Schema Input
  ↓
runtime validation
  ↓
Schema Output
  ↓
serialization
  ↓
client
```

Therefore response documentation uses:

```text
jsonSchema.output()
```

This rule also applies to metadata-only response schemas because the public wire response type is already defined as Schema Output.

The direction rule is therefore fixed:

```text
request
→ input JSON Schema

response
→ output JSON Schema
```

---

# JSON Schema target

OpenAPI v0.1 requests Standard JSON Schema conversion using:

```text
draft-2020-12
```

The target is not user-configurable in v0.1.

The architecture intentionally avoids supporting multiple JSON Schema targets simultaneously during the initial milestone.

---

# OpenAPI target

The initial generated document targets:

```text
OpenAPI 3.1
```

The emitted version is:

```text
3.1.2
```

The document declares:

```text
jsonSchemaDialect:
https://json-schema.org/draft/2020-12/schema
```

OpenAPI version and JSON Schema dialect are generator invariants in v0.1.

They are not route or application configuration.

---

# Contract storage architecture

OpenAPI must not introduce a second persistent registry containing duplicated copies of every route contract.

The accepted model is:

```text
route registration
      │
      ▼
existing application route state
      │
      ├── runtime execution
      │
      └── contract projection
              ↓
       temporary snapshot
```

Existing registration state already retains the semantic information needed for contract tooling:

```text
HTTP method
path
query schema
body schema
response contracts
```

OpenAPI-specific metadata is added only when explicitly declared.

## No full contract on RouteRef

`RouteRef` remains compact.

Documentation metadata does not become another `RouteRef` generic.

The following design is rejected:

```text
RouteRef<
  Method,
  Path,
  Request,
  Responses,
  OpenAPI,
  ...
>
```

Documentation metadata must not increase root application type complexity.

## No public runtime route collection

Gelis does not expose:

```text
app.routes
app.runtimeRoutes
```

as mutable public application state.

Runtime route records remain private implementation details.

---

# Contract source protocol

The core package owns a consumer-neutral contract inspection capability.

The accepted public operation is:

```ts
inspectContract(app);
```

Conceptually:

```ts
export interface ApplicationContractSnapshot {
  readonly routes: readonly ContractRouteSnapshot[];
}
```

A route snapshot conceptually contains:

```ts
export interface ContractRouteSnapshot {
  readonly method: HttpMethod;

  readonly path: string;

  readonly query: StandardSchemaV1 | undefined;

  readonly body: StandardSchemaV1 | undefined;

  readonly responses: ResponseContractMap | undefined;

  readonly openapi: OpenAPIRouteMetadata | false | undefined;
}
```

Equivalent implementation shapes are acceptable if they preserve these semantics.

## Protocol properties

The contract-source protocol is:

```text
read-only
snapshot-based
consumer-neutral
non-generic over every application route
free of executable handler references
free of compiled runtime plans
```

It must not expose:

```text
handler
runtime flags
response finalizer
beforeHandle compiler output
afterHandle compiler output
router nodes
onError wrappers
```

Schema objects remain references because downstream tooling may need their Standard JSON Schema capability.

Schemas are not deep-cloned during contract inspection.

## Snapshot semantics

`inspectContract(app)` captures the current mounted application state.

Example:

```ts
const first = inspectContract(app);

app.get("/later", handler);

const second = inspectContract(app);
```

`first` does not gain `/later`.

`second` does.

The snapshot is not:

```text
live
observable
subscribed
revision-tracked
```

## Route order

The core snapshot preserves route registration order.

Consumer-specific ordering belongs to the consumer.

For example:

```text
inspectContract
→ registration order

@gelis/openapi
→ deterministic OpenAPI ordering
```

## Mounted modules

Mounted module routes naturally appear in the application snapshot because they become registered application routes.

A module that is not mounted does not appear in that application's contract.

---

# Passive OpenAPI metadata

Route documentation uses the option:

```ts
openapi;
```

The accepted semantics are:

```text
openapi absent
→ included by default

openapi object
→ included with metadata

openapi false
→ excluded from OpenAPI
```

`openapi: false` only affects OpenAPI projection.

It does not remove the route from the core `inspectContract()` snapshot.

This keeps the contract-source protocol consumer-neutral.

## Runtime cost

OpenAPI metadata is passive registration metadata.

It must not:

```text
create a runtime route flag
create a response plan
create an input plan
add request-time feature checks
change handler execution
change handler typing
```

A route with only documentation metadata remains a plain runtime route.

---

# OpenAPI route metadata

The v0.1 route metadata surface includes:

```text
summary
description
operationId
tags
deprecated
request metadata
response metadata
```

It intentionally does not attempt to mirror the complete OpenAPI specification.

The initial surface excludes:

```text
callbacks
links
webhooks
externalDocs
security schemes
server overrides
vendor extension DSL
large example DSL
```

Future capabilities may extend this surface when their ownership and semantics are defined.

---

# Operation metadata

Conceptually:

```ts
interface OpenAPIRouteMetadata {
  readonly summary?: string;

  readonly description?: string;

  readonly operationId?: string;

  readonly tags?: readonly string[];

  readonly deprecated?: boolean;

  readonly request?: OpenAPIRequestMetadata;

  readonly responses?: Readonly<
    Record<number | "default", OpenAPIResponseMetadata>
  >;
}
```

This metadata is not generic.

Literal values such as tag names and descriptions do not become part of the route type graph.

---

# operationId

`operationId` is optional.

Gelis does not automatically invent identifiers from:

```text
method
path
handler name
registration order
```

If provided, an `operationId` must be unique within the generated document.

Duplicate identifiers produce a generation issue.

Gelis does not silently rename duplicates.

---

# Tags

Operation tags preserve user order.

Gelis does not infer tags from path segments.

For example:

```text
/users/:id
```

does not automatically receive:

```text
Users
```

Root-level tag declarations are optional and separate from operation tag references.

---

# Documentation visibility

Every registered route is included by default.

Routes may be explicitly hidden using:

```ts
openapi: false;
```

There is no implicit hiding based on:

```text
/internal
/admin
authentication
route prefix
lack of summary
```

Visibility must be explicit.

---

# Missing metadata semantics

Gelis distinguishes these cases:

```text
contract absent
contract declared but non-serializable
contract intentionally opaque
```

They are not equivalent.

## Absent contract

If no request body schema is declared:

```text
no declared body contract
```

This is valid.

The OpenAPI operation simply does not contain a request body unless documentation-only metadata explicitly adds one.

The same principle applies to query schemas.

## Declared but non-serializable contract

If a runtime schema exists but does not support Standard JSON Schema serialization:

```text
runtime schema exists
+
route is documented
+
no explicit documentation override
+
not opaque
→ generation error
```

The generator does not silently emit:

```json
{}
```

and does not silently remove the schema.

Incorrect documentation is considered worse than generation failure.

## Explicit opaque contract

Intentional unknown structure is represented explicitly:

```ts
{
  opaque: true;
}
```

Opaque is an internal/documentation semantic state.

It is not represented internally merely by:

```json
{}
```

Unknown accidentally and unknown intentionally remain distinct.

---

# JSON Schema override

A documentation override may provide an explicit JSON Schema.

The accepted JSON Schema shape supports:

```text
JSON Schema object
boolean schema true
boolean schema false
```

An explicit schema override takes precedence over automatic Standard JSON Schema conversion.

It does not change runtime validation behavior.

---

# Request projection

Request contracts are projected from:

```text
path
query
body
```

Each has different semantics.

---

# Path projection

Gelis v0.1 path syntax:

```text
/users/:id
```

becomes:

```text
/users/{id}
```

A path parameter is automatically represented as:

```text
name
→ derived from path

in
→ path

required
→ true

schema
→ string
```

Current Gelis path parameters are required named string parameters.

Documentation metadata may enrich an existing path parameter with information such as:

```text
description
deprecated
schema override
```

but does not redefine:

```text
name
in
required
```

Metadata referring to a path parameter that does not exist in the route produces a generation error.

---

# Query projection

Gelis query validation receives the complete parsed query object.

Automatic OpenAPI query projection therefore uses:

```text
Standard JSON Schema input
        ↓
top-level object schema
        ↓
properties
        ↓
OpenAPI query parameters
```

One top-level property becomes one OpenAPI query parameter.

Requiredness comes from JSON Schema `required`.

Repeated query arrays use semantics compatible with repeated query keys:

```text
style
→ form

explode
→ true
```

## Query decomposition limits

Gelis does not implement a complete JSON Schema evaluator merely to derive OpenAPI parameter objects.

Automatic query projection requires a structurally decomposable top-level object schema.

Complex forms that cannot be soundly decomposed automatically require:

```text
explicit query documentation
explicit opaque declaration
or generation failure
```

Examples that may require explicit handling include schemas whose top-level representation fundamentally depends on:

```text
oneOf
complex allOf
conditional schemas
non-object roots
arbitrary unresolved structure
```

The generator must remain conservative.

---

# Query documentation override

Query metadata may provide one of:

```text
replacement schema
explicit parameter list
opaque declaration
```

An explicit parameter list is documentation-only and does not create runtime query validation.

The initial explicit query parameter vocabulary includes:

```text
name
description
required
deprecated
schema
style
explode
```

The parameter location is already known to be `query`.

---

# Request body projection

A runtime body schema means Gelis expects a JSON request body.

The automatic projection is:

```text
Standard JSON Schema input
        ↓
requestBody
        ↓
required: true
        ↓
application/json
```

Current runtime JSON handling also accepts structured JSON media types compatible with `application/*+json`, but the default documentation media type remains:

```text
application/json
```

The generator does not emit every JSON-compatible media type automatically.

## Documentation-only body

OpenAPI metadata may define a request body even when no Gelis runtime body schema exists.

This supports manually processed endpoints such as webhooks.

Documentation-only body contracts do not:

```text
enable validation
create an input plan
parse the request
change handler types
```

This preserves the separation:

```text
OpenAPI documentation
≠
runtime validation
```

## Contradicting runtime behavior

Documentation overrides must not knowingly contradict deterministic runtime behavior.

For example, when a Gelis body schema exists:

```text
required: false
```

would contradict the runtime contract and must fail generation.

Likewise, documenting a non-JSON body type for a route whose Gelis runtime body pipeline requires JSON is not accepted.

---

# Response projection

Explicit Gelis response contracts are the canonical public response documentation source.

Example:

```ts
responses: {
  200: User,
  404: NotFound,
}
```

preserves both statuses in OpenAPI.

Declared statuses are not collapsed into response ranges.

---

# Response schema direction

Response schemas are always projected using:

```text
Standard JSON Schema output
```

This remains true whether runtime response validation is enabled or not.

The client-visible contract is Schema Output.

---

# Bodyless responses

The following Gelis bodyless response statuses remain bodyless in documentation:

```text
204
205
304
```

They produce a response entry without `content`.

`undefined` is not JSON `null`.

No fake JSON body schema is generated for bodyless responses.

---

# Explicit JSON serialization

A response contract using:

```text
serialize: "json"
```

projects to:

```text
application/json
```

unless the runtime response descriptor defines an explicit `contentType`.

The runtime content type remains the source of truth.

---

# Explicit text serialization

A response contract using:

```text
serialize: "text"
```

projects to:

```text
text/plain
```

unless the runtime descriptor defines a custom content type.

Text response schemas are expected to represent strings.

---

# AUTO response serialization

AUTO serialization depends on actual response output:

```text
string
→ text

structured non-string
→ JSON
```

Automatic OpenAPI media-type inference is conservative.

If the output JSON Schema is clearly:

```text
string
```

the media type may be documented as:

```text
text/plain
```

If it is clearly non-string:

```text
object
array
number
boolean
null
```

the media type may be documented as:

```text
application/json
```

If the schema could produce both string and non-string output, the runtime media type is ambiguous.

For managed Gelis responses, such ambiguity should be resolved by making the runtime response contract deterministic, for example with an explicit serializer.

Documentation metadata must not hide managed runtime ambiguity.

---

# Implicit handler responses

TypeScript may infer a response type for a route without an explicit runtime response contract.

That compile-time type is not a runtime JSON Schema.

OpenAPI generation must not:

```text
execute the handler
inspect a sample handler result
attempt TypeScript runtime reflection
assume status 200
```

An implicit route response is represented conservatively as an opaque default response.

Conceptually:

```text
default
→ undocumented response
```

Explicit response contracts are required for exact documented response schemas and statuses.

---

# Raw Response escape hatch

A handler with an explicit response contract may still return raw `Response` as a runtime escape hatch.

That does not erase the explicitly declared public response documentation.

The response contract remains the intended public API contract.

Raw `Response` remains caller-owned runtime behavior.

---

# Framework-generated errors

OpenAPI v0.1 does not automatically inject Gelis framework responses such as:

```text
400 malformed JSON
415 unsupported media type
422 validation failure
```

into every operation.

Those responses are real runtime behavior, but their public error body contract should be frozen independently before becoming automatic OpenAPI output.

Users may document additional statuses manually when needed.

---

# Documentation-only responses

OpenAPI metadata may add statuses not present in the managed Gelis response contract.

Example use cases include:

```text
gateway-generated responses
rate limits
proxy responses
manual raw Response statuses
infrastructure responses
```

A documentation-only status does not:

```text
add reply.status typing
create a response plan
enable serialization
enable validation
change handler output types
```

Runtime contract and documentation contract remain distinct capabilities.

---

# Response descriptions

Every OpenAPI response requires a description.

When no explicit description is supplied, Gelis generates deterministic defaults using known HTTP status semantics where possible.

Unknown statuses receive a deterministic generic description.

Users may override generated descriptions through OpenAPI metadata.

---

# OpenAPI generation API

OpenAPI generation is not a `Gelis` class method.

The accepted public API belongs to the external package:

```ts
import { generateOpenAPI } from "@gelis/openapi";

const document = generateOpenAPI(app, options);
```

Rejected forms include:

```text
app.openapi()
new Gelis({ openapi: ... })
automatic core /openapi.json endpoint
```

The generator is synchronous.

---

# Root generation options

The v0.1 generator requires:

```text
info
```

and optionally accepts:

```text
servers
tags
```

Conceptually:

```ts
interface OpenAPIGenerationOptions {
  readonly info: OpenAPIInfoOptions;

  readonly servers?: readonly OpenAPIServerOptions[];

  readonly tags?: readonly OpenAPITagOptions[];
}
```

At minimum:

```ts
interface OpenAPIInfoOptions {
  readonly title: string;

  readonly version: string;

  readonly summary?: string;

  readonly description?: string;
}
```

`info.version` describes the user's API version.

It is not the OpenAPI specification version.

---

# Server URLs

Gelis does not infer server URLs from:

```text
Bun adapter settings
localhost
incoming requests
environment variables
host headers
```

If no servers are provided, the `servers` field is omitted.

Externally visible deployment URLs are application configuration, not portable runtime knowledge.

---

# Root tags

Root tag declarations are optional.

Operation tags do not require corresponding root tag declarations.

Root tags are useful when the user needs:

```text
tag ordering
tag descriptions
```

Gelis does not automatically synthesize root tags.

---

# Generated document ownership

Each `generateOpenAPI()` call produces a fresh document snapshot.

There is no automatic permanent cache.

Example:

```ts
const first = generateOpenAPI(app, options);

app.get("/later", handler);

const second = generateOpenAPI(app, options);
```

`second` reflects the current application state.

The generator does not maintain:

```text
contract revision counters
document invalidation machinery
persistent generated document state
```

in v0.1.

---

# Returned document mutability

The returned OpenAPI document is:

```text
detached from application state
caller-owned
mutable
```

The generator does not recursively freeze the returned object.

Caller mutation after generation is allowed, but correctness of post-generation modifications becomes the caller's responsibility.

Mutating the returned document must not mutate:

```text
Gelis route metadata
source schema objects
schema-library-owned converter results
```

---

# Automatic OpenAPI endpoint

Neither `gelis` nor `@gelis/openapi` automatically registers:

```text
/openapi.json
/docs
/swagger
```

Contract generation and HTTP serving are separate concerns.

A future documentation plugin may consume `generateOpenAPI()`.

Build-time generation is a first-class use case.

---

# Schema conversion identity

Schema conversion is memoized per generation.

Conversion identity is:

```text
schema object identity
+
direction
+
target
```

Because the target is fixed to Draft 2020-12 in v0.1, the effective cache separates:

```text
schema input conversion
schema output conversion
```

A transformed schema may have different input and output JSON Schemas.

They must never share one converted representation merely because the source object identity is the same.

---

# Conversion memoization

If one schema is reused by 5,000 response contracts:

```text
jsonSchema.output()
```

must execute once during one generation call.

If the same schema is also used for requests:

```text
jsonSchema.input()
→ once

jsonSchema.output()
→ once
```

Conversion complexity should therefore scale with:

```text
unique schema identities
×
used directions
```

rather than schema occurrences.

The conversion cache is created per `generateOpenAPI()` call.

It is not stored on `Gelis`.

It is not global.

It becomes collectible after generation.

---

# JSON Schema resources

Converter output is treated as a JSON Schema resource.

It is not treated as arbitrary JSON to be copied blindly into any document location.

The generator must preserve meaningful JSON Schema keywords including:

```text
$schema
$id
$anchor
$dynamicAnchor
$defs
$ref
$dynamicRef
```

Recursive schemas must remain recursive reference graphs.

Gelis must not recursively expand them into infinite nested structures.

---

# Reference-bearing schemas

Blind inline insertion of reference-bearing JSON Schemas is not allowed when doing so would change reference resolution semantics.

A schema with an explicit `$id` preserves that `$id`.

A schema with local references but no explicit resource boundary may receive a deterministic synthetic absolute `$id` when that safely preserves local reference semantics.

Synthetic resource identifiers must be:

```text
deterministic
absolute
collision-free within the document
independent of registration order
```

They are serialization infrastructure, not public component names.

---

# Relative external references

A relative external reference without a known base URI is ambiguous.

Example:

```text
./common.json#/$defs/User
```

without an appropriate `$id` cannot be resolved soundly by Gelis.

The generator must not guess whether the base is:

```text
filesystem
OpenAPI output location
package location
web URL
```

Such a schema produces a generation issue.

Absolute external references may be preserved.

---

# Manual JSON Schema overrides

Explicit documentation schemas bypass Standard JSON Schema conversion because they are already JSON Schema representations.

They still undergo the same resource/reference correctness checks as automatically converted schemas.

An explicit opaque contract bypasses schema conversion and reference analysis entirely.

---

# Boolean JSON Schemas

JSON Schema boolean forms are valid:

```text
true
false
```

The generator preserves them.

It does not translate them into OpenAPI 3.0 compatibility workarounds.

---

# Document schema ownership

Schema-library-owned converter results are not directly exposed as mutable portions of the returned document.

The generated document receives document-owned copies.

Mutating the returned OpenAPI document must not mutate the source schema library state.

Independent schema occurrences in the returned document should not unexpectedly share mutable nested object identity.

---

# Components strategy

Automatic cross-route `components.schemas` generation is not part of v0.1.

Gelis does not invent component names such as:

```text
Schema1
Schema2
Schema3
```

and does not automatically derive names from:

```text
constructor.name
source variable names
registration order
content hashes
schema vendor
```

Those strategies would create unstable or unreadable public generated-client names.

Schemas are inline by default, subject to safe JSON Schema resource handling.

Converter-provided `$defs` and reference structures are preserved.

Explicit named reusable component architecture may be added later after document-size and generation benchmarks justify it.

---

# Why components are deferred

A single transformed schema may legitimately represent:

```text
UserInput
UserOutput
```

as different JSON Schemas.

Therefore:

```text
one schema object
→ one automatic component name
```

would already be semantically insufficient.

Explicit component naming requires a separate design around:

```text
identity
input/output direction
public naming
collision handling
SDK stability
```

It is intentionally deferred.

---

# Deterministic output ordering

Generated OpenAPI output must be stable across equivalent application definitions.

The accepted ordering rules are:

```text
paths
→ lexicographic

methods
→ fixed HTTP method order

path parameters
→ path appearance order

automatically derived query parameters
→ lexicographic by name

explicit query parameters
→ preserve user order

responses
→ numeric ascending
→ default last

operation tags
→ preserve user order

root servers
→ preserve user order

root tags
→ preserve user order
```

The fixed operation order is:

```text
get
post
put
patch
delete
options
head
```

Deterministic ordering exists for:

```text
stable Git diffs
CI artifacts
contract review
snapshot tests
SDK generation
```

It does not create automatic `operationId` values.

---

# Generation errors

OpenAPI generation failures use a dedicated structured error.

Conceptually:

```ts
class OpenAPIGenerationError extends Error {
  readonly issues: readonly OpenAPIGenerationIssue[];
}
```

An issue conceptually includes:

```ts
interface OpenAPIGenerationIssue {
  readonly code: string;

  readonly method?: HttpMethod;

  readonly path?: string;

  readonly location?: string;

  readonly status?: number;

  readonly message: string;

  readonly cause?: unknown;
}
```

Errors do not retain:

```text
request values
response values
handler closures
```

---

# Error aggregation

Generation does not stop after the first invalid route.

The generator scans the application contract and aggregates contract-definition issues.

Example:

```text
3 OpenAPI generation issues

POST /users
request.body

GET /users/:id
response 200

GET /reports
query
```

This is important for large applications where fixing one route per generation cycle would be unnecessarily expensive.

---

# Converter failures

Standard JSON Schema converters may throw.

A converter exception becomes a structured generation issue with route/location context.

The original error may be retained as `cause`.

The generator continues collecting issues where safely possible.

---

# No warning-only fallback

Contract information that cannot be represented soundly is not downgraded to a warning-only result.

The rule is:

```text
contract can be represented safely
→ document

contract cannot be represented safely
→ generation error
```

Critical contract failures must not disappear in warnings commonly ignored by CI.

---

# Framework error boundary

OpenAPI generation errors are definition/build-time tooling errors.

They are not part of Gelis request `onError` lifecycle.

Calling:

```ts
generateOpenAPI(...)
```

outside request execution either returns a document or throws an OpenAPI generation error.

No runtime request error machinery is involved.

---

# Large-application complexity

The architecture targets:

```text
inspectContract
→ O(routes)

schema conversion
→ O(unique schema identities × directions)

OpenAPI projection
→ O(routes + generated contract size)
```

Quadratic global scans are not acceptable.

Examples of expected structures include:

```text
Set
→ operationId uniqueness

Map
→ path assembly

WeakMap
→ schema conversion memoization
```

The implementation must not repeatedly scan every previous route for every new route.

---

# Contract inspection benchmark

Core `gelis` owns the contract inspection benchmark.

Benchmark sizes:

```text
100 routes
1,000 routes
5,000 routes
```

A diagnostic 10,000-route run may also be used.

The provisional development-machine budget is:

```text
inspectContract(5,000)
→ approximately below 50 ms median
```

This number is an engineering regression budget, not a public performance guarantee.

Scaling behavior is more important than one absolute timing result.

---

# OpenAPI generation benchmark

`@gelis/openapi` owns OpenAPI generation benchmarks.

Required workload classes include:

```text
5,000 routes without schemas

5,000 routes sharing one simple response schema

5,000 routes sharing one transformed schema
for request input and response output

5,000 routes with many unique schemas

5,000 mixed query/body/response routes

smaller recursive/reference-heavy workload
```

Converter-call counts must be instrumented in deterministic tests.

For a shared schema:

```text
5,000 output usages
→ one output conversion
```

For shared transformed request/response usage:

```text
input conversion
→ one

output conversion
→ one
```

---

# Provisional generation budgets

On the current reference development machine, provisional budgets are:

```text
5,000 simple/shared-schema routes
→ approximately below 1 second median

5,000 mixed routes
→ approximately below 2 seconds median
```

These are local engineering budgets.

They are not universal performance claims.

A slightly slower implementation may still be acceptable if profiling shows that final document size dominates unavoidable work.

However, clearly superlinear behavior must be investigated before acceptance.

---

# Scaling acceptance

Route-count scaling should remain approximately linear.

A five-times increase in comparable route count should not produce quadratic growth.

A rough target is:

```text
5× route count
→ approximately <= 7× generation time
```

for equivalent workload shape.

Large deviations trigger profiling before milestone acceptance.

---

# Memory verification

OpenAPI generation is build/tooling work, so its memory budget is less strict than request execution.

Nevertheless, memory usage should broadly follow:

```text
contract snapshot size
+
converted schema size
+
generated document size
```

rather than hidden quadratic duplicate structures.

Benchmarking should record where practical:

```text
RSS before
RSS after inspection
RSS after generation
serialized document size
```

Generated OpenAPI state is not retained by the application after generation.

---

# Zero-unused requirement

Zero-unused behavior remains mandatory.

Adding:

```text
OpenAPI metadata types
contract metadata storage
inspectContract capability
```

must not add request-time OpenAPI work.

Routes without OpenAPI metadata must not pay for documentation features.

A route with passive OpenAPI metadata must not gain runtime execution branches because of that metadata.

Required regression verification includes:

```text
plain application
vs
OpenAPI-capable core

plain route
vs
route containing passive OpenAPI metadata
```

within the accepted benchmark methodology.

---

# Type-system requirement

OpenAPI support must not make `Gelis` accumulate all registered route metadata in its root generic type.

`inspectContract(app)` returns a general runtime snapshot type.

It does not return:

```text
ApplicationContractSnapshot<typeof app>
```

containing literal information for all application routes.

Compile-time typed-client projection and runtime tooling inspection remain separate architectures.

---

# Module behavior

Module-mounted routes preserve their contract metadata when cloned into the application.

Application OpenAPI generation represents the mounted application, not globally defined modules.

Example:

```text
module defined
+
not mounted
→ absent

module mounted in app A
→ present in app A

same module not mounted in app B
→ absent in app B
```

No global route or OpenAPI registry is introduced.

---

# Ecosystem contract

The contract-source protocol is the first stable ecosystem boundary intended for multiple official tools.

Potential consumers include:

```text
@gelis/openapi
@gelis/cli
contract diff tooling
future SDK tooling
future API governance tooling
```

The protocol must evolve more slowly than runtime implementation details.

This is why runtime flags, handler closures, router structures, and compiled plans are deliberately excluded.

---

# CLI direction

The future developer CLI is separate from the project generator.

Target repositories/packages:

```text
gelisjs/create-gelis
→ create-gelis

gelisjs/cli
→ @gelis/cli
```

`create-gelis` focuses on scaffolding.

`@gelis/cli` may eventually provide capabilities such as:

```text
gelis routes
gelis openapi
gelis doctor
gelis request
```

Machine-readable output should be considered a first-class CLI capability:

```text
gelis routes --json
gelis doctor --json
```

This can support:

```text
CI
IDE tooling
coding agents
automation
human developers
```

without adding AI-specific behavior to the Gelis runtime.

---

# create-gelis timing

`create-gelis` should not be built before application structure is sufficiently stable.

The scaffold should follow stable framework architecture rather than repeatedly encode experimental project layouts.

Important prerequisites include sufficient stability in:

```text
module architecture
plugin architecture
runtime adapters
startup/shutdown
package topology
```

The initial generator should prefer small useful templates over large ceremonial directory trees.

---

# Implementation sequence

Implementation proceeds in the following order:

```text
B1
architecture record

B2
Standard JSON Schema capability types

B3
passive OpenAPI metadata type surface

B4
contract metadata capture

B5
inspectContract() protocol

B6
core correctness and type tests

B7
core zero-unused verification

B8
100 / 1,000 / 5,000 contract inspection benchmark

CORE CONTRACT SOURCE FREEZE

B9
bootstrap gelisjs/openapi
package @gelis/openapi

B10
OpenAPI root document and generation errors

B11
path and path-parameter projection

B12
query projection

B13
request-body projection

B14
response projection

B15
Standard JSON Schema conversion

B16
resource / $ref / recursive schema handling

B17
metadata overrides and opaque contracts

B18
cross-library Standard JSON Schema conformance

B19
100 / 1,000 / 5,000 generation benchmark

B20
optimization rewind if evidence warrants it

B21
documentation and milestone acceptance
```

The external `gelisjs/openapi` repository is intentionally created only after the core contract-source protocol passes B2-B8.

---

# Acceptance gates

OpenAPI and Contract Serialization v0.1 is not accepted merely because an OpenAPI JSON object can be produced.

The milestone must pass:

```text
architecture
  ↓
core contract-source correctness
  ↓
type-system scalability
  ↓
zero-unused runtime verification
  ↓
5,000-route contract inspection benchmark
  ↓
external @gelis/openapi consumer boundary
  ↓
OpenAPI structural correctness
  ↓
request/response projection correctness
  ↓
Standard JSON Schema interoperability
  ↓
recursive/reference correctness
  ↓
5,000-route generation benchmark
  ↓
memory/document-size verification
  ↓
documentation
  ↓
ACCEPT / REVISE
```

---

# Architectural invariants

The following rules are frozen for v0.1:

```text
Standard Schema
≠
Standard JSON Schema

runtime validation
≠
OpenAPI serialization

typed-client projection
≠
runtime contract inspection

RouteRef
≠
OpenAPI metadata container

RuntimeRouteRecord
≠
public ecosystem protocol

inspectContract()
→ core capability

generateOpenAPI()
→ @gelis/openapi capability

request schemas
→ JSON Schema input

response schemas
→ JSON Schema output

implicit response types
→ not runtime JSON Schema

declared but non-serializable schema
→ error unless explicitly overridden/opaque

opaque
→ explicit intent

OpenAPI metadata
→ no runtime route flag

OpenAPI generation
→ no request-time execution

schema conversion cache
→ per generation

components.schemas
→ not automatically invented

GitHub organization
→ gelisjs

core npm package
→ gelis

official optional npm scope
→ @gelis/*

project generator
→ create-gelis
```

---

# Reopening policy

This architecture should not be reopened because an alternative API looks stylistically attractive.

A frozen decision may be revisited only when implementation provides material evidence such as:

```text
a correctness contradiction
a Standard JSON Schema incompatibility
an OpenAPI specification contradiction
an unacceptable type-system regression
an unacceptable zero-unused regression
a proven large-application scaling problem
an ecosystem boundary that cannot work without leakage
```

When implementation reveals such a contradiction, the architecture is revised explicitly before continuing.

---

# Status

OpenAPI & Contract Serialization Architecture v0.1 is accepted and frozen.

Completed architecture stages:

```text
A1
Schema Serialization Boundary

A2
Contract Storage Architecture

A3
Documentation Coverage and Missing Metadata

A4
Request and Response Projection Semantics

A5
Public Documentation API and Override Model

A6
Document Generation API and Root Model

A7
Repository and Ecosystem Architecture

A8
External Contract Source Protocol

A9
Schema Identity, References, and Large-App Strategy

A10
Architecture Consolidation and Implementation Plan
```

The next phase is implementation.

The first implementation boundary is the core contract-source capability.

No `@gelis/openapi` repository should be created until that core boundary is proven.
