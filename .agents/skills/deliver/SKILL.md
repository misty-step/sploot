---
name: deliver
description: |
  Tailored Sploot workflow skill. Use when the user invokes this phase or asks for the corresponding lifecycle work in this repo.
---

# /deliver

## Sploot Anchors

- Repo: pnpm Turborepo with `apps/web`, `apps/extension`, and `packages/common`.
- Tracker: GitHub Issues. `backlog.d/` is not active here.
- Base branch: `origin/master`.
- Ship gate: `pnpm lint && pnpm type-check && pnpm --filter web test && pnpm --filter extension build`, with DB-backed paths requiring `DATABASE_URL` against pgvector or an explicit unverified note.
- Remote CI: frozen install, web Prisma migrate against `pgvector/pgvector:pg15`, turbo lint/type-check, web tests, extension build.
- Closure: issue reference plus Conventional Commit subject/body or explicit trailers (`Refs: #123`, `Closes: #123`, `Refs-issue: #123`).

## How This Skill Works Here

Take one GitHub issue or shaped packet to merge-ready. Compose `/shape -> /implement -> /ci -> /code-review -> /refactor -> /qa`; stop before merge.

The delivery receipt must name issue refs, changed surfaces (`apps/web`, `apps/extension`, `packages/common`, CI/release), CI parity evidence, DB/pgvector verification status, and residual deploy/release risk. Delivered does not mean shipped.

## Output Contract

End with evidence, decisions, and residual risk. If a changed executable path was not directly exercised, say so explicitly. Keep repo-specific names and commands in the body; do not append generic sidecar notes.
