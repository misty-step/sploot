---
name: reflect
description: |
  Capture Sploot learnings after shipping, incidents, CI failures, or workflow friction.
  Emits concrete follow-up changes and routes harness edits away from master.
---

# /reflect

Reflect after meaningful Sploot work. The goal is not journaling; it is durable learning that improves the repo or harness.

## Sploot Anchors

- Tracker: GitHub Issues. `backlog.d/` is not active here.
- Base branch: `origin/master`.
- Ship gate: `pnpm lint && pnpm type-check && pnpm --filter web test && pnpm --filter extension build`, with DB-backed paths requiring `DATABASE_URL` against pgvector or explicit unverified evidence.
- Production signals: Vercel web deploys, Sentry, semantic-release, Cerberus, extension artifacts under `apps/extension/.output/`.

## Protocol

1. Load the triggering evidence: issue/PR, merge SHA, CI run, Sentry ID, deploy receipt, or local failure transcript.
2. Extract facts only: what failed, what fixed it, what was not verified, and which surface was involved (`apps/web`, `apps/extension`, `packages/common`, CI/release, harness).
3. Decide the highest-leverage codification target: type, lint/hook, test, CI, skill, `AGENTS.md`, docs, or GitHub issue.
4. Apply small repo/harness edits only when they directly prevent recurrence.
5. Route harness-only follow-up branches as `harness/reflect-outputs`; do not mix them into protected branch shipping work.

## Output

Return a short reflection with:

- Trigger: issue/PR/Sentry/CI/deploy reference.
- Learning: one or two concrete lessons.
- Codification: exact file/issue/skill change made or proposed.
- Verification: command or evidence that proves the codification is valid.
- Residual risk: what remains open, with GitHub issue reference when action is needed.
