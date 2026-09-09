# P9-E3-E — Multipart Request Body Reader Acceptance

Status: **FROZEN / ACCEPTED**  
Phase: P9-E3-E  
Framework: Gelis

## Candidate

Accepted candidate HEAD:

```text
ca471ea9ad803e84f9a62418208dc068cec7bea8
```

Last runtime implementation change:

```text
23ec7aa7a16aab53965375988271dcb0c8e2f747
```

The commits after the runtime implementation change only update the multipart acceptance benchmark to keep the manual comparison semantically equivalent to the accepted v2 decoder.

Frozen regression control:

```text
313adf97932a80b95b1d2e4f0f27039a51e74013
```

The accepted implementation completes the built-in `multipart` reader while preserving the frozen P9-E3-A architecture:

- parser choice is compiled at route registration
- the built-in default accepts `multipart/form-data` by media-type essence
- explicit `bodyContentTypes` replace the default and act as aliases for multipart decoding
- the incoming multipart boundary remains parser-significant
- missing, malformed, or unusable boundary after media admission maps to `400`
- successful decoding retains native Web Standards `File` values
- normalized output is a null-prototype object
- first occurrence stays scalar; repeated field names promote to arrays and preserve per-key order
- repeated fields may mix `string` and `File` values
- bracket and dot notation remain literal field names
- empty names and empty string values are preserved
- custom media aliases retain the original multipart parameters, including the boundary, while decoding with multipart grammar
- body-consumption or decoder rejection maps to `400`
- Standard Schema issues remain `422`
- missing, unsupported, or ambiguous Content-Type remains `415`
- no request-time parser-string dispatch is introduced
- accepted JSON, text, arrayBuffer, and urlencoded reader paths remain unchanged
- managed-body AOT transport remains deferred to P9-E5

## Multipart compatibility implementation

Bun 1.4.0 native multipart parsing drops parts whose parsed field name is empty. Gelis's frozen P9-E3-A normalization contract requires empty field names to remain data.

The accepted implementation therefore performs a narrow compatibility pass before native multipart parsing:

1. consume the request body as bytes
2. parse the declared multipart boundary
3. scan multipart part headers only
4. rewrite only `name=""` header values to a collision-safe internal sentinel
5. pass the resulting bytes to the native `Response.formData()` parser
6. normalize native `string` / `File` entries into the Gelis null-prototype form object
7. map the internal sentinel key back to the empty string

The compatibility pass does not decode file contents or replace the native multipart parser. File payload bytes remain handled by the native parser, and native `File` metadata is retained.

The sentinel is selected so that an actual incoming field name equal to the base sentinel cannot collide with the internal empty-name representation.

## Correctness acceptance

```text
bun run check
562 pass
0 fail
1525 expect() calls
Ran 562 tests across 68 files
```

Correctness coverage includes:

- ordinary text fields
- repeated text fields
- native `File` entries and metadata
- mixed repeated `string` / `File` values
- null-prototype normalization
- literal bracket and dot names
- empty string values
- empty field names
- repeated empty field names
- internal sentinel collision safety
- case-insensitive media essence
- quoted boundary parameters
- custom media aliases
- missing/ambiguous media admission
- missing or unusable boundary
- schema rejection
- query + multipart validation
- request-body consumption rejection

## Existing-path regression acceptance

Runtime environment:

```text
Bun:            1.4.0
CPU:            Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz
Samples:        41 mirrored samples
Routes:         5,000 POST routes
Workers:        4 persistent processes/workload
Orientations:   control/candidate + candidate/control
Pair shape:     semantic ABBA / BAAB
Warmup:         10,000 async app.fetch calls/worker
Measurement:    20,000 async app.fetch calls/measurement
Aggregation:    geometric mean of canonical candidate/control ratios
Gate:           mirrored median candidate/control delta <= +3% per workload
Order buckets:  diagnostic only
```

Results:

```text
plain            +2.63% PASS
query-only       +0.94% PASS
body-json        +0.26% PASS
query-body-json  +0.07% PASS
custom-json      -3.58% PASS
```

All protected workloads passed the frozen `+3%` mirrored-median regression gate. Negative deltas are not treated as performance claims.

## Managed/manual multipart acceptance

The accepted v2 benchmark compares the managed reader with a semantically equivalent manual Gelis route.

Both variants use the same multipart v2 decoder, including the empty-name byte compatibility pass and native FormData parser. The same Standard Schema object is used by both variants; the manual route invokes it explicitly while the managed route invokes it through the Gelis input plan.

Protocol:

```text
Routes:         5,000 POST routes
Samples:        41 mirrored samples
Workers:        4 persistent processes
Orientations:   manual/managed + managed/manual
Pair shape:     semantic ABBA / BAAB
Warmup:         10,000 async app.fetch calls per worker
Measurement:    20,000 async app.fetch calls per measurement
Body source:    stable Request-like object; arrayBuffer() returns Promise.resolve(wire multipart payload)
Decode:         shared multipart v2 byte compatibility pass + native FormData parsing
Payload:        repeated fields plus one empty-name field
Validation:     same Standard Schema object
Aggregation:    geometric mean of canonical managed/manual ratios
Gate:           mirrored median managed/manual delta <= +5%
Order buckets:  diagnostic only
```

Accepted result:

```text
multipart managed/manual  +0.14% PASS
manual-start               -1.96% diagnostic
managed-start              +1.10% diagnostic
```

The accepted conclusion is that the managed multipart reader remains within the predeclared `+5%` framework-overhead gate. Order-specific buckets do not replace the mirrored-median acceptance metric.

## Frozen P9-E3-E invariants

1. `multipart` is an accepted built-in runtime reader.
2. Its built-in media default remains `multipart/form-data`.
3. Multipart boundary remains decoder-significant and must come from incoming request metadata.
4. Missing, malformed, or unusable boundary after media admission remains `400`.
5. Managed multipart output remains a null-prototype object.
6. Repeated names normalize scalar-first then array-on-repeat while preserving per-key order.
7. Repeated multipart fields may mix `string` and native `File` values.
8. Native `File` values and runtime-provided metadata remain intact.
9. Field names remain literal; Gelis adds no implicit bracket, dot, or nested-form coercion.
10. Empty field names and empty string values remain data and must not be dropped.
11. The empty-name compatibility mechanism must remain collision-safe and must not replace the native multipart payload decoder.
12. Custom media aliases reuse multipart decoding grammar and preserve incoming parser-significant parameters.
13. Decoder/body-consumption rejection remains `400`; schema issues remain `422`; unsupported/missing/ambiguous media remains `415`.
14. Reader selection remains registration-time compiled.
15. JSON, text, arrayBuffer, and urlencoded reader execution paths remain unchanged.
16. Plain and query-only zero-unused behavior remains preserved.
17. Existing protected workloads passed the frozen `+3%` mirrored-median regression gate.
18. Managed `multipart` passed the frozen `+5%` managed/manual overhead gate.
19. The TypeScript public contract and scaling gates remain unchanged.
20. Managed-body AOT transport remains deferred to P9-E5.

## P9-E3 completion

P9-E3 is complete. All built-in v0.1 managed request-body readers are now accepted:

```text
json         existing shorthand/default
text         FROZEN / ACCEPTED
arrayBuffer  FROZEN / ACCEPTED
urlencoded   FROZEN / ACCEPTED
multipart    FROZEN / ACCEPTED
```

The next Content-Type architecture phase is P9-E4, which returns to response-side Content-Type ergonomics while preserving raw `Response` as the escape hatch. Managed-body AOT/tooling projection remains deferred to P9-E5.
