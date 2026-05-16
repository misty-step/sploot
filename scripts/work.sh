#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT"

# shellcheck source=scripts/lib/python-deps.sh
source "$ROOT/scripts/lib/python-deps.sh"
gradient_python_deps_preflight

usage() {
  cat <<'EOF' >&2
usage: scripts/work.sh <command> [args]

commands:
  list [--status ready|leased|blocked|done|failed|all]
  next
  show <id|path>
  adopt <backlog-dir>
  claim <id|path> [owner]
  ready <id|path>
  block <id|path>
  fail <id|path>
EOF
}

cmd="${1:-help}"
shift || true

case "$cmd" in
  list|next|show|adopt|claim|ready|block|fail)
    python3 - "$cmd" "$@" <<'PY'
from __future__ import annotations

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


def split_doc(path: pathlib.Path) -> tuple[dict[str, Any], str]:
    text = path.read_text()
    if not text.startswith("---\n"):
        die(f"{path} missing YAML frontmatter")
    _prefix, frontmatter, body = text.split("---", 2)
    return yaml.safe_load(frontmatter), body.lstrip("\n")


def write_doc(path: pathlib.Path, data: dict[str, Any], body: str) -> None:
    rendered = yaml.safe_dump(data, sort_keys=False).strip()
    path.write_text(f"---\n{rendered}\n---\n\n{body}")


def work_paths(include_done: bool = True) -> list[pathlib.Path]:
    paths = sorted((ROOT / "backlog.d").glob("[0-9][0-9][0-9]-*.md"))
    if include_done:
        paths += sorted((ROOT / "backlog.d" / "_done").glob("[0-9][0-9][0-9]-*.md"))
    return paths


def load_items(include_done: bool = True) -> list[tuple[pathlib.Path, dict[str, Any], str]]:
    items = []
    for path in work_paths(include_done):
        data, body = split_doc(path)
        items.append((path, data, body))
    return items


def resolve(selector: str) -> tuple[pathlib.Path, dict[str, Any], str]:
    path = pathlib.Path(selector)
    if path.exists():
        data, body = split_doc(path)
        return path, data, body

    matches = []
    for candidate, data, body in load_items(include_done=True):
        if data["id"] == selector or data["id"].startswith(selector):
            matches.append((candidate, data, body))
    if not matches:
        die(f"no work item found for {selector}", 1)
    if len(matches) > 1:
        names = ", ".join(item[1]["id"] for item in matches)
        die(f"ambiguous work item {selector}: {names}", 1)
    return matches[0]


def print_row(path: pathlib.Path, data: dict[str, Any]) -> None:
    rel = path.relative_to(ROOT)
    print(f"{data['id']}\t{data['status']}\t{data['lifecycle_stage']}\t{data.get('owner', '-')}\t{data['title']}\t{rel}")


def list_items(status: str) -> None:
    print("id\tstatus\tstage\towner\ttitle\tpath")
    for path, data, _body in load_items(include_done=True):
        if status != "all" and data["status"] != status:
            continue
        print_row(path, data)


def next_item() -> None:
    ready = [
        (path, data)
        for path, data, _body in load_items(include_done=False)
        if data["status"] == "ready"
    ]
    if not ready:
        die("no ready work items", 1)
    _path, data = ready[0]
    print(data["id"])


def show(selector: str) -> None:
    path, data, body = resolve(selector)
    print(f"# {data['id']}: {data['title']}")
    print(f"status: {data['status']}")
    print(f"stage: {data['lifecycle_stage']}")
    print(f"owner: {data.get('owner', '-')}")
    print(f"path: {path.relative_to(ROOT)}")
    print()
    print("Acceptance:")
    for item in data.get("acceptance", []):
        print(f"- {item}")
    print()
    print("Evidence required:")
    for item in data.get("evidence_required", []):
        print(f"- {item}")
    if body.strip():
        print()
        print(body.rstrip())


def slug_from_path(path: pathlib.Path) -> str:
    return path.stem


def title_from_body(path: pathlib.Path, body: str) -> str:
    for line in body.splitlines():
        if line.startswith("# "):
            return line[2:].strip()
    return slug_from_path(path).replace("-", " ").title()


