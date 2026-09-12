from pathlib import Path

OLD_CANDIDATE = "bda7c0668c38b45bb37afaea72f0b923eb37d64b"
NEW_CANDIDATE = "77168cea5056c50bd7188b2dace17f72f7a01514"

acceptance_source = Path(
    "bench/runtime/cp3r-production-shape-fingerprint-acceptance.mts"
).read_text()
acceptance = acceptance_source.replace("CP3-R", "CP3-S")
acceptance = acceptance.replace("cp3r", "cp3s")
acceptance = acceptance.replace(OLD_CANDIDATE, NEW_CANDIDATE)
acceptance = acceptance.replace(
    "production-shape fingerprint candidate",
    "single-index fingerprint candidate",
)
Path("bench/runtime/cp3s-single-index-fingerprint-acceptance.mts").write_text(
    acceptance
)

worker_source = Path(
    "bench/runtime/cp3r-production-shape-fingerprint-worker.mts"
).read_text()
worker = worker_source.replace("cp3r", "cp3s")
Path("bench/runtime/cp3s-single-index-fingerprint-worker.mts").write_text(worker)
