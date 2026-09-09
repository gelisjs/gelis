# P9-E3-C — ArrayBuffer Request Body Reader Acceptance

Status: **FROZEN / ACCEPTED**  
Phase: P9-E3-C  
Framework: Gelis

## Candidate

Accepted candidate HEAD:

```text
d7d697d7c9eab14264a659694aa3a09aa595b028
```

Frozen regression control:

```text
313adf97932a80b95b1d2e4f0f27039a51e74013
```

The accepted implementation adds the built-in `arrayBuffer` reader while preserving the frozen P9-E3-A architecture:

- parser choice is compiled at route registration
- the built-in default accepts exactly `application/octet-stream` by media-type essence
- explicit `bodyContentTypes` replace the default and act as aliases for binary decoding
- successful decoding uses Web `Request.arrayBuffer()` semantics
- an empty body produces a zero-length `ArrayBuffer`
- body-consumption rejection maps to `400`
- Standard Schema issues remain `422`
- missing, unsupported, or ambiguous Content-Type remains `415`
- no request-time parser-string dispatch is introduced
- the accepted JSON and text hot paths remain unchanged
- `urlencoded` and `multipart` remain deferred
- managed-body AOT transport remains deferred to P9-E5

## Correctness acceptance

```text
bun run check
542 pass
0 fail
1489 expect() calls
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
plain            +0.89% PASS
query-only       +0.46% PASS
body-json        -0.48% PASS
query-body-json  +1.30% PASS
custom-json      +2.23% PASS
```

All protected workloads passed the frozen `+3%` mirrored-median regression gate.

## Managed/manual arrayBuffer acceptance

Protocol:

```text
Routes:         5,000 POST routes
Samples:        41 mirrored samples
Workers:        4 persistent processes
Orientations:   manual/managed + managed/manual
Pair shape:     semantic ABBA / BAAB
Warmup:         10,000 async app.fetch calls/worker
Measurement:    20,000 async app.fetch calls/measurement
Body source:    stable Request-like object; arrayBuffer() returns Promise.resolve(payload)
Aggregation:    geometric mean of canonical managed/manual ratios
Gate:           mirrored median managed/manual delta <= +5%
```

Accepted result:

```text
arrayBuffer managed/manual  -4.92% PASS
```

The negative delta is not accepted as evidence that managed `arrayBuffer` is intrinsically faster than the manual route. The accepted conclusion is only that the managed reader does not exceed the predeclared `+5%` framework-overhead gate.

## Frozen P9-E3-C invariants

1. `arrayBuffer` is an accepted built-in runtime reader.
2. Its built-in media default remains exactly `application/octet-stream`.
3. Decoding uses Web `Request.arrayBuffer()` semantics and preserves bytes.
4. Empty binary bodies produce zero-length `ArrayBuffer` values.
5. Custom media aliases reuse binary decoding grammar and replace the built-in media default.
6. Decoder rejection remains `400`; schema issues remain `422`; unsupported/missing/ambiguous media remains `415`.
7. Reader selection remains registration-time compiled.
8. JSON and text reader execution paths remain unchanged.
9. Plain and query-only zero-unused behavior remains preserved.
10. Existing protected workloads passed the frozen `+3%` mirrored-median regression gate.
11. Managed `arrayBuffer` passed the frozen `+5%` managed/manual overhead gate.
12. The TypeScript public contract and scaling gates remain unchanged.
13. Managed-body AOT transport remains deferred to P9-E5.

## Next step — P9-E3-D

Implement and validate the built-in `urlencoded` reader next.

The frozen URL-encoded semantics remain:

- default media type: `application/x-www-form-urlencoded`
- Web form decoding behavior, including `+` as SPACE and forgiving malformed percent triplets
- repeated field names preserved then normalized scalar-first / array-on-repeat
- null-prototype normalized object
- literal field names; no bracket/dot nesting coercion
- custom media aliases still use URL-encoded decoding grammar
- protected-path regression gate remains `<= +3%`
- managed/manual URL-encoded gate remains `<= +5%`
