---
name: demo
description: |
  Tailored Sploot workflow skill. Use when the user invokes this phase or asks for the corresponding lifecycle work in this repo.
---

# /demo

## Sploot Anchors

- Product: personal meme library focused on save, semantic search, and shuffle.
- Stack: pnpm Turborepo with `apps/web` (Next.js 15, Clerk, Prisma/Neon pgvector, Vercel Blob, Replicate, Sentry), `apps/extension` (WXT/React Chrome extension), and `packages/common` (shared upload/API contracts).
- Tracker: local markdown files in `backlog.d/`; GitHub Issues are not the source of truth. Active work stays top-level, done work moves to `backlog.d/_done/`.
- Base branch: `origin/master`.
- Load-bearing gate: Ship gate equals CI parity: `pnpm lint && pnpm type-check && pnpm --filter web test && pnpm --filter extension build`, with Prisma/pgvector DB-backed paths requiring `DATABASE_URL` against a pgvector-capable Postgres or explicit `DB path unverified` evidence. GitHub CI adds frozen install, `pnpm --filter web db:migrate` against `pgvector/pgvector:pg15`, turbo lint/type-check, web tests, extension lint/test/build, and the `merge-gate` aggregate job.
- Closure signal: move the backlog item to `backlog.d/_done/` with `Status: done`, a `## What Was Built` note, and a conventional commit/PR body carrying `Backlog: backlog.d/<id>-<slug>.md` or explicit `Closes-backlog:` / `Ships-backlog:` trailers.

## How This Skill Works Here

Use /demo to package evidence from a completed Sploot change. Good demo artifacts are concrete: screenshots, request/response snippets, release checker output, deployed smoke JSON, extension manifest audits, or before/after UI captures.

For web behavior, include URL, viewport, auth state, and screenshot path. For API behavior, include method/path/status/body shape with secrets redacted. For extension behavior, include Chrome profile class, extension ID, loaded path, popup/context-menu result, background log summary, and whether library verification happened. For release work, include Chrome Web Store listing assets and receipt status.

## Output Contract

End with evidence, decisions, and residual risk. Name exact commands/artifacts for executable paths. If a changed path was not directly exercised, say so explicitly. Keep Sploot-specific terms in the body; do not append generic sidecar notes.
