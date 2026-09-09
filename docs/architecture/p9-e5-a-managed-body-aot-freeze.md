# P9-E5-A Managed Request-Body AOT & Tooling Architecture Freeze

Status: ACCEPTED ARCHITECTURE / IMPLEMENTATION PENDING  
Phase: P9-E5  
Branch: `architecture/composition-v0.1`  
Frozen control before P9-E5 implementation: `f2d2666e0c38c39a29d13163da597676c0d9637c`

## Purpose

P9-E5 closes the AOT/tooling gap deliberately left open by P9-E2 and P9-E3.

Normal runtime registration already compiles managed request-body behavior into `RuntimeInputPlan` at route registration. The flat/source AOT pipeline, however, is currently plain-route only:

- the semantic route plan records only method/path/plain flags;
- the flat artifact stores topology only;
- generated source carries only route handlers;
- flat runtime binding reconstructs routes with `input: undefined`;
- source analysis rejects route overloads with options.

P9-E5 adds managed request-body parity without turning Standard Schema objects or parser functions into serialized artifact data.

## Core architecture decision

The flat AOT artifact remains **topology-only**.

It continues to transport:

```text
method
path
route order
router topology
shape fingerprint
```

It does **not** transport:

```text
Standard Schema objects
runtime parser functions
RuntimeInputPlan objects
OpenAPI schema/capability references
handler functions
```

Those values remain source/runtime bindings because they may contain JavaScript object identity, functions, closures, or other non-JSON capabilities.

Therefore `FLAT_AOT_ARTIFACT_VERSION` does not change merely to add managed request bodies.

For identical route topology, the flat artifact JSON must remain identical regardless of whether a route is plain or has a managed request-body binding.

## Why schemas stay out of the artifact

A Standard Schema is a runtime capability object. Its `~standard.validate` member may be a function and may carry library-specific identity or closure state.

Serializing it into the flat JSON artifact would either:

1. be impossible for general schemas;
2. lose identity/behavior;
3. require framework-specific schema serialization;
4. turn Standard Schema into a codec/build protocol, which Gelis explicitly does not assume.

P9-E5 therefore treats the generated source module as the correct transport for live capability references.

## Generated-source sidecar model

Existing plain AOT source keeps its handler array:

```text
handlers[routeIndex]
```

Managed request-body routes add an **optional route-input binding sidecar** indexed by the same stable route index:

```text
inputBindings[routeIndex]
```

The sidecar exists only when at least one eligible managed-body route exists in the compilation.

Plain-only generated modules must not allocate this sidecar.

Conceptually:

```ts
interface FlatAotManagedInputBinding {
  readonly handler: RuntimeRouteHandler;
  readonly input: RuntimeInputPlan;
  readonly contractMetadata?: RuntimeRouteContractMetadata;
}
```

The exact internal representation may be object/tuple based, but the semantic contents are frozen.

A plain route continues to use only the existing handler array entry.

A managed-body route uses the sidecar entry as the authoritative runtime binding for its handler + compiled input plan.

## Declaration-time capture semantics

Managed options must be captured at the original route declaration position, not deferred until the final installer call.

This preserves JavaScript evaluation semantics.

For an original call conceptually shaped as:

```ts
app.post(path, optionsExpression, handlerExpression);
```

JavaScript evaluates:

```text
options expression
→ handler expression
→ route registration / input-plan compilation
```

The generated AOT replacement must preserve that ordering.

The preferred generated shape is conceptually:

```ts
inputBindings[index] = captureManagedInput(
  optionsExpression,
  handlerExpression,
);
```

where function arguments preserve options-before-handler evaluation and the capture helper compiles the input plan only after both expressions have evaluated.

This avoids a semantic bug where deferred installation could observe an options object after later mutation.

## Managed-input capture helper

The capture helper is runtime/internal tooling support, not a public route API.

It must:

1. receive the original route options and handler;
2. reject unsupported non-input executable capabilities in the P9-E5 source-AOT subset;
3. call the same `createRuntimeInputPlan()` compiler used by normal registration;
4. require the resulting plan to contain a managed body;
5. preserve the handler reference;
6. clone/preserve supported contract metadata at the same semantic boundary as normal registration.

P9-E5 must not create a second parser compiler.

The generated AOT path and normal registration path must converge on the same `RuntimeInputPlan` implementation.

## Source-AOT eligibility for P9-E5

P9-E5 extends the current static source-AOT subset incrementally.

### Eligible convenience route

Conceptually:

```ts
app.post(
  "/messages",
  {
    body: Body,
    bodyParser: "text",
    bodyContentTypes: ["text/plain"],
  },
  handler,
);
```

### Eligible generic route

Conceptually:

```ts
app.route(
  "QUERY",
  "/search",
  {
    body: Body,
    bodyParser: "json",
  },
  handler,
);
```

### Allowed option keys in the P9-E5 managed-body AOT subset

```text
query
body
bodyParser
bodyContentTypes
openapi
```

`body` is required for this new AOT subset.

A managed-body route may also declare `query`; this supports the already accepted query+body `RuntimeInputPlan` path.

`openapi` is allowed because contract/tooling metadata must not disappear merely because a managed route is AOT compiled.

### Deferred options

The following remain outside the P9-E5 managed-body AOT subset:

```text
responses
route lifecycle argument
request scope
module request scope
other future executable route capabilities
```

They require their own AOT parity work and correctness/performance gates.

P9-E5 must not silently accept an option and then drop its behavior.

### Static analyzability rule

The managed-body AOT options argument must be a directly analyzable object literal in v0.1.

The analyzer must reject ambiguous shapes such as:

```text
spread properties
computed property names
unknown option keys
options supplied only through an opaque identifier/expression
```

Schema values themselves may be identifiers or arbitrary ordinary expressions because the generated source preserves and evaluates those expressions; Gelis does not serialize their contents.

This restriction is intentionally conservative. It is preferable to reject an AOT source shape than to compile it while silently losing route semantics.

## Runtime binding specialization

The flat runtime installer must retain a dedicated plain-only path.

Conceptually:

```text
no input sidecar
→ existing plain bind loop

input sidecar present
→ managed/mixed bind loop
```

Do not put a per-route managed-input check into the plain-only bind loop merely because P9-E5 exists.

This is startup-time specialization, not request-time dispatch.

For a managed route, the installed runtime record must be semantically equivalent to normal registration:

```text
flags includes RUNTIME_ROUTE_INPUT
input points to the captured RuntimeInputPlan
beforeHandle undefined
 afterHandle undefined
responses undefined
optional supported contract metadata preserved
```

After installation, normal Gelis route execution consumes the same input plan and route flags as non-AOT registration.

There must be no AOT-specific request-body parser branch in the request hot path.

## Tooling contract projection

`inspectContract()` must expose managed-body parser metadata that P9-E2 deliberately retained on `RuntimeInputPlan`.

`ContractRouteSnapshot` gains conceptual fields:

```ts
readonly bodyParser: RequestBodyParser | undefined;
readonly bodyContentTypes: readonly string[] | undefined;
```

Semantics:

- no managed body → both undefined;
- `{ body: schema }` shorthand → `bodyParser === "json"`;
- explicit parser → effective parser value;
- default parser media types → `bodyContentTypes === undefined`;
- explicit media list → normalized/deduplicated essence list retained by the compiled input plan.

This projection is inspection-time/tooling data. It must not add request-time work.

Normal registration and AOT-installed routes must produce equivalent contract snapshots for the same managed request declaration.

## Artifact and fingerprint invariants

P9-E5 freezes these rules:

1. flat artifact version remains unchanged while topology representation is unchanged;
2. managed schema/parser capabilities do not enter artifact JSON;
3. route index remains the join key between topology, handlers, and optional input bindings;
4. the existing shape fingerprint remains method + path + order;
5. input binding changes do not require a topology fingerprint change because they are generated source bindings, analogous to handler implementation changes;
6. artifact/binding route-count and fingerprint validation remain mandatory.

## Request semantics invariants

AOT must preserve all frozen P9-E2/P9-E3 behavior:

- JSON shorthand defaults;
- custom JSON media aliases;
- text;
- URL-encoded;
- multipart including empty-name compatibility;
- arrayBuffer;
- case-insensitive media essence matching;
- explicit media list replacement semantics;
- ambiguous combined Content-Type rejection;
- 415 unsupported media type;
- 400 malformed representation;
- 422 schema failure;
- one reader→validation Promise continuation policy;
- registration/capture-time parser selection;
- no request-time interpretation of public parser strings.

## Correctness acceptance gate

Before performance measurement:

```text
bun run check
```

must report:

```text
0 fail
```

Permanent P9-E5 tests must cover at minimum:

