# Competitive Performance v0.1 — CP4-L static capability elision decomposition freeze

## Purpose

CP4-L isolates the remaining static-only dispatch cost after CP4-K rejected the pathname-extraction handoff hypothesis. The control is the exact CP4-I composed source. The candidate keeps the CP4-I request-URL router for dynamic applications, but a Gelis-created Router starts with the optional `matchRequestUrl` capability elided. The first successfully registered parameterized route reveals the existing prototype capability. Static-only applications therefore fall through the already-existing application compatibility path: `pathnameFromRequestUrl(request.url)` plus `router.match(...)`.

This is a decomposition experiment, not production acceptance. It tests whether registration-time capability absence can restore static-only request performance without regressing mixed/dynamic paths, registration cost, or retained heap.

## Frozen identity

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- Control source: `c18f231374d0008b7cc3e01bacbf9f81aff9a273`
- Candidate source: `dafeae25257f9288735e0564a14201a70b474f7e`
- Routes per workload: `5,000`
- Samples: `11` mirrored fresh-worker pairs per cell pair
- Local authoritative machine: Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz

## Recovery derivation

CP4-J measured the control-equivalent composed source at `1.0747x` production for static-only raw. Reaching the frozen production gate `<= 1.0200x` requires candidate/control `<= 1.0200 / 1.0747 = 0.949102...`. The CP4-L recovery gate is therefore frozen at `<= 0.9491x` before timing.

This derived threshold is only a viability discriminator. A PASS cannot promote the candidate through chained ratios; any eventual production candidate must pass a new direct production acceptance run.

## Frozen cells

1. static-only raw
2. mixed static raw
3. mixed dynamic raw
4. mixed dynamic JSON
5. mixed same-length dynamic raw
6. pure trailing dynamic raw
7. pure trailing dynamic JSON
8. generic dynamic raw
9. forced collision raw
10. ALL dynamic raw
11. static registration
12. static retained heap

Correctness requires control and candidate to pass every cell before timing: `24/24` probes.

## Frozen gates

- static-only recovery: `<= 0.9491x`
- mixed-static guard: `<= 1.0200x`
- mixed dynamic raw guard: `<= 1.0200x`
- mixed dynamic JSON guard: `<= 1.0200x`
- mixed same-length dynamic raw guard: `<= 1.0200x`
- pure trailing dynamic raw guard: `<= 1.0200x`
- pure trailing dynamic JSON guard: `<= 1.0200x`
- generic dynamic raw guard: `<= 1.0200x`
- forced collision raw guard: `<= 1.0200x`
- ALL dynamic raw guard: `<= 1.0200x`
- static registration guard: `<= 1.0500x`
- static retained heap guard: `<= 1.0500x`

## Interpretation contract

- PASS requires every frozen gate to pass in the first valid local authoritative run.
- A PASS only proves capability elision viable for a later direct production acceptance candidate.
- A FAIL rejects capability elision for this recovery target. Thresholds must not be relaxed and the run must not be repeated merely because it is unfavorable.
- CI may validate formatting, typecheck, tests, and probe-only correctness. CI timing is not authoritative and must not be used for acceptance.
