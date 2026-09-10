# P11-E Request / Body Limit Capability Freeze

**Status:** ARCHITECTURE + API + GATES FROZEN  
**Date:** 2026-09-10  
**Phase:** P11-E  
**Public owner:** `gelis/body-limit`  
**Performance control source:** `3628c82d1d38539c24a6f88ec2c6717ec8c3542f`  
**Control quality gate:** `646 pass / 0 fail / 1798 expect() calls`

## Purpose

P11-E adds production request-body limiting without creating a universal middleware chain or weakening the zero-unused managed-input path.

The capability protects Gelis-managed request-body readers with authoritative actual-byte enforcement. Transport/server limits remain a separate harder ceiling.

The accepted ownership follows P11-B:

```text
gelis/body-limit
    ↓
managed input specialization
    ↓
RuntimeInputPlan.readBody
```

`Content-Length` is an early rejection optimization only. It is never the sole security check.

---

# 1. Scope

P11-E v0.1 covers:

```text
application-level managed-body ceiling
route-level managed-body ceiling
Content-Length fast rejection
actual Request.body byte enforcement
missing Content-Length
streamed/chunked bodies
JSON
text
application/x-www-form-urlencoded
multipart/form-data
arrayBuffer
default 413 response
custom overflow response policy
explicit raw/unmanaged limited-body reading
Bun transport ceiling interaction
AOT managed-input preservation
zero-unused regression
```

P11-E does not introduce streaming multipart file consumption, disk-backed upload storage, per-file multipart limits, raw-wire byte accounting, OpenAPI body-limit metadata, typed-client body-limit state, or a universal Request clone/tee wrapper.

---

# 2. Public application capability

Public ownership:

```ts
import { bodyLimit } from "gelis/body-limit";
```

Conceptual usage:

```ts
const limit = bodyLimit({
  maxBytes: 1024 * 1024,
});

app.use(limit);
```

There is no implicit Gelis body limit when the capability is absent.

`bodyLimit()` requires an explicit `maxBytes`.

Only one application body-limit capability may be installed per Gelis application in P11-E v0.1. A second installation fails synchronously rather than stacking, replacing, or weakening the first policy.

Conceptual public surface:

```ts
export interface BodyLimitOptions {
  readonly maxBytes: number;
  readonly onExceeded?: BodyLimitExceededHandler;
}

export type BodyLimitExceededHandler = (
  request: Request,
  maxBytes: number,
) => Response | PromiseLike<Response>;

export type BodyLimitReadResult =
  | {
      readonly ok: true;
      readonly bytes: Uint8Array;
    }
  | {
      readonly ok: false;
      readonly response: Response;
    };

export interface BodyLimitCapability extends Plugin {
  readonly maxBytes: number;
  readBody(request: Request): Promise<BodyLimitReadResult>;
}

export function bodyLimit(options: BodyLimitOptions): BodyLimitCapability;
```

The root `gelis` entrypoint does not re-export body-limit helpers.

---

# 3. Limit validation

Every configured limit must be a finite safe non-negative integer:

```text
Number.isFinite(value)
Number.isInteger(value)
value >= 0
value <= Number.MAX_SAFE_INTEGER
```

Invalid values fail synchronously at configuration or route registration time.

`0` is valid and accepts only a zero-byte body. A body exactly equal to `maxBytes` is accepted; only `> maxBytes` exceeds the limit.

---

# 4. Route-level API

Route-specific managed-body limits use a direct non-generic `RouteOptions` primitive:

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

Frozen type direction:

```ts
interface RouteOptions {
  readonly bodyLimit?: number;
}
```

`RouteOptionsFor` carries the same non-generic field.

`bodyLimit` is valid only when the route has a Gelis-managed `body` schema. Declaring `bodyLimit` on an unmanaged/raw route is a configuration error because Gelis must not imply protection for a body stream the managed input system does not consume.

Raw/unmanaged reads use the explicit capability reader.

---

# 5. Application + route precedence

For a managed route:

```text
no application limit + no route limit
-> existing unlimited reader unchanged

application limit only
-> application maxBytes

route limit only
-> route bodyLimit

application + route limit
-> min(application maxBytes, route bodyLimit)
```

A route may make policy stricter but may not loosen the application ceiling.

A transport ceiling remains independent and may reject before Gelis receives a Request.

---

# 6. Authoritative byte semantics

The authoritative Gelis measurement is the bytes yielded by the Fetch `Request.body` stream visible to Gelis.

It is not TCP bytes, HTTP framing bytes, or decoded multipart field/file sizes.

The limited reader stops once observed bytes become greater than the effective limit. Gelis must not intentionally buffer the remainder of an already-over-limit body. The active stream should be cancelled when practical; cancellation failure does not convert a confirmed overflow into success.

---

# 7. Content-Length fast rejection

A syntactically valid singleton decimal `Content-Length` may reject early:

```text
Content-Length > effective limit
-> 413 without consuming body
```

