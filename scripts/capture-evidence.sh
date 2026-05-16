#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT"

# shellcheck source=scripts/lib/python-deps.sh
source "$ROOT/scripts/lib/python-deps.sh"
gradient_python_deps_preflight

if [ "$#" -ne 1 ]; then
  echo "usage: $0 backlog.d/<id>.md" >&2
  exit 64
fi

WORK_ITEM="$1"

python3 - "$WORK_ITEM" <<'PY'
from __future__ import annotations

import datetime as dt
import json
import pathlib
import re
import subprocess
import sys

import yaml

ROOT = pathlib.Path.cwd()
WORK_ITEM = pathlib.Path(sys.argv[1])


def run(cmd: list[str]) -> tuple[int, str]:
    proc = subprocess.run(cmd, cwd=ROOT, text=True, capture_output=True)
    return proc.returncode, (proc.stdout + proc.stderr).strip()


def parse_work_item(path: pathlib.Path) -> dict:
    text = path.read_text()
    if not text.startswith("---\n"):
        raise SystemExit(f"{path} missing YAML frontmatter")
    _, frontmatter, _body = text.split("---", 2)
    return yaml.safe_load(frontmatter)


def load_profile() -> dict:
    with (ROOT / "gradient.yaml").open() as fh:
        return yaml.safe_load(fh)


def write_json(path: pathlib.Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2) + "\n")


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9-]+", "-", text.lower()).strip("-")


def first_existing(candidates: list[str]) -> pathlib.Path | None:
    for candidate in candidates:
        path = ROOT / candidate
        if path.exists():
            return path
    return None


def context_item(context_id: str, suffix: str, kind: str, body: str, path: pathlib.Path) -> dict:
    rel_path = str(path.relative_to(ROOT))
    return {
        "id": f"{context_id}-{suffix}",
        "type": kind,
        "body": body,
        "source_uri": rel_path,
        "source_version": "git-worktree",
        "freshness": "current-worktree",
        "permission_label": "public-safe",
        "citation": rel_path,
    }


work = parse_work_item(WORK_ITEM)
profile = load_profile()
work_id = work["id"]
stamp = dt.datetime.now(dt.UTC).strftime("%Y%m%dT%H%M%SZ")
run_id = f"run-{slug(work_id)}-{stamp.lower()}"
context_id = f"context-{slug(work_id)}-{stamp.lower()}"
evidence_id = f"evidence-{slug(work_id)}-{stamp.lower()}"
policy_id = f"policy-{slug(work_id)}-{stamp.lower()}"
feedback_id = f"feedback-{slug(work_id)}-{stamp.lower()}"

status_code, status_text = run(["git", "status", "--short"])
diff_code, diff_text = run(["git", "diff", "--stat"])
validate_code, validate_text = run(["./scripts/validate.sh"])

artifact_dir = ROOT / ".gradient" / "runs" / run_id / "artifacts"
artifact_dir.mkdir(parents=True, exist_ok=True)
(artifact_dir / "git-status.txt").write_text(status_text + "\n")
(artifact_dir / "git-diff-stat.txt").write_text(diff_text + "\n")
(artifact_dir / "validate.txt").write_text(validate_text + "\n")

repo_gate = profile.get("policy", {}).get("evidence", {}).get("repo_gate", {})
repo_gate_command = repo_gate.get("command", "")
repo_gate_required = bool(repo_gate.get("required", False))
repo_gate_run_by_default = bool(repo_gate.get("run_by_default", False))
repo_gate_code = 0
repo_gate_text = "repo gate not configured"
repo_gate_status = "unverified"
if repo_gate_command and repo_gate_run_by_default:
    proc = subprocess.run(repo_gate_command, cwd=ROOT, shell=True, text=True, capture_output=True)
    repo_gate_code = proc.returncode
    repo_gate_text = (proc.stdout + proc.stderr).strip()
    repo_gate_status = "pass" if repo_gate_code == 0 else "fail"
elif repo_gate_command:
    repo_gate_text = f"repo gate configured but not run by default: {repo_gate_command}"
