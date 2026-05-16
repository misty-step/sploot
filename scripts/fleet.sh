#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT"

usage() {
  cat <<'EOF' >&2
usage: scripts/fleet.sh <command> [args]

commands:
  normalize-board <json> write normalized synthetic board work items
  start <work-id|path> [--slot id] [--backend codex-local|claude-code-local|manual] [--prompt-version version]
  status [run-id]
  complete <run-id> [summary]
  abort <run-id> [summary]
EOF
}

cmd="${1:-help}"
shift || true

case "$cmd" in
  normalize-board|start|status|complete|abort)
    python3 - "$cmd" "$@" <<'PY'
from __future__ import annotations

import datetime as dt
import json
import pathlib
import re
import sys
from typing import Any

import yaml

ROOT = pathlib.Path.cwd()
COMMAND = sys.argv[1]
ARGS = sys.argv[2:]


def die(message: str, code: int = 64) -> None:
    print(message, file=sys.stderr)
    raise SystemExit(code)


def now() -> str:
    return dt.datetime.now(dt.UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return dt.datetime.now(dt.UTC).strftime("%Y%m%dT%H%M%SZ").lower()


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9-]+", "-", text.lower()).strip("-")


def load_json(path: pathlib.Path) -> dict[str, Any]:
    with path.open() as fh:
        return json.load(fh)


def write_json(path: pathlib.Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2) + "\n")


def split_doc(path: pathlib.Path) -> tuple[dict[str, Any], str]:
    text = path.read_text()
    if not text.startswith("---\n"):
        die(f"{path} missing YAML frontmatter")
    _prefix, frontmatter, body = text.split("---", 2)
    return yaml.safe_load(frontmatter), body.lstrip("\n")


def write_doc(path: pathlib.Path, data: dict[str, Any], body: str) -> None:
    path.write_text(f"---\n{yaml.safe_dump(data, sort_keys=False).strip()}\n---\n\n{body}")


def resolve_work(selector: str) -> tuple[pathlib.Path, dict[str, Any], str]:
    path = pathlib.Path(selector)
    if path.exists():
        data, body = split_doc(path)
        return path, data, body
    matches = []
    for candidate in sorted((ROOT / "backlog.d").glob("*.md")):
        data, body = split_doc(candidate)
        if data["id"] == selector or data["id"].startswith(selector):
            matches.append((candidate, data, body))
    if not matches:
        die(f"no active work item found for {selector}", 1)
    if len(matches) > 1:
        die(f"ambiguous work item {selector}: {', '.join(match[1]['id'] for match in matches)}", 1)
    return matches[0]


def parse_start_args(args: list[str]) -> tuple[str, str, str, str]:
    if not args:
        die("usage: scripts/fleet.sh start <work-id|path> [--slot id] [--backend codex-local|claude-code-local|manual] [--prompt-version version]")
    selector = args[0]
    slot_id = "local-1"
    backend = "codex-local"
    prompt_version = "local-supervised-v0"
    idx = 1
    while idx < len(args):
        flag = args[idx]
        if flag not in {"--slot", "--backend", "--prompt-version"}:
            die(f"unknown start option: {flag}")
        if idx + 1 >= len(args):
            die(f"missing value for {flag}")
        value = args[idx + 1]
        if flag == "--slot":
            slot_id = value
        elif flag == "--backend":
            if value not in {"codex-local", "claude-code-local", "manual"}:
                die(f"unknown backend: {value}")
            backend = value
        else:
            prompt_version = value
        idx += 2
    return selector, slot_id, backend, prompt_version


def run_paths(run_id: str) -> tuple[pathlib.Path, pathlib.Path]:
    run_dir = ROOT / ".gradient" / "runs" / run_id
    return run_dir, run_dir / "artifacts"


