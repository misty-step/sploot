---
name: ship
description: |
  Tailored Sploot workflow skill. Use when the user invokes this phase or asks for the corresponding lifecycle work in this repo.
---

# /ship

## Sploot Anchors

- Repo: pnpm Turborepo with `apps/web`, `apps/extension`, and `packages/common`.
- Tracker: GitHub Issues. `backlog.d/` is not active here.
- Base branch: `origin/master`.
- Ship gate: `pnpm lint && pnpm type-check && pnpm --filter web test && pnpm --filter extension build`, with DB-backed paths requiring `DATABASE_URL` against pgvector or an explicit unverified note.
- Remote CI: frozen install, web Prisma migrate against `pgvector/pgvector:pg15`, turbo lint/type-check, web tests, extension build.
- Closure: issue reference plus Conventional Commit subject/body or explicit trailers (`Refs: #123`, `Closes: #123`, `Refs-issue: #123`).

## How This Skill Works Here

Final mile for a merge-ready PR. Verify issue refs, CI parity, and mergeability; preserve `Closes #<id>`/`Refs #<id>` or explicit trailers in the squash body so GitHub closure remains structured. Use `origin/master` as base.

Before merge, update docs touched by the change and ensure web versus extension release implications are stated. After merge, verify issue closure/reference state, semantic-release implications, run `/reflect` with the issue/PR/merge SHA, and then decide whether `/monitor` is needed. Reflect harness edits route to `harness/reflect-outputs`; do not invent `backlog.d` archive steps in this repo.

## Output Contract

End with evidence, decisions, and residual risk. If a changed executable path was not directly exercised, say so explicitly. Keep repo-specific names and commands in the body; do not append generic sidecar notes.
