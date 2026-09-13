from pathlib import Path

CONTROL = "c18f231374d0008b7cc3e01bacbf9f81aff9a273"
CANDIDATE = "b268a99f58e6c055ed0255c30ea16783f85fb5f3"

acceptance = Path("bench/runtime/cp4p-mixed-positive-packed-state-acceptance.mts").read_text()
worker = Path("bench/runtime/cp4p-mixed-positive-packed-state-worker.mts").read_text()

acceptance = acceptance.replace(
    "cp4p-mixed-positive-packed-state-worker.mts",
    "cp4q-deferred-upper-bound-dispatch-worker.mts",
)
acceptance = acceptance.replace("gelis-cp4p-control-", "gelis-cp4q-control-")
acceptance = acceptance.replace(
    "4a79497f0b4c5e6fa88abf77c84f922417b634af",
    CANDIDATE,
)
acceptance = acceptance.replace("CP4-P", "CP4-Q")
acceptance = acceptance.replace(
    "mixed-positive packed-state viability",
    "deferred upper-bound dispatch viability",
)
acceptance = acceptance.replace(
    "MIXED-POSITIVE PACKED-STATE VIABILITY",
    "DEFERRED UPPER-BOUND DISPATCH VIABILITY",
)
acceptance = acceptance.replace(
    "CP4-Q LOCAL MIXED-POSITIVE PACKED-STATE RUN: COMPLETE",
    "CP4-Q LOCAL DEFERRED UPPER-BOUND DISPATCH RUN: COMPLETE",
)

acceptance = acceptance.replace(
    '  { cell: "static-registration", label: "static registration" },\n'
    '  { cell: "static-memory", label: "static retained heap" },\n',
    "",
)
acceptance = acceptance.replace(
    '  const registrationRatio = ratio(summaries, "static-registration");\n'
    '  const memoryRatio = ratio(summaries, "static-memory");\n',
    "",
)
acceptance = acceptance.replace(
    '''    {
      label: "static registration guard",
      value: registrationRatio,
      limit: 1.05,
    },
    { label: "static retained heap guard", value: memoryRatio, limit: 1.05 },
''',
    "",
)

worker = worker.replace("cp4p-app=", "cp4q-app=")
worker = worker.replace("cp4p-router=", "cp4q-router=")

Path("bench/runtime/cp4q-deferred-upper-bound-dispatch-acceptance.mts").write_text(
    acceptance
)
Path("bench/runtime/cp4q-deferred-upper-bound-dispatch-worker.mts").write_text(worker)

freeze = f'''# Competitive Performance v0.1 — CP4-Q deferred upper-bound dispatch viability freeze

## Purpose

CP4-N identified mixed-static as the reproducible residual and showed that CP4-E ordering recovered that lane strongly before CP4-F FastMapKind specialization added part of the cost back. CP4-O and CP4-P then showed that packing the discriminator metadata, including changing its numeric polarity, does not recover mixed-static.

CP4-Q therefore isolates request-dispatch control flow rather than metadata representation. The candidate starts from exact CP4-I source, retains CP4-I registration metadata and its upper-bound-only static negative discrimination, but removes the FastMapKind branch chain from `matchRequestUrl()` and restores CP4-E-style ordering: generic-trie fallback first, exact-static upper-bound check after URL offsets, then trailing metadata.

This is a direct CP4-I control-versus-candidate decomposition. No CP4-O or CP4-P ratio chaining is used for acceptance.

## Frozen identity

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- Control source: `{CONTROL}`
- Candidate source: `{CANDIDATE}`
- Routes: `5,000`
- Samples: `11` mirrored fresh-worker pairs per cell pair
- Timed cells: `10` request-dispatch cells
- Correctness probes: `20/20` required before timing

## Frozen gates

- static-only raw guard: `<= 1.0200x`
- mixed-static recovery: `<= 0.9963x`
- mixed dynamic raw guard: `<= 1.0200x`
- mixed dynamic JSON guard: `<= 1.0200x`
- mixed same-length dynamic raw guard: `<= 1.0200x`
- pure trailing dynamic raw guard: `<= 1.0200x`
- pure trailing dynamic JSON guard: `<= 1.0200x`
- generic dynamic raw guard: `<= 1.0200x`
- forced collision raw guard: `<= 1.0200x`
- ALL dynamic raw guard: `<= 1.0200x`

Registration and retained-heap cells are intentionally excluded because CP4-Q changes only request dispatch; registration metadata is retained from CP4-I unchanged.

## Protocol

The first valid completed local timed run on the authoritative machine is evidence as-is. Do not rerun because the result is unfavorable. Do not change source, harness, sample count, or gates after timing begins.

A PASS is decomposition evidence only. It authorizes later direct production revalidation; it does not itself promote production.
'''
Path("docs/benchmarks/competitive-cp4q-deferred-upper-bound-dispatch-freeze.md").write_text(
    freeze
)
