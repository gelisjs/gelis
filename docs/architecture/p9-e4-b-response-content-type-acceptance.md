# P9-E4-B Response Content-Type Acceptance

Status: ACCEPTED / FROZEN  
Phase: P9-E4  
Branch: `architecture/composition-v0.1`  
Correctness candidate: `5191b86c1660c70a62251fc6f63309d6454197c0`

## Scope

P9-E4 completes the response-side Content-Type requirement of the P9-E architecture without introducing a new response serializer family.

The P9-E4-A architecture freeze established that HTML is a string representation selected with the existing strict text serializer plus an explicit HTML Content-Type:

```ts
responses: {
  200: {
    schema: Html,
    serialize: "text",
    contentType: "text/html; charset=utf-8",
  },
}
```

Gelis v0.1 does not add `serialize: "html"`.

This preserves the accepted separation:

```text
serializer
→ encoding strategy

contentType
→ wire media type metadata
```

## Correctness gate

The candidate added permanent runtime coverage in:

```text
test/runtime/response-content-type.test.ts
```

The gate was executed by the user on Bun 1.4.0 after synchronizing to the candidate.

Observed result:

```text
565 pass
0 fail
1534 expect() calls
Ran 565 tests across 69 files. [1483.00ms]
```

Result: PASS.

## Accepted HTML invariants

1. Managed HTML uses the existing strict `text` serializer.
2. The recommended HTML Content-Type is `text/html; charset=utf-8`.
3. Explicit `contentType` values are preserved as declared; Gelis does not silently append a charset to `text/html`.
4. With `validate: true`, the successful Standard Schema `result.value` is serialized, not the pre-validation handler value.
5. HTML does not introduce a new `serialize` literal in v0.1.
6. Raw `Response` remains the escape hatch for arbitrary response ownership, streaming, binary output, or custom HTTP behavior.
7. Existing JSON/text serializer semantics remain unchanged.
8. No runtime implementation source or public type changed in P9-E4-B.

## Performance disposition

No response runtime implementation or public type changed between the P9-E3-E freeze and the P9-E4-B correctness candidate.

The P9-E4 diff contains only:

```text
docs/architecture/p9-e4-a-response-content-type-freeze.md
test/runtime/response-content-type.test.ts
```

Therefore P9-E4 introduces no candidate runtime/type delta requiring a new performance or TypeScript-scaling acceptance run.

This is not a performance claim. It is a scope determination: there is no changed execution path to benchmark.

## Phase result

P9-E4 is complete.

The response-side P9-E requirement for HTML / SSR-compatible Content-Type semantics is satisfied using the already accepted response serializer architecture.

## Next phase

Proceed to P9-E5: managed request-body AOT transport and tooling projection parity.

P9-E3 deliberately did not enlarge the flat/source AOT artifact. P9-E5 must now determine how managed request-body metadata and executable behavior cross the AOT/tooling boundary while preserving:

- plain-route zero-unused behavior;
- registration-time parser specialization;
- request/runtime semantics already frozen in P9-E2 and P9-E3;
- portable Web Standards core behavior;
- tooling/contract projection of parser and media-type metadata;
- no request-time interpretation of public parser strings.
