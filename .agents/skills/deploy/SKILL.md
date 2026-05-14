---
name: deploy
description: |
  Tailored Sploot workflow skill. Use when the user invokes this phase or asks for the corresponding lifecycle work in this repo.
---

# /deploy

## Sploot Anchors

- Repo: pnpm Turborepo with `apps/web`, `apps/extension`, and `packages/common`.
- Tracker: GitHub Issues. `backlog.d/` is not active here.
- Base branch: `origin/master`.
- Ship gate: `pnpm lint && pnpm type-check && pnpm --filter web test && pnpm --filter extension build`, with DB-backed paths requiring `DATABASE_URL` against pgvector or an explicit unverified note.
- Remote CI: frozen install, web Prisma migrate against `pgvector/pgvector:pg15`, turbo lint/type-check, web tests, extension build.
- Closure: issue reference plus Conventional Commit subject/body or explicit trailers (`Refs: #123`, `Closes: #123`, `Refs-issue: #123`).

## How This Skill Works Here

Deploy is justified here because `apps/web/vercel.json`, Vercel production, semantic-release, and extension production artifacts exist. Treat web deploy and extension release separately.

Web deploy checks: merged `master`, Vercel deployment status, env availability, `/api/health`, `/api/db-ping`, Sentry. Extension release checks: `pnpm --filter extension build:prod`, `.output/` artifact, `VITE_API_BASE_URL=https://www.sploot.app`, Chrome Web Store notes. Deploy does not replace `/monitor`.

## Output Contract

End with evidence, decisions, and residual risk. If a changed executable path was not directly exercised, say so explicitly. Keep repo-specific names and commands in the body; do not append generic sidecar notes.
