from pathlib import Path
import re

control = "1e19a185eafbe271125eb73fc9f389413345ea8b"
candidate = "b3ae6337b561d2683376a0f459a3bbf2d50d0867"

accept_src = Path("bench/runtime/cp4f-method-table-kind-acceptance.mts").read_text()
accept = accept_src
accept = accept.replace("cp4f-method-table-kind-worker.mts", "cp4g-request-url-dispatch-worker.mts")
accept = accept.replace("PRODUCTION_SOURCE", "CONTROL_SOURCE")
accept = accept.replace("PRODUCTION_WORKTREE", "CONTROL_WORKTREE")
accept = accept.replace("productionWorktreeCreated", "controlWorktreeCreated")
accept = accept.replace('"af4e5102046def1b163435333563b8d08f919bf5"', f'"{control}"', 1)
accept = accept.replace('"1e19a185eafbe271125eb73fc9f389413345ea8b"', f'"{candidate}"', 1)
accept = accept.replace('"production"', '"control"')
accept = accept.replace("production", "control")
accept = accept.replace("Production", "Control")
accept = accept.replace("CP4-F method-table kind candidate", "CP4-G request URL dispatch decomposition")
accept = accept.replace("CP4-F CORRECTNESS PROBE", "CP4-G CORRECTNESS PROBE")
accept = accept.replace("CP4-F LOCAL METHOD-TABLE KIND RUN: COMPLETE", "CP4-G LOCAL REQUEST URL DISPATCH DECOMPOSITION RUN: COMPLETE")
accept = accept.replace("CP4-F requires", "CP4-G requires")
accept = accept.replace("CP4-F source", "CP4-G source")
accept = accept.replace("gelis-cp4f-control-", "gelis-cp4g-control-")
accept = accept.replace("gelis-cp4f-production-", "gelis-cp4g-control-")
accept = accept.replace('  { cell: "static-registration", label: "static registration" },\n', "")
accept = accept.replace('  { cell: "static-memory", label: "static retained heap delta" },\n', "")
accept = accept.replace('  const registrationRatio = ratio(summaries, "static-registration");\n', "")
accept = accept.replace('  const memoryRatio = ratio(summaries, "static-memory");\n', "")

old_gates = re.compile(r"  const gates = \[.*?  \] as const;", re.S)
new_gates = '''  const gates = [
    {
      label: "static-only recovery",
      value: staticOnlyRatio,
      limit: 0.9956,
    },
    {
      label: "mixed-static recovery",
      value: mixedStaticRatio,
      limit: 0.985,
    },
    {
      label: "mixed dynamic raw guard",
      value: mixedRawRatio,
      limit: 1.02,
    },
    {
      label: "mixed dynamic JSON guard",
      value: mixedJsonRatio,
      limit: 1.02,
    },
    {
      label: "mixed same-length dynamic raw guard",
      value: sameLengthRatio,
      limit: 1.02,
    },
    {
      label: "pure trailing dynamic raw guard",
      value: trailingRawRatio,
      limit: 1.02,
    },
    {
      label: "pure trailing dynamic JSON guard",
      value: trailingJsonRatio,
      limit: 1.02,
    },
    { label: "generic dynamic raw guard", value: genericRatio, limit: 1.02 },
    { label: "forced collision raw guard", value: collisionRatio, limit: 1.02 },
    { label: "ALL dynamic raw guard", value: allRatio, limit: 1.02 },
  ] as const;'''
accept, count = old_gates.subn(new_gates, accept, count=1)
if count != 1:
    raise SystemExit("gate block replacement failed")

accept = accept.replace(
    "Frozen CP4-F method-table kind gates",
    "Frozen CP4-G request URL dispatch decomposition gates",
)
accept = accept.replace(
    "CP4-F METHOD-TABLE KIND GATE",
    "CP4-G REQUEST URL DISPATCH DECOMPOSITION GATE",
)

Path("bench/runtime/cp4g-request-url-dispatch-acceptance.mts").write_text(accept)

worker_src = Path("bench/runtime/cp4f-method-table-kind-worker.mts").read_text()
worker = worker_src.replace('"production"', '"control"')
worker = worker.replace("cp4f-app=", "cp4g-app=")
worker = worker.replace("cp4f-router=", "cp4g-router=")
worker = worker.replace("source=cp4f", "source=cp4g")
Path("bench/runtime/cp4g-request-url-dispatch-worker.mts").write_text(worker)

freeze = f'''# Competitive Performance v0.1 — CP4-G request URL dispatch decomposition freeze

## Purpose

CP4-G isolates the per-request application dispatch cost that remains above the CP4-F router algorithm. It is a decomposition experiment, not a production acceptance candidate.

The control is the exact frozen CP4-F source. The candidate changes only `src/app.ts`: routers that already provide `matchRequestUrl` are used directly, while routers without it are normalized once at installation through a compatibility adapter. `Gelis.fetch()` then calls the normalized request-URL matcher directly instead of performing an optional capability branch and `Function.call()` on every request.

## Frozen identity

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- CP4-F control source: `{control}`
- CP4-G candidate source: `{candidate}`
- Routes per workload: `5,000`
- Samples: `11` mirrored fresh-worker pairs per cell pair
- Local authoritative machine: Intel(R) Core(TM) i5-10500H CPU @ 2.50GHz

## Frozen cells

- static-only raw
- mixed static raw
- mixed dynamic raw
- mixed dynamic JSON
- mixed same-length dynamic raw
- pure trailing dynamic raw
- pure trailing dynamic JSON
- generic dynamic raw
- forced collision raw
- ALL dynamic raw

Correctness requires both control and candidate to pass every cell before timing: `20/20` probes.

Registration and retained-heap cells are intentionally excluded because CP4-G changes application request dispatch only and does not alter router registration or table representation.

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

The two recovery thresholds are derived before timing from CP4-F's authoritative production deficits. CP4-F static-only was `1.0245x` vs production, so closing the frozen production guard of `1.0200x` requires at most `1.0200 / 1.0245 = 0.995607...`, frozen as `0.9956x`. CP4-F mixed-static was `1.0356x`, so closing the same production guard requires at most `1.0200 / 1.0356 = 0.984936...`, frozen as `0.9850x`.

The remaining cells use the established `<= 1.0200x` no-regression guard. They exist to ensure an app-dispatch improvement is not bought by materially harming dynamic request shapes.

## Interpretation contract

- If both recovery gates pass and every secondary guard passes, app-level request-URL dispatch is strong enough to compose into the next full production candidate.
- If either recovery gate fails, this mechanism alone does not recover enough of the observed CP4-F static deficit to justify production promotion by itself.
- A valid first local timed run is evidence as-is. Thresholds must not be relaxed and the run must not be repeated merely because the result is unfavorable.
- CI may validate formatting, typecheck, tests, and the probe-only harness. CI timing is not authoritative.
'''
Path("docs/benchmarks/competitive-cp4g-request-url-dispatch-freeze.md").write_text(freeze)
