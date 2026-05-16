#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT"

usage() {
  cat >&2 <<'EOF'
usage:
  scripts/trace.sh status
  scripts/trace.sh attach <evidence.json|--latest> --backend raindrop --trace-id <id> (--uri <uri>|--artifact <path>) --redaction <status> --summary <text>
EOF
}

cmd="${1:-}"
shift || true

if [ -z "$cmd" ] || [ "$cmd" = "-h" ] || [ "$cmd" = "--help" ]; then
  usage
  exit 0
fi

case "$cmd" in
  status)
    python3 - <<'PY'
from __future__ import annotations

import json
import pathlib
import shutil
import subprocess

ROOT = pathlib.Path.cwd()
raindrop = shutil.which("raindrop")
status = {
    "backend": "raindrop",
    "cli_installed": bool(raindrop),
    "cli_path": raindrop,
    "workshop_running": False,
    "workshop_status": "raindrop CLI is not installed",
    "raw_trace_policy": "Gradient records trace references only; raw Workshop databases and unredacted trace exports stay outside committed artifacts.",
}

if raindrop:
    proc = subprocess.run(
        [raindrop, "workshop", "status"],
        cwd=ROOT,
        text=True,
        capture_output=True,
        timeout=10,
        check=False,
    )
    output = (proc.stdout + proc.stderr).strip()
    status["workshop_status"] = output or f"raindrop workshop status exited {proc.returncode}"
    status["workshop_running"] = proc.returncode == 0

print(json.dumps(status, indent=2))
PY
    ;;
  attach)
    if [ "$#" -lt 1 ]; then
      usage
      exit 64
    fi
    target="$1"
    shift
    python3 - "$target" "$@" <<'PY'
from __future__ import annotations

import json
import pathlib
import sys

ROOT = pathlib.Path.cwd()
TRACE_BACKENDS = {"local", "raindrop", "langfuse", "helicone", "otlp"}
SAFE_REDACTIONS = {"synthetic", "redacted", "redacted-export", "public-safe"}


def latest_evidence() -> pathlib.Path:
    paths = sorted((ROOT / ".gradient/evidence").glob("*.json"), key=lambda p: p.stat().st_mtime)
    if not paths:
        raise SystemExit("no evidence packets found")
    return paths[-1]


def parse_args(args: list[str]) -> dict:
    parsed: dict[str, str] = {}
    i = 0
    while i < len(args):
        key = args[i]
        if key not in {"--backend", "--trace-id", "--uri", "--artifact", "--redaction", "--summary"}:
            raise SystemExit(f"unknown argument: {key}")
        if i + 1 >= len(args):
            raise SystemExit(f"missing value for {key}")
        parsed[key[2:].replace("-", "_")] = args[i + 1]
        i += 2
    return parsed


target = latest_evidence() if sys.argv[1] == "--latest" else ROOT / sys.argv[1]
options = parse_args(sys.argv[2:])

backend = options.get("backend")
trace_id = options.get("trace_id")
redaction = options.get("redaction")
summary = options.get("summary")
uri = options.get("uri")
artifact = options.get("artifact")

if backend not in TRACE_BACKENDS:
    raise SystemExit(f"unknown trace backend: {backend}")
if not trace_id:
    raise SystemExit("--trace-id is required")
if redaction not in SAFE_REDACTIONS:
    raise SystemExit(f"--redaction must be one of: {', '.join(sorted(SAFE_REDACTIONS))}")
if not summary:
    raise SystemExit("--summary is required")
if bool(uri) == bool(artifact):
    raise SystemExit("provide exactly one of --uri or --artifact")

trace_ref = {
    "backend": backend,
    "trace_id": trace_id,
    "redaction": redaction,
    "summary": summary,
}
if uri:
    trace_ref["uri"] = uri
if artifact:
    trace_ref["artifact_path"] = artifact

with target.open() as fh:
    evidence = json.load(fh)

refs = evidence.setdefault("trace_refs", [])
refs.append(trace_ref)
target.write_text(json.dumps(evidence, indent=2) + "\n")

print(f"attached {backend} trace {trace_id} to {target.relative_to(ROOT)}")
PY
    ;;
  *)
    echo "unknown trace command: $cmd" >&2
    usage
    exit 64
    ;;
esac
