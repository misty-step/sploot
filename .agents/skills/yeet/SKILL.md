---
name: yeet
description: |
  Tailored Sploot workflow skill. Use when the user invokes this phase or asks for the corresponding lifecycle work in this repo.
---

# /yeet

## Sploot Anchors

- Repo: pnpm Turborepo with `apps/web`, `apps/extension`, and `packages/common`.
- Tracker: local markdown files in `backlog.d/`; GitHub Issues are not active for Sploot work tracking.
- Base branch: `origin/master`.
- Ship gate: `pnpm lint && pnpm type-check && pnpm --filter web test && pnpm --filter extension build`, with DB-backed paths requiring `DATABASE_URL` against pgvector or an explicit unverified note.
- Remote CI: frozen install, web Prisma migrate against `pgvector/pgvector:pg15`, turbo lint/type-check, web tests, extension build.
- Closure: backlog item status moves to `done` with a `What Was Built` note plus Conventional Commit subject/body or an explicit `Backlog: backlog.d/<id>-<slug>.md` trailer.

## How This Skill Works Here

Turn local worktree changes into conventional commits and push. Read full `git status --short`, `git diff --stat`, and recent commits. Split by reviewer meaning: web/API, extension, common package, CI/release, docs/harness.

Commit subjects follow Conventional Commits. Bodies should include backlog refs when available and note DB/pgvector verification gaps. Do not push secrets, `.env`, extension private keys, or generated debris outside intended artifacts.

## Output Contract

End with evidence, decisions, and residual risk. If a changed executable path was not directly exercised, say so explicitly. Keep repo-specific names and commands in the body; do not append generic sidecar notes.
