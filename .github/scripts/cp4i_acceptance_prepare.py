from pathlib import Path
import re

control = "45598d35271be658da76fe4ca755c04c91f35c92"
candidate = "c18f231374d0008b7cc3e01bacbf9f81aff9a273"

accept = Path("bench/runtime/cp4h-fast-map-primary-acceptance.mts").read_text()
accept = accept.replace("cp4h-fast-map-primary-worker.mts", "cp4i-mixed-upper-bound-worker.mts")
accept = re.sub(r'const CONTROL_SOURCE = "[0-9a-f]+";', f'const CONTROL_SOURCE = "{control}";', accept, count=1)
accept = re.sub(r'const CANDIDATE_SOURCE = "[0-9a-f]+";', f'const CANDIDATE_SOURCE = "{candidate}";', accept, count=1)
accept = accept.replace(
    "CP4-H fast-map primary discriminator decomposition",
    "CP4-I mixed upper-bound viability",
)
accept = accept.replace("CP4-H CORRECTNESS PROBE", "CP4-I CORRECTNESS PROBE")
accept = accept.replace(
    "CP4-H LOCAL FAST-MAP PRIMARY DISCRIMINATOR RUN: COMPLETE",
    "CP4-I LOCAL MIXED UPPER-BOUND RUN: COMPLETE",
)
accept = accept.replace("CP4-H requires", "CP4-I requires")
accept = accept.replace("CP4-H source", "CP4-I source")
accept = accept.replace("gelis-cp4h-control-", "gelis-cp4i-control-")
accept = accept.replace(
    "Frozen CP4-H fast-map primary discriminator decomposition gates",
    "Frozen CP4-I mixed upper-bound viability gates",
)
accept = accept.replace(
    "CP4-H FAST-MAP PRIMARY DISCRIMINATOR DECOMPOSITION GATE",
    "CP4-I MIXED UPPER-BOUND VIABILITY GATE",
)
accept = accept.replace(
    "CP4-F control worktree remained after cleanup",
    "CP4-I control worktree remained after cleanup",
)

old_gates = re.compile(r"  const gates = \[.*?  \] as const;", re.S)
new_gates = '''  const gates = [
    { label: "static-only guard", value: staticOnlyRatio, limit: 1.02 },
    { label: "mixed-static recovery", value: mixedStaticRatio, limit: 0.9948 },
    { label: "mixed dynamic raw guard", value: mixedRawRatio, limit: 1.02 },
    { label: "mixed dynamic JSON guard", value: mixedJsonRatio, limit: 1.02 },
    { label: "mixed same-length dynamic raw guard", value: sameLengthRatio, limit: 1.02 },
    { label: "pure trailing dynamic raw guard", value: trailingRawRatio, limit: 1.02 },
    { label: "pure trailing dynamic JSON guard", value: trailingJsonRatio, limit: 1.02 },
    { label: "generic dynamic raw guard", value: genericRatio, limit: 1.02 },
    { label: "forced collision raw guard", value: collisionRatio, limit: 1.02 },
    { label: "ALL dynamic raw guard", value: allRatio, limit: 1.02 },
  ] as const;'''
accept, count = old_gates.subn(new_gates, accept, count=1)
if count != 1:
    raise SystemExit("gate block replacement failed")

Path("bench/runtime/cp4i-mixed-upper-bound-acceptance.mts").write_text(accept)

worker = Path("bench/runtime/cp4h-fast-map-primary-worker.mts").read_text()
worker = worker.replace("cp4h-app=", "cp4i-app=")
worker = worker.replace("cp4h-router=", "cp4i-router=")
worker = worker.replace("source=cp4h", "source=cp4i")
Path("bench/runtime/cp4i-mixed-upper-bound-worker.mts").write_text(worker)

freeze = f'''# Competitive Performance v0.1 — CP4-I mixed upper-bound viability freeze

## Purpose

CP4-I isolates the residual mixed-static cost left after CP4-H. The control is the exact frozen CP4-H source. The candidate keeps CP4-H's primary `fastMapKind` discriminator and changes only the mixed static-precedence range check from a min/max range to a one-sided upper-bound check.

For a mixed-table request longer than the maximum static route length, a static match is impossible, so the exact static lookup can still be skipped. For a request at or below the maximum, the candidate performs the exact static lookup. This is conservative for paths shorter than the previous minimum: they may pay an unnecessary lookup but cannot produce a false static match. Same-length static precedence remains exact.

## Frozen identity

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- CP4-H control source: `{control}`
- CP4-I candidate source: `{candidate}`
- Routes per workload: `5,000`
- Samples: `11` mirrored fresh-worker pairs per cell pair
- Local authoritative machine: Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz

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

Correctness requires both control and candidate to pass every cell before timing: `20/20` probes.

Registration and retained-heap cells remain outside this viability decomposition. A passing CP4-I mechanism must later pass full production acceptance against the frozen production source, including registration and retained heap, before any promotion.

## Frozen viability gates

| gate | candidate / CP4-H control | limit |
| --- | ---: | ---: |
| static-only guard | candidate/control | `<= 1.0200x` |
| mixed-static recovery | candidate/control | `<= 0.9948x` |
| mixed dynamic raw guard | candidate/control | `<= 1.0200x` |
| mixed dynamic JSON guard | candidate/control | `<= 1.0200x` |
| mixed same-length dynamic raw guard | candidate/control | `<= 1.0200x` |
| pure trailing dynamic raw guard | candidate/control | `<= 1.0200x` |
| pure trailing dynamic JSON guard | candidate/control | `<= 1.0200x` |
| generic dynamic raw guard | candidate/control | `<= 1.0200x` |
| forced collision raw guard | candidate/control | `<= 1.0200x` |
| ALL dynamic raw guard | candidate/control | `<= 1.0200x` |

The mixed-static recovery limit was frozen before timing. CP4-F measured `1.0356x` versus production and CP4-H measured `0.9901x` versus CP4-F, yielding an approximate residual of `1.0253x` versus production. Returning to the unchanged production guard of `<= 1.0200x` therefore requires approximately `1.0200 / (1.0356 * 0.9901) = 0.9948x` versus CP4-H.

## Interpretation contract

- PASS requires the mixed-static recovery gate and every secondary guard to pass.
- If mixed-static recovery fails, removing the lower-bound read/comparison is insufficient to close the residual mixed-static deficit.
- If a secondary guard fails, the one-sided discriminator is not viable even if mixed-static improves.
- The first valid local timed run is authoritative evidence as-is. No threshold may change after timing is seen.
- CI may validate formatting, typecheck, tests, and probe-only correctness. CI timing is not authoritative.
'''
Path("docs/benchmarks/competitive-cp4i-mixed-upper-bound-freeze.md").write_text(freeze)
