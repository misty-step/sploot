#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT"

# shellcheck source=scripts/lib/python-deps.sh
source "$ROOT/scripts/lib/python-deps.sh"
gradient_python_deps_preflight

usage() {
  cat <<'EOF' >&2
usage: scripts/feedback.sh <command> [args]

commands:
  report --module M --classification C --severity S --summary T --expected X --actual Y --evidence E [--repro step] [--route backlog|eval|docs|standard|reject] [--owner O] [--reporter R]
  list [--status open|routed|resolved|rejected|all]
  show <id>
  route <id> --to backlog|eval|docs|standard|reject [--rationale text]
EOF
}

cmd="${1:-help}"
shift || true

case "$cmd" in
  report|list|show|route)
    python3 - "$cmd" "$@" <<'PY'
from __future__ import annotations

import datetime as dt
import json
import os
import pathlib
import re
import sys

import yaml

ROOT = pathlib.Path.cwd()
COMMAND = sys.argv[1]
ARGS = sys.argv[2:]
MODULE_STAGE = {
    "Harness": "Intent",
    "Work": "Work Graph",
    "Fleet": "Fleet Run",
    "Policy": "Policy/Eval",
    "Context": "Evidence",
    "Training": "Feedback",
    "Deployment": "Intent",
}


def die(message: str, code: int = 64) -> None:
    print(message, file=sys.stderr)
    raise SystemExit(code)


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9-]+", "-", text.lower()).strip("-") or "feedback"


def parse_flags(args: list[str]) -> dict[str, object]:
    parsed: dict[str, object] = {"repro": [], "evidence": []}
    i = 0
    while i < len(args):
        key = args[i]
        if key not in {
            "--module",
            "--classification",
            "--severity",
            "--summary",
            "--expected",
            "--actual",
            "--evidence",
            "--repro",
            "--route",
            "--owner",
            "--reporter",
            "--scope",
            "--profile",
            "--to",
            "--rationale",
        }:
            die(f"unknown option: {key}")
        if i + 1 >= len(args):
            die(f"missing value for {key}")
        value = args[i + 1]
        if key == "--repro":
            parsed["repro"].append(value)  # type: ignore[index]
        elif key == "--evidence":
            parsed["evidence"].append(value)  # type: ignore[index]
        else:
            parsed[key[2:].replace("-", "_")] = value
        i += 2
    return parsed


def profile_name() -> str:
    path = ROOT / "gradient.yaml"
    if not path.exists():
        return "unconfigured"
    for line in path.read_text().splitlines():
        if line.startswith("name: "):
            return line.split(":", 1)[1].strip()
    return "unconfigured"


def feedback_paths() -> list[pathlib.Path]:
    return sorted((ROOT / ".gradient" / "feedback").glob("feedback-*.json"))


def load(path: pathlib.Path) -> dict:
    with path.open() as fh:
        return json.load(fh)


def write(path: pathlib.Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2) + "\n")


def resolve(identifier: str) -> tuple[pathlib.Path, dict]:
    matches = []
    for path in feedback_paths():
        data = load(path)
        if data["id"] == identifier or data["id"].startswith(identifier):
            matches.append((path, data))
    if not matches:
        die(f"feedback item not found: {identifier}", 1)
    if len(matches) > 1:
        die(f"ambiguous feedback item: {identifier}", 1)
    return matches[0]


def next_work_number() -> int:
    numbers = []
    for root in [ROOT / "backlog.d", ROOT / "backlog.d" / "_done"]:
        if not root.exists():
            continue
        for path in root.glob("[0-9][0-9][0-9]-*.md"):
            numbers.append(int(path.name[:3]))
    return max(numbers, default=0) + 1


def route_to_backlog(data: dict) -> str:
    number = next_work_number()
    stem = f"{number:03d}-{slug(data['summary'])}"
    work_id = stem
    path = ROOT / "backlog.d" / f"{stem}.md"
    acceptance = [
        data.get("expected", "Expected behavior is defined in the feedback record."),
        "Reproduce or explain the reported actual behavior.",
        "Add validation or eval evidence that covers the fix.",
    ]
    evidence_required = ["feedback record", "validation output"]
    body = f"""# {data['summary']}

## Goal

{data.get('expected', data['summary'])}

## Non-Goals

- Do not store private transcripts, secrets, or raw telemetry in public-safe artifacts.

## Oracle

""" + "\n".join(f"- {item}" for item in acceptance) + f"""

## Actual Behavior

{data.get('actual', 'Not provided.')}

## Evidence

""" + "\n".join(f"- {item}" for item in data.get("evidence", [])) + """

## Residual Risk

- Operator review is required to confirm the routed work item is scoped correctly.
"""
    frontmatter = {
        "id": work_id,
        "title": data["summary"],
        "status": "ready",
        "lifecycle_stage": data.get("lifecycle_stage", MODULE_STAGE.get(data["module"], "Feedback")),
        "owner": data.get("owner", "gradient-core"),
        "acceptance": acceptance,
        "evidence_required": evidence_required,
        "refs": [f".gradient/feedback/{data['id']}.json"],
    }
    rendered = yaml.safe_dump(frontmatter, sort_keys=False).strip()
    path.write_text(f"---\n{rendered}\n---\n\n{body}")
    return work_id