def start_run(args: list[str]) -> None:
    selector, slot_id, backend, prompt_version = parse_start_args(args)
    work_path, work, body = resolve_work(selector)
    if work["status"] not in {"ready", "leased"}:
        die(f"cannot start fleet run for {work['id']} in status {work['status']}", 1)

    harness = load_json(ROOT / ".gradient" / "harness" / "resolution.json")
    run_id = f"run-{slug(work['id'])}-{stamp()}"
    run_dir, artifact_dir = run_paths(run_id)
    artifact_dir.mkdir(parents=True, exist_ok=True)

    prompt_path = artifact_dir / "workflow-prompt.md"
    handoff_path = artifact_dir / "handoff.md"
    pr_placeholder_path = artifact_dir / "pr-placeholder.md"
    prompt_path.write_text(
        f"# Local Supervised Workflow\n\n"
        f"Version: {prompt_version}\n"
        f"Work item: {work['id']}\n"
        f"Acceptance criteria:\n"
        + "\n".join(f"- {item}" for item in work.get("acceptance", []))
        + "\n"
    )
    handoff_path.write_text(
        f"# Fleet Handoff\n\n"
        f"Run: {run_id}\n"
        f"Slot: {slot_id}\n"
        f"State: waiting_for_operator\n"
        f"Next: run the work in the selected local agent, then call `gradient fleet complete {run_id}`.\n"
    )
    pr_placeholder_path.write_text(
        f"# PR / Evidence Placeholder\n\n"
        f"Run {run_id} has not opened a PR. Attach review artifacts before closing production work.\n"
    )

    t = now()
    run = {
        "$schema": "../../../schemas/fleet-run.schema.json",
        "id": run_id,
        "backend": backend,
        "slot_id": slot_id,
        "workflow_prompt_version": prompt_version,
        "handoff_state": "waiting_for_operator",
        "status": "waiting",
        "work_item_ids": [work["id"]],
        "harness_id": harness["id"],
        "operator": "local-supervised",
        "started_at": t,
        "events": [
            {"type": "start", "at": t, "summary": f"Started local supervised run for {work['id']}."},
            {"type": "handoff", "at": t, "summary": f"Leased worker slot {slot_id} using {prompt_version}."},
            {"type": "artifact", "at": t, "summary": "Wrote workflow prompt, handoff, and PR/evidence placeholder artifacts."},
        ],
        "artifacts": [
            f".gradient/runs/{run_id}/artifacts/workflow-prompt.md",
            f".gradient/runs/{run_id}/artifacts/handoff.md",
            f".gradient/runs/{run_id}/artifacts/pr-placeholder.md",
        ],
    }
    write_json(run_dir / "run.json", run)

    work["status"] = "leased"
    work["owner"] = f"fleet:{slot_id}"
    write_doc(work_path, work, body)

    print(run_id)
    print(f"handoff: .gradient/runs/{run_id}/artifacts/handoff.md")


def normalize_board(args: list[str]) -> None:
    if len(args) != 1:
        die("usage: scripts/fleet.sh normalize-board <json>")
    board_path = pathlib.Path(args[0])
    if not board_path.exists():
        die(f"board source does not exist: {board_path}", 1)
    board = load_json(board_path)
    cards = board.get("cards", [])
    if not isinstance(cards, list) or not cards:
        die("board source must contain non-empty cards[]", 1)
    normalized = []
    for card in cards:
        work = {
            "id": card["id"],
            "title": card["title"],
            "status": card.get("status", "ready"),
            "lifecycle_stage": card.get("lifecycle_stage", "Work Graph"),
            "owner": card.get("owner", "gradient-core"),
            "acceptance": card.get("acceptance", []),
            "evidence_required": card.get("evidence_required", []),
            "source": {
                "kind": "synthetic-board",
                "board_id": board.get("id", "synthetic-board"),
                "lane": card.get("lane", "ready"),
            },
        }
        if not work["acceptance"] or not work["evidence_required"]:
            die(f"card {work['id']} missing acceptance or evidence_required", 1)
        normalized.append(work)
    output = ROOT / ".gradient" / "fleet" / f"{slug(board.get('id', 'synthetic-board'))}.normalized-work.json"
    write_json(output, {"source": str(board_path), "items": normalized})
    print(output.relative_to(ROOT))


def run_file(run_id: str) -> pathlib.Path:
    path = ROOT / ".gradient" / "runs" / run_id / "run.json"
    if not path.exists():
        die(f"no fleet run found: {run_id}", 1)
    return path


def list_runs() -> None:
    print("id\tstatus\thandoff\tslot\tbackend\twork")
    for path in sorted((ROOT / ".gradient" / "runs").glob("*/run.json")):
        run = load_json(path)
        print(
            f"{run['id']}\t{run['status']}\t{run.get('handoff_state', '-')}\t"
            f"{run.get('slot_id', '-')}\t{run['backend']}\t{','.join(run['work_item_ids'])}"
        )


def show_run(run_id: str) -> None:
    run = load_json(run_file(run_id))
    print(json.dumps(run, indent=2))


def update_run(run_id: str, status: str, handoff_state: str, event_type: str, summary: str) -> None:
    path = run_file(run_id)
    run = load_json(path)
    t = now()
    run["status"] = status
    run["handoff_state"] = handoff_state
    run["ended_at"] = t
    run.setdefault("events", []).append({"type": event_type, "at": t, "summary": summary})
    write_json(path, run)
    print(f"{run_id} -> {status}")


if COMMAND == "normalize-board":
    normalize_board(ARGS)
elif COMMAND == "start":
    start_run(ARGS)
elif COMMAND == "status":
    if len(ARGS) == 0:
        list_runs()
    elif len(ARGS) == 1:
        show_run(ARGS[0])
    else:
        die("usage: scripts/fleet.sh status [run-id]")
elif COMMAND == "complete":
    if len(ARGS) not in {1, 2}:
        die("usage: scripts/fleet.sh complete <run-id> [summary]")
    update_run(ARGS[0], "succeeded", "ready_for_review", "complete", ARGS[1] if len(ARGS) == 2 else "Local supervised run marked ready for review.")
elif COMMAND == "abort":
    if len(ARGS) not in {1, 2}:
        die("usage: scripts/fleet.sh abort <run-id> [summary]")
    update_run(ARGS[0], "aborted", "aborted", "abort", ARGS[1] if len(ARGS) == 2 else "Local supervised run aborted.")
PY
    ;;
  help|--help|-h)
    usage
    ;;
  *)
    echo "unknown fleet command: $cmd" >&2
    usage
    exit 64
    ;;
esac
