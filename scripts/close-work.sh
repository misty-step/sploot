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

import json
import pathlib
import shutil
import subprocess
import sys

import yaml

ROOT = pathlib.Path.cwd()
WORK_ITEM = pathlib.Path(sys.argv[1])


def parse_work_item(path: pathlib.Path) -> dict:
    text = path.read_text()
    if not text.startswith("---\n"):
        raise SystemExit(f"{path} missing YAML frontmatter")
    _, frontmatter, body = text.split("---", 2)
    return yaml.safe_load(frontmatter), body


def load(path: pathlib.Path) -> dict:
    with path.open() as fh:
        return json.load(fh)


def write_closed(path: pathlib.Path, data: dict, body: str) -> None:
    data["status"] = "done"
    frontmatter = yaml.safe_dump(data, sort_keys=False).strip()
    path.write_text(f"---\n{frontmatter}\n---{body}")


def write_json(path: pathlib.Path, data: dict) -> None:
    path.write_text(json.dumps(data, indent=2) + "\n")


if not WORK_ITEM.exists():
    raise SystemExit(f"work item does not exist: {WORK_ITEM}")

data, body = parse_work_item(WORK_ITEM)
work_id = data["id"]

evidences = [
    load(path)
    for path in sorted((ROOT / ".gradient/evidence").glob("*.json"))
    if load(path).get("work_item_id") == work_id
]
if not evidences:
    raise SystemExit(f"no evidence packet found for {work_id}; run scripts/capture-evidence.sh first")

passing = False
for evidence in evidences:
    policy_path = ROOT / ".gradient/policy" / f"{evidence['policy_outcome_id']}.json"
    if not policy_path.exists():
        continue
    policy = load(policy_path)
    if policy.get("verdict") == "pass":
        passing = True
        break

if not passing:
    raise SystemExit(f"no passing policy outcome found for {work_id}")

proc = subprocess.run(["./scripts/validate.sh"], cwd=ROOT)
if proc.returncode != 0:
    raise SystemExit("validation failed; refusing to close work")

done_dir = ROOT / "backlog.d" / "_done"
done_dir.mkdir(parents=True, exist_ok=True)
target = done_dir / WORK_ITEM.name
write_closed(WORK_ITEM, data, body)
shutil.move(str(WORK_ITEM), str(target))

for evidence_path in sorted((ROOT / ".gradient/evidence").glob("*.json")):
    evidence = load(evidence_path)
    if evidence.get("work_item_id") != work_id:
        continue
    changed = False
    for artifact in evidence.get("artifacts", []):
        if artifact.get("kind") == "work-item" and artifact.get("path") == str(WORK_ITEM):
            artifact["path"] = str(target.relative_to(ROOT))
            changed = True
    if changed:
        write_json(evidence_path, evidence)

for context_path in sorted((ROOT / ".gradient/context").glob("*.json")):
    context = load(context_path)
    changed = False
    for item in context.get("items", []):
        for field in ["source_uri", "citation"]:
            value = item.get(field)
            if not isinstance(value, str):
                continue
            suffix = ""
            path_text = value
            if "#" in value:
                path_text, suffix = value.split("#", 1)
                suffix = "#" + suffix
            if path_text == str(WORK_ITEM):
                item[field] = str(target.relative_to(ROOT)) + suffix
                changed = True
    if changed:
        write_json(context_path, context)

print(f"closed work item: {target}")
PY
