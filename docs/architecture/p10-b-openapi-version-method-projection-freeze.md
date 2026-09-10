# P10-B OpenAPI Version + Method Projection Freeze

**Status:** ACCEPTED / FROZEN  
**Phase:** P10-B  
**Date:** 2026-09-09  
**Parent audit:** `p10-a-post-p9-openapi-integration-audit.md`

## Purpose

This document freezes the OpenAPI output-version and HTTP-method projection strategy before `@gelis/openapi` implementation changes begin.

It does not change Gelis runtime behavior.

The design must preserve:

```text
inspectContract() semantic boundary
zero request-time OpenAPI overhead
deterministic generation
current route grammar boundary
current schema-serialization boundary
```

---

# 1. Output versions

P10-B accepts two output targets:

```text
OpenAPI 3.1.2
OpenAPI 3.2.0
```

The default remains:

```text
3.1.2
```

Reason:

- it preserves the previously accepted package default;
- it currently has broader downstream codegen/rendering interoperability;
- OpenAPI Generator still advertises 3.1, not 3.2, as its newest supported specification line;
- some 3.2 documentation/rendering ecosystems are still completing adoption.

OpenAPI 3.2.0 is the **full-fidelity method target** for Gelis because it natively defines:

```text
Path Item.query
Path Item.additionalOperations
```

Therefore the product position is:

```text
3.1.2 = compatibility output
3.2.0 = full-fidelity output
```

This is not two independent generators.

---

# 2. Public version API direction

`generateOpenAPI()` gains an optional output-version selection conceptually equivalent to:

```ts
interface OpenAPIGenerationOptions {
  readonly version?: "3.1.2" | "3.2.0";
  // existing fields remain
}
```

Omitting `version` means:

```text
3.1.2
```

The existing exported `OPENAPI_VERSION` public constant must not silently change meaning during P10.

It remains the default-version constant representing:

```text
3.1.2
```

P10 implementation may add a separate 3.2 constant and an `OpenAPIVersion` union, but it must not reinterpret the old constant as a moving "latest" value.

The JSON Schema dialect remains:

```text
https://json-schema.org/draft/2020-12/schema
```

for both P10 targets unless a later explicit architecture phase changes the schema dialect policy.

---

# 3. Version-neutral semantic projection

The generator must not duplicate route/schema projection separately for 3.1 and 3.2.

Preferred architecture:

```text
ApplicationContractSnapshot
          ↓
version-neutral semantic operation projection
          ↓
┌────────────────────┬────────────────────┐
│ OAS 3.1.2 encoder  │ OAS 3.2.0 encoder  │
└────────────────────┴────────────────────┘
```

The semantic operation model is keyed by the actual Gelis HTTP method string.

Path/query/body/response/schema work occurs before version-specific method-field encoding where practical.

Version-specific logic should be limited to representation differences that actually come from the OpenAPI target.

This avoids:

```text
duplicated schema conversion
duplicated collision logic
divergent response projection
divergent metadata behavior
```

---

# 4. Standard method mapping

For both 3.1.2 and 3.2.0, these Gelis methods map to ordinary Path Item fields:

| Gelis method | Path Item field |
| ------------ | --------------- |
| GET          | `get`           |
| POST         | `post`          |
| PUT          | `put`           |
| PATCH        | `patch`         |
| DELETE       | `delete`        |
| OPTIONS      | `options`       |
| HEAD         | `head`          |

Existing deterministic behavior and operation collision detection remain.

---

# 5. QUERY mapping

## OpenAPI 3.2.0

Exact Gelis method:

```text
QUERY
```

maps to:

```text
Path Item.query
```

This is the canonical/full-fidelity representation.

## OpenAPI 3.1.2

OpenAPI 3.1 has no fixed `query` operation field.

Gelis QUERY maps to the OpenAPI Initiative registered extension:

```text
x-oai-additionalOperations:
  QUERY: <Operation Object>
```

This preserves the operation in compatibility documents without inventing a Gelis-specific extension.

Consumers that ignore extensions may not understand the QUERY operation. That limitation must be documented.

---

# 6. Generic custom HTTP methods

A generic Gelis method such as:

```text
PROPFIND
```

is not dropped.

## OpenAPI 3.2.0

It maps to:

```text
additionalOperations:
  PROPFIND: <Operation Object>
```

## OpenAPI 3.1.2

It maps to:

```text
x-oai-additionalOperations:
  PROPFIND: <Operation Object>
```

The exact Gelis method token/capitalization is preserved in the map key.

Only exact uppercase `QUERY` maps to the OpenAPI 3.2 fixed `query` field.

A differently cased/custom token remains an additional operation because Gelis generic route registration preserves custom token identity.

---

# 7. ALL pseudo-method policy

Gelis:

```ts
app.all(...)
```

uses the internal routing method:

```text
*
```

This means "match all eligible HTTP methods" at runtime.

It is not one actual HTTP method and cannot be represented faithfully by one OpenAPI Operation Object.

P10-B therefore freezes **fail-closed automatic projection**.

