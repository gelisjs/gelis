# HTTP Method Semantics v0.1

Status: Frozen  
Phase: P9-D  
Framework: Gelis

## Scope

This document freezes Gelis HTTP method semantics for:

- `HEAD`
- `OPTIONS`
- `405 Method Not Allowed`
- `Allow`
- precedence between exact routes, `ALL`, and implicit HTTP semantics
- the zero-unused performance acceptance methodology used for P9-D

It builds on the P9-C freeze for `ALL` and custom HTTP methods.

## Dispatch precedence

For a request with method `M` and pathname `P`, Gelis resolves routing in this order:

1. exact `M` route match
2. `ALL` (`"*"`) route fallback
3. implicit HTTP semantics
   - `HEAD` may fall back to a matching `GET`
   - `OPTIONS` may synthesize an automatic response
4. if `P` exists under another method, return `405 Method Not Allowed`
5. otherwise return `404 Not Found`

The successful exact-method path must not enumerate other method tables.

## HEAD

Precedence:

```text
explicit HEAD
→ ALL
→ implicit GET
→ 405 / 404
```

Frozen behavior:

- explicit `HEAD` wins over `ALL` and implicit `GET`
- `ALL` wins over implicit `GET`
- implicit `HEAD → GET` executes the complete matching GET route pipeline
- the original `Request` remains a `HEAD` request
- every final HEAD response is bodyless
- body suppression applies to:
  - explicit HEAD handlers
  - ALL handlers serving HEAD
  - implicit GET fallback
  - route lifecycle early responses
  - application `onRequest` early responses
  - `onError` handled responses
  - startup-gate responses
  - 404 and 405 responses
- existing response headers are preserved where possible
- Gelis does not synthesize expensive body-derived headers when they are absent

## OPTIONS

Precedence:

```text
explicit OPTIONS
→ ALL
→ automatic OPTIONS
→ 405 / 404
```

Automatic OPTIONS is synthesized only after exact and ALL matching fail and the pathname exists in router topology.

Synthetic response:

```text
204 No Content
Allow: ...
```

Automatic OPTIONS:

- does not provide CORS behavior
- runs application `onRequest`
- does not run route validation
- does not run route `beforeHandle`
- does not execute a route handler
- does not run route `afterHandle`
- is not projected as a declared contract or OpenAPI route

`OPTIONS *` remains outside v0.1 scope.

## 405 Method Not Allowed

Gelis returns 405 when:

- no exact route matches
- no ALL route matches
- no implicit HTTP semantic handles the request
- the actual pathname exists under at least one other method

Path existence is determined from router topology, not route-pattern string equality.

Example:

```text
GET  /users/:id
POST /users/admin

DELETE /users/admin
```

The DELETE request is `405`, because `/users/admin` exists in the router topology.

## Allow

`Allow` contains every explicit method whose router topology matches the actual pathname.

Additional rules:

- `GET` implies `HEAD`
- automatic OPTIONS implies `OPTIONS`
- synthetic `HEAD` is inserted after `GET`
- synthetic `OPTIONS` is appended last
- explicit `HEAD` and explicit `OPTIONS` retain method-table order
- custom method casing is preserved
- ordinary wire method `"ALL"` may appear
- the ALL pseudo-method `"*"` is never advertised
- duplicate methods are removed
- ordering is deterministic

## ALL interaction

ALL suppresses implicit semantics:

- HEAD served by ALL does not fall through to GET
- OPTIONS served by ALL does not synthesize automatic OPTIONS
- a method handled by ALL does not generate 405
- `Allow` never advertises `"*"`

HEAD response body suppression still applies when HEAD is served by ALL.

## AOT parity

Flat AOT and preorder AOT inherit the same runtime semantics for:

- HEAD fallback
- automatic OPTIONS
- 405
- Allow construction

Implicit HEAD, automatic OPTIONS, and 405 remain runtime semantics rather than synthetic contract declarations.

## Performance design

The P9-D implementation keeps method-miss semantics out of the successful exact-route hot path as much as practical.

The final production shape caches `request.method`, keeps HEAD-specific dispatch isolated, and moves semantic miss resolution to a cold helper.

An exact successful GET therefore does not enumerate cross-method topology.

## P9-D6 zero-unused acceptance

### Original frozen threshold

The performance threshold remained unchanged throughout P9-D6:

```text
candidate overhead <= +3%
```

Representative workloads:

1. shared `Response`
2. string result requiring normal response normalization

The control revision is:

```text
4466d0170cc97b94415a602093633e63c8de4034
```

### Why the original paired estimator was replaced

The initial in-process paired protocol used order-specific medians as acceptance gates.

During P9-D6, identical-source A/A controls demonstrated that this protocol could reject identical Gelis implementations by more than the frozen `+3%` threshold.

Additional diagnostics ruled out simple causes including:

- one shared polymorphic fetch call-site
- same-class A/A placement
- cross-module placement
- ABBA ordering alone
- mirrored in-process placement

The failure was therefore a measurement-method validity problem, not grounds to loosen the performance threshold.

### Final acceptance estimator

The final protocol uses:

- one Gelis module graph per Bun process
- four persistent worker processes per workload
- mirrored control/candidate and candidate/control orientations
- semantic ABBA / BAAB ordering
- `61` mirrored samples
- `50,000` warmup iterations per worker
- `100,000` iterations per measurement
- `Bun.gc(true)` inside the measured worker before each measurement
- geometric mean of canonical candidate/control ratios
- median of the mirrored sample deltas

Order buckets remain diagnostic only because identical A/A controls proved that they could independently produce false failures.

The frozen acceptance gate remains:

```text
mirrored median delta <= +3%
```

No threshold was increased or loosened.

### Accepted result

Environment:

```text
Bun 1.4.0
Intel Core i5-10500H
5000 routes
```

Result:

```text
shared-response
mirrored median delta: +2.91%
PASS

string-normalized
mirrored median delta: -1.63%
PASS
```

## Final validation

The final P9-D candidate passed the full repository gate:

```text
508 pass
0 fail
1432 expect() calls
64 runtime test files
```

P9-D is frozen after this validation.