A valid value less than or equal to the limit never bypasses actual-byte enforcement. The stream is still counted.

Therefore:

```text
header larger than limit -> early 413
header equal to limit -> actual bytes still enforced
header smaller than actual body -> stream catches overflow
missing header -> stream enforcement
malformed header -> do not trust; stream enforcement
ambiguous/combined representation -> do not trust; stream enforcement
```

P11-E does not define a separate Gelis 400 solely for malformed `Content-Length`; transport runtimes may normalize or reject such syntax before application code.

---

# 8. Managed parser integration

Limited managed routes enforce bytes before an oversized complete body reaches parser/schema work.

Supported parsers:

```text
json
text
urlencoded
multipart
arrayBuffer
```

Execution shape:

```text
media-type check
    ↓
Content-Length fast reject when usable
    ↓
limited Request.body read
    ↓
parser-specific decode/parse
    ↓
Standard Schema validation
    ↓
beforeHandle
    ↓
handler
```

No schema validation, route beforeHandle, or handler runs after body-limit rejection.

Existing media-type and malformed-body semantics remain authoritative for accepted-size bodies.

Most importantly, **unlimited routes keep the current native reader functions unchanged** (`request.json()`, `request.text()`, `request.arrayBuffer()`, and the existing urlencoded/multipart paths). P11-E does not route unlimited reads through a new generic limiting abstraction.

---

# 9. Multipart

The current accepted-body multipart implementation may continue buffering the complete accepted body before parsing.

P11-E changes the dangerous oversized case:

```text
oversized multipart
-> limited reader detects overflow
-> 413
-> Gelis does not intentionally buffer the remaining body
```

Streaming multipart/file storage is outside P11-E.

---

# 10. Overflow response

Default overflow response:

```text
status: 413 Content Too Large
code: BODY_TOO_LARGE
```

Conceptually:

```json
{
  "error": {
    "code": "BODY_TOO_LARGE",
    "message": "Request body exceeds the configured limit"
  }
}
```

A configured `onExceeded` may return a custom `Response` synchronously or asynchronously.

Errors thrown or rejected by a custom overflow handler are application errors and remain observable by Gelis `onError` handling.

Body-limit rejection does not become schema-validation failure and does not return 422.

---

# 11. Raw / unmanaged body reading

P11-E does not pretend that an application-level managed-input policy automatically protects arbitrary direct use of `request.body`, `request.arrayBuffer()`, etc. inside user handlers.

The explicit capability instance supplies the protected raw-reader path:

```ts
const limit = bodyLimit({ maxBytes: 1024 * 1024 });
app.use(limit);

app.post("/raw", async ({ request }) => {
  const result = await limit.readBody(request);

  if (!result.ok) return result.response;

  return new Response(result.bytes);
});
```

Bypassing `readBody()` and consuming `request.body` directly is intentionally outside the managed body-limit guarantee.

---

# 12. Runtime architecture

Primary execution lane: P11-B Lane D, managed input specialization.

Accepted shape:

```text
route bodyLimit metadata
and/or
application BodyLimit policy
    ↓
configuration-time effective limit
    ↓
compiled RuntimeInputPlan.readBody
```

The application capability may recompile existing managed routes at configuration time and must affect future managed routes registered afterward.

No application-state lookup is performed on every body chunk.

`RuntimeRouteRecord.input` may become deliberately mutable so application policy installation can replace compiled input plans at configuration time, analogous to existing mutable lifecycle execution fields.

Route policy metadata is optional/lazy. Plain routes and query-only routes do not gain body-limit state.

---

# 13. Zero-unused invariants

P11-E must preserve:

```text
root gelis does not import gelis/body-limit implementation

no application body-limit + no route bodyLimit
-> current managed reader path unchanged

plain route
-> RUNTIME_ROUTE_PLAIN path unchanged

query-only route
-> no body-limit property/sidecar

route policy absent
-> no route body-limit metadata allocation

no application limit
-> no request-time application-policy lookup

no universal Request wrapper
-> no clone/tee/body proxy cost
```

Any structural branch added to the unlimited managed reader merely to support P11-E is a design failure even if noisy benchmarks happen to pass.

---

# 14. Type and contract boundary

Body-limit policy is execution metadata only. It does not become:

```text
OpenAPI requestBody metadata
typed-client request contract state
RouteRef generic state
Gelis root generic state
```

Required type/package properties:

```text
RouteOptions accepts numeric bodyLimit
RouteOptionsFor carries bodyLimit without a new generic
root Gelis generic remains stable
gelis/body-limit is portable and does not require Bun types
root gelis does not re-export body-limit helpers
BodyLimitCapability / BodyLimitOptions / BodyLimitReadResult compile
```

Runtime validation remains authoritative for invalid numeric values that TypeScript cannot reject with a plain `number` field.

---

# 15. AOT

AOT source analysis must recognize `bodyLimit` as accepted managed-body route metadata.

