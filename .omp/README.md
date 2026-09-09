# Sploot repo-local OMP config

Always-loaded contracts live in `AGENTS.md`. Rules under `rules/` apply only to their path globs. Commands under `commands/` are on-demand:

- `/db` — Prisma/Neon `DATABASE_URL` and migration authority
- `/ext-release` — Chrome Web Store packet check

Do not add a repo-local lifecycle catalog or cross-harness bridge.
