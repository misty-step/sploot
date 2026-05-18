#!/usr/bin/env bash
set -euo pipefail

SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

usage() {
  echo "usage: $0 [--profile name] /path/to/repo" >&2
}

profile_from_config() {
  local config="${GRADIENT_CONFIG_DIR:-$HOME/.gradient}/config.yaml"
  if [ -f "$config" ]; then
    awk '/^default_profile:/ { print $2; exit }' "$config"
  fi
}

PROFILE=""
TARGET_ROOT=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --profile)
      if [ "$#" -lt 2 ]; then
        usage
        exit 64
      fi
      PROFILE="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    -*)
      echo "unknown option: $1" >&2
      usage
      exit 64
      ;;
    *)
      if [ -n "$TARGET_ROOT" ]; then
        usage
        exit 64
      fi
      TARGET_ROOT="$1"
      shift
      ;;
  esac
done

if [ -z "$TARGET_ROOT" ]; then
  usage
  exit 64
fi

PROFILE="${PROFILE:-$(profile_from_config)}"
PROFILE="${PROFILE:-solo-frontier}"
TARGET_ROOT="$(cd "$TARGET_ROOT" && pwd)"

if ! GIT_ROOT="$(git -C "$TARGET_ROOT" rev-parse --show-toplevel 2>/dev/null)"; then
  echo "target must be a git repository: $TARGET_ROOT" >&2
  exit 65
fi
REQUESTED_ROOT="$TARGET_ROOT"
TARGET_ROOT="$(cd "$GIT_ROOT" && pwd)"
echo "resolved git worktree root: $TARGET_ROOT"
if [ "$REQUESTED_ROOT" != "$TARGET_ROOT" ]; then
  echo "requested path was inside worktree: $REQUESTED_ROOT"
fi

copy_new() {
  local src="$1"
  local dst="$2"
  if [ -e "$dst" ]; then
    echo "preserve existing $dst"
    return 0
  fi
  mkdir -p "$(dirname "$dst")"
  cp "$src" "$dst"
  echo "create $dst"
}

copy_dir_new() {
  local src="$1"
  local dst="$2"
  if [ -e "$dst" ]; then
    echo "preserve existing $dst"
    return 0
  fi
  mkdir -p "$(dirname "$dst")"
  cp -R "$src" "$dst"
  echo "create $dst"
}

mkdir -p \
  "$TARGET_ROOT/backlog.d/_done" \
  "$TARGET_ROOT/.gradient/context" \
  "$TARGET_ROOT/.gradient/evidence" \
  "$TARGET_ROOT/.gradient/feedback" \
  "$TARGET_ROOT/.gradient/harness" \
  "$TARGET_ROOT/.gradient/policy" \
  "$TARGET_ROOT/.gradient/runs" \
  "$TARGET_ROOT/evals" \
  "$TARGET_ROOT/examples/golden-workflows"

copy_dir_new "$SOURCE_ROOT/schemas" "$TARGET_ROOT/schemas"
copy_dir_new "$SOURCE_ROOT/profiles" "$TARGET_ROOT/profiles"
copy_dir_new "$SOURCE_ROOT/standards" "$TARGET_ROOT/standards"
copy_new "$SOURCE_ROOT/gradient.yaml" "$TARGET_ROOT/gradient.yaml"
copy_new "$SOURCE_ROOT/gradient.yaml.example" "$TARGET_ROOT/gradient.yaml.example"
copy_new "$SOURCE_ROOT/requirements.txt" "$TARGET_ROOT/requirements.txt"
if [ -f "$TARGET_ROOT/AGENTS.md" ]; then
  copy_new "$SOURCE_ROOT/AGENTS.md" "$TARGET_ROOT/AGENTS.gradient.md"
else
  copy_new "$SOURCE_ROOT/AGENTS.md" "$TARGET_ROOT/AGENTS.md"
