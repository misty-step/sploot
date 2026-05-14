---
name: monitor
description: |
  Tailored Sploot workflow skill. Use when the user invokes this phase or asks for the corresponding lifecycle work in this repo.
---

# /monitor

## Sploot Anchors

- Repo: pnpm Turborepo with `apps/web`, `apps/extension`, and `packages/common`.
- Tracker: local markdown files in `backlog.d/`; GitHub Issues are not active for Sploot work tracking.
- Base branch: `origin/master`.
- Ship gate: `pnpm lint && pnpm type-check && pnpm --filter web test && pnpm --filter extension build`, with DB-backed paths requiring `DATABASE_URL` against pgvector or an explicit unverified note.
- Remote CI: frozen install, web Prisma migrate against `pgvector/pgvector:pg15`, turbo lint/type-check, web tests, extension build.
- Closure: backlog item status moves to `done` with a `What Was Built` note plus Conventional Commit subject/body or an explicit `Backlog: backlog.d/<id>-<slug>.md` trailer.

## How This Skill Works Here

Watch signals after merge/deploy/release. For web: Vercel deploy status, `/api/health`, `/api/db-ping`, Sentry, structured logs, and release notes. For extension: build artifact presence, manual Chrome smoke, and store-submission status when available. For CI-only changes: subsequent GitHub Actions runs.

Monitor emits a clean result or escalates to `/diagnose`; it does not patch code.

## Output Contract

End with evidence, decisions, and residual risk. If a changed executable path was not directly exercised, say so explicitly. Keep repo-specific names and commands in the body; do not append generic sidecar notes.
