# P11-G Request ID + Timeout/Abort Capability Acceptance

**Status:** COMPLETE  
**Date:** 2026-09-11  
**Repository:** `gelisjs/gelis`  
**Public owners:** `gelis/request-id`, `gelis/timeout`

## Purpose

P11-G adds official request-ID and timeout/abort capabilities while preserving Gelis' pay-for-use execution model, portable package boundaries, AOT/prebuilt behavior, TypeScript scalability, and zero-unused runtime cost.

The accepted timeout contract is a response deadline with cooperative cancellation through `AbortSignal`. It does not claim that Gelis can forcibly cancel user code or downstream libraries that ignore the signal.

## Final phase tree

```text
P11-G  Request ID + Timeout/Abort                    COMPLETE
├── G1   architecture/API/performance freeze          FROZEN
├── G2   request-ID policy + request-local state       ACCEPTED
├── G3   request-ID application integration           ACCEPTED
├── G4   application timeout integration              ACCEPTED
├── G5   route timeout specialization                 ACCEPTED
├── G6   timeout/cancellation correctness             ACCEPTED
├── G7   package/type/AOT + TypeScript scaling        ACCEPTED
├── G8   zero-unused benchmark acceptance             ACCEPTED
├── G9   request-ID Hono + HTTP benchmark             ACCEPTED
├── G10  timeout Hono + HTTP + route-scale benchmark  ACCEPTED
├── G11  full bun run check                           ACCEPTED
└── G12  acceptance documentation                     ACCEPTED
```

## Accepted public capabilities

Request ID:

```ts
import { requestId } from "gelis/request-id";

const ids = requestId();
app.use(ids);

app.get("/resource", ({ request }) => {
  const id = ids.get(request);
  return { id };
});
```

Timeout:

```ts
import { timeout } from "gelis/timeout";

const deadlines = timeout({ duration: 5_000 });
app.use(deadlines);

app.get("/resource", async ({ request }) => {
  const signal = deadlines.signal(request);
  return await loadResource({ signal });
});
```

Route-level timeout uses the existing route options surface:

```ts
app.get(
  "/resource",
  {
    timeout: 1_000,
  },
  async ({ request }) => {
    const signal = deadlines.signal(request);
    return await loadResource({ signal });
  },
);
```

The root `gelis` entrypoint does not re-export the request-ID or timeout convenience APIs. Both remain explicit portable package subpaths.

## Request-ID semantics

The accepted default request-ID policy is:

```text
header name       X-Request-Id
maximum length    255
trust incoming    false
generator         crypto.randomUUID()
```

`requestId()` resolves one request ID during application request preparation, stores it against the original `Request`, exposes the value through `capability.get(request)`, and propagates the same value on the response.

The accepted option surface is:

```ts
interface RequestIdOptions {
  readonly headerName?: string;
  readonly maxLength?: number;
  readonly trustIncoming?:
    boolean | ((value: string, request: Request) => boolean);
  readonly generator?: (request: Request) => string;
}
```

Incoming identity is not trusted unless explicitly enabled. A trusted incoming value must still pass the baseline length and legal-header-value validation. The built-in `trustIncoming: true` path additionally requires a token-compatible value. Invalid trusted candidates fall back to generation rather than being repaired.

Custom generator output is validated. Invalid configuration, unsafe generated values, trust-predicate failures, and generator failures fail closed rather than being silently rewritten.

Request-ID response propagation covers ordinary route responses, synthetic protocol responses, handled errors, and accepted cross-capability response finalization paths.

## Timeout and cooperative abort semantics

The application timeout surface is:

```ts
interface TimeoutOptions {
  readonly duration?: number;
}
```

A configured duration must be an integer from `1` through `2_147_483_647` milliseconds.

The public timeout capability exposes:

```ts
signal(request: Request): AbortSignal
```

and exports `TimeoutError` with:

```text
code      REQUEST_TIMEOUT
scope     application | route
duration  winning configured duration
message   Request exceeded the configured timeout
```

When the framework timeout wins and user `onError` does not handle the `TimeoutError`, the accepted default response is HTTP `504` with:

```json
{
  "error": {
    "code": "REQUEST_TIMEOUT",
    "message": "Request exceeded the configured timeout"
  }
}
```