An otherwise eligible managed-input AOT route must not become silently ineligible because it declares:

```ts
bodyLimit: 1024;
```

The managed AOT path already reuses `createRuntimeInputPlan(options)`; P11-E preserves that single input compiler rather than introducing a second AOT body-limit implementation.

Required behavior:

```text
source analyzer preserves bodyLimit
captureFlatAotManagedInput compiles the same limited semantics
hydrated route retains route-level policy
application capability can specialize hydrated managed input
plain AOT routes remain unaffected
```

---

# 16. Bun transport interaction

`Bun.serve({ maxRequestBodySize })` is a transport/server ceiling and remains separate from Gelis policy.

```text
Bun transport limit
    ↓
Gelis application limit
    ↓
Gelis route limit
```

If Bun's ceiling is stricter, Bun may reject before Gelis executes. P11-E does not attempt to override or weaken it.

No Bun type is introduced into portable `gelis/body-limit` APIs.

---

# 17. Correctness gates

Permanent runtime coverage must include at minimum:

```text
configuration:
valid maxBytes; zero; negative/fraction/NaN/Infinity/unsafe rejected;
duplicate application capability rejected;
route bodyLimit without body schema rejected

boundaries:
below; exactly equal; one byte over

Content-Length:
over-limit fast reject; equal still counts actual bytes;
forged small value cannot bypass; missing/malformed/ambiguous cannot bypass;
very large decimal handled safely

streaming:
multi-chunk below; crossing limit; stop/cancel after overflow;
stream failure preserves appropriate body-read failure semantics

parsers:
JSON/text/urlencoded/arrayBuffer/multipart below/equal/over;
custom bodyContentTypes; unsupported media remains 415;
malformed within-limit JSON remains 400;
schema failure within-limit remains 422

composition:
application only; route only; route stricter;
route looser cannot bypass application;
routes before and after capability installation;
module/plugin/scope managed routes where supported

response/error:
default 413; custom sync/async overflow;
custom throw/reject through onError;
CORS finalizes 413 when enabled

raw:
readBody below/equal/over;
missing or forged Content-Length;
custom overflow response

adapter:
Bun maxRequestBodySize independently configurable;
portable package does not require Bun types
```

No correctness or security test may be weakened to satisfy performance.

---

# 18. Performance gates

Control source:

```text
3628c82d1d38539c24a6f88ec2c6717ec8c3542f
```

Canonical zero-unused direct `app.fetch()` cases:

```text
static raw
dynamic raw
static JSON
dynamic JSON
```

Frozen zero-unused thresholds:

```text
each candidate/control median <= 1.03x
four-case geometric mean        <= 1.015x
```

Primary enabled portable comparator: Hono body-limit middleware.

Equivalent scenarios:

```text
under-limit valid Content-Length
under-limit streamed/missing Content-Length
over-limit Content-Length fast reject
over-limit streamed body
```

Frozen enabled thresholds:

```text
valid-header under-limit Gelis/Hono <= 1.15x
streamed under-limit    Gelis/Hono <= 1.15x
header fast reject      Gelis/Hono <= 1.10x
stream overflow reject  Gelis/Hono <= 1.15x
four-case geometric mean          <= 1.10x
```

Multipart remains a diagnostic rather than a hard cross-framework ratio gate because parser/materialization semantics are not assumed equivalent enough.

Route-scale gate:

```text
1,000 routes vs 5,000 routes
5000 / 1000 median <= 1.50x
```

The implementation must never scan all configured routes/policies to enforce one matched route's limit.

---

# 19. Acceptance sequence

P11-E proceeds in this order:

```text
E1 architecture/API/gates freeze
E2 core limited-byte reader + 413 semantics
E3 route bodyLimit specialization
E4 application body-limit capability + recompilation
E5 raw capability reader
E6 parser + multipart correctness
E7 type/package gates
E8 AOT preservation
E9 zero-unused benchmark
E10 enabled competitor benchmark
E11 route-scale benchmark
E12 full bun run check
E13 acceptance document
```

Thresholds are frozen before implementation benchmark results are observed.

---

# 20. Decision

```text
P11-E REQUEST / BODY LIMIT ARCHITECTURE FROZEN

Public owner:
gelis/body-limit

Managed enforcement:
RuntimeInputPlan specialized reader

Application semantics:
explicit maxBytes, no implicit default

Route semantics:
bodyLimit?: number

Effective limit:
min(application, route)

Authoritative enforcement:
actual Request.body bytes

Optimization:
valid Content-Length fast reject

Raw/unmanaged model:
explicit BodyLimitCapability.readBody()

Default overflow:
413 BODY_TOO_LARGE

Transport:
adapter/runtime ceiling remains separate

Zero-unused:
existing unlimited managed readers unchanged

AOT:
route bodyLimit remains managed-input AOT eligible
```

No release, tag, GitHub Release, or npm publication is authorized by P11-E.
