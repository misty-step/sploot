---
name: ci
description: |
  Tailored Sploot workflow skill. Use when the user invokes this phase or asks for the corresponding lifecycle work in this repo.
---

# /ci

## Sploot Anchors

- Repo: pnpm Turborepo with `apps/web`, `apps/extension`, and `packages/common`.
- Tracker: local markdown files in `backlog.d/`; GitHub Issues are not active for Sploot work tracking.
- Base branch: `origin/master`.
- Ship gate: `pnpm lint && pnpm type-check && pnpm --filter web test && pnpm --filter extension build`, with DB-backed paths requiring `DATABASE_URL` against pgvector or an explicit unverified note.
- Remote CI: frozen install, web Prisma migrate against `pgvector/pgvector:pg15`, turbo lint/type-check, web tests, extension build.
- Closure: backlog item status moves to `done` with a `What Was Built` note plus Conventional Commit subject/body or an explicit `Backlog: backlog.d/<id>-<slug>.md` trailer.

## How This Skill Works Here

The load-bearing local gate is exactly: `pnpm lint && pnpm type-check && pnpm --filter web test && pnpm --filter extension build`. GitHub CI adds frozen install and `pnpm --filter web db:migrate` against `pgvector/pgvector:pg15`.

When CI fails, read the failing lane before editing. DB failures require checking `DATABASE_URL`, Prisma migrations, pgvector availability, and `apps/web/prisma`. Extension build failures often trace to `VITE_API_BASE_URL`, WXT config, or `@sploot/common` aliasing. Never lower lint/type/test gates to pass.

## Output Contract

End with evidence, decisions, and residual risk. If a changed executable path was not directly exercised, say so explicitly. Keep repo-specific names and commands in the body; do not append generic sidecar notes.
