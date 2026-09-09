# P10-A Post-P9 OpenAPI Integration Audit

**Status:** AUDIT COMPLETE / IMPLEMENTATION NOT STARTED  
**Phase:** P10-A  
**Date:** 2026-09-09  
**Core branch:** `architecture/composition-v0.1`  
**Core baseline:** post-P9 HTTP Surface Architecture  
**OpenAPI package:** `gelisjs/openapi` `main`

## Purpose

P10 aligns Gelis's frozen post-P9 HTTP contract surface with the official `@gelis/openapi` package.

This phase is an audit only. It does not change runtime semantics, public route APIs, OpenAPI generation behavior, package versions, tags, or release state.

The existing integration boundary remains the starting point:

```text
Gelis application
      ↓
inspectContract(app)
      ↓
ApplicationContractSnapshot
      ↓
@gelis/openapi
      ↓
OpenAPI document
```

The audit asks whether that boundary still carries enough semantic information after P9 and where `@gelis/openapi` is now stale.

---

# 1. Audit inputs

## Gelis core after P9

The current contract snapshot exposes, per route:

```text
method: string
path
query schema
body schema
bodyParser
bodyContentTypes
responses
openapi metadata
```

Compared with the Gelis commit currently pinned by `@gelis/openapi`, the important additions/changes are:

```text
method: HttpMethod → string
bodyParser added
bodyContentTypes added
QUERY added as first-class method
custom method registration added
ALL pseudo-method added
HEAD / OPTIONS / Allow semantics finalized
request body parser/media architecture finalized
response Content-Type architecture finalized
```

The core contract inspection boundary is still semantic and remains outside request execution.

## `@gelis/openapi` current package state

The package currently declares:

```text
@gelis/openapi version: 0.0.0
private: true
OpenAPI target: 3.1.2
JSON Schema dialect: draft 2020-12
Gelis dev dependency pinned to:
e339664bb7574e773450d6f644af484e9da55525
```

Its architecture v0.1 is already frozen around `generateOpenAPI(app, options)` and `inspectContract(app)`.

That architectural boundary remains valuable and should not be replaced merely because the contract surface grew.

---

# 2. Findings summary

| Area | Current alignment | P10 action |
| --- | --- | --- |
| `inspectContract()` boundary | aligned | retain |
| path grammar `/static` + `/:param` | aligned with current grammar | retain until Router Grammar v0.2 |
| ordinary methods GET/POST/PUT/PATCH/DELETE/OPTIONS/HEAD | aligned | retain |
| QUERY | unsupported by package | add projection |
| generic custom HTTP methods | unsupported | add projection |
| ALL pseudo-method | no faithful OpenAPI representation yet | define explicit policy |
| query schema / metadata | substantially aligned | regression audit |
| request body schema | stale JSON-only assumption | redesign projection around parser/media metadata |
| response descriptors / content type | substantially aligned | compatibility regression audit |
| OpenAPI version | frozen at 3.1.2 | define 3.1/3.2 target strategy |
| schema serialization boundary | still sound | retain |
| zero-unused runtime architecture | still sound | retain |
| generation scaling | existing baseline available | rerun after integration |

---

# 3. Method vocabulary gap

## Current Gelis

The first-class convenience method vocabulary is:

```text
GET
POST
PUT
PATCH
DELETE
OPTIONS
HEAD
QUERY
```

Generic `route(method, ...)` may also register other valid HTTP method tokens while preserving literal identity.

Gelis also has the internal/public routing pseudo-method:

```text
*
```

for `all()` matching. It is not an actual HTTP method token.

## Current `@gelis/openapi`

The package currently models only:

```text
GET
POST
PUT
PATCH
DELETE
OPTIONS
HEAD
```

Its path projector has fixed switches for those seven methods.

Updating the package dependency to current Gelis without addressing this would make the method model incomplete and, in some locations, structurally non-exhaustive.

## OpenAPI 3.2 relevance

OpenAPI 3.2 adds two directly relevant Path Item fields:

```text
query
additionalOperations
```

Therefore a full-fidelity 3.2 mapping can naturally be:

```text
Gelis QUERY
→ Path Item.query

Gelis custom method, e.g. PROPFIND
→ Path Item.additionalOperations.PROPFIND
```

This is significantly cleaner than inventing a Gelis-specific extension.

## OpenAPI 3.1 compatibility

The OpenAPI Initiative extension registry defines:

```text
x-oai-additionalOperations
```

for representing additional HTTP operations on OpenAPI versions before 3.2.

That gives P10 a standards-ecosystem compatibility path for both QUERY and generic custom methods when emitting 3.1.x.