Application and route deadlines compose by absolute deadline. A route timeout may tighten an application timeout, but a longer route timeout never extends an earlier application deadline.

The timeout covers the accepted route execution boundary, including asynchronous validation/lifecycle work covered by the route execution plan. Late fulfillment after timeout does not replace the winning timeout response, and late rejection is observed without creating an unhandled rejection.

Incoming aborts remain incoming aborts; they are not relabeled as Gelis timeouts. Already-aborted incoming requests preserve their abort reason.

## Lazy cooperative signal architecture

The final accepted implementation materializes the derived cooperative `AbortSignal` lazily.

The deadline race itself remains active whenever an application or route deadline is configured. However, Gelis does not create an `AbortController` or attach an incoming abort listener merely because timeout policy is installed. Those objects are created only if application code asks for `deadlines.signal(request)` while a framework deadline is active or after a cooperative abort reason has already been recorded.

The resulting state model preserves:

```text
no active framework deadline
-> signal(request) returns the original request.signal

active application/route deadline + signal requested
-> derived cooperative signal is materialized

framework timeout wins before signal is requested
-> timeout reason is recorded
-> later signal materialization returns an already-aborted signal

incoming abort wins before late materialization
-> incoming abort reason is preserved
```

Nested application + route execution uses an active-deadline count so an inner route completion cannot prematurely end the cooperative-signal lifetime while an outer application deadline is still active.

This optimization was accepted only after the complete timeout/cancellation correctness suite remained green.

## Execution architecture and cross-capability composition

Request ID and timeout use the official P11-B application HTTP execution lane rather than a universal always-on middleware chain.

Request ID:

```text
requestId() plugin
        ↓
official application HTTP request-ID marker
        ↓
request-local ID prepare
        ↓
route / synthetic protocol / handled-error execution
        ↓
response propagation finalization
```

Timeout:

```text
timeout() plugin
        ↓
official application timeout marker
        ↓
request-local timeout state
        ↓
application deadline execution
        ↓
optional route timeout specialization
        ↓
TimeoutError / successful response race
```

Request-ID and timeout state are request-local and keyed by the original `Request`. The public handler context is not globally widened merely because these capabilities exist.

Accepted cross-capability tests cover request ID with CORS and secure headers, plus timeout fallback finalization with request ID, secure headers, CORS, HEAD suppression, and handled `onError` behavior.

## Package and AOT/prebuilt preservation

The package surface exports portable subpaths:

```text
gelis/request-id
gelis/timeout
```

Neither capability is re-exported from the root `gelis` entrypoint.

AOT/prebuilt acceptance verifies request-ID and timeout behavior when the capabilities are installed before or after supported router hydration boundaries. Request-ID and timeout execution policy are not serialized into route topology artifacts or contract snapshots.

Route timeout declarations remain part of route semantics needed to restore runtime specialization, while the executable timeout policy remains application runtime state.

## TypeScript scalability evidence

P11-G7 identified that the general rich route-options type path created avoidable TypeScript cost for the common timeout-only route shape. The accepted production type specialization keeps timeout-only declarations on a lightweight overload without changing the stable root `Gelis` type.

The final G7 candidate before the later runtime-only G10 optimization was:

```text
4b9053d7efaec35e71d35b3fbb0cb5b97cba7b61
```

The accepted TypeScript benchmark used Bun `1.4.0`, TypeScript `7.0.2`, three runs per case, and `100`, `500`, `1,000`, and `5,000` route sizes.

Relative timeout-route/control evidence:

```text
routes   instantiation   memory    check
100      1.0160x         1.0066x   0.9782x   PASS
500      1.0483x         1.0207x   1.0165x   PASS
1000     1.0661x         1.0405x   1.0431x   PASS
5000     1.0949x         1.1095x   1.0893x   PASS
```

Frozen per-size gates remained:

```text
instantiation <= 1.15x
memory        <= 1.15x
check         <= 1.25x
5000 check    <= 1.20x
```

Accepted timeout-route `1,000 -> 5,000` growth evidence:

```text
instantiation growth  3.5342x <= 5.5x  PASS
check growth          1.8346x <= 6.0x  PASS
```

