# Gelis Response Contracts & Serialization Architecture v0.1

**Status:** Architecture accepted; implementation and performance verification pending.

## Goals

Response contracts define how Gelis represents typed response behavior without forcing generic response machinery onto routes that do not use executable response features.

The architecture must preserve the Gelis principles:

```text
Correct
  ↓
Predictable
  ↓
Secure
  ↓
Composable
  ↓
Fast
```

and:

> Enterprise capability must not require enterprise overhead when unused.

The primary goals are:

1. preserve existing response normalization for ordinary routes;
2. keep raw `Response` pass-through cheap;
3. represent status-specific response contracts explicitly;
4. support bodyless responses;
5. keep runtime response validation opt-in;
6. support Standard Schema transformations correctly;
7. separate logical response contracts from HTTP serialization;
8. compile executable response behavior at registration time;
9. preserve synchronous execution when all participating operations are synchronous;
10. keep typed-client contracts compact and based on wire-visible output;
11. integrate response failures with the accepted `onError` lifecycle;
12. avoid request-time generic descriptor interpretation.

## Existing response baseline

The accepted Gelis response normalization behavior remains the compatibility baseline:

```text
Response
→ pass through

undefined
→ HTTP 204 with no body

string
→ HTTP 200 text/plain

other values
→ HTTP 200 JSON
```

`reply.status(status, body)` applies the same body normalization rules under an explicit status.

Bodyless HTTP statuses currently include:

```text
204
205
304
```

These semantics are not replaced merely because response contracts exist.

## Response result algebra

Gelis recognizes five relevant handler-result classes:

```text
direct structured value
direct string
undefined
reply.status(...)
raw Response
```

Their baseline meanings are:

```text
direct non-undefined value
→ status 200

direct undefined
→ status 204

reply.status(...)
→ explicitly selected status

raw Response
→ caller-owned HTTP response
```

Response-contract semantics build on these existing meanings rather than redefining them.

## Response contract model

A response entry may conceptually be:

```ts
type ResponseContract = StandardSchemaV1 | undefined | ResponseDescriptor;
```

A response map remains status-specific:

```ts
responses: {
  200: User,
  404: NotFound,
  204: undefined,
}
```

The three entry classes have different meanings.

### Standard Schema shorthand

```ts
200: User
```

means:

```text
typed response contract
typed-client contract
future metadata source

NO runtime validation
NO response transformation
NO executable serializer plan
```

The handler produces:

```text
StandardSchema Output
```

and the client observes:

```text
StandardSchema Output
```

### Bodyless contract

```ts
204: undefined
```

means:

```text
declared response status
no response body
```

`undefined` is intentionally distinct from `null`.

`null` remains a legitimate JSON body.

### Executable response descriptor

Executable response behavior is declared explicitly.

The accepted conceptual descriptor families are:

```ts
type ValidatedAutoResponse<Schema extends StandardSchemaV1> = {
  readonly schema: Schema;
  readonly validate: true;

  readonly serialize?: never;
  readonly contentType?: never;
};

type JsonResponse<Schema extends StandardSchemaV1> = {
  readonly schema: Schema;

  readonly serialize: "json";
  readonly validate?: true;

  readonly contentType?: string;
};

type TextResponse<Schema extends StandardSchemaV1> = {
  readonly schema: Schema;

  readonly serialize: "text";
  readonly validate?: true;

  readonly contentType?: string;
};
```

The exact implementation may use equivalent helper types, but these semantics are fixed.

This is invalid:

```ts
{
  schema: User,
}
```

because it adds no behavior beyond the shorthand:

```ts
User;
```

This is also intentionally invalid:

```ts
{
  schema: User,
  contentType: "application/problem+json",
}
```

A custom content type requires an explicit serializer so wire behavior remains deterministic.

Use:

```ts
{
  schema: Problem,
  serialize: "json",
  contentType: "application/problem+json",
}
```

instead.

## Bodyless response rules

Bodyless response contracts use:

```ts
undefined;
```

directly:

```ts
responses: {
  204: undefined,
}
```

The intended reply API is:

