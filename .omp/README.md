# sploot oh-my-pi (omp) harness

Repo-local config for the [`omp`](https://github.com/can1357/oh-my-pi) coding
agent. omp reads this `.omp/` dir at priority 100 (above inherited `.claude/`
etc.), walking up from the cwd so it works from any subdir of the monorepo.

## Run it

```bash
omp                       # interactive TUI, in repo root
omp "wire up X"           # interactive with a starting prompt
omp -p "run the gate"     # non-interactive (print and exit)
```

## What's configured

**Models (global — `~/.omp/agent/config.yml`).** Everything routes through
OpenRouter (built-in; uses `OPENROUTER_API_KEY`). Default anchor is
`google/gemini-3.5-flash`; on quota/rate-limit it fails over through the chain
`minimax-m3 → grok-build-0.1 → grok-4.3 → kimi-latest → deepseek-v4-pro →
deepseek-v4-flash → glm-5.1`, then reverts when the primary's cooldown expires.
Role split: `slow`→grok-4.3, `plan`→deepseek-v4-pro, `task`→minimax-m3, the
rest→gemini-3.5-flash. Switch live with `/model`, `Ctrl+P`, or `--slow`/`--plan`.

**Context.** omp natively loads `AGENTS.md` + `CLAUDE.md` (monorepo hierarchy
aware). `.omp/RULES.md` holds the critical-few invariants and is re-injected
near every turn so they survive long sessions.

**Scoped rules (`.omp/rules/`).** Fire only when you touch the matching paths:
- `prisma-db.mdc` → `apps/web/prisma/**`, db libs, api routes
- `common-contract.mdc` → `packages/common/**`
- `extension.mdc` → `apps/extension/**`

**Slash commands (`.omp/commands/`).**
- `/gate` — CI-parity ship gate (4 steps; per-step ✅/❌)
- `/typecheck` — monorepo `tsc --noEmit` triage
- `/test-web` — web Vitest via the CI `test` script (`CI=1`, run-once)
- `/db` — Prisma/Neon ops with the `DATABASE_URL` guardrail
- `/backlog` — inspect Powder cards and their proof/claim state
- `/ext-release` — Chrome Web Store release-packet validation

**Search.** Exa (root `.mcp.json`, native to omp) + Brave (`BRAVE_API_KEY`).
**LSP.** On for the TS monorepo (diagnostics on edit); format-on-write off so it
never fights eslint/prettier or the gate.

## Extending

- Add a command: drop `.omp/commands/<name>.md` (file body = the prompt).
- Add a scoped rule: `.omp/rules/<name>.mdc` with `globs:` frontmatter.
- Unpack omp's bundled task agents into the repo: `omp agents unpack --project`.
- Custom tools / hooks / extensions: `.omp/tools/`, `.omp/hooks/<type>/`,
  `.omp/extensions/<name>/` (see omp's `examples/`).
