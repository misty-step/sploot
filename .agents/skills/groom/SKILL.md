---
name: groom
description: |
  Tailored Sploot workflow skill. Use when the user invokes this phase or asks for the corresponding lifecycle work in this repo.
---

# /groom

## Sploot Anchors

- Repo: pnpm Turborepo with `apps/web`, `apps/extension`, and `packages/common`.
- Tracker: GitHub Issues. `backlog.d/` is not active here.
- Base branch: `origin/master`.
- Ship gate: `pnpm lint && pnpm type-check && pnpm --filter web test && pnpm --filter extension build`, with DB-backed paths requiring `DATABASE_URL` against pgvector or an explicit unverified note.
- Remote CI: frozen install, web Prisma migrate against `pgvector/pgvector:pg15`, turbo lint/type-check, web tests, extension build.
- Closure: issue reference plus Conventional Commit subject/body or explicit trailers (`Refs: #123`, `Closes: #123`, `Refs-issue: #123`).

## How This Skill Works Here

Groom GitHub Issues, not file backlog. A successful groom always ends with a refreshed backlog of work: opened GitHub issues, edited GitHub issues, explicit close/archive recommendations, or a ratification packet listing the exact issue mutations that need user approval. An inventory of issues and PRs is context, not a groom.

Run the full loop every time:

1. **Tidy.** Reconcile open issues and PRs against merged commits, release notes, Sentry incidents, and docs. Use `gh issue list`, `gh pr list`, `git log --oneline --decorate -30`, `.github/workflows/`, `CHANGELOG.md`, `PROMPT.md`, and recent Sentry prompts when available.
2. **Generate missing work.** If GitHub Issues is empty or thin, treat that as a backlog health failure, not a stopping condition. Mine product vision, TODO/debt comments, stale docs, open PR failures, production incidents, and hot files for candidate work.
3. **Interrogate.** For top candidates, state the user outcome, root cause, non-goals, oracle, and why this belongs on the backlog now. Challenge symptom tickets before writing them.
4. **Rank.** Group candidates into 2-4 themes and rank by `(product impact * operational risk reduction) / effort`. Sploot's current product focus is save, search, shuffle; operational risk includes Prisma/pgvector, embeddings, Clerk auth, Vercel deploys, extension capture/upload, and release automation.
5. **Emit backlog changes.** Create or update GitHub issues when the mutation is straightforward and non-destructive. For destructive or ambiguous actions, present a ratification packet with exact `gh issue` commands or issue bodies.

Always flag stale contradictions: an issue closed in GitHub but still referenced as active in docs, a shipped PR without issue linkage, an open PR that duplicates another PR, a Sentry incident fixed without a regression test or monitoring note, or a TODO/debt marker with no issue. If a file backlog is requested, create a GitHub issue first or ask for an explicit tracker migration.

Each new or refreshed issue must contain:

- Goal: one sentence naming the outcome.
- Oracle: mechanically checkable completion evidence, including the Sploot ship gate or a narrower command when justified.
- Scope: affected surface (`apps/web`, `apps/extension`, `packages/common`, CI/release, docs).
- Why now: evidence from PRs, incidents, docs, product vision, or code scan.
- Links: relevant PRs, commits, Sentry IDs, docs, or files.

## Output Contract

End with evidence, decisions, backlog mutations, and residual risk. The final answer must include a **Refreshed Backlog** section with created/updated issue URLs or a ratification packet. If no issue should be created, say which evidence made deletion/deferral better than backlog growth. If a changed executable path was not directly exercised, say so explicitly. Keep repo-specific names and commands in the body; do not append generic sidecar notes.