The structural stable-root-type assertion also compiled successfully.

The later G10 runtime optimization did not change the public route type surface.

## Zero-unused performance evidence

Because the final production candidate changed during G10 optimization, G8 was rerun against the exact final candidate rather than relying on the earlier result.

Frozen control:

```text
c6a65d639679464744ba3be21cfc8acb0f850d9a
```

Final candidate:

```text
1dd5f94cf0e9ad884ca44e537ee287587cd8baab
```

Protocol:

```text
5,000 mixed routes
11 mirrored fresh-process pairs
Bun 1.4.0
```

Exact-candidate G8 evidence:

```text
static raw     0.9884x  PASS
dynamic raw    0.9918x  PASS
static JSON    1.0011x  PASS
dynamic JSON   1.0117x  PASS
geomean        0.9982x  PASS
```

Frozen gates remained:

```text
each candidate/control median <= 1.03x
four-case geometric mean      <= 1.015x
```

Ratios below `1.00x` are treated only as no-regression evidence. This benchmark does not establish a universal speedup claim.

## Request-ID competitor performance evidence

Because the production candidate changed during G10, G9 was also rerun against the exact final candidate.

The authoritative revalidation used the exact previously accepted G9 harness lineage, Hono `4.13.5`, Bun `1.4.0`, 11 mirrored fresh-process direct pairs per case, and equivalent request-ID propagation semantics.

Final direct evidence:

```text
default generated          0.6839x  PASS
trusted valid inbound      0.6443x  PASS
invalid inbound fallback   0.8009x  PASS
custom generator           0.6273x  PASS
geomean                    0.6859x  PASS
```

Frozen direct gates remained:

```text
each Gelis/Hono case <= 1.10x
geometric mean       <= 1.05x
```

The frozen end-to-end HTTP comparator used the default generated request-ID case, 50 concurrent connections, warmup, and seven alternating framework pairs.

Final HTTP evidence:

```text
Gelis median throughput   85,178 req/s
Hono median throughput    79,739 req/s
median Gelis/Hono          1.0682x
pairwise diagnostic        1.0795x
Hono-first diagnostic      1.0909x
Gelis-first diagnostic     1.0795x
```

Frozen HTTP gate:

```text
median Gelis throughput >= 0.90x Hono throughput
```

These results are evidence for the exact benchmark workloads only and are not a universal performance claim.

## Timeout competitor performance evidence

The first G10 direct harness reused one `Request` identity repeatedly. That was invalid for this capability because repeated attachment to one never-aborted incoming signal accumulated request-local abort listeners and did not model independent HTTP requests. The harness was corrected to use unique request identities without changing the frozen gates.

With that harness correction, the original timeout implementation still failed the direct gate materially, around `2.54x` through `3.16x` Hono while HTTP and route-scale gates passed. This was treated as a real per-request timeout bookkeeping bottleneck rather than benchmark noise.

The production implementation was then changed to the lazy cooperative signal architecture described above. Correctness was rerun before the optimized candidate was accepted for measurement.

Final production candidate:

```text
1dd5f94cf0e9ad884ca44e537ee287587cd8baab
```

Authoritative G10 V3 direct evidence against Hono `4.13.5`:

```text
application sync 204   0.7253x  PASS
application async 204  0.9018x  PASS
route sync 204         0.7183x  PASS
route async 204        0.9466x  PASS
geomean                0.8166x  PASS
```

Frozen direct gates remained:

```text
each Gelis/Hono case <= 1.15x
geometric mean       <= 1.10x
```

Timeout-fire measurement remained diagnostic-only:

```text
Gelis median  10.42 ms
Hono median   12.05 ms
```

The final end-to-end application-timeout HTTP comparator used 50 concurrent connections and seven alternating pairs:

```text
Gelis median throughput   91,640 req/s
Hono median throughput    84,253 req/s
median Gelis/Hono          1.0877x
pairwise diagnostic        1.1114x
Hono-first diagnostic      1.1145x
Gelis-first diagnostic     1.0576x
```

Frozen HTTP gate:

```text
median Gelis throughput >= 0.90x Hono throughput
```

Route-timeout request-scale evidence:

```text
1,000 routes median   1031.0 ns/op
5,000 routes median   1025.7 ns/op
5000/1000 ratio        0.9949x  PASS
```

Frozen route-scale gate:

```text
5000/1000 median <= 1.50x
```

Again, ratios below `1.00x` or throughput ratios above `1.00x` apply only to these measured workloads.

## Invalid-harness evidence retained

P11-G acceptance does not discard failed or invalid benchmark history.

Two categories are explicitly retained as audit evidence:

```text
G10 initial reused-Request direct workload
-> invalid request-identity model
-> corrected before authoritative acceptance

G9 exact-candidate revalidation attempts before V3
-> selected non-authoritative Hono worker lineage
-> equivalence guard failed before sample 1
-> no performance evidence produced
```

The final G9 revalidation was therefore rebuilt from the exact commit that produced the previously accepted G9 V2 run, changing only the production candidate identity.

No hard gate was relaxed and no failed performance result was averaged away.

## Correctness and full quality evidence

The final accepted production candidate is:

```text
1dd5f94cf0e9ad884ca44e537ee287587cd8baab
```

G11 created a fresh validation branch pointing exactly to that immutable production SHA and made no source changes.

Authoritative Quality workflow run:

```text
34561827205
```

completed successfully under Bun `1.4.0` and executed the repository `bun run check` chain.

Final observed runtime/package test totals:

```text
package exports
14 pass
0 fail
34 expect() calls

runtime
779 pass
0 fail
2330 expect() calls
94 files
```

The full gate includes formatting, root typecheck, portable package typecheck, Bun package typecheck, benchmark typecheck, type tests, runtime-test typecheck, Bun adapter typecheck, package export tests, and runtime tests.

Permanent correctness evidence includes:

```text
request-ID configuration and validation
trusted/untrusted incoming-ID behavior
response propagation
synthetic response coverage
handled-error propagation
CORS and secure-header composition
duplicate capability rejection
application timeout
route timeout and deadline precedence
already-aborted and later-aborted incoming requests
late fulfillment/rejection after timeout
cooperative TimeoutError abort reason
HEAD timeout fallback suppression
async input/response validation under route timeout
lazy late signal materialization
AOT/prebuilt preservation
```

No correctness, type, AOT, zero-unused, competitor, HTTP, route-scale, or TypeScript threshold was weakened to obtain acceptance.

## Acceptance checkpoints

Final P11-G checkpoints include:

```text
G1 architecture/API/performance freeze
work/p11-g1-request-id-timeout-freeze

G7 timeout-only type specialization
4b9053d7efaec35e71d35b3fbb0cb5b97cba7b61

G8 exact-final-candidate zero-unused revalidation head
584d0eb8f85fa5ffa85c15051e8b0d1b30fea636

G9 exact accepted harness lineage
accepted source commit: a7c619aebcdc0ed30fd99272ec4634b528e03582
final revalidation harness head: 22e40ec7f4bf19d568acb430617561201ca3186d

G10 final benchmark harness head
2cf2f90cba6027af70e30e63c8cbbcb938c9171f

G10/G11 final production candidate
1dd5f94cf0e9ad884ca44e537ee287587cd8baab

G11 authoritative Quality run
34561827205
```

Benchmark-only and documentation commits do not replace the production candidate being measured and accepted.

## Release boundary

P11-G completion does not authorize a release.

No npm publish, Git tag, GitHub Release, or equivalent public release action is implied by this acceptance. Release engineering remains explicit maintainer-controlled work outside this subphase.

## Next planning boundary

P11-G completes the last individual HTTP-essential capability in the frozen P11 roadmap, but P11 Industrial HTTP Essentials is not yet complete.

The frozen roadmap defines the next subphase as:

```text
P11-H cumulative correctness/security/type/performance/docs freeze
```

P11-H must verify both:

```text
plain application with all P11 capabilities unused

representative production application using several accepted P11 capabilities together
```

TypeScript scalability must be rerun if cumulative work materially changes public generic surfaces.

## Decision

```text
P11-G REQUEST ID + TIMEOUT/ABORT CAPABILITY COMPLETE

NEXT:
P11-H cumulative correctness/security/type/performance/docs freeze
```
