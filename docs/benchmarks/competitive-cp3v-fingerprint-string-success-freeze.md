# Competitive Performance v0.1 — CP3-V fingerprint + string-success candidate freeze

## Purpose

CP3-S proved that the single-index trailing-prefix fingerprint router satisfies static, dynamic, generic, collision, registration, and retained-memory requirements but missed the frozen pipeline geomean gate. CP3-T localized the loss to response normalization when the body carries a request-derived parameter. CP3-U then showed that omitting explicit `status: 200` from the ordinary successful string `Response` path is the strongest measured response-construction mechanism and that reintroducing the old prefix lookup is harmful.

CP3-V tests the combined production candidate:

1. CP3-S single-index fingerprint routing; and
2. ordinary successful direct strings use `new Response(value, { headers: TEXT_HEADERS })`, relying on native default status `200`.

CP3-V reuses the exact CP3-S candidate acceptance thresholds. No gate is relaxed or introduced to fit observed results.

## Frozen baseline

- production source: `8e43aad09759d60378b3fc174292850057ccfba3`
- CP3-S source: `77168cea5056c50bd7188b2dace17f72f7a01514`
- Bun: exactly `1.4.2`
- Bun revision: exactly `744846f844374847c902b5e7fd59b4342a51ef99`
- routes: `5,000`

The final CP3-V candidate source SHA is recorded only after the source change passes full repository Quality. The acceptance harness must then guard that exact candidate SHA.

## Source scope

The intended CP3-V source delta from CP3-S is limited to the ordinary successful direct-string branch in `src/runtime/response.ts`:

- preserve explicit canonical `text/plain; charset=utf-8` Content-Type;
- omit explicit `status: 200` and rely on the native default status;
- do not alter raw `Response` identity;
- do not alter direct `undefined => 204`;
- do not alter `reply.status(...)` / `normalizeResponseWithStatus()` semantics;
- do not alter HEAD suppression;
- do not alter JSON success behavior;
- do not alter router source relative to CP3-S.

Correctness must explicitly retain status `200`, empty default `statusText`, exact body, and canonical text Content-Type for ordinary direct-string success.

## Authoritative protocol

CP3-V must reuse the CP3-S production-shape protocol:

- exact production baseline mounted through a temporary detached Git worktree;
- `11` mirrored fresh-worker pairs per cell pair;
- `20,000` warmups for ns/op cells;
- calibration floor `20 ms`;
- target measured duration approximately `120 ms`;
- alternate production-first / candidate-first ordering;
- correctness probe before timing;
- temporary worktree removed and pruned in `finally`;
- one authoritative local timed run after valid probe;
- no rerun merely because a valid result is unfavorable.

Cells remain:

1. mixed static request;
2. mixed trailing dynamic request;
3. generic multi-param dynamic request;
4. string pipeline using captured `params.id`;
5. JSON pipeline using captured `params.id`;
6. forced fingerprint collision;
7. trailing-route registration;
8. retained router heap delta.

## Frozen acceptance gates

These are exactly the CP3-S thresholds:

| gate                                | candidate / production limit |
| ----------------------------------- | ---------------------------: |
| mixed static request                |                 `<= 1.0200x` |
| mixed trailing dynamic request      |                 `<= 0.9000x` |
| generic multi-param dynamic request |                 `<= 1.0300x` |
| string + JSON pipeline geomean      |                 `<= 0.9800x` |
| forced-collision fallback           |                 `<= 1.1500x` |
| trailing-route registration         |                 `<= 1.7500x` |
| retained router heap delta          |                 `<= 1.5000x` |

Every gate must pass for CP3-V candidate acceptance.

## Interpretation

- A PASS would show that the fingerprint router plus native default-success string response is production-viable under the same standard that rejected CP3-S.
- A FAIL is preserved as valid evidence and must not trigger threshold changes or selective reruns.
- Even a full local PASS remains a candidate acceptance checkpoint; promotion/revalidation follows separately.