## ALL pseudo-method

`all()` is a routing declaration, not a concrete HTTP operation.

It cannot be projected faithfully as one ordinary OpenAPI Operation Object.

P10-B must explicitly choose one of the following families of behavior rather than silently guessing:

```text
A. reject automatic OpenAPI projection for ALL unless excluded
B. require explicit documentation expansion
C. expand to a defined finite method set under explicit policy
```

The audit does not freeze which option wins.

What is already clear is:

> OpenAPI tooling must not silently pretend `ALL` is one HTTP method.

---

# 4. Request body gap

This is the largest post-P9 contract mismatch.

## Current `@gelis/openapi` assumption

The existing request-body projector assumes:

```text
runtime body contract
→ JSON parser
→ application/json by default
```

It rejects explicit non-JSON media metadata when a runtime body schema exists.

That assumption was correct for the older Gelis contract pinned by the package.

It is no longer correct after P9.

## Current Gelis body parser vocabulary

Gelis now supports:

```text
json
text
urlencoded
multipart
arrayBuffer
```

The parser controls decoding grammar.

`bodyContentTypes` controls accepted media aliases.

The contract snapshot preserves:

```text
bodyParser
bodyContentTypes
```

with `bodyContentTypes === undefined` meaning parser defaults.

## Required P10 behavior

Automatic request-body projection must be driven by runtime contract facts, not by an OpenAPI-side assumption that every body is JSON.

Conceptually:

```text
body schema
bodyParser
bodyContentTypes
        ↓
request-body projection policy
        ↓
OpenAPI content map
```

At minimum P10 must cover:

```text
JSON shorthand
custom JSON media type
text/plain
application/x-www-form-urlencoded
multipart/form-data
application/octet-stream
multiple explicit accepted media types
```

## Important separation

Parser grammar and schema serialization remain different concerns.

For example:

```text
multipart parser available at runtime
        ≠
all File-bearing Standard Schemas can automatically become JSON Schema/OpenAPI schemas
```

Likewise:

```text
arrayBuffer parser available at runtime
        ≠
Standard Schema necessarily exposes a portable binary OpenAPI schema
```

Therefore P10 must preserve the existing rule:

> Runtime-capable schema does not imply contract-serializable schema.

Explicit OpenAPI schema metadata and opaque documentation remain valid escape hatches where automatic Standard JSON Schema projection is unavailable.

---

# 5. Response projection status

Response projection is much closer to current Gelis semantics than request-body projection.

The current package already understands response descriptors with:

```text
serialize: json
serialize: text
contentType
bodyless responses
AUTO media classification
explicit OpenAPI media override/conflict detection
```

This aligns with the accepted Gelis response architecture where HTML is represented as text serialization plus an explicit content type rather than a separate HTML serializer.

P10 therefore does not begin by redesigning response projection.

Required work is primarily regression verification against current Gelis:

```text
multiple success statuses
bodyless statuses
json descriptor
text descriptor
custom response content type
HTML-as-text content type
raw/implicit response documentation behavior
```

Any newly discovered mismatch must be treated as a specific P10 issue rather than a reason to reopen the already accepted response architecture wholesale.

---

# 6. Query and path projection status

The existing package already projects ordinary Gelis query schemas and explicit query metadata.

P9's `QUERY` HTTP method is unrelated to URL query-parameter serialization and must not alter existing URL query parameter semantics merely because both use the word "query".

OpenAPI 3.2 also adds a `querystring` parameter location. P10 must not adopt it automatically unless Gelis's runtime query parsing contract actually matches the intended whole-query-string semantics.

Current route grammar remains:

```text
/static
/:requiredParam
```

The existing OpenAPI path conversion:

```text
/users/:id
→ /users/{id}
```

remains acceptable until Router Grammar & Matching v0.2 introduces a shared semantic path representation.

P10 must not preemptively invent a second parser for future grammar constructs.

---

# 7. OpenAPI 3.1.2 vs 3.2.0

## Semantic result

OpenAPI 3.2 is the cleanest native representation for the final P9 method surface because it includes:

```text
query
additionalOperations
```

It is therefore the full-fidelity target for QUERY and generic custom HTTP methods.

## Tooling compatibility result

The ecosystem is not uniformly migrated to 3.2 yet.

Evidence reviewed during this audit includes:

```text
Swagger UI 5.32+ lists OpenAPI 3.2 compatibility.
Redocly tooling has substantial 3.2 support, but some standalone Redoc/build-docs paths still report 3.1-only limitations.
Scalar has 3.2 parser/type work, but its public tracking still shows incomplete package-wide adoption.
OpenAPI Generator's published compatibility table still lists 3.1, not 3.2, as its newest supported OpenAPI line.
```

