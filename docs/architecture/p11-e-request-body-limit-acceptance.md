# P11-E Request / Body Limit Acceptance

**Status:** COMPLETE  
**Date:** 2026-09-10  
**Repository:** `gelisjs/gelis`  
**Public owner:** `gelis/body-limit`

## Purpose

P11-E adds a production request-body limiting capability without introducing a universal request wrapper, weakening Gelis-managed input semantics, or trusting `Content-Length` as an authoritative body-size signal.

The accepted design keeps the policy pay-for-use and specializes managed body readers at configuration time while preserving explicit raw-reader support and Web Standards portability.

## Final phase tree

```text
P11-E  Request / Body Limit                    COMPLETE
├── E1   architecture/API/performance freeze   FROZEN
├── E2   bounded byte reader + 413 semantics   ACCEPTED
├── E3   route specialization                  ACCEPTED
├── E4   application capability                ACCEPTED
├── E5   raw capability reader                 ACCEPTED
├── E6   parser + multipart parity             ACCEPTED
├── E7   type/package boundary                 ACCEPTED
├── E8   AOT preservation                      ACCEPTED
├── E9   zero-unused acceptance                ACCEPTED
├── E10  enabled competitor acceptance         ACCEPTED
├── E11  request-time route-scale acceptance   ACCEPTED
├── E12  full quality gate                     ACCEPTED
└── E13  acceptance documentation              ACCEPTED
```

## Accepted capability

The public application capability remains:

```ts
import { bodyLimit } from "gelis/body-limit";

const limit = bodyLimit({
  maxBytes: 1024 * 1024,
});

app.use(limit);
```

There is no implicit Gelis application body limit. `maxBytes` is explicit, only one application body-limit capability may be installed, and invalid limits fail synchronously.

Managed routes may use the direct route primitive:

```ts
app.post(
  "/upload",
  {
    body: uploadSchema,
    bodyParser: "multipart",
    bodyLimit: 8 * 1024 * 1024,
  },
  handler,
);
```

A route-level `bodyLimit` is valid only for a Gelis-managed body schema. Application and route limits compose as:

```text
application only -> application maxBytes
route only       -> route bodyLimit
both             -> min(application, route)
```

Raw or otherwise unmanaged body consumption uses the explicit capability reader:

```ts
const result = await limit.readBody(request);
```

The root `gelis` entrypoint does not re-export body-limit helpers.

## Security semantics

The authoritative measurement is the bytes yielded by the Fetch `Request.body` stream visible to Gelis.

`Content-Length` is only an early rejection optimization:

```text
valid Content-Length > effective limit
-> early 413 without body consumption

valid Content-Length <= effective limit
-> body stream is still counted
```

Therefore a forged smaller `Content-Length` cannot bypass the limit. Missing, malformed, or ambiguous `Content-Length` also falls back to actual-byte enforcement.

The bounded reader stops after the first observed chunk that makes the total exceed the effective limit and does not intentionally consume the remainder. The active reader is cancelled when overflow is confirmed. Cancellation failure does not convert overflow into success.

The accepted overflow fast path treats the body as terminal after cancellation begins. It does not pay `releaseLock()` after a successfully initiated overflow cancellation; successful reads and other error paths still release the reader lock. This preserves bounded cancellation semantics while avoiding measurable terminal cleanup overhead.

This capability protects Gelis-managed readers and explicit `BodyLimitCapability.readBody()` usage. Arbitrary user code that bypasses those paths and consumes `request.body`, `request.arrayBuffer()`, or equivalent APIs directly remains outside the application body-limit guarantee.

Transport/runtime body limits remain a separate harder ceiling.

## Parser and response behavior

The accepted managed body-limit path covers:

```text
json
text
application/x-www-form-urlencoded
multipart/form-data
arrayBuffer
```

Enforcement occurs before parsing, Standard Schema validation, `beforeHandle`, and the route handler.

Accepted-size requests preserve existing parser semantics, including existing 400 malformed-body, 415 unsupported-media, and 422 schema-validation behavior.

Default overflow remains HTTP `413` with:

```json
{
  "error": {
    "code": "BODY_TOO_LARGE",
    "message": "Request body exceeds the configured limit"
  }
}
```

A configured `onExceeded` may return a synchronous or asynchronous custom response. Errors from that callback remain application errors and pass through normal Gelis error handling.

## Architecture boundary

The accepted request path is:

```text
route bodyLimit metadata
and/or
application body-limit policy
        ↓
configuration-time effective limit
        ↓
compiled RuntimeInputPlan.readBody
        ↓
matched request only
```

