from pathlib import Path
import re

control = "c18f231374d0008b7cc3e01bacbf9f81aff9a273"
candidate = "dafeae25257f9288735e0564a14201a70b474f7e"

accept = Path("bench/runtime/cp4k-static-only-handoff-acceptance.mts").read_text()
accept = accept.replace("cp4k-static-only-handoff-worker.mts", "cp4l-static-capability-elision-worker.mts")
accept = re.sub(r'const CONTROL_SOURCE = "[0-9a-f]+";', f'const CONTROL_SOURCE = "{control}";', accept, count=1)
accept = re.sub(r'const CANDIDATE_SOURCE = "[0-9a-f]+";', f'const CANDIDATE_SOURCE = "{candidate}";', accept, count=1)
accept = accept.replace(
    "Competitive Performance v0.1 — CP4-K static-only handoff decomposition",
    "Competitive Performance v0.1 — CP4-L static capability elision decomposition",
)
accept = accept.replace(
    '  { cell: "all-dynamic-raw", label: "ALL dynamic raw" },\n];',
    '  { cell: "all-dynamic-raw", label: "ALL dynamic raw" },\n  { cell: "static-registration", label: "static registration" },\n  { cell: "static-memory", label: "static retained heap" },\n];',
)
accept = accept.replace(
    '  const allRatio = ratio(summaries, "all-dynamic-raw");',
    '  const allRatio = ratio(summaries, "all-dynamic-raw");\n  const registrationRatio = ratio(summaries, "static-registration");\n  const memoryRatio = ratio(summaries, "static-memory");',
)
accept = accept.replace(
    '    { label: "ALL dynamic raw guard", value: allRatio, limit: 1.02 },\n  ] as const;',
    '    { label: "ALL dynamic raw guard", value: allRatio, limit: 1.02 },\n    { label: "static registration guard", value: registrationRatio, limit: 1.05 },\n    { label: "static retained heap guard", value: memoryRatio, limit: 1.05 },\n  ] as const;',
)
accept = accept.replace(
    "Frozen CP4-K static-only handoff decomposition gates",
    "Frozen CP4-L static capability elision decomposition gates",
)
accept = accept.replace(
    "CP4-K STATIC-ONLY HANDOFF DECOMPOSITION GATE",
    "CP4-L STATIC CAPABILITY ELISION DECOMPOSITION GATE",
)
accept = accept.replace(
    "CP4-K LOCAL STATIC-ONLY HANDOFF RUN: COMPLETE",
    "CP4-L LOCAL STATIC CAPABILITY ELISION RUN: COMPLETE",
)
accept = accept.replace("gelis-cp4k-control-", "gelis-cp4l-control-")
accept = accept.replace("CP4-K", "CP4-L")
Path("bench/runtime/cp4l-static-capability-elision-acceptance.mts").write_text(accept)

worker = Path("bench/runtime/cp4k-static-only-handoff-worker.mts").read_text()
worker = worker.replace("cp4k-app=", "cp4l-app=")
worker = worker.replace("cp4k-router=", "cp4l-router=")
Path("bench/runtime/cp4l-static-capability-elision-worker.mts").write_text(worker)

freeze = f'''# Competitive Performance v0.1 — CP4-L static capability elision decomposition freeze

## Purpose

CP4-L isolates the remaining static-only dispatch cost after CP4-K rejected the pathname-extraction handoff hypothesis. The control is the exact CP4-I composed source. The candidate keeps the CP4-I request-URL router for dynamic applications, but a Gelis-created Router starts with the optional `matchRequestUrl` capability elided. The first successfully registered parameterized route reveals the existing prototype capability. Static-only applications therefore fall through the already-existing application compatibility path: `pathnameFromRequestUrl(request.url)` plus `router.match(...)`.

This is a decomposition experiment, not production acceptance. It tests whether registration-time capability absence can restore static-only request performance without regressing mixed/dynamic paths, registration cost, or retained heap.

## Frozen identity

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- Control source: `{control}`
- Candidate source: `{candidate}`
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
'''
Path("docs/benchmarks/competitive-cp4l-static-capability-elision-freeze.md").write_text(freeze)
