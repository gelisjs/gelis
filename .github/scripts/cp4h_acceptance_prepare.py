from pathlib import Path
import re

control = "1e19a185eafbe271125eb73fc9f389413345ea8b"
candidate = "45598d35271be658da76fe4ca755c04c91f35c92"

accept = Path("bench/runtime/cp4f-method-table-kind-acceptance.mts").read_text()
accept = accept.replace("cp4f-method-table-kind-worker.mts", "cp4h-fast-map-primary-worker.mts")
accept = re.sub(r'const PRODUCTION_SOURCE = "[0-9a-f]+";', f'const CONTROL_SOURCE = "{control}";', accept, count=1)
accept = re.sub(r'const CANDIDATE_SOURCE = "[0-9a-f]+";', f'const CANDIDATE_SOURCE = "{candidate}";', accept, count=1)
accept = accept.replace("PRODUCTION_WORKTREE", "CONTROL_WORKTREE")
accept = accept.replace("productionWorktreeCreated", "controlWorktreeCreated")
accept = accept.replace('"production"', '"control"')
accept = accept.replace("production", "control")
accept = accept.replace("Production", "Control")
accept = accept.replace("CP4-F method-table kind candidate", "CP4-H fast-map primary discriminator decomposition")
accept = accept.replace("CP4-F CORRECTNESS PROBE", "CP4-H CORRECTNESS PROBE")
accept = accept.replace("CP4-F LOCAL METHOD-TABLE KIND RUN: COMPLETE", "CP4-H LOCAL FAST-MAP PRIMARY DISCRIMINATOR RUN: COMPLETE")
accept = accept.replace("CP4-F requires", "CP4-H requires")
accept = accept.replace("CP4-F source", "CP4-H source")
accept = accept.replace("gelis-cp4f-production-", "gelis-cp4h-control-")
accept = accept.replace("gelis-cp4f-control-", "gelis-cp4h-control-")
accept = accept.replace('  { cell: "static-registration", label: "static registration" },\n', "")
accept = accept.replace('  { cell: "static-memory", label: "static retained heap delta" },\n', "")
accept = accept.replace('  const registrationRatio = ratio(summaries, "static-registration");\n', "")
accept = accept.replace('  const memoryRatio = ratio(summaries, "static-memory");\n', "")
accept = accept.replace('  const mixedGeomean = Math.sqrt(mixedRawRatio * mixedJsonRatio);\n', "")

old_gates = re.compile(r"  const gates = \[.*?  \] as const;", re.S)
new_gates = '''  const gates = [
    { label: "static-only recovery", value: staticOnlyRatio, limit: 0.9956 },
    { label: "mixed-static recovery", value: mixedStaticRatio, limit: 0.9850 },
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
accept = accept.replace("Frozen CP4-F method-table kind gates", "Frozen CP4-H fast-map primary discriminator decomposition gates")
accept = accept.replace("CP4-F METHOD-TABLE KIND GATE", "CP4-H FAST-MAP PRIMARY DISCRIMINATOR DECOMPOSITION GATE")
accept = accept.replace("Production vs candidate cells", "Control vs candidate cells")
accept = accept.replace("Candidate / production ratios", "Candidate / control ratios")
Path("bench/runtime/cp4h-fast-map-primary-acceptance.mts").write_text(accept)

worker = Path("bench/runtime/cp4f-method-table-kind-worker.mts").read_text()
worker = worker.replace('"production"', '"control"')
worker = worker.replace("cp4f-app=", "cp4h-app=")
worker = worker.replace("cp4f-router=", "cp4h-router=")
worker = worker.replace("source=cp4f", "source=cp4h")
Path("bench/runtime/cp4h-fast-map-primary-worker.mts").write_text(worker)

freeze = f'''# Competitive Performance v0.1 — CP4-H fast-map primary discriminator decomposition freeze

## Purpose

CP4-H isolates the request-time cost of reading `usesDynamicTrie` separately from the registration-time `fastMapKind` discriminator introduced in CP4-F.

Control is the exact frozen CP4-F source. Candidate changes only `src/runtime/router.ts`: runtime-created fast-map tables use `fastMapKind` as their primary capability discriminator, generic tables delete that kind when migrating to the trie, and legacy/prebuilt tables without a kind retain the conservative `usesDynamicTrie` fallback.

## Frozen identity

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- CP4-F control source: `{control}`
- CP4-H candidate source: `{candidate}`
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

Registration and retained-heap cells are excluded from this decomposition. If CP4-H is viable, the mechanism must later pass the full production acceptance including registration and memory before promotion.

## Frozen viability gates

| gate | candidate / CP4-F control | limit |
| --- | ---: | ---: |
| static-only recovery | candidate/control | `<= 0.9956x` |
| mixed-static recovery | candidate/control | `<= 0.9850x` |
| mixed dynamic raw guard | candidate/control | `<= 1.0200x` |
| mixed dynamic JSON guard | candidate/control | `<= 1.0200x` |
| mixed same-length dynamic raw guard | candidate/control | `<= 1.0200x` |
| pure trailing dynamic raw guard | candidate/control | `<= 1.0200x` |
| pure trailing dynamic JSON guard | candidate/control | `<= 1.0200x` |
| generic dynamic raw guard | candidate/control | `<= 1.0200x` |
| forced collision raw guard | candidate/control | `<= 1.0200x` |
| ALL dynamic raw guard | candidate/control | `<= 1.0200x` |

The recovery limits were frozen before timing from CP4-F's authoritative deficits against production: `1.0245x` static-only and `1.0356x` mixed-static. Reaching the unchanged production guard of `<= 1.0200x` requires approximately `<= 0.9956x` and `<= 0.9850x` respectively versus CP4-F.

## Interpretation contract

- PASS requires both static recovery gates and every secondary guard to pass.
- If either recovery gate fails, the discriminator change alone is insufficient to close CP4-F's static deficit.
- The first valid local timed run is authoritative evidence as-is. No threshold may change after seeing timing.
- CI may validate formatting, typecheck, tests, and probe-only correctness. CI timing is not authoritative.
'''
Path("docs/benchmarks/competitive-cp4h-fast-map-primary-freeze.md").write_text(freeze)
