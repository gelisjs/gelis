from pathlib import Path
import subprocess

SOURCE_SHA = "cdad3f3d6013abc435fed4411dda4dcf90e74c67"
SOURCE_PATH = "bench/runtime/cp4as-collision-memory-gate.mts"
TARGET_PATH = Path("bench/runtime/cp4aw-collision-memory-gate.mts")
OLD_CANDIDATE = "dd25f4ada6ceef68460efb0845fea45c238c49cf"
NEW_CANDIDATE = "4e8ea606086da239e36bca994568968cbb778b2c"

source = subprocess.check_output(
    ["git", "show", f"{SOURCE_SHA}:{SOURCE_PATH}"],
    text=True,
)

source = source.replace(OLD_CANDIDATE, NEW_CANDIDATE)
source = source.replace("CP4-AS", "CP4-AW")

TARGET_PATH.write_text(source, encoding="utf-8")
