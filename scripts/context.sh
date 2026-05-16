#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT"

usage() {
  cat <<'EOF' >&2
usage: scripts/context.sh <command> [args]

commands:
  repo <query>          write a public-safe repo/docs/evidence context bundle
  private-smoke <query> write a synthetic private-source context bundle
EOF
}

cmd="${1:-help}"
shift || true

case "$cmd" in
  repo|private-smoke)
    if [ "$#" -lt 1 ]; then
      usage
      exit 64
    fi
    python3 - "$cmd" "$*" <<'PY'
from __future__ import annotations

import datetime as dt
import json
import pathlib
import re
import sys

ROOT = pathlib.Path.cwd()
COMMAND = sys.argv[1]
QUERY = sys.argv[2]


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9-]+", "-", text.lower()).strip("-")[:60] or "context"


def write_json(path: pathlib.Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2) + "\n")


stamp = dt.datetime.now(dt.UTC).strftime("%Y%m%dT%H%M%SZ").lower()
context_id = f"context-{COMMAND}-{slug(QUERY)}-{stamp}"

if COMMAND == "repo":
    items = [
        {
            "id": f"{context_id}-architecture",
            "type": "procedure",
            "body": "Gradient follows one lifecycle: Intent -> Work Graph -> Fleet Run -> Evidence -> Policy/Eval -> Feedback.",
            "source_uri": "docs/architecture.md",
            "source_version": "git-worktree",
            "freshness": "current-worktree",
            "permission_label": "public-safe",
            "citation": "docs/architecture.md#lifecycle",
        },
        {
            "id": f"{context_id}-module-contracts",
            "type": "requirement",
            "body": "Evidence packets link Work, Harness, Fleet, Context, verification artifacts, trace references, unverified claims, reviewer risks, and Policy outcomes.",
            "source_uri": "docs/module-contracts.md",
            "source_version": "git-worktree",
            "freshness": "current-worktree",
            "permission_label": "public-safe",
            "citation": "docs/module-contracts.md#evidence-traces-policy-and-evals",
        },
        {
            "id": f"{context_id}-context-engine",
            "type": "procedure",
            "body": "Context source adapters normalize deployment-specific systems before retrieval returns cited context bundles.",
            "source_uri": "docs/context-engine.md",
            "source_version": "git-worktree",
            "freshness": "current-worktree",
            "permission_label": "public-safe",
            "citation": "docs/context-engine.md#pipeline",
        },
    ]
else:
    items = [
        {
            "id": f"{context_id}-private-adapter",
            "type": "procedure",
            "body": "Synthetic private-source item proving the adapter shape. Real private source content must stay outside committed Gradient artifacts.",
            "source_uri": "local-private-source://synthetic",
            "source_version": stamp,
            "freshness": stamp,
            "permission_label": "private/example",
            "citation": "examples/sources.local.example.yaml",
        },
        {
            "id": f"{context_id}-qmd-pattern",
            "type": "requirement",
            "body": "A personal knowledge vault adapter should query bounded snippets through a local search service and return citations, not raw vault pages.",
            "source_uri": "docs/private-context.md",
            "source_version": "git-worktree",
            "freshness": "current-worktree",
            "permission_label": "private/example",
            "citation": "docs/private-context.md#personal-context-v0",
        },
    ]

bundle = {
    "$schema": "../../schemas/context-bundle.schema.json",
    "id": context_id,
    "mode": "assist",
    "query": QUERY,
    "items": items,
}

path = ROOT / ".gradient" / "context" / f"{context_id}.json"
write_json(path, bundle)
print(path.relative_to(ROOT))
PY
    ;;
  help|--help|-h)
    usage
    ;;
  *)
    echo "unknown context command: $cmd" >&2
    usage
    exit 64
    ;;
esac
