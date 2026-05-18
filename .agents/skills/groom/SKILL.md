---
name: groom
description: |
  Tailored Sploot workflow skill. Use when the user invokes this phase or asks for the corresponding lifecycle work in this repo.
---

# /groom

## Sploot Anchors

- Repo: pnpm Turborepo with `apps/web`, `apps/extension`, and `packages/common`.
- Tracker: local markdown files in `backlog.d/`; GitHub Issues are not active for Sploot work tracking.
- Base branch: `origin/master`.
- Ship gate: `pnpm lint && pnpm type-check && pnpm --filter web test && pnpm --filter extension build`, with DB-backed paths requiring `DATABASE_URL` against pgvector or an explicit unverified note.
- Remote CI: frozen install, web Prisma migrate against `pgvector/pgvector:pg15`, turbo lint/type-check, web tests, extension build.
- Closure: backlog item status moves to `done` with a `What Was Built` note plus Conventional Commit subject/body or an explicit `Backlog: backlog.d/<id>-<slug>.md` trailer.

## How This Skill Works Here

Groom local `backlog.d`, not GitHub Issues. A successful groom always ends with a refreshed backlog of work: new top-level markdown tickets, edited markdown tickets, explicit `_done/` archive recommendations, or a ratification packet listing exact backlog file mutations that need user approval. An inventory of existing backlog items and PRs is context, not a groom.

Run the full loop every time:

1. **Tidy.** Reconcile top-level `backlog.d/*.md` items and PRs against merged commits, release notes, Sentry incidents, and docs. Use `find backlog.d -maxdepth 2 -type f`, `gh pr list`, `git log --oneline --decorate -30`, `.github/workflows/`, `CHANGELOG.md`, `PROMPT.md`, and recent Sentry prompts when available.
2. **Generate missing work.** If local `backlog.d` is empty or thin, treat that as a backlog health failure, not a stopping condition. Mine product vision, TODO/debt comments, stale docs, open PR failures, production incidents, and hot files for candidate work.
3. **Interrogate.** For top candidates, state the user outcome, root cause, non-goals, oracle, and why this belongs on the backlog now. Challenge symptom tickets before writing them.
4. **Rank.** Group candidates into 2-4 themes and rank by `(product impact * operational risk reduction) / effort`. Sploot's current product focus is save, search, shuffle; operational risk includes Prisma/pgvector, embeddings, Clerk auth, Vercel deploys, extension capture/upload, and release automation.
5. **Emit backlog changes.** Create or update local backlog items when the mutation is straightforward and non-destructive. For destructive or ambiguous actions, present a ratification packet with exact `git mv`/file-edit commands or backlog file bodies.

For broad product/QA grooming, deployed authenticated smoke is part of the
evidence floor, not a nice-to-have. Use the `/qa` Chrome/Computer Use path with
an existing signed-in Chrome profile/session or a user-provided test account
path to exercise production library/search and, when relevant, upload or
extension capture. If this cannot be run, the groom must say
`authenticated production smoke: blocked` with the exact attempted path and
must create or update backlog work for the missing harness/evidence if it
changes the ranking.

Always flag stale contradictions: a backlog item marked done but still referenced as active in docs, a shipped PR without backlog linkage, an open PR that duplicates another PR, a Sentry incident fixed without a regression test or monitoring note, or a TODO/debt marker with no backlog item. If someone asks to use GitHub Issues for work tracking, ask for explicit tracker migration approval first.

Each new or refreshed backlog item must contain:

- Goal: one sentence naming the outcome.
- Oracle: mechanically checkable completion evidence, including the Sploot ship gate or a narrower command when justified.
- Scope: affected surface (`apps/web`, `apps/extension`, `packages/common`, CI/release, docs).
- Why now: evidence from PRs, incidents, docs, product vision, or code scan.
- Links: relevant PRs, commits, Sentry IDs, docs, or files.

## Output Contract

End with evidence, decisions, backlog mutations, and residual risk. The final answer must include a **Refreshed Backlog** section with created/updated backlog file paths or a ratification packet. It must also include `authenticated production smoke: passed|failed|blocked`. If no backlog item should be created, say which evidence made deletion/deferral better than backlog growth. If a changed executable path was not directly exercised, say so explicitly. Keep repo-specific names and commands in the body; do not append generic sidecar notes.