def report() -> None:
    options = parse_flags(ARGS)
    required = ["module", "classification", "severity", "summary", "expected", "actual"]
    missing = [key for key in required if not options.get(key)]
    if missing:
        die("missing required options: " + ", ".join("--" + key.replace("_", "-") for key in missing))
    now = dt.datetime.now(dt.UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    feedback_id = f"feedback-{dt.datetime.now(dt.UTC).strftime('%Y%m%dT%H%M%SZ').lower()}-{slug(str(options['summary']))[:48]}"
    data = {
        "$schema": "../../schemas/feedback-item.schema.json",
        "id": feedback_id,
        "module": options["module"],
        "classification": options["classification"],
        "severity": options["severity"],
        "summary": options["summary"],
        "route": options.get("route", "open"),
        "status": "open",
        "reporter": options.get("reporter", os.environ.get("USER", "local-operator")),
        "reported_at": now,
        "scope": options.get("scope", str(ROOT)),
        "profile": options.get("profile", profile_name()),
        "lifecycle_stage": MODULE_STAGE.get(str(options["module"]), "Feedback"),
        "expected": options["expected"],
        "actual": options["actual"],
        "reproduction": options.get("repro", []),
        "evidence": options.get("evidence", []),
        "redaction": "public-safe",
        "owner": options.get("owner", "gradient-core"),
    }
    path = ROOT / ".gradient" / "feedback" / f"{feedback_id}.json"
    write(path, data)
    print(f"reported feedback: {path.relative_to(ROOT)}")
    if data["route"] in {"backlog", "eval", "docs", "standard", "reject"}:
        route_item(data["id"], str(data["route"]), None)


def list_items() -> None:
    status = "open"
    if ARGS:
        if len(ARGS) != 2 or ARGS[0] != "--status":
            die("usage: scripts/feedback.sh list [--status open|routed|resolved|rejected|all]")
        status = ARGS[1]
    print("id\tstatus\tmodule\tseverity\troute\tsummary")
    for path in feedback_paths():
        data = load(path)
        if status != "all" and data.get("status") != status:
            continue
        print(f"{data['id']}\t{data['status']}\t{data['module']}\t{data['severity']}\t{data['route']}\t{data['summary']}")


def show(identifier: str) -> None:
    path, data = resolve(identifier)
    print(f"# {data['id']}: {data['summary']}")
    for key in ["status", "module", "classification", "severity", "route", "owner", "profile", "scope"]:
        if key in data:
            print(f"{key}: {data[key]}")
    print(f"path: {path.relative_to(ROOT)}")
    if data.get("expected"):
        print("\nExpected:\n" + data["expected"])
    if data.get("actual"):
        print("\nActual:\n" + data["actual"])
    if data.get("linked_work_item"):
        print(f"\nLinked work item: {data['linked_work_item']}")


def route_item(identifier: str, route: str, rationale: str | None) -> None:
    path, data = resolve(identifier)
    if route == "backlog":
        work_id = route_to_backlog(data)
        data["linked_work_item"] = work_id
        data["route"] = "backlog"
        data["status"] = "routed"
        print(f"routed feedback to backlog: backlog.d/{work_id}.md")
    elif route in {"eval", "docs", "standard"}:
        data["route"] = route
        data["status"] = "routed"
        print(f"routed feedback to {route}: {data['id']}")
    elif route == "reject":
        if not rationale:
            die("--rationale is required when routing to reject")
        data["route"] = "reject"
        data["status"] = "rejected"
        data["rejection_rationale"] = rationale
        print(f"rejected feedback: {data['id']}")
    else:
        die(f"unknown route: {route}")
    write(path, data)


if COMMAND == "report":
    report()
elif COMMAND == "list":
    list_items()
elif COMMAND == "show":
    if len(ARGS) != 1:
        die("usage: scripts/feedback.sh show <id>")
    show(ARGS[0])
elif COMMAND == "route":
    if not ARGS:
        die("usage: scripts/feedback.sh route <id> --to backlog|eval|docs|standard|reject [--rationale text]")
    identifier = ARGS[0]
    options = parse_flags(ARGS[1:])
    if not options.get("to"):
        die("--to is required")
    route_item(identifier, str(options["to"]), options.get("rationale"))  # type: ignore[arg-type]
PY
    ;;
  help|--help|-h)
    usage
    ;;
  *)
    echo "unknown feedback command: $cmd" >&2
    usage
    exit 64
    ;;
esac