fi
copy_new "$SOURCE_ROOT/scripts/validate.sh" "$TARGET_ROOT/scripts/validate.sh"
copy_new "$SOURCE_ROOT/scripts/resolve-harness.sh" "$TARGET_ROOT/scripts/resolve-harness.sh"
copy_new "$SOURCE_ROOT/scripts/capture-evidence.sh" "$TARGET_ROOT/scripts/capture-evidence.sh"
copy_new "$SOURCE_ROOT/scripts/eval-gradient.sh" "$TARGET_ROOT/scripts/eval-gradient.sh"
copy_new "$SOURCE_ROOT/scripts/close-work.sh" "$TARGET_ROOT/scripts/close-work.sh"
copy_new "$SOURCE_ROOT/scripts/report.sh" "$TARGET_ROOT/scripts/report.sh"
copy_new "$SOURCE_ROOT/scripts/status.sh" "$TARGET_ROOT/scripts/status.sh"
copy_new "$SOURCE_ROOT/scripts/gradient.sh" "$TARGET_ROOT/scripts/gradient.sh"
copy_new "$SOURCE_ROOT/scripts/init-workspace.sh" "$TARGET_ROOT/scripts/init-workspace.sh"
copy_new "$SOURCE_ROOT/scripts/upgrade-workspace.sh" "$TARGET_ROOT/scripts/upgrade-workspace.sh"
copy_new "$SOURCE_ROOT/scripts/context.sh" "$TARGET_ROOT/scripts/context.sh"
copy_new "$SOURCE_ROOT/scripts/fleet.sh" "$TARGET_ROOT/scripts/fleet.sh"
copy_new "$SOURCE_ROOT/scripts/trace.sh" "$TARGET_ROOT/scripts/trace.sh"
copy_new "$SOURCE_ROOT/scripts/work.sh" "$TARGET_ROOT/scripts/work.sh"
copy_new "$SOURCE_ROOT/scripts/feedback.sh" "$TARGET_ROOT/scripts/feedback.sh"
copy_dir_new "$SOURCE_ROOT/scripts/lib" "$TARGET_ROOT/scripts/lib"
copy_new "$SOURCE_ROOT/.gradient/harness/resolution.json" "$TARGET_ROOT/.gradient/harness/resolution.json"
copy_dir_new "$SOURCE_ROOT/evals" "$TARGET_ROOT/evals"

repo_name="$(basename "$TARGET_ROOT" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9._-' '-')"
repo_name="${repo_name%-}"
workspace_name="${repo_name:-workspace}"

if grep -q "^name: gradient-self$" "$TARGET_ROOT/gradient.yaml"; then
  perl -0pi -e "s/^name: gradient-self$/name: $workspace_name/m; s/^description: Gradient's own repo-local governed work profile\\.$/description: Gradient workspace profile for $workspace_name./m; s/(^harness:\\n(?:  .+\\n)*?  profile: )[^\\n]+/\${1}$PROFILE/m" "$TARGET_ROOT/gradient.yaml"
  echo "tailor $TARGET_ROOT/gradient.yaml for $workspace_name ($PROFILE)"
fi

python3 - "$SOURCE_ROOT" "$TARGET_ROOT" <<'PY'
from __future__ import annotations

import os
import pathlib
import re
import shutil
import sys

source = pathlib.Path(sys.argv[1])
target = pathlib.Path(sys.argv[2])


def rel(path: pathlib.Path) -> str:
    return str(path.relative_to(target))


def parse_source_skills() -> list[str]:
    text = (source / "gradient.yaml").read_text()
    match = re.search(r"(?ms)^  skills:\n(?P<body>.*?)(?=^  agents:)", text)
    if not match:
        raise SystemExit("could not read source harness skills from gradient.yaml")
    return [
        line.split("-", 1)[1].strip()
        for line in match.group("body").splitlines()
        if line.strip().startswith("- ")
    ]


def read_shared_skill_root(root: pathlib.Path) -> pathlib.Path | None:
    profile = root / "gradient.yaml"
    if not profile.exists():
        return None
    text = profile.read_text()
    match = re.search(r"(?m)^  shared_skill_root:\s*(\S+)\s*$", text)
    if not match:
        return None
    return pathlib.Path(match.group(1))


def existing_shared_root() -> pathlib.Path:
    configured = read_shared_skill_root(target)
    if configured is not None:
        return target / configured
    for candidate in [target / ".agents" / "skills", target / ".agent" / "skills"]:
        if candidate.exists():
            return candidate
    claude = target / ".claude" / "skills"
    if claude.exists() and any(child.is_dir() and not child.is_symlink() for child in claude.iterdir()):
        return claude
    return target / ".agent" / "skills"


def detect_bridges(shared: pathlib.Path) -> list[pathlib.Path]:
    bridges: list[pathlib.Path] = []
    for candidate in [target / ".claude" / "skills", target / ".codex" / "skills", target / ".pi" / "skills"]:
        if candidate.exists():
            bridges.append(candidate)
    for candidate in [target / ".claude" / "skills", target / ".codex" / "skills", target / ".pi" / "skills"]:
        if candidate not in bridges:
            bridges.append(candidate)
    return bridges


def source_skill_roots() -> list[pathlib.Path]:
    roots: list[pathlib.Path] = []
    configured = read_shared_skill_root(source)
    if configured is not None:
        roots.append(source / configured)
    for candidate in [source / ".agents" / "skills", source / ".agent" / "skills"]:
        if candidate not in roots:
            roots.append(candidate)
    return roots