1. plain AOT remains supported;
2. JSON shorthand AOT;
3. explicit custom JSON media type AOT;
4. text AOT;
5. URL-encoded AOT;
6. multipart AOT including an empty field name;
7. arrayBuffer AOT;
8. query + managed body AOT;
9. wrong/missing media 415;
10. malformed accepted representation 400;
11. schema failure 422;
12. normal vs AOT `inspectContract()` parser/media metadata parity;
13. supported OpenAPI metadata survives AOT binding;
14. responses/lifecycle/unknown option shapes are rejected rather than ignored;
15. declaration-time options/handler evaluation ordering is preserved;
16. mutation after a route declaration cannot retroactively change the captured input plan.

No performance benchmark may be used to accept a candidate with a failing correctness gate.

## Performance controls and gates

Performance gates are frozen before implementation results.

### Frozen controls

P9-E5 implementation control:

```text
f2d2666e0c38c39a29d13163da597676c0d9637c
```

If P9-E5 modifies shared normal request-body execution code, cumulative P9-E3 regression protection also remains anchored to the existing pre-E3 control:

```text
313adf97932a80b95b1d2e4f0f27039a51e74013
```

That cumulative control must not be silently replaced by a later, slower checkpoint.

### Plain AOT zero-unused gate

Use 5,000 routes and fresh-process sampling consistent with the existing AOT benchmark discipline.

Required profiles:

```text
static
trailing
mixed-balanced
```

Minimum samples:

```text
31 per profile/orientation
```

Candidate versus frozen P9-E5 control:

```text
geometric-mean ready-time regression <= +3%
per-profile ready-time regression     <= +5%
geometric-mean first-fetch regression <= +3%
per-profile first-fetch regression    <= +7%
RSS regression                         <= +5% per profile
```

First-fetch order/profile buckets are diagnostic; the canonical decision uses the frozen aggregate rules above.

Negative deltas are no-regression evidence, not speedup claims.

### Artifact zero-unused gate

For identical plain topology:

```text
artifact JSON bytes: exactly unchanged
artifact version:    exactly unchanged
```

A plain-only source compilation must not emit or allocate the managed-input sidecar.

### Managed AOT request-path parity gate

After correctness passes, compare AOT-installed versus normal-registration routes using equivalent schemas, request bytes, parser metadata, and route topology.

Required representative workloads:

```text
JSON shorthand
query + JSON
multipart
```

Protocol:

```text
5,000 routes
41 mirrored samples
4 persistent processes/workload
both orientations
semantic ABBA / BAAB
10,000 warmup app.fetch calls/worker
20,000 measured calls/measurement
Bun.gc(true) within the measured worker discipline
canonical ratio = geometric mean of mirrored candidate/control medians
```

Gate:

```text
AOT-installed / normal-registration request delta <= +3% per workload
```

Because both paths should converge on the same runtime plan, a larger request penalty is an architecture failure, not an acceptable AOT tax.

### Managed AOT startup usefulness gate

For 5,000 managed JSON routes, fresh-process module-ready measurement must show:

```text
AOT ready / normal-registration ready <= 1.05x
```

P9-E5 does not require a speedup claim, but AOT support must not make managed-route startup materially worse than simply registering those routes normally.

### TypeScript scaling disposition

P9-E5 must not add parser/media metadata to route generics.

If implementation keeps the existing public route generic surface unchanged, the existing P9-E2 TypeScript scaling acceptance remains authoritative and `bun run check` is sufficient for the P9-E5 type surface.

If any candidate changes `RouteOptionsFor`, `RouteRef`, handler inference, or another route-level generic, the frozen P9-E2 100→5000 scaling gates must be rerun before acceptance.

## Rejected architecture directions

### Serialize Standard Schema into the JSON artifact

Rejected because Standard Schema objects may contain functions/identity and are not a portable data format.

### Store public parser strings in the artifact and interpret them per request

Rejected because parser selection is already frozen as registration-time compiled behavior.

### Defer reading mutable route options until final AOT installation

Rejected because it can observe mutations that normal registration would not observe.

### Add an input-sidecar allocation to every plain AOT application

Rejected by zero-unused architecture.

### Accept arbitrary route options and ignore unsupported keys

Rejected because AOT must fail closed when it cannot preserve semantics.

## Implementation sequence

P9-E5 proceeds in this order:

```text
P9-E5-A  architecture + gates freeze              ← this document
P9-E5-B  contract/tooling parser metadata parity
P9-E5-C  managed-input source capture + binding
P9-E5-D  AOT correctness/equivalence suite
P9-E5-E  plain zero-unused + managed AOT perf gates
P9-E5-F  acceptance freeze
```

The gates above must not be relaxed after candidate results are observed.
