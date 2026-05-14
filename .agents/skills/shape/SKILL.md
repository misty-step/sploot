---
name: shape
description: |
  Tailored Sploot workflow skill. Use when the user invokes this phase or asks for the corresponding lifecycle work in this repo.
---

# /shape

## Sploot Anchors

- Repo: pnpm Turborepo with `apps/web`, `apps/extension`, and `packages/common`.
- Tracker: GitHub Issues. `backlog.d/` is not active here.
- Base branch: `origin/master`.
- Ship gate: `pnpm lint && pnpm type-check && pnpm --filter web test && pnpm --filter extension build`, with DB-backed paths requiring `DATABASE_URL` against pgvector or an explicit unverified note.
- Remote CI: frozen install, web Prisma migrate against `pgvector/pgvector:pg15`, turbo lint/type-check, web tests, extension build.
- Closure: issue reference plus Conventional Commit subject/body or explicit trailers (`Refs: #123`, `Closes: #123`, `Refs-issue: #123`).

## How This Skill Works Here

Shape Sploot ideas into context packets that distinguish product surface. A web idea names routes/API handlers under `apps/web`; an extension idea names background/popup/shared boundaries under `apps/extension`; shared upload constraints name `packages/common` first.

Every packet must include acceptance criteria, non-goals, files likely touched, and an oracle. The oracle must cite CI parity and, when Prisma/pgvector/upload/search is touched, the DB-backed verification path or its explicit absence.

## Output Contract

End with evidence, decisions, and residual risk. If a changed executable path was not directly exercised, say so explicitly. Keep repo-specific names and commands in the body; do not append generic sidecar notes.
