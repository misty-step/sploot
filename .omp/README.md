# Sploot repo-local OMP config

OMP loads `AGENTS.md` and this directory from any subdirectory of the monorepo.
`RULES.md` contains the small set of turn-critical contracts. Rules under
`rules/` apply only to their path globs; commands under `commands/` are prompt
entry points for recurring local operations.

## Commands

- `/gate` — run the CI-parity ship gate from `commands/gate.md`.
- `/typecheck` — type-check the monorepo and group root-cause failures.
- `/test-web` — run the web Vitest suite once with `CI=1`.
- `/db` — use Prisma/Neon operations with the `DATABASE_URL` and migration rules.
- `/ext-release` — validate the Chrome Web Store release packet.

Use the globally configured Harness Kit skills. Do not add a repo-local lifecycle
catalog, generated skill references, provider adapter, or cross-harness bridge
unless a narrow Sploot-only behavior requires it.
