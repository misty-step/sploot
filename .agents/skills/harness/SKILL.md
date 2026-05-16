---
name: harness
description: |
  Maintain Gradient's repo-local agent harness: skills, agents, settings,
  repo brief, and gate-aligned instructions. Trigger: /harness, /skill,
  /primitive.
argument-hint: "[create|eval|lint|sync|audit] [target]"
---

# /harness

Harness work in this repo is itself a Gradient Harness artifact. Keep it
cross-harness, public-safe, and honest about the absence of app CI.

## Layout

- Shared skill root: `.agent/skills/`
- Claude bridge: `.claude/skills/`
- Codex bridge: `.codex/skills/`
- Pi bridge: `.pi/skills/`
- Installed agents: `.claude/agents/`
- Repo brief: `.spellbook/repo-brief.md`

## Rules

- Shared skills are canonical; harness-specific dirs are symlink bridges.
- Workflow skills must cite this exact gate: The load-bearing ship gate is
  `./scripts/validate.sh`, plus reviewer judgment for lifecycle semantics in
  `docs/architecture.md` and `docs/module-contracts.md` when docs change.
- Universal skills may remain verbatim.
- Do not add fake command allowlists to `.codex/config.toml`.
- Keep markers with `installed-by: tailor`.
- Preserve public-safe boundaries in examples and skill text.

## Audit

Check bridge resolution, marker presence, byte-identical workflow regressions,
agent references, settings syntax, and gate sentence drift.
