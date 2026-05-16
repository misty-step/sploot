#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT"

# shellcheck source=scripts/lib/python-deps.sh
source "$ROOT/scripts/lib/python-deps.sh"
gradient_python_deps_preflight

python3 - <<'PY'
from __future__ import annotations

import json
import pathlib

import yaml

ROOT = pathlib.Path.cwd()
profile_path = ROOT / "gradient.yaml"

with profile_path.open() as fh:
    profile = yaml.safe_load(fh)

harness = profile["harness"]
resolution = {
    "$schema": "../../schemas/harness-resolution.schema.json",
    "id": f"harness-{profile['name']}-{profile['version']}",
    "profile": harness.get("profile", profile["name"]),
    "primitive_library": harness["primitive_library"],
    "shared_skill_root": harness["shared_skill_root"],
    "skills": harness["skills"],
    "agents": harness.get("agents", []),
    "bridges": harness["bridges"],
}

out = ROOT / ".gradient" / "harness" / "resolution.json"
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(resolution, indent=2) + "\n")
print(f"resolved harness: {out.relative_to(ROOT)}")
PY
