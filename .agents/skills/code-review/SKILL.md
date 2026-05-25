---
name: code-review
description: |
  Tailored Sploot workflow skill. Use when the user invokes this phase or asks for the corresponding lifecycle work in this repo.
---

# /code-review

## Sploot Anchors

- Product: personal meme library focused on save, semantic search, and shuffle.
- Stack: pnpm Turborepo with `apps/web` (Next.js 15, Clerk, Prisma/Neon pgvector, Vercel Blob, Replicate, Sentry), `apps/extension` (WXT/React Chrome extension), and `packages/common` (shared upload/API contracts).
- Tracker: local markdown files in `backlog.d/`; GitHub Issues are not the source of truth. Active work stays top-level, done work moves to `backlog.d/_done/`.
- Base branch: `origin/master`.
- Load-bearing gate: Ship gate equals CI parity: `pnpm lint && pnpm type-check && pnpm --filter web test && pnpm --filter extension build`, with Prisma/pgvector DB-backed paths requiring `DATABASE_URL` against a pgvector-capable Postgres or explicit `DB path unverified` evidence. GitHub CI adds frozen install, `pnpm --filter web db:migrate` against `pgvector/pgvector:pg15`, turbo lint/type-check, web tests, extension lint/test/build, and the `merge-gate` aggregate job.
- Closure signal: move the backlog item to `backlog.d/_done/` with `Status: done`, a `## What Was Built` note, and a conventional commit/PR body carrying `Backlog: backlog.d/<id>-<slug>.md` or explicit `Closes-backlog:` / `Ships-backlog:` trailers.

## How This Skill Works Here

Use /code-review with a bug/risk-first stance. Findings lead; summaries come after issues. Review against Sploot-specific risks: Clerk auth boundaries, upload validation, `@sploot/common` contract drift, Prisma/pgvector migrations, embedding cost/duplicate jobs, Vercel Blob behavior, extension env/origin/auth, Sentry health, semantic-release token path, and docs/API drift.

Reject internal mocks of owned collaborators. Require real pgvector evidence for DB-backed claims. Treat signed-out curl smoke as insufficient for authenticated product/release claims. For extension changes, check built artifact shape and real Chrome behavior, not just WXT unit tests.

## Output Contract

End with evidence, decisions, and residual risk. Name exact commands/artifacts for executable paths. If a changed path was not directly exercised, say so explicitly. Keep Sploot-specific terms in the body; do not append generic sidecar notes.
