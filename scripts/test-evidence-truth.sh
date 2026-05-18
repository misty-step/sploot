#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_ROOT="${TMPDIR:-/tmp}/gradient-evidence-truth-test-$$"

cleanup() {
  rm -rf "$TMP_ROOT"
}
trap cleanup EXIT

mkdir -p "$TMP_ROOT"

git -C "$TMP_ROOT" init target >/dev/null
git -C "$TMP_ROOT/target" config user.email gradient@example.invalid
git -C "$TMP_ROOT/target" config user.name "Gradient Test"
printf "# Evidence Truth Fixture\n" > "$TMP_ROOT/target/README.md"
git -C "$TMP_ROOT/target" add README.md
git -C "$TMP_ROOT/target" commit -m "seed" >/dev/null

"$ROOT/scripts/gradient.sh" init "$TMP_ROOT/target" > "$TMP_ROOT/init.txt"
grep -q "detected shared skill root: .agents/skills" "$TMP_ROOT/init.txt"
test -d "$TMP_ROOT/target/.agents/skills/research"
test ! -d "$TMP_ROOT/target/.agent/skills"
mkdir -p "$TMP_ROOT/target/.spellbook"

cat > "$TMP_ROOT/target/ARCHITECTURE.md" <<'EOF'
# Fixture Architecture

The fixture architecture is intentionally repo-local.
EOF

cat > "$TMP_ROOT/target/.spellbook/repo-brief.md" <<'EOF'
# Fixture Repo Brief

The source of truth for work tracking is `backlog.d`.
Base branch is `master`.
Package manager is `npm`.
Closure rule is `passing-policy`.
The public-safe evidence boundary is load-bearing.
EOF

cat > "$TMP_ROOT/target/backlog.d/002-trace-work.md" <<'EOF'
---
id: 002-trace-work
title: Exercise trace-aware evidence capture
status: ready
lifecycle_stage: Fleet Run
owner: gradient-test
acceptance:
  - Capture uses ARCHITECTURE.md as repo-local context.
  - Capture records repo gate evidence separately.
  - Capture records a public-safe trace reference.
evidence_required:
  - repo gate output
  - agent trace
refs:
  - ARCHITECTURE.md
---

# Exercise trace-aware evidence capture

This fixture proves Gradient evidence truth behavior with synthetic inputs.
EOF

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

(
  cd "$TMP_ROOT/target"
  ./scripts/gradient.sh resolve
  ./scripts/gradient.sh capture backlog.d/002-trace-work.md > "$TMP_ROOT/capture-pass.txt"
  ./scripts/gradient.sh report --latest > "$TMP_ROOT/report-pass.txt"
  ./scripts/gradient.sh validate > "$TMP_ROOT/validate-pass.txt"
)

python3 - "$TMP_ROOT/target" <<'PY'
from __future__ import annotations

import json
import pathlib
import sys

root = pathlib.Path(sys.argv[1])
evidence = json.loads(sorted((root / ".gradient/evidence").glob("evidence-002-trace-work-*.json"))[-1].read_text())
context = json.loads((root / ".gradient/context" / f"{evidence['context_bundle_id']}.json").read_text())
fleet = json.loads((root / ".gradient/runs" / evidence["fleet_run_id"] / "run.json").read_text())
policy = json.loads((root / ".gradient/policy" / f"{evidence['policy_outcome_id']}.json").read_text())
sources = {item["source_uri"] for item in context["items"]}
if "ARCHITECTURE.md" not in sources:
    raise SystemExit(f"ARCHITECTURE.md missing from context sources: {sources}")
if any(source.startswith("docs/architecture.md") for source in sources):
    raise SystemExit(f"hard-coded Gradient docs leaked into context: {sources}")
if policy.get("repo_gate_verdict") != "pass":
    raise SystemExit(f"repo gate did not pass: {policy.get('repo_gate_verdict')}")
if policy.get("acceptance_verdict") != "proven":
    raise SystemExit(f"acceptance was not proven: {policy.get('acceptance_verdict')}")
if not evidence.get("acceptance_evidence"):
    raise SystemExit("missing acceptance evidence")
if not evidence.get("trace_refs") or not fleet.get("trace_refs"):
    raise SystemExit("missing trace refs")
if not any(artifact["kind"] == "repo-gate-output" for artifact in evidence["artifacts"]):
    raise SystemExit("missing repo gate artifact")
PY

grep -Eq "Repo gate:[[:space:]]+pass" "$TMP_ROOT/report-pass.txt"
grep -q "Acceptance evidence" "$TMP_ROOT/report-pass.txt"
grep -q "Trace references" "$TMP_ROOT/report-pass.txt"

cat > "$TMP_ROOT/target/.gradient/context/context-bad-citation.json" <<'EOF'
{
  "id": "context-bad-citation",
  "mode": "assist",
  "query": "bad local citation fixture",
  "items": [
    {
      "id": "bad",
      "type": "fact",
      "body": "This citation should fail.",
      "source_uri": "missing-local-doc.md",
      "freshness": "fixture",
      "permission_label": "public-safe",
      "citation": "missing-local-doc.md"
    }
  ]
}
EOF
if (cd "$TMP_ROOT/target" && ./scripts/gradient.sh validate > "$TMP_ROOT/bad-citation.txt" 2>&1); then
  echo "expected missing context citation to fail validation" >&2
  exit 1
fi
grep -q "missing source_uri: missing-local-doc.md" "$TMP_ROOT/bad-citation.txt"
rm "$TMP_ROOT/target/.gradient/context/context-bad-citation.json"

cp "$TMP_ROOT/target/.spellbook/repo-brief.md" "$TMP_ROOT/repo-brief.good"
cat > "$TMP_ROOT/target/.spellbook/repo-brief.md" <<'EOF'
# Fixture Repo Brief

The source of truth for work tracking is GitHub Issues.
EOF
if (cd "$TMP_ROOT/target" && ./scripts/gradient.sh validate > "$TMP_ROOT/tracker-drift.txt" 2>&1); then
  echo "expected tracker drift to fail validation" >&2
  exit 1
fi
grep -q "truth claim drift (work_tracker, blocking)" "$TMP_ROOT/tracker-drift.txt"
cp "$TMP_ROOT/repo-brief.good" "$TMP_ROOT/target/.spellbook/repo-brief.md"

perl -0pi -e 's/Base branch is `master`/Base branch is `develop`/' "$TMP_ROOT/target/.spellbook/repo-brief.md"
cat >> "$TMP_ROOT/target/AGENTS.md" <<'EOF'

Base branch is `master`.
EOF
(cd "$TMP_ROOT/target" && ./scripts/gradient.sh validate > "$TMP_ROOT/base-drift.txt")
grep -q "warn truth claim drift (base_branch, warning)" "$TMP_ROOT/base-drift.txt"

echo "evidence truth regression passed"
