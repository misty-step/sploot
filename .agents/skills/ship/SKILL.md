---
name: ship
description: |
  Tailored Sploot workflow skill. Use when the user invokes this phase or asks for the corresponding lifecycle work in this repo.
---

# /ship

## Sploot Anchors

- Product: personal meme library focused on save, semantic search, and shuffle.
- Stack: pnpm Turborepo with `apps/web` (Next.js 15, Clerk, Prisma/Neon pgvector, Vercel Blob, Replicate, Sentry), `apps/extension` (WXT/React Chrome extension), and `packages/common` (shared upload/API contracts).
- Tracker: local markdown files in `backlog.d/`; GitHub Issues are not the source of truth. Active work stays top-level, done work moves to `backlog.d/_done/`.
- Base branch: `origin/master`.
- Load-bearing gate: Ship gate equals CI parity: `pnpm lint && pnpm type-check && pnpm --filter web test && pnpm --filter extension build`, with Prisma/pgvector DB-backed paths requiring `DATABASE_URL` against a pgvector-capable Postgres or explicit `DB path unverified` evidence. GitHub CI adds frozen install, `pnpm --filter web db:migrate` against `pgvector/pgvector:pg15`, turbo lint/type-check, web tests, extension lint/test/build, and the `merge-gate` aggregate job.
- Closure signal: move the backlog item to `backlog.d/_done/` with `Status: done`, a `## What Was Built` note, and a conventional commit/PR body carrying `Backlog: backlog.d/<id>-<slug>.md` or explicit `Closes-backlog:` / `Ships-backlog:` trailers.

## How This Skill Works Here

Use /ship only when work is merge-ready. Verify base `origin/master`, clean intentional diff, CI parity evidence, backlog closure, and release implications.

Closure is mechanical: each shipped `backlog.d/<id>-*.md` gets `Status: done`, a `## What Was Built` note, moves to `backlog.d/_done/`, and is referenced by `Backlog: backlog.d/<id>-<slug>.md` or `Closes-backlog:` / `Ships-backlog:` in the landed commit/PR body. After merge, verify the archive landed, then run /reflect with branch, merge SHA, backlog IDs, gate evidence, and residual risk.

## Output Contract

End with evidence, decisions, and residual risk. Name exact commands/artifacts for executable paths. If a changed path was not directly exercised, say so explicitly. Keep Sploot-specific terms in the body; do not append generic sidecar notes.
