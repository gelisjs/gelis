from pathlib import Path
import re

control = "c18f231374d0008b7cc3e01bacbf9f81aff9a273"
candidate = "ac7cc2fc5eb381f703b410a1d3f9cc3a958106b8"

accept = Path("bench/runtime/cp4i-mixed-upper-bound-acceptance.mts").read_text()
accept = accept.replace("cp4i-mixed-upper-bound-worker.mts", "cp4k-static-only-handoff-worker.mts")
accept = re.sub(r'const CONTROL_SOURCE = "[0-9a-f]+";', f'const CONTROL_SOURCE = "{control}";', accept, count=1)
accept = re.sub(r'const CANDIDATE_SOURCE = "[0-9a-f]+";', f'const CANDIDATE_SOURCE = "{candidate}";', accept, count=1)
accept = accept.replace(
    "Competitive Performance v0.1 — CP4-I mixed upper-bound viability",
    "Competitive Performance v0.1 — CP4-K static-only handoff decomposition",
)
accept = accept.replace(
    '    { label: "static-only guard", value: staticOnlyRatio, limit: 1.02 },',
    '    { label: "static-only recovery", value: staticOnlyRatio, limit: 0.9491 },',
)
accept = accept.replace(
    '    { label: "mixed-static recovery", value: mixedStaticRatio, limit: 0.9948 },',
    '    { label: "mixed-static guard", value: mixedStaticRatio, limit: 1.02 },',
)
accept = accept.replace(
    "Frozen CP4-I mixed upper-bound viability gates",
    "Frozen CP4-K static-only handoff decomposition gates",
)
accept = accept.replace(
    "CP4-I MIXED UPPER-BOUND VIABILITY GATE",
    "CP4-K STATIC-ONLY HANDOFF DECOMPOSITION GATE",
)
accept = accept.replace(
    "CP4-I LOCAL MIXED UPPER-BOUND RUN: COMPLETE",
    "CP4-K LOCAL STATIC-ONLY HANDOFF RUN: COMPLETE",
)
accept = accept.replace("gelis-cp4i-control-", "gelis-cp4k-control-")
accept = accept.replace("CP4-I", "CP4-K")
Path("bench/runtime/cp4k-static-only-handoff-acceptance.mts").write_text(accept)

worker = Path("bench/runtime/cp4i-mixed-upper-bound-worker.mts").read_text()
worker = worker.replace("cp4i-app=", "cp4k-app=")
worker = worker.replace("cp4i-router=", "cp4k-router=")
Path("bench/runtime/cp4k-static-only-handoff-worker.mts").write_text(worker)

freeze = f'''# Competitive Performance v0.1 — CP4-K static-only handoff decomposition freeze

## Purpose

CP4-K isolates the dominant residual from the failed CP4-J full production acceptance: pure static request dispatch. The control is the exact rejected CP4-I source, and the candidate changes only the runtime-created `FAST_MAP_STATIC_ONLY` request path so it exits before the full request-URL offset parser and performs a production-shaped `pathnameFromRequestUrl(url)` plus exact static-map lookup.

This is a decomposition experiment, not production acceptance. Mixed, trailing, generic, collision, and ALL-dynamic cells are secondary regression guards.

## Frozen identity

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- Control source: `{control}`
- Candidate source: `{candidate}`
- Routes per workload: `5,000`
- Samples: `11` mirrored fresh-worker pairs per cell pair
- Local authoritative machine: Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz

## Recovery derivation

CP4-J measured the control-equivalent composed source at `1.0747x` production for static-only raw. To reach the frozen production gate `<= 1.0200x`, a candidate/control ratio of at most `1.0200 / 1.0747 = 0.949102...` is required. The pre-timing CP4-K recovery gate is therefore frozen at `<= 0.9491x`.

No chained ratio can promote a candidate. This threshold is only a viability discriminator; any eventual production candidate must still pass a new direct production acceptance run.

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

Correctness requires control and candidate to pass every cell before timing: `20/20` probes.

## Frozen gates

| gate | candidate / control | limit |
| --- | ---: | ---: |
| static-only recovery | candidate/control | `<= 0.9491x` |
| mixed-static guard | candidate/control | `<= 1.0200x` |
| mixed dynamic raw guard | candidate/control | `<= 1.0200x` |
| mixed dynamic JSON guard | candidate/control | `<= 1.0200x` |
| mixed same-length dynamic raw guard | candidate/control | `<= 1.0200x` |
| pure trailing dynamic raw guard | candidate/control | `<= 1.0200x` |
| pure trailing dynamic JSON guard | candidate/control | `<= 1.0200x` |
| generic dynamic raw guard | candidate/control | `<= 1.0200x` |
| forced collision raw guard | candidate/control | `<= 1.0200x` |
| ALL dynamic raw guard | candidate/control | `<= 1.0200x` |

## Interpretation contract

- PASS requires every frozen gate to pass in the first valid local authoritative run.
- A PASS only proves the static-only handoff mechanism is viable for composition into a later candidate.
- A FAIL rejects this mechanism as the static-only recovery path. No threshold may be relaxed and no run may be repeated merely because the result is unfavorable.
- Registration and retained heap are intentionally excluded because CP4-K changes only per-request dispatch and does not alter table representation or registration.
- CI may validate formatting, typecheck, tests, and probe-only correctness. CI timing is not authoritative and must not be used for acceptance.
'''
Path("docs/benchmarks/competitive-cp4k-static-only-handoff-freeze.md").write_text(freeze)