```ts
reply.status(204);
```

not:

```ts
reply.status(204, undefined);
```

and not:

```ts
reply.status(204, null);
```

`204`, `205`, and `304` cannot declare body-bearing response schemas.

These are invalid:

```ts
responses: {
  204: User,
}
```

```ts
responses: {
  205: User,
}
```

```ts
responses: {
  304: User,
}
```

This restriction should be enforced statically where practical and verified again at registration time for runtime JavaScript or unsafe casts.

`undefined` body contracts remain valid for other statuses:

```ts
responses: {
  200: undefined,
}
```

which can be emitted explicitly with:

```ts
reply.status(200);
```

Direct:

```ts
return undefined;
```

still means status `204`, not status `200`.

Therefore direct `undefined` can satisfy an explicit direct-return contract only when status `204` is declared.

Statuses `205` and `304` require explicit status selection.

## Body-bearing schema invariant

A response schema represents a body-bearing response.

A top-level schema output that can itself be `undefined` is therefore not a valid body-bearing response contract.

Conceptually:

```text
undefined response entry
→ bodyless response

schema / descriptor entry
→ body-bearing response
```

A response schema must not use top-level `undefined` output as an alternative way to represent an empty response.

This keeps status and body semantics unambiguous.

## Contract versus executable behavior

Declaring:

```ts
responses: {
  200: User,
  404: NotFound,
}
```

must not create executable response work.

The declaration provides:

```text
type contract
wire contract
typed-client projection
metadata
```

but not:

```text
runtime schema validation
generic status checking
generic serialization dispatch
response-plan lookup
```

Executable response machinery exists only when a descriptor enables:

```text
validate: true
```

or an explicit serializer:

```text
serialize: "json"
serialize: "text"
```

This distinction is fundamental to zero-unused cost.

## Producer types and wire types

Standard Schema distinguishes:

```text
Input
Output
```

Response contracts use this distinction at the server boundary.

### Contract-only response

For:

```ts
responses: {
  200: User,
}
```

the server handler must already produce:

```text
User.Output
```

because no response validation or transformation executes.

The client also receives:

```text
User.Output
```

Conceptually:

```text
handler
  ↓
Schema.Output
  ↓
serialization
  ↓
client
```

### Validated response

For:

```ts
responses: {
  200: {
    schema: User,
    validate: true,
  },
}
```

the handler produces:

```text
User.Input
```

Gelis executes:

```text
schema.validate(input)
```

and the successful:

```text
result.value
```

becomes the canonical value.

Conceptually:

```text
handler
  ↓
Schema.Input
  ↓
Standard Schema validate / transform
  ↓
Schema.Output
  ↓
serialization
  ↓
client
```

The client always observes:

```text
Schema.Output
```

regardless of whether response validation is enabled.

## Validation transformations

Response validation is not check-only validation.

This architecture rejects:

```text
validate original value
  ↓
ignore result.value
  ↓
serialize original value
```

When response validation succeeds:

```ts
schema["~standard"].validate(value);
```

the value sent to serialization is:

```ts
result.value;
```

not the original handler value.

This preserves Standard Schema transformation semantics.

Depending on the schema implementation, the transformation may perform behavior such as:

```text
normalization
field stripping
coercion
mapping
canonicalization
```

Gelis does not itself promise any of those behaviors unless the selected schema library provides them.

Declaring a response schema without:

```ts
validate: true;
```

does not provide runtime sanitization.

## Response validation failure

Input validation failure and response validation failure represent different responsibility boundaries.

```text
invalid client input
→ normal request validation response

invalid server output
→ server contract failure
```

Response validation issues must not become:

```text
422
```

because the client did not cause the server to violate its output contract.

Structured response validation issues become a response-contract error handled by the normal error lifecycle.

If the schema itself throws or rejects instead of returning validation issues, the original thrown/rejected error propagates.

## Serialization model

Schema contracts and serialization strategies are separate concepts.

```text
schema
→ logical value contract

serializer
→ HTTP representation
```

Standard Schema is not treated as a codec API.

### AUTO serialization

Ordinary routes and contract-only entries retain existing Gelis normalization:

```text
Response
→ pass through

undefined
→ empty

string
→ text

other value
→ JSON
```

No additional response plan is created merely to reproduce existing AUTO behavior.

### JSON serializer

Explicit:

```ts
{
  schema: User,
  serialize: "json",
}
```

uses deterministic JSON serialization.

Conceptually it follows Web Standard `Response.json(...)` semantics.

The final value is serialized as JSON regardless of its runtime type.

For example a string is serialized as a JSON string rather than text/plain.

Default content type:

```text
application/json
```

An explicit override may be supplied:

```ts
{
  schema: Problem,
  serialize: "json",
  contentType: "application/problem+json",
}
```

### Text serializer

Explicit:

```ts
{
  schema: Text,
  serialize: "text",
}
```

requires the final schema output to be a string.

Gelis does not perform:

```ts
String(value);
```

coercion for this serializer.

A non-string final value is a response-contract serialization failure.

Default content type:

```text
text/plain; charset=utf-8
```

An explicit override may be supplied, for example:

```text
text/html; charset=utf-8
```

### No implicit binary codec

Gelis v0.1 does not auto-compile binary codecs for:

```text
Uint8Array
ArrayBuffer
Blob
ReadableStream
files
CBOR
MessagePack
Protocol Buffers
```

Advanced body ownership remains available through raw `Response`.

## Raw Response escape hatch

Directly returned:

```ts
return new Response(...);
```

is the raw HTTP escape hatch.

Raw `Response` bypasses:

```text
response schema validation
response transformation
response serializer selection
managed status enforcement
body inspection
body cloning
```

This is required for:

```text
streaming
SSE
file responses
range responses
large binary responses
custom headers
runtime-specific bodies
```

For response-enabled routes, raw `Response` detection should occur before managed response-plan work.

Response-contract runtime guarantees therefore apply to Gelis-managed handler results, not arbitrary raw `Response` objects.

## reply.status semantics

`reply.status(...)` remains the canonical Gelis-managed mechanism for an explicit response status.

Contract-only:

```ts
responses: {
  201: Created,
}
```

means:

```text
reply.status body
→ Created.Output
```

Validated:

```ts
responses: {
  201: {
    schema: Created,
    validate: true,
  },
}
```

means:

```text
reply.status body
→ Created.Input

runtime validation
→ Created.Output
```

Bodyless:

```ts
responses: {
  204: undefined,
}
```

means:

```ts
reply.status(204);
```

with zero body arguments.

## Managed status enforcement

TypeScript should reject undeclared `reply.status(...)` calls.

For metadata-only response contracts, no new runtime status enforcement is added merely to defend against `any`, JavaScript, or unsafe casts.

For routes that activate an executable response plan, Gelis-managed results are owned by that plan.

An undeclared managed status on such a route becomes a response-contract error.

Raw `Response` remains exempt because it is the explicit HTTP escape hatch.

## Lifecycle integration

Accepted execution order:

```text
onError
  ↓
onRequest
  ↓
routing
  ↓
input validation
  ↓
beforeHandle
  ↓
handler
  ↓
afterHandle
  ↓
response finalization
  ↓
Response
```

### onRequest early results

`onRequest` executes before route selection.

Its early response therefore cannot be governed by a route response contract.

Early results use existing Gelis normalization and return immediately.

### beforeHandle early results

A `beforeHandle` early result is a lifecycle-controlled short circuit.

It bypasses the handler response plan.

This preserves cross-cutting behavior such as:

```text
authentication
authorization
rate limiting
maintenance responses
```

without requiring every handler response map to repeat infrastructure statuses.

Route-local lifecycle `reply.status()` may continue using wire-response typing as a compile-time convenience, but it does not cause the executable handler response plan to run.

### afterHandle

`afterHandle` remains observational.

It receives the raw resolved handler result before response validation and serialization.

For validated response schemas:

```text
handler produces Schema.Input
  ↓
afterHandle observes pre-validation result
  ↓
response validation
  ↓
client receives Schema.Output
```

Gelis does not clone result objects before `afterHandle`.

