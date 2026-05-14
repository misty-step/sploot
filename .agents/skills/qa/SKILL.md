---
name: qa
description: |
  Tailored Sploot workflow skill. Use when the user invokes this phase or asks for the corresponding lifecycle work in this repo.
---

# /qa

## Sploot Anchors

- Repo: pnpm Turborepo with `apps/web`, `apps/extension`, and `packages/common`.
- Tracker: local markdown files in `backlog.d/`; GitHub Issues are not active for Sploot work tracking.
- Base branch: `origin/master`.
- Ship gate: `pnpm lint && pnpm type-check && pnpm --filter web test && pnpm --filter extension build`, with DB-backed paths requiring `DATABASE_URL` against pgvector or an explicit unverified note.
- Remote CI: frozen install, web Prisma migrate against `pgvector/pgvector:pg15`, turbo lint/type-check, web tests, extension build.
- Closure: backlog item status moves to `done` with a `What Was Built` note plus Conventional Commit subject/body or an explicit `Backlog: backlog.d/<id>-<slug>.md` trailer.

## How This Skill Works Here

QA is not “tests passed.” For web UI changes, run the web dev server on port 3001 and walk the changed route in Browser, checking console/network errors. For API changes, replay representative HTTP requests and verify status/body/auth behavior. For extension changes, build with `pnpm --filter extension build` or `build:prod`, then inspect `.output/` and manually smoke popup/background flows when browser state matters.

For DB/search/upload changes, use a pgvector-capable `DATABASE_URL`; otherwise mark that path unverified. Evidence should name exact commands and surfaces.

## Output Contract

End with evidence, decisions, and residual risk. If a changed executable path was not directly exercised, say so explicitly. Keep repo-specific names and commands in the body; do not append generic sidecar notes.
