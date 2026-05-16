#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT"

cmd="${1:-help}"
shift || true

case "$cmd" in
  validate)
    exec ./scripts/validate.sh "$@"
    ;;
  resolve)
    exec ./scripts/resolve-harness.sh "$@"
    ;;
  capture)
    exec ./scripts/capture-evidence.sh "$@"
    ;;
  eval)
    exec ./scripts/eval-gradient.sh "$@"
    ;;
  close)
    exec ./scripts/close-work.sh "$@"
    ;;
  report)
    exec ./scripts/report.sh "$@"
    ;;
  work)
    exec ./scripts/work.sh "$@"
    ;;
  feedback)
    exec ./scripts/feedback.sh "$@"
    ;;
  context)
    exec ./scripts/context.sh "$@"
    ;;
  fleet)
    exec ./scripts/fleet.sh "$@"
    ;;
  trace)
    exec ./scripts/trace.sh "$@"
    ;;
  status)
    exec ./scripts/status.sh "$@"
    ;;
  init)
    exec ./scripts/init-workspace.sh "$@"
    ;;
  upgrade)
    exec ./scripts/upgrade-workspace.sh "$@"
    ;;
  install-global)
    exec ./scripts/install-global.sh "$@"
    ;;
  config)
    mkdir -p "${GRADIENT_CONFIG_DIR:-$HOME/.gradient}"
    if [ ! -f "${GRADIENT_CONFIG_DIR:-$HOME/.gradient}/config.yaml" ]; then
      exec ./scripts/install-global.sh
    fi
    cat "${GRADIENT_CONFIG_DIR:-$HOME/.gradient}/config.yaml"
    ;;
  help|--help|-h)
    cat <<'EOF'
usage: scripts/gradient.sh <command> [args]

commands:
  validate                    validate Gradient profiles, schemas, harness, and artifacts
  resolve                     derive .gradient/harness/resolution.json from gradient.yaml
  capture <backlog-item.md>    capture evidence for a backlog.d work item
  eval                        run Gradient structural evals
  close <backlog-item.md>      close work only after evidence and policy pass
  report [--latest|evidence]   print a human-readable Gradient evidence report
  work <subcommand>             list, show, claim, and transition backlog.d work
  feedback <subcommand>         report, inspect, and route operator feedback
  context <subcommand>          generate repo or synthetic private context bundles
  fleet <subcommand>            start, inspect, complete, or abort local supervised runs
  trace <subcommand>            inspect local trace backends or attach trace refs to evidence
  status [--check]             report global install and harness discovery state
  init [--profile name] <repo> seed a git repo with a tailored Gradient loop
  upgrade [--dry-run|--apply] <repo>
                              update managed Gradient assets in an initialized repo
  install-global               install the gradient command and user config
  config                       print ~/.gradient/config.yaml
EOF
    ;;
  *)
    echo "unknown command: $cmd" >&2
    echo "run scripts/gradient.sh help" >&2
    exit 64
    ;;
esac
