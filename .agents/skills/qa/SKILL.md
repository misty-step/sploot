---
name: qa
description: |
  Tailored Sploot workflow skill. Use when the user invokes this phase or asks for the corresponding lifecycle work in this repo.
---

# /qa

## Sploot Anchors

- Product: personal meme library focused on save, semantic search, and shuffle.
- Stack: pnpm Turborepo with `apps/web` (Next.js 15, Clerk, Prisma/Neon pgvector, Vercel Blob, Replicate, Sentry), `apps/extension` (WXT/React Chrome extension), and `packages/common` (shared upload/API contracts).
- Tracker: local markdown files in `backlog.d/`; GitHub Issues are not the source of truth. Active work stays top-level, done work moves to `backlog.d/_done/`.
- Base branch: `origin/master`.
- Load-bearing gate: Ship gate equals CI parity: `pnpm lint && pnpm type-check && pnpm --filter web test && pnpm --filter extension build`, with Prisma/pgvector DB-backed paths requiring `DATABASE_URL` against a pgvector-capable Postgres or explicit `DB path unverified` evidence. GitHub CI adds frozen install, `pnpm --filter web db:migrate` against `pgvector/pgvector:pg15`, turbo lint/type-check, web tests, extension lint/test/build, and the `merge-gate` aggregate job.
- Closure signal: move the backlog item to `backlog.d/_done/` with `Status: done`, a `## What Was Built` note, and a conventional commit/PR body carrying `Backlog: backlog.d/<id>-<slug>.md` or explicit `Closes-backlog:` / `Ships-backlog:` trailers.

## How This Skill Works Here

QA is not "tests passed". Choose the proof path for the changed Sploot surface.

- Web/UI: run the web app on port 3001 when local behavior matters; inspect changed routes with Browser/Computer Use and check console/network errors.
- API/upload/search/storage: run representative requests and web tests against a pgvector-capable `DATABASE_URL`; verify status/body/auth behavior and docs sync in `apps/web/docs/API.md`.
- Extension: build or production-build `apps/extension/dist/chrome-mv3`, load/reload it in real Chrome when auth, context menus, background worker, permissions, or release readiness matters, and record extension ID plus loaded path. Use Computer Use for `chrome://extensions` and toolbar/popup flows.
- Deployed/release: run `pnpm --filter web smoke:deployed` and `pnpm --filter extension release:check` when publishing, release packet, or production smoke is in scope.

Authenticated production smoke is required for save/search/shuffle, extension publishing, auth, upload, storage quota, deployed UX, and broad product grooming. If login/session is unavailable, record `authenticated production smoke: blocked` with the attempted path.

## Output Contract

End with evidence, decisions, and residual risk. Name exact commands/artifacts for executable paths. If a changed path was not directly exercised, say so explicitly. Keep Sploot-specific terms in the body; do not append generic sidecar notes.