If an `ALL` route reaches automatic OpenAPI projection, generation must report a deterministic issue equivalent to:

```text
OPENAPI_ALL_METHOD_UNREPRESENTABLE
```

and generation remains all-or-error under the existing package error model.

The route can be intentionally omitted with:

```ts
openapi: false;
```

P10 v0.1 does **not** automatically expand `ALL` into a finite list of methods.

Reason:

```text
ALL may match methods beyond the first-class convenience set
finite expansion would be incomplete
silent expansion could contradict explicit routes and runtime precedence
```

A future explicit documentation-expansion feature may reopen this rule, but it is not part of P10 v0.1.

---

# 8. Deterministic ordering

Path ordering remains lexicographic as already accepted.

Within one path, semantic method ordering is frozen as:

```text
GET
POST
PUT
PATCH
DELETE
OPTIONS
HEAD
QUERY
custom methods lexicographically
```

The exact JSON object field order is a deterministic implementation concern, not an HTTP semantic claim.

For 3.2:

```text
QUERY uses the fixed `query` field
custom operations are inserted into `additionalOperations`
```

For 3.1:

```text
QUERY and custom operations are inserted into `x-oai-additionalOperations`
```

Keys inside additional-operation maps are deterministic:

```text
QUERY first when present
then custom method strings lexicographically
```

---

# 9. Collision rules

Existing operation collision and `operationId` collision rules remain applicable across the expanded method vocabulary.

The semantic projection stage owns collision detection before version encoding.

Required invariants:

```text
same projected path + same exact method
→ collision/error

same operationId across any method
→ collision/error

QUERY and custom methods participate in the same collision model
```

Version encoding must not create a second, weaker collision system.

---

# 10. Issue typing

The current `OpenAPIGenerationIssue.method` type is limited to the old seven-method OpenAPI union.

That is no longer sufficient after P9.

P10 implementation must allow issue records to preserve the actual Gelis method string, including:

```text
QUERY
custom methods
*
```

The exact public TypeScript representation may be `string` or an equivalent bounded type that preserves custom method reporting.

It must not lie by coercing custom methods into the old seven-method union.

---

# 11. Metadata and execution boundaries

Selecting OpenAPI 3.2 does not change runtime route behavior.

Version selection is tooling-only state.

It must not:

```text
change route registration
change router method matching
change request validation
change response serialization
change AOT runtime artifacts
add request-time version checks
```

`generateOpenAPI()` remains an explicit tooling operation.

---

# 12. Compatibility interpretation

OpenAPI 3.1.2 output is intentionally conservative for ecosystem compatibility.

It may contain:

```text
x-oai-additionalOperations
```

when Gelis routes use QUERY/custom methods.

A consumer that ignores the registered extension can still process ordinary standard operations, but it may omit those additional methods.

Users requiring native standard representation of QUERY/custom operations should select:

```text
3.2.0
```

The package documentation must state this explicitly.

---

# 13. P10-B correctness requirements

Implementation must eventually test at minimum:

```text
3.1 default remains unchanged for ordinary GET route
explicit 3.2 root version
QUERY → 3.1 extension
QUERY → 3.2 query field
custom method → 3.1 extension
custom method → 3.2 additionalOperations
multiple custom methods deterministic ordering
QUERY + custom methods on same path
operationId collision involving QUERY/custom method
ALL route fails generation
ALL + openapi:false is excluded cleanly
ordinary method projection regression
3.1/3.2 semantic operation content equivalence apart from encoding shape
```

These tests are correctness gates, not benchmark gates.

---

# 14. Performance/type disposition

P10-B is architecture only.

No request runtime path changes are authorized.

Generation performance gates will be frozen later before measurement.

The version-neutral semantic model must avoid obvious double-generation work, but no implementation optimization is accepted without measurement.

---

# 15. External basis

OpenAPI 3.2 Path Item definitions:

```text
https://spec.openapis.org/oas/v3.2.0.html
```

Registered pre-3.2 additional-operation extension:

```text
https://spec.openapis.org/registry/extension/x-oai-additionalOperations
```

Tooling compatibility evidence reviewed in P10-A includes:

```text
Swagger UI 5.32+ OpenAPI 3.2 compatibility
OpenAPI Generator compatibility currently through 3.1
Scalar 3.2 adoption tracking
Redocly mixed/full 3.2 support across products
```

---

# 16. Freeze decision

The following is now frozen for P10 v0.1:

```text
OpenAPI 3.1.2 remains default compatibility output
OpenAPI 3.2.0 is supported as explicit full-fidelity output
one version-neutral semantic projection feeds both encoders
QUERY maps natively to 3.2 `query`
QUERY maps to registered extension in 3.1
custom methods map to 3.2 `additionalOperations`
custom methods map to registered extension in 3.1
ALL fails closed unless excluded with openapi:false
actual Gelis method identity is preserved in generation issues
no request-time OpenAPI/version overhead is introduced
```

Therefore:

```text
P10-B ACCEPTED / FROZEN
```

Next:

```text
P10-C — post-P9 request-body/media contract serialization freeze
```
