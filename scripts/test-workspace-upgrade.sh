#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_ROOT="${TMPDIR:-/tmp}/gradient-workspace-upgrade-test-$$"

cleanup() {
  rm -rf "$TMP_ROOT"
}
trap cleanup EXIT

mkdir -p "$TMP_ROOT"

git -C "$TMP_ROOT" init target >/dev/null
git -C "$TMP_ROOT/target" config user.email gradient@example.invalid
git -C "$TMP_ROOT/target" config user.name "Gradient Test"
printf "# Upgrade Fixture\n" > "$TMP_ROOT/target/README.md"
git -C "$TMP_ROOT/target" add README.md
git -C "$TMP_ROOT/target" commit -m "seed" >/dev/null

"$ROOT/scripts/gradient.sh" init "$TMP_ROOT/target" > "$TMP_ROOT/init.txt"
test -f "$TMP_ROOT/target/.gradient/managed-manifest.json"

python3 - "$TMP_ROOT/target" <<'PY'
from __future__ import annotations

import pathlib
import sys

import yaml

root = pathlib.Path(sys.argv[1])
path = root / "gradient.yaml"
data = yaml.safe_load(path.read_text())
data["policy"]["evidence"]["repo_gate"] = {
    "command": "printf repo-gate-ok",
    "required": True,
    "run_by_default": True,
}
path.write_text(yaml.safe_dump(data, sort_keys=False))
PY

python3 - "$TMP_ROOT/target" <<'PY'
from __future__ import annotations

import hashlib
import json
import pathlib
import sys

target = pathlib.Path(sys.argv[1])
managed = target / "scripts/status.sh"
managed.write_text("#!/usr/bin/env bash\nprintf 'old managed status\\n'\n")
managed.chmod(0o755)
old_hash = hashlib.sha256(managed.read_bytes()).hexdigest()
manifest_path = target / ".gradient/managed-manifest.json"
manifest = json.loads(manifest_path.read_text())
for item in manifest["files"]:
    if item["target_path"] == "scripts/status.sh":
        item["target_sha256"] = old_hash
        item["source_sha256"] = old_hash
        break
else:
    raise SystemExit("scripts/status.sh not managed")
manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
PY

"$ROOT/scripts/gradient.sh" upgrade --dry-run "$TMP_ROOT/target" > "$TMP_ROOT/dry-run.txt"
grep -q "summary: .*update=" "$TMP_ROOT/dry-run.txt"
grep -q "scripts/status.sh <- scripts/status.sh" "$TMP_ROOT/dry-run.txt"
grep -q "old managed status" "$TMP_ROOT/target/scripts/status.sh"

"$ROOT/scripts/gradient.sh" upgrade --apply "$TMP_ROOT/target" > "$TMP_ROOT/apply.txt"
grep -q "write .*/.gradient/managed-manifest.json" "$TMP_ROOT/apply.txt"
! grep -q "old managed status" "$TMP_ROOT/target/scripts/status.sh"

printf "# local edit\n" >> "$TMP_ROOT/target/scripts/report.sh"
"$ROOT/scripts/gradient.sh" upgrade --dry-run "$TMP_ROOT/target" > "$TMP_ROOT/conflict.txt"
grep -q "conflict:" "$TMP_ROOT/conflict.txt"
grep -q "scripts/report.sh <- scripts/report.sh" "$TMP_ROOT/conflict.txt"
if "$ROOT/scripts/gradient.sh" upgrade --apply "$TMP_ROOT/target" > "$TMP_ROOT/conflict-apply.txt" 2>&1; then
  echo "expected conflicting apply to fail" >&2
  exit 1
fi
grep -q "refusing to apply with conflicts" "$TMP_ROOT/conflict-apply.txt"

python3 - "$TMP_ROOT/target" <<'PY'
from __future__ import annotations

import pathlib
import sys

target = pathlib.Path(sys.argv[1])
report = target / "scripts/report.sh"
text = report.read_text()
report.write_text(text.replace("\n# local edit\n", "\n"))
PY

"$ROOT/scripts/gradient.sh" upgrade --apply "$TMP_ROOT/target" > "$TMP_ROOT/final-apply.txt"
(
  cd "$TMP_ROOT/target"
  ./scripts/gradient.sh resolve
  ./scripts/gradient.sh validate
  ./scripts/gradient.sh capture backlog.d/001-gradient-first-local-work.md
  GRADIENT_SKIP_WORKSPACE_REGRESSIONS=1 ./scripts/gradient.sh eval
)

echo "workspace upgrade regression passed"
