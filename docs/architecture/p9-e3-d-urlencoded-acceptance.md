# P9-E3-D — URL-Encoded Request Body Reader Acceptance

Status: **FROZEN / ACCEPTED**  
Phase: P9-E3-D  
Framework: Gelis

## Candidate

Accepted candidate HEAD:

```text
733056313b6139c3b6b312652ea8a99da44c2918
```

Frozen regression control:

```text
313adf97932a80b95b1d2e4f0f27039a51e74013
```

The accepted implementation adds the built-in `urlencoded` reader while preserving the frozen P9-E3-A architecture:

- parser choice is compiled at route registration
- the built-in default accepts exactly `application/x-www-form-urlencoded` by media-type essence
- explicit `bodyContentTypes` replace the default and act as aliases for URL-encoded decoding
- successful body consumption uses Web `Request.text()` semantics
- URL-encoded parsing uses `URLSearchParams`, preserving Web form semantics such as `+` to SPACE and forgiving malformed percent triplets
- normalized output is a null-prototype object
- first occurrence stays scalar; repeated field names promote to arrays and preserve per-key order
- bracket and dot notation remain literal field names
- empty names and values are preserved
- no automatic string-to-number/boolean coercion is introduced
- body-consumption rejection maps to `400`
- Standard Schema issues remain `422`
- missing, unsupported, or ambiguous Content-Type remains `415`
- no request-time parser-string dispatch is introduced
- accepted JSON, text, and arrayBuffer hot paths remain unchanged
- `multipart` remains deferred
- managed-body AOT transport remains deferred to P9-E5

## Correctness acceptance

```text
bun run check
554 pass
0 fail
1507 expect() calls
Ran 554 tests across 67 files
```

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
plain            +1.46% PASS
query-only       -9.37% PASS
body-json        +0.32% PASS
query-body-json  -0.97% PASS
custom-json      -0.72% PASS
```

All protected workloads passed the frozen `+3%` mirrored-median regression gate. Negative deltas are not treated as performance claims.

## Managed/manual urlencoded acceptance

Protocol:

```text
Routes:         5,000 POST routes
Samples:        41 mirrored samples
Workers:        4 persistent processes
Orientations:   manual/managed + managed/manual
Pair shape:     semantic ABBA / BAAB
Warmup:         10,000 async app.fetch calls per worker
Measurement:    20,000 async app.fetch calls per measurement
Body source:    stable Request-like object; text() returns Promise.resolve(form payload)
Decode:         URLSearchParams + null-prototype scalar/array normalization
Aggregation:    geometric mean of canonical managed/manual ratios
Gate:           mirrored median managed/manual delta <= +5%
```

Accepted result:

```text
urlencoded managed/manual  -0.65% PASS
```

The negative delta is not accepted as evidence that managed `urlencoded` is intrinsically faster than the manual route. The accepted conclusion is only that the managed reader does not exceed the predeclared `+5%` framework-overhead gate.

## Frozen P9-E3-D invariants

1. `urlencoded` is an accepted built-in runtime reader.
2. Its built-in media default remains exactly `application/x-www-form-urlencoded`.
3. Body consumption uses Web `Request.text()` semantics and parsing uses Web-compatible `URLSearchParams` behavior.
4. Malformed percent triplets such as `%ZZ` remain form data rather than becoming automatic `400` errors.
5. Repeated names normalize scalar-first then array-on-repeat while preserving per-key order.
6. Managed form objects use a null prototype.
7. Bracket and dot syntax remain literal field names; Gelis adds no nesting or coercion policy.
8. Custom media aliases reuse URL-encoded decoding grammar and replace the built-in media default.
9. Decoder rejection remains `400`; schema issues remain `422`; unsupported/missing/ambiguous media remains `415`.
10. Reader selection remains registration-time compiled.
11. JSON, text, and arrayBuffer reader execution paths remain unchanged.
12. Plain and query-only zero-unused behavior remains preserved.
13. Existing protected workloads passed the frozen `+3%` mirrored-median regression gate.
14. Managed `urlencoded` passed the frozen `+5%` managed/manual overhead gate.
15. The TypeScript public contract and scaling gates remain unchanged.
16. Managed-body AOT transport remains deferred to P9-E5.

## Next step — P9-E3-E

Implement and validate the built-in `multipart` reader next.

The frozen multipart semantics remain:

- default media type: `multipart/form-data`
- boundary parameter is required and parser-significant
- missing, malformed, or unusable boundary after accepted media admission maps to `400`
- repeated text/file fields normalize scalar-first / array-on-repeat
- normalized object uses a null prototype
- native `File` values and metadata are preserved
- custom media aliases still use multipart decoding grammar, with the incoming boundary parameter retained
- protected-path regression gate remains `<= +3%`
- managed/manual multipart gate remains `<= +5%`
