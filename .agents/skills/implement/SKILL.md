---
name: implement
description: |
  Tailored Sploot workflow skill. Use when the user invokes this phase or asks for the corresponding lifecycle work in this repo.
---

# /implement

## Sploot Anchors

- Repo: pnpm Turborepo with `apps/web`, `apps/extension`, and `packages/common`.
- Tracker: local markdown files in `backlog.d/`; GitHub Issues are not active for Sploot work tracking.
- Base branch: `origin/master`.
- Ship gate: `pnpm lint && pnpm type-check && pnpm --filter web test && pnpm --filter extension build`, with DB-backed paths requiring `DATABASE_URL` against pgvector or an explicit unverified note.
- Remote CI: frozen install, web Prisma migrate against `pgvector/pgvector:pg15`, turbo lint/type-check, web tests, extension build.
- Closure: backlog item status moves to `done` with a `What Was Built` note plus Conventional Commit subject/body or an explicit `Backlog: backlog.d/<id>-<slug>.md` trailer.

## How This Skill Works Here

Implement from a shaped packet or local backlog item. Create branches as `<type>/<id>-<slug>` when a backlog item exists; otherwise use `cx/<slug>` for Codex work. Write behavior tests before production code for business logic and API contracts.

Respect internal boundaries: do not mock Sploot-owned modules; use realistic fakes or the real implementation. Boundary mocks are allowed for Clerk, Sentry, Vercel Blob, Replicate, network, clock, and browser APIs. New code must keep `@sploot/common` as the source of upload limits and API types.

## Output Contract

End with evidence, decisions, and residual risk. If a changed executable path was not directly exercised, say so explicitly. Keep repo-specific names and commands in the body; do not append generic sidecar notes.