If a hook mutates the same object reference, later response validation observes the mutated value.

An `afterHandle` throw or rejection aborts normal response finalization and propagates through `onError`.

## Error integration

Response validation and explicit serialization execute inside the routed fetch and therefore inside the outer accepted `onError` boundary.

The response-contract error family is conceptually:

```text
ResponseContractError
```

with:

```text
code = RESPONSE_CONTRACT_ERROR
```

and a kind such as:

```text
validation
serialization
status
```

A validation contract error may expose structured validation issues to application error handlers.

A serialization contract error may preserve the original serialization error as its cause.

An undeclared managed runtime status on an executable response route uses the status error kind.

The error object should not automatically retain the complete invalid response value because that value may contain sensitive application data.

Exact constructor implementation may remain internal while the error family is exported for `instanceof` and error handling.

## AUTO normalization failures

Existing AUTO normalization failures retain existing error identity where practical.

They are not automatically wrapped merely because response contracts exist.

Explicit response-plan failures use `ResponseContractError`.

Both are intercepted by the outer `onError` boundary when they originate from normal routed execution.

## onError results

A handled result produced by `onError` does not re-enter the route response plan.

Conceptually:

```text
response finalizer fails
  ↓
onError
  ↓
handled result
  ↓
normal Gelis response normalization
  ↓
Response
```

There is no recursive response validation or serialization lifecycle.

If normalization of the `onError` handler's own result fails, that new error propagates immediately and does not recursively re-enter `onError`.

## Sync awareness

Response capabilities preserve synchronous execution whenever possible.

A route with:

```text
sync handler
sync afterHandle
sync response validator
sync serializer
```

must remain capable of returning:

```text
Response
```

synchronously.

A synchronous Standard Schema result must not be forced through an unconditional Promise.

An asynchronous response schema may legitimately convert the final request execution into:

```text
Promise<Response>
```

because the developer explicitly enabled an asynchronous capability.

Contract-only response declarations never make a route asynchronous.

## Registration-time compilation

Executable response behavior is compiled from route configuration.

Conceptually:

```text
registration
    ↓
inspect response declaration
    ↓
compile exact response behavior
```

The request path must not repeatedly interpret descriptors like:

```ts
if (descriptor.validate) {
  ...
}

if (descriptor.serialize === "json") {
  ...
}

if (descriptor.serialize === "text") {
  ...
}
```

Generic descriptor interpretation belongs at registration time.

The request path receives a specialized response finalizer.

## Direct-result specialization

A direct non-undefined handler result already implies:

```text
status 200
```

and direct `undefined` implies:

```text
status 204
```

An executable response compiler should therefore be free to create direct-result finalizers without performing a generic status-map lookup for these common direct paths.

Explicit `reply.status(...)` results require status dispatch because the selected status is part of the result.

The exact dispatch strategy is intentionally not frozen.

Possible implementations include:

```text
single-status specialization
small switch
indexed table
generic map
```

Runtime measurements must determine which strategies justify production complexity.

## Zero-unused-feature architecture

A route with no executable response descriptor must preserve the existing execution path.

In particular, plain routes must not gain a permanent check such as:

```ts
if (route.responsePlan !== undefined) {
  ...
}
```

when route specialization can avoid it.

Conceptually:

```text
ordinary route
→ existing handler execution
→ existing normalizeResponse
```

Executable route:

```text
handler
→ compiled response finalizer
→ Response
```

Response metadata alone must not create request-time response machinery.

## Route execution flags

An executable response capability may eventually participate in route-plan flags or specialized invokers.

The architecture does not yet require a combinatorial specialization for every possible combination of:

```text
input
beforeHandle
afterHandle
response
```

The implementation starts with the simplest correct compiled structure.

Runtime and HTTP benchmarks decide whether additional specialization is justified.

No combinatorial execution-plan expansion is accepted solely by intuition.

## Public wire contract projection

Raw response declarations are registration-local implementation contracts.

Public `RouteRef` response types contain only wire-visible status/body information.

For example:

```ts
responses: {
  200: {
    schema: User,
    validate: true,
    serialize: "json",
  },

  404: NotFound,

  204: undefined,
}
```

