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
import re
import sys

ROOT = pathlib.Path.cwd()
TRACE_BACKENDS = {"local", "raindrop", "langfuse", "helicone", "otlp"}
SAFE_TRACE_REDACTIONS = {"synthetic", "redacted", "redacted-export", "public-safe"}
RAW_TRACE_SUFFIXES = {".db", ".sqlite", ".sqlite3"}


def load(path: pathlib.Path) -> dict:
    with path.open() as fh:
        return json.load(fh)


def fail(message: str) -> None:
    print(f"FAIL {message}")
    raise SystemExit(1)


def ok(message: str) -> None:
    print(f"PASS {message}")


secret_patterns = [
    re.compile(r"sk-[A-Za-z0-9_-]{20,}"),
    re.compile(r"sk-proj-[A-Za-z0-9_-]{20,}"),
    re.compile(r"ghp_[A-Za-z0-9_]{20,}"),
    re.compile(r"github_pat_[A-Za-z0-9_]{20,}"),
    re.compile(r"BEGIN (?:RSA |OPENSSH )?PRIVATE KEY"),
    re.compile(r"aws_secret_access_key\s*=", re.IGNORECASE),
]

for root_name in ["backlog.d", ".gradient", "examples", "schemas"]:
    root = ROOT / root_name
    if not root.exists():
        continue
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if ".gradient/private" in str(path.relative_to(ROOT)):
            continue
        text = path.read_text(errors="ignore")
        for pattern in secret_patterns:
            if pattern.search(text):
                fail(f"public-safe fixture matched {pattern.pattern}: {path}")
ok("public-safe fixture scan")

security_fixtures = load(ROOT / "evals" / "security-fixtures.json")
for sample in security_fixtures["safe_samples"]:
    if any(pattern.search(sample) for pattern in secret_patterns):
        fail(f"safe security fixture matched secret scanner: {sample}")
for sample in security_fixtures["unsafe_samples"]:
    text = "".join(sample["parts"])
    if not any(pattern.search(text) for pattern in secret_patterns):
        fail(f"unsafe security fixture did not match secret scanner: {sample['name']}")
ok("security red fixtures")

evidences = [load(path) for path in sorted((ROOT / ".gradient/evidence").glob("*.json"))]
if not evidences:
    fail("no evidence packets found")
for evidence in evidences:
    required = ["work-item", "fleet-run", "context-bundle", "policy-outcome"]
    kinds = {artifact["kind"] for artifact in evidence["artifacts"]}
    missing = [kind for kind in required if kind not in kinds]
    if missing:
        fail(f"{evidence['id']} missing artifact kinds {missing}")
    declared_required = evidence.get("required_artifact_kinds", [])
    declared_missing = [kind for kind in declared_required if kind not in kinds]
    if declared_missing:
        fail(f"{evidence['id']} missing declared required artifact kinds {declared_missing}")
    for trace_ref in evidence.get("trace_refs", []):
        if trace_ref["backend"] not in TRACE_BACKENDS:
            fail(f"{evidence['id']} unknown trace backend {trace_ref['backend']}")
        if trace_ref["redaction"] not in SAFE_TRACE_REDACTIONS:
            fail(f"{evidence['id']} unsafe trace redaction {trace_ref['redaction']}")
        artifact_path = trace_ref.get("artifact_path", "")
        if artifact_path:
            path = ROOT / artifact_path
            if ".gradient/private" in artifact_path:
                fail(f"{evidence['id']} trace ref points at private local state")
            if path.suffix.lower() in RAW_TRACE_SUFFIXES or path.name == "raindrop_workshop.db":
                fail(f"{evidence['id']} trace ref points at raw trace store")
ok("evidence completeness")

trace_cases = load(ROOT / "evals" / "trace-fixtures.json")
for case in trace_cases["cases"]:
    evidence = case["evidence"]
    trace_refs = evidence.get("trace_refs", [])
    requires_trace = "agent-trace" in evidence.get("required_artifact_kinds", [])
    safe_trace_present = any(
        ref.get("backend") in TRACE_BACKENDS
        and ref.get("redaction") in SAFE_TRACE_REDACTIONS
        and not ref.get("artifact_path", "").endswith(tuple(RAW_TRACE_SUFFIXES))
        and ref.get("artifact_path", "") != "raindrop_workshop.db"
        for ref in trace_refs
    )
    actual = "pass" if not requires_trace or safe_trace_present else "fail"
    if actual != case["expected"]:
        fail(f"trace fixture {case['name']} expected {case['expected']} got {actual}")
ok("trace requirement fixtures")

for path in sorted((ROOT / ".gradient/context").glob("*.json")):
    context = load(path)
    for item in context["items"]:
        for field in ["source_uri", "freshness", "permission_label", "citation"]:
            if not item.get(field):
                fail(f"{context['id']} item {item['id']} missing {field}")
ok("context provenance")

policies = [load(path) for path in sorted((ROOT / ".gradient/policy").glob("*.json"))]
if not any(policy["verdict"] in {"pass", "needs_review"} for policy in policies):
    fail("no usable policy verdict found")
for policy in policies:
    evidence_verdict = policy.get("evidence_verdict")
    if evidence_verdict and evidence_verdict not in {"sufficient", "sufficient_with_risks", "insufficient"}:
        fail(f"{policy['id']} unknown evidence verdict {evidence_verdict}")
ok("policy verdicts")

if __import__("os").environ.get("GRADIENT_SKIP_WORKSPACE_REGRESSIONS") == "1":
    ok("workspace regressions skipped")
else:
    evidence_truth = __import__("subprocess").run(
        ["./scripts/test-evidence-truth.sh"],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    if evidence_truth.returncode != 0:
        print(evidence_truth.stdout)
        print(evidence_truth.stderr)
        fail("evidence truth regression failed")
    ok("evidence truth regression")

    regression = __import__("subprocess").run(
        ["./scripts/test-workspace-adoption.sh"],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    if regression.returncode != 0:
        print(regression.stdout)
        print(regression.stderr)
        fail("workspace adoption regression failed")
    ok("workspace adoption regression")

    upgrade_regression = __import__("subprocess").run(
        ["./scripts/test-workspace-upgrade.sh"],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    if upgrade_regression.returncode != 0:
        print(upgrade_regression.stdout)
        print(upgrade_regression.stderr)
        fail("workspace upgrade regression failed")
    ok("workspace upgrade regression")

print("gradient evals passed")
PY
