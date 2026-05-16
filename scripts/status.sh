#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_DIR="${GRADIENT_CONFIG_DIR:-$HOME/.gradient}"
CONFIG="$CONFIG_DIR/config.yaml"
BRIEF="$CONFIG_DIR/AGENTS.md"
PROJECTS="$CONFIG_DIR/projects.local.yaml"
CHECK=0

if [ "${1:-}" = "--check" ]; then
  CHECK=1
fi

failures=0

check_file() {
  local label="$1" path="$2"
  if [ -e "$path" ]; then
    echo "ok $label: $path"
  else
    echo "missing $label: $path"
    failures=$((failures + 1))
  fi
}

check_command() {
  if command -v gradient >/dev/null 2>&1; then
    echo "ok command: $(command -v gradient)"
  else
    echo "missing command: gradient"
    failures=$((failures + 1))
  fi
}

check_managed_block() {
  local path="$1"
  if [ -f "$path" ] && grep -q "BEGIN GRADIENT MANAGED BLOCK" "$path"; then
    echo "ok harness snippet: $path"
  else
    echo "missing harness snippet: $path"
    failures=$((failures + 1))
  fi
}

echo "Gradient core: $ROOT"
check_command
check_file "config" "$CONFIG"
check_file "machine brief" "$BRIEF"
if [ -f "$PROJECTS" ]; then
  echo "ok local projects: $PROJECTS"
else
  echo "local projects: not configured"
fi

workspace="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
echo "workspace: $workspace"
if [ -f "$workspace/gradient.yaml" ]; then
  echo "ok workspace profile: $workspace/gradient.yaml"
  if [ -x "$workspace/scripts/gradient.sh" ]; then
    echo "ok workspace command: $workspace/scripts/gradient.sh"
  else
    echo "missing workspace command: $workspace/scripts/gradient.sh"
    failures=$((failures + 1))
  fi
else
  echo "workspace profile: not initialized"
fi

check_managed_block "$HOME/.codex/AGENTS.md"
check_managed_block "$HOME/.claude/CLAUDE.md"
check_managed_block "$HOME/.opencode/AGENTS.md"
check_managed_block "$HOME/.pi/agent/AGENTS.md"

if [ "$CHECK" -eq 1 ] && [ "$failures" -gt 0 ]; then
  exit 1
fi