def status_from_body(path: pathlib.Path, body: str) -> str:
    if "_done" in path.parts:
        return "done"
    for line in body.splitlines():
        match = re.match(r"(?i)^status:\s*(.+?)\s*$", line.strip())
        if not match:
            continue
        raw = match.group(1).lower()
        return {
            "ready": "ready",
            "todo": "ready",
            "to do": "ready",
            "in-progress": "leased",
            "in progress": "leased",
            "doing": "leased",
            "done": "done",
            "complete": "done",
            "completed": "done",
            "blocked": "blocked",
            "failed": "failed",
        }.get(raw, "ready")
    return "ready"


def oracle_acceptance(body: str) -> list[str]:
    lines = body.splitlines()
    in_oracle = False
    items: list[str] = []
    for line in lines:
        if line.startswith("## "):
            in_oracle = line.strip().lower() == "## oracle"
            continue
        if not in_oracle:
            continue
        stripped = line.strip()
        if stripped.startswith("- [ ] "):
            items.append(stripped[6:].strip())
        elif stripped.startswith("- [x] ") or stripped.startswith("- [X] "):
            items.append(stripped[6:].strip())
        elif stripped.startswith("- "):
            items.append(stripped[2:].strip())
    return [item for item in items if item]


def adopt(backlog_dir: str) -> None:
    root = (ROOT / backlog_dir).resolve()
    if not root.is_dir():
        die(f"backlog directory not found: {backlog_dir}", 1)
    candidates = sorted(root.glob("*.md")) + sorted((root / "_done").glob("*.md") if (root / "_done").exists() else [])
    print("path\taction\tstatus\tnotes")
    for path in candidates:
        rel = path.relative_to(ROOT)
        if not re.match(r"^[0-9][0-9][0-9]-.*\.md$", path.name):
            print(f"{rel}\tskip\t-\tnon-ticket markdown")
            continue
        text = path.read_text()
        if text.startswith("---\n"):
            print(f"{rel}\tpreserve\t-\talready has frontmatter")
            continue
        body = text
        status = status_from_body(path, body)
        data = {
            "id": slug_from_path(path),
            "title": title_from_body(path, body),
            "status": status,
            "lifecycle_stage": "Feedback" if status == "done" or "_done" in path.parts else "Intent",
            "owner": "local",
            "acceptance": oracle_acceptance(body) or ["Preserve the existing ticket goal; operator review required."],
            "evidence_required": ["validation output"],
            "refs": [str(rel)],
        }
        rendered = yaml.safe_dump(data, sort_keys=False).strip()
        path.write_text(f"---\n{rendered}\n---\n\n{body}")
        note = "top-level done ticket may be moved to backlog.d/_done" if status == "done" and "_done" not in path.parts else "frontmatter added"
        print(f"{rel}\tadopt\t{status}\t{note}")


def transition(selector: str, status: str, owner: str | None = None) -> None:
    path, data, body = resolve(selector)
    if path.parts[-2:] and "_done" in path.parts:
        die(f"cannot transition archived work item: {path.relative_to(ROOT)}", 1)
    data["status"] = status
    if owner:
        data["owner"] = owner
    write_doc(path, data, body)
    print(f"{data['id']} -> {status}")


if COMMAND == "list":
    status = "all"
    if ARGS:
        if len(ARGS) != 2 or ARGS[0] != "--status":
            die("usage: scripts/work.sh list [--status ready|leased|blocked|done|failed|all]")
        status = ARGS[1]
    if status not in {"ready", "leased", "blocked", "done", "failed", "all"}:
        die(f"unknown status: {status}")
    list_items(status)
elif COMMAND == "next":
    if ARGS:
        die("usage: scripts/work.sh next")
    next_item()
elif COMMAND == "show":
    if len(ARGS) != 1:
        die("usage: scripts/work.sh show <id|path>")
    show(ARGS[0])
elif COMMAND == "adopt":
    if len(ARGS) != 1:
        die("usage: scripts/work.sh adopt <backlog-dir>")
    adopt(ARGS[0])
elif COMMAND == "claim":
    if len(ARGS) not in {1, 2}:
        die("usage: scripts/work.sh claim <id|path> [owner]")
    transition(ARGS[0], "leased", ARGS[1] if len(ARGS) == 2 else "local-operator")
elif COMMAND in {"ready", "block", "fail"}:
    if len(ARGS) != 1:
        die(f"usage: scripts/work.sh {COMMAND} <id|path>")
    status = {"ready": "ready", "block": "blocked", "fail": "failed"}[COMMAND]
    transition(ARGS[0], status)
PY
    ;;
  help|--help|-h)
    usage
    ;;
  *)
    echo "unknown work command: $cmd" >&2
    usage
    exit 64
    ;;
esac
