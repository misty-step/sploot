---
name: settle
description: |
  Tailored Sploot workflow skill. Use when the user invokes this phase or asks for the corresponding lifecycle work in this repo.
---

# /settle

## Sploot Anchors

- Repo: pnpm Turborepo with `apps/web`, `apps/extension`, and `packages/common`.
- Tracker: GitHub Issues. `backlog.d/` is not active here.
- Base branch: `origin/master`.
- Ship gate: `pnpm lint && pnpm type-check && pnpm --filter web test && pnpm --filter extension build`, with DB-backed paths requiring `DATABASE_URL` against pgvector or an explicit unverified note.
- Remote CI: frozen install, web Prisma migrate against `pgvector/pgvector:pg15`, turbo lint/type-check, web tests, extension build.
- Closure: issue reference plus Conventional Commit subject/body or explicit trailers (`Refs: #123`, `Closes: #123`, `Refs-issue: #123`).

## How This Skill Works Here

Polish a branch or PR until it is merge-ready. Preconditions: not on `master`, no unresolved merge/rebase, worktree state understood, branch has commits beyond `origin/master`. Loop through `/ci`, GitHub PR checks and review comments, `/code-review`, `/refactor`, and targeted `/qa`.

Stop at merge-ready. Do not merge, deploy, close issues, or reflect; hand off to `/ship`. The lifecycle gate blocks merge-ready claims unless issue linkage and CI parity evidence are present.

## Output Contract

End with evidence, decisions, and residual risk. If a changed executable path was not directly exercised, say so explicitly. Keep repo-specific names and commands in the body; do not append generic sidecar notes.
