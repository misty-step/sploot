---
name: deliver
description: |
  Tailored Sploot workflow skill. Use when the user invokes this phase or asks for the corresponding lifecycle work in this repo.
---

# /deliver

## Sploot Anchors

- Repo: pnpm Turborepo with `apps/web`, `apps/extension`, and `packages/common`.
- Tracker: local markdown files in `backlog.d/`; GitHub Issues are not active for Sploot work tracking.
- Base branch: `origin/master`.
- Ship gate: `pnpm lint && pnpm type-check && pnpm --filter web test && pnpm --filter extension build`, with DB-backed paths requiring `DATABASE_URL` against pgvector or an explicit unverified note.
- Remote CI: frozen install, web Prisma migrate against `pgvector/pgvector:pg15`, turbo lint/type-check, web tests, extension build.
- Closure: backlog item status moves to `done` with a `What Was Built` note plus Conventional Commit subject/body or an explicit `Backlog: backlog.d/<id>-<slug>.md` trailer.

## How This Skill Works Here

When invoked without an explicit backlog item, inspect active top-level `backlog.d/*.md` tickets and select the highest-priority item whose `Status:` is `ready`, using the ticket number as the tie-breaker. Do not ask the operator to choose while `Priority:` and `Status:` provide a deterministic next item. If no ready item exists, say that and stop.

Take the selected local backlog item or shaped packet to merge-ready. Compose `/shape -> /implement -> /ci -> /code-review -> /refactor -> /qa`; stop before merge, push, deploy, or backlog archival.

The delivery receipt must name the selected backlog ref, changed surfaces (`apps/web`, `apps/extension`, `packages/common`, CI/release), CI parity evidence, DB/pgvector verification status, and residual deploy/release risk. Delivered does not mean shipped.

## Output Contract

End with evidence, decisions, and residual risk. If a changed executable path was not directly exercised, say so explicitly. Keep repo-specific names and commands in the body; do not append generic sidecar notes.
