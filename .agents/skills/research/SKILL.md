---
name: research
description: |
  Tailored Sploot workflow skill. Use when the user invokes this phase or asks for the corresponding lifecycle work in this repo.
---

# /research

## Sploot Anchors

- Repo: pnpm Turborepo with `apps/web`, `apps/extension`, and `packages/common`.
- Tracker: GitHub Issues. `backlog.d/` is not active here.
- Base branch: `origin/master`.
- Ship gate: `pnpm lint && pnpm type-check && pnpm --filter web test && pnpm --filter extension build`, with DB-backed paths requiring `DATABASE_URL` against pgvector or an explicit unverified note.
- Remote CI: frozen install, web Prisma migrate against `pgvector/pgvector:pg15`, turbo lint/type-check, web tests, extension build.
- Closure: issue reference plus Conventional Commit subject/body or explicit trailers (`Refs: #123`, `Closes: #123`, `Refs-issue: #123`).

## How This Skill Works Here

Use research when Sploot work needs outside evidence, official docs, or multiple perspectives. Start from local truth: `ARCHITECTURE.md`, `vision.md`, `CLAUDE.md`, app-level `AGENTS.md`, `.spellbook/repo-brief.md`, and the current GitHub issue or PR. For framework/API facts that may have changed, cite primary docs: Next.js, WXT, Clerk, Prisma, Neon, Vercel Blob, Sentry, Replicate, Turborepo, Vitest.

For repo investigations, fan out by surface: web/API, extension, common package, CI/release. Keep synthesis on the lead model and mark any unverified DB/pgvector path.

## Output Contract

End with evidence, decisions, and residual risk. If a changed executable path was not directly exercised, say so explicitly. Keep repo-specific names and commands in the body; do not append generic sidecar notes.