projects to the public response contract:

```ts
{
  200: UserOutput;
  404: NotFoundOutput;
  204: undefined;
}
```

The public contract does not carry:

```text
validate
serializer
contentType
Schema.Input
runtime response-plan structure
```

This keeps `RouteRef` compact.

## Handler producer projection

Handler response typing uses the producer side of each entry.

Conceptually:

```text
contract-only schema
→ Schema.Output

validated schema
→ Schema.Input

bodyless
→ no body
```

This projection controls:

```text
handler reply.status(...)
direct handler result compatibility
```

## Lifecycle reply projection

Route-local lifecycle early results bypass executable response plans.

Where lifecycle `reply.status()` is typed against route responses, it uses the wire-side body type:

```text
Schema.Output
```

rather than validated producer `Schema.Input`.

This gives useful status/body type safety without pretending the response validator will execute for an early lifecycle result.

Global lifecycle reply typing remains generic and must not become a union of every route contract in the application.

## Direct handler return typing

For an explicit response map, Gelis-managed direct values reflect actual normalization semantics.

If status `200` is declared, a compatible non-undefined direct body may represent that response.

If status `204` is declared as bodyless:

```ts
204: undefined
```

direct:

```ts
return undefined;
```

may represent that response.

A direct `undefined` cannot represent bodyless statuses `200`, `205`, or `304`, because direct `undefined` has runtime status `204`.

Explicit statuses other than those naturally implied by direct result semantics use:

```ts
reply.status(...)
```

Raw `Response` remains separately allowed as the escape hatch.

## reply.status typing

Body-bearing statuses require a body argument.

Bodyless statuses require no body argument.

Conceptually:

```ts
type ReplyBodyArguments<Body> = [Body] extends [undefined] ? [] : [body: Body];
```

The final implementation may use an equivalent type expression.

`ReplyResult` should use an internal nominal/unique-symbol brand so ordinary structural objects cannot accidentally impersonate a Gelis status result.

## Implicit response inference

Routes without explicit `responses` derive public response contracts from ordinary handler results.

Conceptually:

```text
structured/string/null/other non-undefined value
→ status 200

undefined / void
→ status 204
```

Example:

```ts
() => ({ ok: true });
```

projects to:

```ts
{
  200: {
    ok: boolean;
  };
}
```

Example:

```ts
() => undefined;
```

projects to:

```ts
{
  204: undefined;
}
```

A union:

```ts
() => (condition ? { ok: true } : undefined);
```

projects to:

```ts
{
  200: {
    ok: boolean;
  };

  204: undefined;
}
```

## Implicit raw Response inference

An arbitrary raw `Response` can carry any runtime status and body representation.

Therefore an implicit route whose result can be raw `Response` must not claim:

```text
200: Response
```

as a precise contract.

Without an explicit response declaration, the public response contract becomes conservative/opaque when raw `Response` is part of the handler result.

Conceptually the client sees:

```text
status: number
data: unknown
```

instead of a false status-specific guarantee.

If an explicit response map exists, that explicit public contract remains available even though raw `Response` is still permitted as a documented escape hatch outside managed contract guarantees.

## Typed client contract

Typed-client projection consumes only:

```text
status
wire body
```

For:

```ts
responses: {
  200: User,
  204: undefined,
}
```

the conceptual client result is:

```ts
type Result =
  | {
      status: 200;
      data: UserOutput;
      headers: Headers;
      response: Response;
    }
  | {
      status: 204;
      data: undefined;
      headers: Headers;
      response: Response;
    };
```

The typed client does not need to know:

```text
validation mode
serializer
content type
Schema.Input
runtime finalizer
```

## Type-system performance

Response-contract typing must remain bounded.

Prefer:

```text
small mapped projections
shallow conditional projections
compact RouteRef wire contracts
local response-map inference
```

Avoid:

```text
recursive contract normalization
global union of every route response
large application-root accumulation
serializer implementation types in RouteRef
metadata accumulation in client contracts
```

