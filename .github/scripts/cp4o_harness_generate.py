from pathlib import Path
import subprocess

BASE = "bc472ed8aaf101705b2f660c58298392d90be56b"
CONTROL = "c18f231374d0008b7cc3e01bacbf9f81aff9a273"
CANDIDATE = "882c35250f6ce141746f0980eb65378b442504c2"

def show(path: str) -> str:
    return subprocess.check_output(["git", "show", f"{BASE}:{path}"], text=True)

acceptance = show("bench/runtime/cp4l-static-capability-elision-acceptance.mts")
worker = show("bench/runtime/cp4l-static-capability-elision-worker.mts")

acceptance = acceptance.replace("cp4l-static-capability-elision-worker.mts", "cp4o-packed-fast-map-state-worker.mts")
acceptance = acceptance.replace("gelis-cp4l-control-", "gelis-cp4o-control-")
acceptance = acceptance.replace("CP4-L", "CP4-O")
acceptance = acceptance.replace("static capability elision decomposition", "packed fast-map state viability")
acceptance = acceptance.replace("STATIC CAPABILITY ELISION DECOMPOSITION", "PACKED FAST-MAP STATE VIABILITY")
acceptance = acceptance.replace("dafeae25257f9288735e0564a14201a70b474f7e", CANDIDATE)
acceptance = acceptance.replace('{ label: "static-only recovery", value: staticOnlyRatio, limit: 0.9491 },', '{ label: "static-only guard", value: staticOnlyRatio, limit: 1.02 },')
acceptance = acceptance.replace('{ label: "mixed-static guard", value: mixedStaticRatio, limit: 1.02 },', '{ label: "mixed-static recovery", value: mixedStaticRatio, limit: 0.9963 },')
acceptance = acceptance.replace("Frozen CP4-O static capability elision decomposition gates", "Frozen CP4-O packed fast-map state viability gates")
acceptance = acceptance.replace("CP4-O LOCAL STATIC CAPABILITY ELISION RUN: COMPLETE", "CP4-O LOCAL PACKED FAST-MAP STATE RUN: COMPLETE")

worker = worker.replace("cp4l-app=", "cp4o-app=")
worker = worker.replace("cp4l-router=", "cp4o-router=")

Path("bench/runtime/cp4o-packed-fast-map-state-acceptance.mts").write_text(acceptance)
Path("bench/runtime/cp4o-packed-fast-map-state-worker.mts").write_text(worker)

freeze = f'''# Competitive Performance v0.1 — CP4-O packed fast-map state viability freeze\n\n## Purpose\n\nCP4-N localized the first reproducible static regression to CP4-B -> CP4-C, where pathname-length discriminator metadata was introduced. CP4-M then showed the composed CP4-I mixed-static path at `1.0237x` versus production, slightly outside the frozen `1.0200x` production limit.\n\nCP4-O tests whether packing fast-map lane state and the static pathname upper bound into one numeric field removes enough metadata-read/dispatch cost while preserving CP4-I's negative discrimination and dynamic wins.\n\n## Frozen identity\n\n- Bun: `1.4.2`\n- Bun revision: `744846f844374847c902b5e7fd59b4342a51ef99`\n- Control source: `{CONTROL}`\n- Candidate source: `{CANDIDATE}`\n- Routes: `5,000`\n- Samples: `11` mirrored fresh-worker pairs per cell pair\n\n## Frozen gates\n\n- static-only raw guard: `<= 1.0200x`\n- mixed-static recovery: `<= 0.9963x`\n- mixed dynamic raw guard: `<= 1.0200x`\n- mixed dynamic JSON guard: `<= 1.0200x`\n- mixed same-length dynamic raw guard: `<= 1.0200x`\n- pure trailing dynamic raw guard: `<= 1.0200x`\n- pure trailing dynamic JSON guard: `<= 1.0200x`\n- generic dynamic raw guard: `<= 1.0200x`\n- forced collision raw guard: `<= 1.0200x`\n- ALL dynamic raw guard: `<= 1.0200x`\n- static registration guard: `<= 1.0500x`\n- static retained heap guard: `<= 1.0500x`\n\nThe primary `0.9963x` gate is frozen before timing. It is slightly stricter than `1.0200 / 1.0237 = 0.9963856598...`, the recovery required by CP4-M's direct CP4-I mixed-static result.\n\nPASS requires every gate to pass. Thresholds must not be relaxed after observing local timing. The first valid authoritative local run is evidence as-is.\n'''
Path("docs/benchmarks/competitive-cp4o-packed-fast-map-state-freeze.md").write_text(freeze)
