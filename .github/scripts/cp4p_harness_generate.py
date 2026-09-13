from pathlib import Path
import subprocess

BASE = "8d80b509665b6e1824d7a9aeeb3ff6d8ac6b5786"
CONTROL = "c18f231374d0008b7cc3e01bacbf9f81aff9a273"
CANDIDATE = "4a79497f0b4c5e6fa88abf77c84f922417b634af"


def show(path: str) -> str:
    return subprocess.check_output(["git", "show", f"{BASE}:{path}"], text=True)


acceptance = show("bench/runtime/cp4o-packed-fast-map-state-acceptance.mts")
worker = show("bench/runtime/cp4o-packed-fast-map-state-worker.mts")

acceptance = acceptance.replace(
    "cp4o-packed-fast-map-state-worker.mts",
    "cp4p-mixed-positive-packed-state-worker.mts",
)
acceptance = acceptance.replace("gelis-cp4o-control-", "gelis-cp4p-control-")
acceptance = acceptance.replace("CP4-O", "CP4-P")
acceptance = acceptance.replace(
    "packed fast-map state viability",
    "mixed-positive packed-state viability",
)
acceptance = acceptance.replace(
    "PACKED FAST-MAP STATE VIABILITY",
    "MIXED-POSITIVE PACKED-STATE VIABILITY",
)
acceptance = acceptance.replace(
    "882c35250f6ce141746f0980eb65378b442504c2",
    CANDIDATE,
)
acceptance = acceptance.replace(
    "CP4-P LOCAL PACKED FAST-MAP STATE RUN: COMPLETE",
    "CP4-P LOCAL MIXED-POSITIVE PACKED-STATE RUN: COMPLETE",
)

worker = worker.replace("cp4o-app=", "cp4p-app=")
worker = worker.replace("cp4o-router=", "cp4p-router=")

Path("bench/runtime/cp4p-mixed-positive-packed-state-acceptance.mts").write_text(
    acceptance
)
Path("bench/runtime/cp4p-mixed-positive-packed-state-worker.mts").write_text(worker)

freeze = f'''# Competitive Performance v0.1 — CP4-P mixed-positive packed-state viability freeze

## Purpose

CP4-O showed that packing lane state and the static upper bound into one numeric field was safe on every secondary guard and improved registration, but it did not recover mixed-static request time: `1.0008x` versus CP4-I against a frozen `<= 0.9963x` recovery requirement.

CP4-P keeps the one-field representation but flips its polarity so the mixed lane is the direct positive case. A mixed request now checks the positive upper bound directly instead of passing through the CP4-O negative-state decode (`state < -1`, then `-state - 1`). Pure-static state is encoded negative, trailing-only remains a sentinel, and generic routing remains unchanged.

The benchmark remains a direct comparison against CP4-I. CP4-O ratios are not chained into acceptance.

## Frozen identity

- Bun: `1.4.2`
- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`
- Control source: `{CONTROL}`
- Candidate source: `{CANDIDATE}`
- Routes: `5,000`
- Samples: `11` mirrored fresh-worker pairs per cell pair

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
- static registration guard: `<= 1.0500x`
- static retained heap guard: `<= 1.0500x`

PASS requires every gate to pass. Thresholds are frozen before local timing and must not be relaxed afterward. The first valid authoritative local run is evidence as-is.
'''
Path("docs/benchmarks/competitive-cp4p-mixed-positive-packed-state-freeze.md").write_text(
    freeze
)