If compiler benchmarks reveal a conflict between elaborate diagnostic typing and scalable inference, bounded compiler behavior takes priority over decorative diagnostics.

Correct wire types and handler boundary types remain mandatory.

## OpenAPI boundary

Response contracts are designed so their schema and wire metadata can later feed OpenAPI tooling.

However, ordinary compact `RouteRef` contracts do not gain heavy runtime metadata solely for future OpenAPI generation.

The following remain separate concerns:

```text
runtime response execution
public typed-client projection
OpenAPI metadata extraction
```

The subsequent OpenAPI milestone will define how serializable schema metadata is retained or projected when OpenAPI capability is actually requested.

A Standard Schema implementation is not automatically guaranteed to provide enough serializable metadata for OpenAPI.

OpenAPI capability must not contaminate routes that do not enable or consume it.

## Portable runtime boundary

The response architecture remains based on:

```text
Request
Response
Headers
Standard Schema
```

and does not require Bun-specific APIs.

Runtime-specific serializer optimizations may later exist at adapter boundaries only when measurements justify them and portable semantics remain unchanged.

## Implementation acceptance gates

Architecture acceptance does not mean implementation acceptance.

Implementation proceeds through:

```text
correctness implementation
  ↓
type tests
  ↓
runtime tests
  ↓
zero-unused regression
  ↓
runtime microbenchmarks
  ↓
real HTTP benchmarks
  ↓
optimization experiments
  ↓
accept / revise
```

Required correctness coverage includes at least:

```text
contract-only response
validated response
Standard Schema Input → Output transformation
sync response validator
async response validator
validation issues
validator throw
validator rejection
JSON serializer
text serializer
custom content type
bodyless statuses
direct 200
direct 204
reply.status
undeclared managed status on executable route
beforeHandle early bypass
afterHandle pre-validation result
raw Response bypass
onError handling response-contract errors
onError non-recursion
implicit response inference
typed-client wire projection
```

## Performance acceptance requirements

Implementation is not accepted unless:

1. routes without executable response capabilities retain the existing response path;
2. metadata-only `responses` declarations impose no measurable request-time response cost;
3. plain synchronous routes remain synchronous;
4. synchronous response validation remains synchronous;
5. raw `Response` remains a cheap pass-through;
6. explicit JSON serialization does not use generic descriptor interpretation per request;
7. route-plan complexity is justified by measurement rather than speculation;
8. zero-unused regression remains within accepted noise;
9. HTTP performance is verified on realistic response workloads;
10. type-system changes remain healthy under large-route compiler benchmarks.

## Non-goals for v0.1

This milestone does not define:

```text
custom arbitrary serializer callbacks
CBOR
MessagePack
Protocol Buffers
XML codecs
automatic file codecs
automatic stream validation
compression
content negotiation
multiple representations for one status
OpenAPI generation itself
development-only global validation policies
runtime-specific Bun response APIs in portable core
```

These capabilities may be added later through separate architecture when their requirements are understood.

## Architecture freeze

The accepted v0.1 architectural invariants are:

```text
response metadata alone has zero executable response cost

validation is opt-in

validation uses Standard Schema Input → Output semantics

successful validation serializes result.value

contract-only handlers produce Schema.Output

validated handlers produce Schema.Input

clients always observe Schema.Output

schema and serializer are separate concepts

explicit serializers are JSON or text in v0.1

custom content type requires explicit serializer

undefined entry means bodyless response

204 / 205 / 304 cannot have body contracts

raw Response is the HTTP escape hatch

onRequest and beforeHandle early results bypass handler response plans

afterHandle observes pre-validation handler results

response-plan failures integrate with onError

onError results do not recursively re-enter response plans

sync paths remain sync when possible

executable behavior compiles at registration time

no generic descriptor interpretation on every request

plain routes do not pay for response-contract capability

RouteRef carries compact wire types, not runtime implementation detail

typed clients consume status + wire output only

OpenAPI metadata transport is deferred to the dedicated OpenAPI milestone
```

Response Contracts & Serialization Architecture v0.1 is frozen at this checkpoint.

The next phase is correctness implementation, not speculative optimization.