def copy_missing_skill(skill: str, shared: pathlib.Path, roots: list[pathlib.Path]) -> None:
    src = None
    for root in roots:
        candidate = root / skill
        if candidate.exists():
            src = candidate
            break
    if src is None:
        searched = ", ".join(str((root / skill).resolve()) for root in roots)
        raise SystemExit(f"missing source skill '{skill}'; searched: {searched}")
    dst = shared / skill
    if dst.exists():
        print(f"preserve existing {dst}")
        return
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(src, dst, symlinks=True)
    print(f"add missing skill: {dst}")


def link_skill(skill: str, shared: pathlib.Path, bridge: pathlib.Path) -> None:
    link = bridge / skill
    bridge.mkdir(parents=True, exist_ok=True)
    if link.exists() or link.is_symlink():
        print(f"preserve existing {link}")
        return
    target_rel = os.path.relpath(shared / skill, bridge)
    link.symlink_to(target_rel)
    print(f"add bridge: {link} -> {target_rel}")


def replace_yaml_block(text: str, key: str, replacement: str) -> str:
    lines = text.splitlines(keepends=True)
    start = None
    end = None
    for index, line in enumerate(lines):
        if line == f"  {key}:\n":
            start = index
            end = index + 1
            while end < len(lines) and lines[end].startswith("    "):
                end += 1
            break
    if start is None or end is None:
        return text
    return "".join(lines[:start]) + replacement + "".join(lines[end:])


def update_profile(shared: pathlib.Path, bridges: list[pathlib.Path], skills: list[str]) -> None:
    profile = target / "gradient.yaml"
    text = profile.read_text()
    shared_rel = rel(shared)
    bridge_rels = [rel(path) for path in bridges]
    text = re.sub(r"(?m)^  shared_skill_root:\s*.*$", f"  shared_skill_root: {shared_rel}", text)
    text = replace_yaml_block(text, "bridges", "  bridges:\n" + "".join(f"    - {item}\n" for item in bridge_rels))
    text = replace_yaml_block(text, "skills", "  skills:\n" + "".join(f"    - {skill}\n" for skill in skills))
    profile.write_text(text)


skills = parse_source_skills()
source_roots = source_skill_roots()
shared = existing_shared_root()
bridges = detect_bridges(shared)
print(f"detected shared skill root: {rel(shared)}")
print("detected bridges: " + ", ".join(rel(path) for path in bridges))
shared.mkdir(parents=True, exist_ok=True)
for skill in skills:
    copy_missing_skill(skill, shared, source_roots)
for bridge in bridges:
    for skill in skills:
        link_skill(skill, shared, bridge)
update_profile(shared, bridges, skills)
PY

cat > "$TARGET_ROOT/.gradient/onboarding.md" <<EOF
# Gradient Onboarding

Workspace: $workspace_name
Profile: $PROFILE

Run:

\`\`\`sh
gradient resolve
gradient validate
gradient capture backlog.d/001-gradient-first-local-work.md
gradient eval
\`\`\`
EOF
echo "write $TARGET_ROOT/.gradient/onboarding.md"

touch "$TARGET_ROOT/.gitignore"
if ! grep -qxF ".gradient/sources.local.yaml" "$TARGET_ROOT/.gitignore"; then
  printf "\n.gradient/sources.local.yaml\n" >> "$TARGET_ROOT/.gitignore"
  echo "update $TARGET_ROOT/.gitignore"
fi

if [ ! -f "$TARGET_ROOT/backlog.d/001-gradient-first-local-work.md" ]; then
  cat > "$TARGET_ROOT/backlog.d/001-gradient-first-local-work.md" <<'EOF'
---
id: 001-gradient-first-local-work
title: Capture the first local Gradient work item
status: ready
lifecycle_stage: Evidence
owner: local
acceptance:
  - scripts/gradient.sh capture backlog.d/001-gradient-first-local-work.md creates linked artifacts.
  - scripts/gradient.sh eval passes.
  - scripts/gradient.sh validate passes.
evidence_required:
  - capture evidence packet
  - policy verdict
  - validation output
refs:
  - AGENTS.md
---

# Capture the first local Gradient work item

Use this starter item to verify the repo-local Gradient loop.
EOF
  echo "create $TARGET_ROOT/backlog.d/001-gradient-first-local-work.md"
fi

chmod +x "$TARGET_ROOT"/scripts/*.sh
(
  cd "$TARGET_ROOT"
  ./scripts/gradient.sh resolve
)
python3 "$SOURCE_ROOT/scripts/lib/workspace_managed.py" write-manifest "$SOURCE_ROOT" "$TARGET_ROOT"
echo "initialized Gradient workspace at $TARGET_ROOT"
echo "next: cd '$TARGET_ROOT' && gradient resolve && gradient validate"