Therefore selecting only 3.2 immediately would improve semantic fidelity but reduce compatibility with some widely used tooling.

Selecting only 3.1.2 would maximize current compatibility but force QUERY/custom methods into extension form.

## P10-B recommendation

P10-B should evaluate and likely freeze a version-neutral semantic projection with two output targets:

```text
OpenAPI 3.1.2 compatibility target
OpenAPI 3.2.0 full-fidelity target
```

Candidate mapping:

| Gelis method | OAS 3.1.2 | OAS 3.2.0 |
| --- | --- | --- |
| standard fixed method | normal Path Item field | normal Path Item field |
| QUERY | `x-oai-additionalOperations.QUERY` | `query` |
| custom HTTP method | `x-oai-additionalOperations[METHOD]` | `additionalOperations[METHOD]` |
| ALL | explicit policy required | explicit policy required |

The default target is **not frozen by P10-A**.

That decision belongs to P10-B because default-version selection affects public API compatibility and downstream tool behavior.

---

# 8. Core contract boundary decision

P10-A finds no reason to replace `inspectContract()`.

The current snapshot now contains the key P9 request-body and method facts needed by tooling:

```text
method string
body parser
explicit content-type aliases
response contracts
OpenAPI metadata
```

Therefore the preferred architecture remains:

```text
runtime declaration
      ↓
compact semantic contract snapshot
      ├── typed tooling
      ├── OpenAPI 3.1 projection
      └── OpenAPI 3.2 projection
```

OpenAPI must not read:

```text
runtime router nodes
execution flags
AOT artifacts
handler closures
Bun runtime state
```

This preserves zero request-time OpenAPI overhead.

---

# 9. P10 implementation implications

The audit suggests the following sequencing.

## P10-B — version + method projection strategy

Freeze:

```text
3.1/3.2 output policy
public version option/default
QUERY mapping
custom-method mapping
ALL behavior
ordering/collision rules
```

## P10-C — post-P9 contract serialization completeness

Define automatic serialization rules for:

```text
bodyParser
bodyContentTypes
request-body content maps
parser defaults
non-serializable body schemas
response content-type parity
```

## P10-D — `@gelis/openapi` integration update

Only after B/C freezes:

```text
update Gelis dependency
implement version-aware projection
implement managed request-body projection
add current-contract tests
```

## P10-E — correctness + provider compatibility

Retest at least:

```text
Zod
ArkType
Valibot
```

plus method/media coverage introduced by P9.

## P10-F — generation scalability

Reuse/extend the existing:

```text
100
1000
5000 routes
```

generation benchmark and establish gates before measurement.

## P10-G — zero-runtime-overhead verification

Confirm that merely enabling contract/OpenAPI metadata still does not enter request execution.

## P10-H — public API/docs freeze

Freeze the package contract only after all preceding gates pass.

Release remains a separate maintainer-authorized process.

---

# 10. External references reviewed

OpenAPI Specification 3.2.0:

```text
https://spec.openapis.org/oas/v3.2.0.html
```

OpenAPI Initiative extension registry for pre-3.2 additional operations:

```text
https://spec.openapis.org/registry/extension/x-oai-additionalOperations
```

Swagger UI compatibility table:

```text
https://github.com/swagger-api/swagger-ui
```

OpenAPI Generator compatibility table:

```text
https://github.com/OpenAPITools/openapi-generator
```

Scalar OpenAPI 3.2 tracking:

```text
https://github.com/scalar/scalar/issues/6715
```

Redocly OpenAPI 3.2 status and documentation:

```text
https://redocly.com/blog/openapi-3-2
https://redocly.com/docs/cli/commands/build-docs
```

---

# 11. P10-A verdict

```text
P10-A AUDIT COMPLETE
```

Accepted conclusions:

1. `inspectContract()` remains the correct Gelis → OpenAPI integration boundary.
2. `@gelis/openapi` is stale against post-P9 method and managed request-body semantics.
3. Response projection is substantially aligned and should be regression-tested rather than redesigned by default.
4. OpenAPI 3.2 provides native semantics for Gelis QUERY and custom methods.
5. Tooling compatibility still justifies retaining an OpenAPI 3.1.x projection path.
6. P10-B must freeze output-version/default policy and method mapping before implementation.
7. P10-C must freeze parser/media → request-body projection rules before implementation.
8. No runtime/core request-path change is justified by this audit.
9. No package release action is authorized by this audit.
