---
name: code-review
description: |
  Tailored Sploot workflow skill. Use when the user invokes this phase or asks for the corresponding lifecycle work in this repo.
---

# /code-review

## Sploot Anchors

- Repo: pnpm Turborepo with `apps/web`, `apps/extension`, and `packages/common`.
- Tracker: GitHub Issues. `backlog.d/` is not active here.
- Base branch: `origin/master`.
- Ship gate: `pnpm lint && pnpm type-check && pnpm --filter web test && pnpm --filter extension build`, with DB-backed paths requiring `DATABASE_URL` against pgvector or an explicit unverified note.
- Remote CI: frozen install, web Prisma migrate against `pgvector/pgvector:pg15`, turbo lint/type-check, web tests, extension build.
- Closure: issue reference plus Conventional Commit subject/body or explicit trailers (`Refs: #123`, `Closes: #123`, `Refs-issue: #123`).

## How This Skill Works Here

Review for Sploot regressions first: auth bypass in API routes, upload validation drift between apps, Prisma raw SQL, pgvector query correctness, embedding job fanout/cost, serverless connection handling, extension env mistakes, and docs drift in `apps/web/docs/API.md`.

Use the local diff, GitHub PR context, CI results, and repo docs as evidence. Findings lead, ordered by severity, with file/line references and exact runtime impact.

## Output Contract

End with evidence, decisions, and residual risk. If a changed executable path was not directly exercised, say so explicitly. Keep repo-specific names and commands in the body; do not append generic sidecar notes.
