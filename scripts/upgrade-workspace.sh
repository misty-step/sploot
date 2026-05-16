#!/usr/bin/env bash
set -euo pipefail

SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

usage() {
  echo "usage: $0 [--dry-run|--apply] /path/to/repo" >&2
}

APPLY=0
TARGET_ROOT=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --dry-run)
      APPLY=0
      shift
      ;;
    --apply)
      APPLY=1
      shift
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

TARGET_ROOT="$(cd "$TARGET_ROOT" && pwd)"
if ! GIT_ROOT="$(git -C "$TARGET_ROOT" rev-parse --show-toplevel 2>/dev/null)"; then
  echo "target must be a git repository: $TARGET_ROOT" >&2
  exit 65
fi
TARGET_ROOT="$(cd "$GIT_ROOT" && pwd)"

if [ "$APPLY" -eq 1 ]; then
  exec python3 "$SOURCE_ROOT/scripts/lib/workspace_managed.py" upgrade --apply "$SOURCE_ROOT" "$TARGET_ROOT"
fi

exec python3 "$SOURCE_ROOT/scripts/lib/workspace_managed.py" upgrade "$SOURCE_ROOT" "$TARGET_ROOT"