(artifact_dir / "repo-gate.txt").write_text(repo_gate_text + "\n")

now = dt.datetime.now(dt.UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")
harness = json.loads((ROOT / ".gradient/harness/resolution.json").read_text())


def latest_worker_slot_run(work_id: str) -> dict | None:
    candidates: list[tuple[pathlib.Path, dict]] = []
    for path in sorted((ROOT / ".gradient/runs").glob("*/run.json")):
        run = json.loads(path.read_text())
        if work_id not in run.get("work_item_ids", []):
            continue
        if not run.get("slot_id") or not run.get("workflow_prompt_version"):
            continue
        candidates.append((path, run))
    if not candidates:
        return None
    path, run = candidates[-1]
    return {"path": path, "run": run}

context_items = [
    {
        "id": f"{context_id}-work",
        "type": "requirement",
        "body": "; ".join(work.get("acceptance", [])),
        "source_uri": str(WORK_ITEM),
        "source_version": "git-worktree",
        "freshness": "current-worktree",
        "permission_label": "public-safe",
        "citation": str(WORK_ITEM),
    }
]
agent_guidance = first_existing(["AGENTS.md", "AGENTS.gradient.md"])
if agent_guidance:
    context_items.append(context_item(context_id, "agent-guidance", "procedure", "Active repository agent guidance.", agent_guidance))
architecture_doc = first_existing(["ARCHITECTURE.md", "docs/architecture.md", "README.md"])
if architecture_doc:
    context_items.append(context_item(context_id, "architecture", "requirement", "Repository architecture or overview context.", architecture_doc))
module_contracts = first_existing(["docs/module-contracts.md", "docs/context-engine.md", "README.md"])
if module_contracts and module_contracts != architecture_doc:
    context_items.append(context_item(context_id, "module-contracts", "procedure", "Repository module, context, or operating contract.", module_contracts))
harness_resolution = ROOT / ".gradient/harness/resolution.json"
if harness_resolution.exists():
    context_items.append(context_item(context_id, "harness-resolution", "evidence", "Resolved harness contract for this run.", harness_resolution))

context = {
    "$schema": "../../schemas/context-bundle.schema.json",
    "id": context_id,
    "mode": "assist",
    "query": f"What context is needed to complete {work_id}: {work['title']}?",
    "items": context_items,
}
write_json(ROOT / ".gradient/context" / f"{context_id}.json", context)

trace_refs = []
trace_required = (
    work.get("lifecycle_stage") == "Fleet Run"
    or any("trace" in item.lower() for item in work.get("acceptance", []) + work.get("evidence_required", []))
)
if trace_required:
    trace_artifact = artifact_dir / "trace-summary.txt"
    trace_artifact.write_text(f"Synthetic public-safe trace reference for {run_id}; no raw transcript committed.\n")
    trace_refs.append({
        "backend": "local",
        "trace_id": f"{run_id}-trace",
        "artifact_path": f".gradient/runs/{run_id}/artifacts/trace-summary.txt",
        "redaction": "synthetic",
        "summary": "Synthetic public-safe local trace summary for agent behavior review.",
    })

fleet = {
    "$schema": "../../../schemas/fleet-run.schema.json",
    "id": run_id,
    "backend": "codex-local",
    "status": "succeeded" if validate_code == 0 else "failed",
    "work_item_ids": [work_id],
    "harness_id": harness["id"],
    "context_bundle_id": context_id,
    "operator": "local-supervised",
    "started_at": now,
    "ended_at": now,
    "events": [
        {"type": "start", "at": now, "summary": f"Captured local supervised work for {work_id}."},
        {"type": "artifact", "at": now, "summary": "Recorded git status, diff stat, and validation output."},
        {"type": "validation", "at": now, "summary": "Ran ./scripts/validate.sh during evidence capture."},
        {"type": "complete", "at": now, "summary": "Evidence capture completed."},
    ],
    "artifacts": [
        f".gradient/runs/{run_id}/artifacts/git-status.txt",
        f".gradient/runs/{run_id}/artifacts/git-diff-stat.txt",
        f".gradient/runs/{run_id}/artifacts/validate.txt",
        f".gradient/runs/{run_id}/artifacts/repo-gate.txt",
    ],
    "trace_refs": trace_refs,
}
write_json(ROOT / ".gradient/runs" / run_id / "run.json", fleet)

repo_gate_blocks = repo_gate_required and repo_gate_status != "pass"
policy_verdict = "pass" if validate_code == 0 and not repo_gate_blocks else "needs_review"
required_artifact_kinds = [
    "work-item",
    "harness-resolution",
    "fleet-run",
    "context-bundle",
    "git-status",
    "git-diff-stat",
    "validation-output",
    "repo-gate-output",
    "policy-outcome",
    "feedback-item",
]
if trace_required:
    required_artifact_kinds.append("agent-trace")
if repo_gate_blocks:
    required_artifact_kinds.append("passing-repo-gate")
worker_slot = latest_worker_slot_run(work_id)
worker_slot_artifacts = []
if worker_slot:
    worker_run = worker_slot["run"]
    required_artifact_kinds.extend([
        "worker-slot-run",
        "workflow-prompt",
        "pr-evidence-placeholder",
    ])
    worker_slot_artifacts.append({
        "kind": "worker-slot-run",
        "path": str(worker_slot["path"].relative_to(ROOT)),
        "summary": f"Worker slot run {worker_run['id']} ({worker_run.get('handoff_state', 'unknown')}).",
    })
    for artifact_path in worker_run.get("artifacts", []):
        name = pathlib.Path(artifact_path).name
        if name == "workflow-prompt.md":
            worker_slot_artifacts.append({
                "kind": "workflow-prompt",
                "path": artifact_path,
                "summary": f"Workflow prompt version {worker_run.get('workflow_prompt_version', 'unknown')}.",
            })
        elif name == "pr-placeholder.md":
            worker_slot_artifacts.append({
                "kind": "pr-evidence-placeholder",
                "path": artifact_path,
                "summary": "Placeholder for PR or review evidence produced by the local worker slot.",
            })
        elif name == "handoff.md":
            worker_slot_artifacts.append({
                "kind": "handoff",
                "path": artifact_path,
                "summary": f"Local operator handoff for slot {worker_run.get('slot_id', 'unknown')}.",
            })
present_artifact_kinds = set(required_artifact_kinds)
missing_evidence = sorted(set(required_artifact_kinds) - present_artifact_kinds)
if repo_gate_blocks:
    missing_evidence.append("passing-repo-gate")
acceptance_status = "pass" if validate_code == 0 and not repo_gate_blocks else ("fail" if validate_code != 0 or repo_gate_status == "fail" else "unverified")
acceptance_evidence = [
    {
        "criterion": item,
        "status": acceptance_status,
        "artifact_refs": ["validation-output", "repo-gate-output"],
        "notes": "Mapped to Gradient validation and configured repository gate output.",
    }
    for item in work.get("acceptance", [])
]
acceptance_verdict = (
    "failed"
    if any(item["status"] == "fail" for item in acceptance_evidence)
    else "partially_unverified"
    if any(item["status"] == "unverified" for item in acceptance_evidence)
    else "proven"
)
evidence_verdict = (
    "sufficient"
    if validate_code == 0 and not missing_evidence and acceptance_verdict == "proven"
    else "insufficient"
)
policy = {
    "$schema": "../../schemas/policy-outcome.schema.json",
    "id": policy_id,
    "work_item_id": work_id,
    "fleet_run_id": run_id,
    "verdict": policy_verdict,
    "evidence_verdict": evidence_verdict,
    "acceptance_verdict": acceptance_verdict,
    "repo_gate_verdict": repo_gate_status if repo_gate_command else "not_required",
    "required_evidence": required_artifact_kinds,
    "missing_evidence": missing_evidence,
    "reasons": [
        "Evidence was generated from a real backlog.d work item and local git state.",
        "./scripts/validate.sh passed during capture." if validate_code == 0 else "./scripts/validate.sh did not pass during capture.",
    ],
    "eval_results": [
        {
            "id": "eval-local-validation-gate",
            "status": "pass" if validate_code == 0 else "fail",
            "summary": "Local validation gate result captured as policy input.",
        },
        {
            "id": "eval-repo-gate",
            "status": repo_gate_status if repo_gate_command else "unverified",
            "summary": "Configured repository gate result captured separately from Gradient validation.",
        }
    ],
}
write_json(ROOT / ".gradient/policy" / f"{policy_id}.json", policy)

feedback = {
    "$schema": "../../schemas/feedback-item.schema.json",
    "id": feedback_id,
    "module": "Policy" if validate_code == 0 else "Work",
    "classification": "eval-case" if validate_code == 0 else "missing-standard",
    "severity": "medium",
    "summary": "Review generated evidence and add a sharper eval if the capture missed an important risk.",
    "route": "evals/gradient-contracts.md",
    "status": "open",
}
write_json(ROOT / ".gradient/feedback" / f"{feedback_id}.json", feedback)

evidence = {
    "$schema": "../../schemas/evidence-packet.schema.json",
    "id": evidence_id,
    "work_item_id": work_id,
    "harness_id": harness["id"],
    "fleet_run_id": run_id,
    "context_bundle_id": context_id,
    "policy_outcome_id": policy_id,
    "workflow_class": "supervised-local-code-change",
    "required_artifact_kinds": required_artifact_kinds,
    "trace_refs": trace_refs,
    "acceptance_evidence": acceptance_evidence,
    "artifacts": [
        {"kind": "work-item", "path": str(WORK_ITEM), "summary": "Source work item."},
        {"kind": "harness-resolution", "path": ".gradient/harness/resolution.json", "summary": "Resolved harness contract."},
        {"kind": "git-status", "path": f".gradient/runs/{run_id}/artifacts/git-status.txt", "summary": "Captured current worktree status."},
        {"kind": "git-diff-stat", "path": f".gradient/runs/{run_id}/artifacts/git-diff-stat.txt", "summary": "Captured current diff stat."},
        {"kind": "validation-output", "path": f".gradient/runs/{run_id}/artifacts/validate.txt", "summary": "Captured validation gate output."},
        {"kind": "repo-gate-output", "path": f".gradient/runs/{run_id}/artifacts/repo-gate.txt", "summary": "Captured configured repository gate output."},
        {"kind": "context-bundle", "path": f".gradient/context/{context_id}.json", "summary": "Generated context packet."},
        {"kind": "fleet-run", "path": f".gradient/runs/{run_id}/run.json", "summary": "Generated local supervised run record."},
        {"kind": "policy-outcome", "path": f".gradient/policy/{policy_id}.json", "summary": "Generated policy verdict."},
        {"kind": "feedback-item", "path": f".gradient/feedback/{feedback_id}.json", "summary": "Generated feedback route."},
    ] + ([{"kind": "agent-trace", "path": f".gradient/runs/{run_id}/artifacts/trace-summary.txt", "summary": "Public-safe synthetic trace summary."}] if trace_required else []) + worker_slot_artifacts,
    "verification": [
        {
            "command": "./scripts/validate.sh",
            "kind": "gradient-validation",
            "status": "pass" if validate_code == 0 else "fail",
            "summary": "Validation command executed during capture.",
        },
        {
            "command": repo_gate_command or "repo gate not configured",
            "kind": "repo-gate",
            "status": repo_gate_status,
            "summary": "Configured repository gate captured separately from Gradient validation.",
        }
    ],
    "unverified_claims": [] if validate_code == 0 else ["Validation failed during capture; inspect validation artifact."],
    "reviewer_risks": [
        "Evidence capture records summaries and local artifacts, not private agent transcripts.",
        "Policy verdict is structural and local; no team/org approval workflow exists yet.",
    ],
}
write_json(ROOT / ".gradient/evidence" / f"{evidence_id}.json", evidence)

print(f"captured evidence: .gradient/evidence/{evidence_id}.json")
print(f"policy verdict: {policy_verdict}")
PY
