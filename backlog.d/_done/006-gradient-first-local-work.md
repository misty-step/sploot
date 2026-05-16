---
id: 006-gradient-first-local-work
title: Capture the first local Gradient work item
status: done
lifecycle_stage: Feedback
owner: local
acceptance:
  - scripts/gradient.sh capture backlog.d/_done/006-gradient-first-local-work.md creates linked artifacts.
  - scripts/gradient.sh validate passes.
  - GRADIENT_SKIP_WORKSPACE_REGRESSIONS=1 scripts/gradient.sh eval passes until upstream core-only eval scoping is fixed.
evidence_required:
  - capture evidence packet
  - policy verdict
  - validation output
refs:
  - AGENTS.md
  - gradient.yaml
---

# Capture the first local Gradient work item

Use this starter item to verify the repo-local Gradient loop.

## What Was Built

Gradient is initialized for Sploot with a repo-local `gradient.yaml`, managed
harness projection, backlog validation, feedback intake, structural evals,
and cross-harness skill bridges for Claude, Codex, and Pi. The setup preserves
Sploot's existing `.agents/skills` shared skill root and records the current
known upstream gap: core-only workspace regression evals must be skipped in
target app repositories until Gradient scopes them to the core checkout.
