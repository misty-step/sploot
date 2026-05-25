---
name: deliver
description: |
  Tailored Sploot workflow skill. Use when the user invokes this phase or asks for the corresponding lifecycle work in this repo.
---

# /deliver

## Sploot Anchors

- Product: personal meme library focused on save, semantic search, and shuffle.
- Stack: pnpm Turborepo with `apps/web` (Next.js 15, Clerk, Prisma/Neon pgvector, Vercel Blob, Replicate, Sentry), `apps/extension` (WXT/React Chrome extension), and `packages/common` (shared upload/API contracts).
- Tracker: local markdown files in `backlog.d/`; GitHub Issues are not the source of truth. Active work stays top-level, done work moves to `backlog.d/_done/`.
- Base branch: `origin/master`.
- Load-bearing gate: Ship gate equals CI parity: `pnpm lint && pnpm type-check && pnpm --filter web test && pnpm --filter extension build`, with Prisma/pgvector DB-backed paths requiring `DATABASE_URL` against a pgvector-capable Postgres or explicit `DB path unverified` evidence. GitHub CI adds frozen install, `pnpm --filter web db:migrate` against `pgvector/pgvector:pg15`, turbo lint/type-check, web tests, extension lint/test/build, and the `merge-gate` aggregate job.
- Closure signal: move the backlog item to `backlog.d/_done/` with `Status: done`, a `## What Was Built` note, and a conventional commit/PR body carrying `Backlog: backlog.d/<id>-<slug>.md` or explicit `Closes-backlog:` / `Ships-backlog:` trailers.

## How This Skill Works Here

Use /deliver to take one active Sploot backlog item to merge-ready, stopping before merge/push/deploy. If no item is named, select the highest-priority `ready` item from `backlog.d/`; today that means checking the active table in `backlog.d/README.md`.

Compose the loop: /shape -> /implement -> /ci -> /code-review -> /refactor -> /qa. Carry the selected `backlog.d/<id>-<slug>.md` reference through branch, commit/PR body, evidence, and final handoff so /ship can archive it. Report gate evidence and unresolved blockers explicitly.

## Output Contract

End with evidence, decisions, and residual risk. Name exact commands/artifacts for executable paths. If a changed path was not directly exercised, say so explicitly. Keep Sploot-specific terms in the body; do not append generic sidecar notes.