The application capability may re-specialize existing managed routes when installed and specializes future managed routes as they are registered.

There is no request-time scan across configured routes or policies. Unlimited managed routes retain their existing native request readers, and plain routes retain the existing plain runtime lane.

AOT preserves the same managed input compiler and body-limit semantics rather than maintaining a second implementation.

## Zero-unused performance evidence

P11-E9 verified that applications not using body-limit retain the accepted request-time baseline.

Accepted local evidence on Bun 1.4.0:

```text
static raw    0.9899x  PASS
 dynamic raw  0.9991x  PASS
static JSON   0.9886x  PASS
dynamic JSON  0.9708x  PASS
geomean       0.9870x  PASS
```

Frozen gates were:

```text
each candidate/control median <= 1.03x
four-case geometric mean      <= 1.015x
```

Ratios below `1.0x` are treated only as no-regression evidence, not as a speedup claim.

## Enabled competitor performance evidence

P11-E10 compared Gelis with Hono `4.13.5` using 11 mirrored fresh-process pairs and the frozen four-case body-limit matrix.

Accepted local evidence on Bun 1.4.0:

```text
valid-header under-limit   0.5390x  PASS
streamed under-limit       0.4760x  PASS
header fast reject         0.8995x  PASS
stream overflow reject     1.0456x  PASS
geomean                    0.7009x  PASS
```

Frozen hard gates remained unchanged throughout investigation:

```text
valid-header under-limit Gelis/Hono <= 1.15x
streamed under-limit    Gelis/Hono <= 1.15x
header fast reject      Gelis/Hono <= 1.10x
stream overflow reject  Gelis/Hono <= 1.15x
four-case geometric mean          <= 1.10x
```

The accepted result does not come from weakening authoritative byte counting. Gelis still verifies actual stream bytes when a valid under-limit `Content-Length` is present, whereas Hono 4.13.5 fast-paths that case from the header before its handler consumes the body.

During E10, candidate optimizations that did not hold under full acceptance were rejected rather than used to relax the gate. The accepted optimization was limited to terminal overflow cleanup after cancellation had already been initiated.

## Route-scale evidence

P11-E11 measured request-time scaling with a managed static route, application body-limit policy, and header fast rejection at 1,000 and 5,000 registered routes.

Accepted local evidence on Bun 1.4.0:

```text
1,000 routes   3683.9 ns/op
5,000 routes   3939.2 ns/op
5000/1000      0.9925x  PASS
1000-first     0.9803x
5000-first     1.0002x
```

Frozen gate:

```text
5000 / 1000 median <= 1.50x
```

The result is treated as evidence that request-time enforcement does not grow with the configured route count in this workload, not as evidence that 5,000 routes are intrinsically faster than 1,000 routes.

## Correctness and full quality evidence

The authoritative P11-E11 implementation commit is:

```text
b6fa1c8af27cc450e9011b7db146134ada816c40
```

Authoritative Quality workflow run `34486870711` completed successfully and executed the full `bun run check` chain, including formatting, root typecheck, portable package typecheck, Bun package typecheck, benchmark typecheck, type tests, runtime-test typecheck, Bun adapter typecheck, package export tests, and runtime tests.

Final observed test totals were:

```text
package exports   9 pass / 0 fail / 21 expect() calls
runtime         696 pass / 0 fail / 1950 expect() calls
```

Body-limit coverage includes configuration validation, below/equal/over boundaries, cancellation after overflow, safe `Content-Length` handling, forged-small header enforcement, parser parity, application and route precedence, raw capability reads, custom overflow responses, package portability, and AOT preservation.

## Accepted implementation checkpoints

The final performance acceptance checkpoints are:

```text
E9   92214a5bf099f9b5daacfda4f1d254b87a1f53bd
E10  50f0726855954b38a985367f0b45b57acfb488d3
E11  b6fa1c8af27cc450e9011b7db146134ada816c40
```

Each final checkpoint was clean-squashed directly onto the previous accepted authoritative head and passed Quality CI before authoritative promotion.

## Release boundary

P11-E completion does not authorize release.

No tag, GitHub Release, npm publish, or equivalent public release action is implied by this acceptance. Release engineering remains a later maintainer-controlled milestone.

## Next planning boundary

P11-E is complete, but P11 Industrial HTTP Essentials is not complete.

The next capability is P11-F secure headers. It should preserve the same project constraints used here: secure defaults, pay-for-use architecture, portability, deterministic correctness gates, and benchmark evidence before authoritative promotion.

```text
P11-E REQUEST / BODY LIMIT COMPLETE
```
