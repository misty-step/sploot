#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT"

usage() {
  echo "usage: $0 [--latest|.gradient/evidence/<evidence>.json]" >&2
}

target="${1:---latest}"

if [ "$target" = "-h" ] || [ "$target" = "--help" ]; then
  usage
  exit 0
fi

python3 - "$target" <<'PY'
from __future__ import annotations

import json
import pathlib
import sys

ROOT = pathlib.Path.cwd()
TARGET = sys.argv[1]


def latest_evidence() -> pathlib.Path:
    paths = sorted((ROOT / ".gradient/evidence").glob("*.json"), key=lambda p: p.stat().st_mtime)
    if not paths:
        raise SystemExit("no evidence packets found")
    return paths[-1]


def load(path: pathlib.Path) -> dict:
    with path.open() as fh:
        return json.load(fh)


def path_for(kind: str, evidence: dict) -> str:
    for artifact in evidence.get("artifacts", []):
        if artifact.get("kind") == kind:
            return artifact.get("path", "")
    return ""


evidence_path = latest_evidence() if TARGET == "--latest" else ROOT / TARGET
evidence = load(evidence_path)
fleet_path = ROOT / path_for("fleet-run", evidence)
context_path = ROOT / path_for("context-bundle", evidence)
policy_path = ROOT / path_for("policy-outcome", evidence)
feedback_path = ROOT / path_for("feedback-item", evidence)

fleet = load(fleet_path) if fleet_path.exists() else {}
context = load(context_path) if context_path.exists() else {}
policy = load(policy_path) if policy_path.exists() else {}
feedback = load(feedback_path) if feedback_path.exists() else {}
harness = load(ROOT / ".gradient/harness/resolution.json")

print("Gradient Report")
print("===============")
print(f"Work item:       {evidence.get('work_item_id')}")
print(f"Profile:         {harness.get('profile')}")
print(f"Harness:         {evidence.get('harness_id')}")
print(f"Fleet run:       {evidence.get('fleet_run_id')} ({fleet.get('status', 'unknown')})")
print(f"Context bundle:  {evidence.get('context_bundle_id')} ({len(context.get('items', []))} cited items)")
print(f"Policy verdict:  {policy.get('verdict', evidence.get('policy_outcome_id'))}")
if policy.get("evidence_verdict"):
    print(f"Evidence verdict:{policy.get('evidence_verdict')}")
print(f"Feedback route:  {feedback.get('route', 'n/a')}")
if evidence.get("trace_refs") is not None:
    print(f"Trace refs:      {len(evidence.get('trace_refs', []))}")
if policy.get("repo_gate_verdict"):
    print(f"Repo gate:       {policy.get('repo_gate_verdict')}")
if policy.get("acceptance_verdict"):
    print(f"Acceptance:      {policy.get('acceptance_verdict')}")
print()
print("Artifacts")
print("---------")
print(f"Evidence:        {evidence_path}")
for artifact in evidence.get("artifacts", []):
    print(f"- {artifact.get('kind')}: {artifact.get('path')}")
missing_kinds = sorted(set(evidence.get("required_artifact_kinds", [])) - {artifact.get("kind") for artifact in evidence.get("artifacts", [])})
if missing_kinds:
    print()
    print("Missing required artifacts")
    print("--------------------------")
    for kind in missing_kinds:
        print(f"- {kind}")
if evidence.get("trace_refs"):
    print()
    print("Trace references")
    print("----------------")
    for trace in evidence.get("trace_refs", []):
        target = trace.get("uri") or trace.get("artifact_path") or "n/a"
        print(f"- {trace.get('backend')}:{trace.get('trace_id')} {trace.get('redaction')} {target}")
if evidence.get("acceptance_evidence"):
    print()
    print("Acceptance evidence")
    print("-------------------")
    for item in evidence.get("acceptance_evidence", []):
        refs = ", ".join(item.get("artifact_refs", [])) or "n/a"
        print(f"- {item.get('status')}: {item.get('criterion')} [{refs}]")
print()
print("Verification")
print("------------")
for check in evidence.get("verification", []):
    kind = check.get("kind", "verification")
    print(f"- {kind} {check.get('command')}: {check.get('status')}")
for result in policy.get("eval_results", []):
    print(f"- {result.get('id')}: {result.get('status')} ({result.get('summary')})")

risks = evidence.get("reviewer_risks", [])
if risks:
    print()
    print("Reviewer risks")
    print("--------------")
    for risk in risks:
        print(f"- {risk}")
PY
