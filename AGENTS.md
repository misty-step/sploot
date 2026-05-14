# AGENTS

## Stack & Boundaries

Sploot is a pnpm Turborepo monorepo. `apps/web` owns the Next.js 15 app, API routes, Clerk auth, Prisma/Neon pgvector, Vercel Blob, Replicate embeddings, Sentry, and Vercel deployment. `apps/extension` owns the WXT/React Chrome extension, background capture, popup UI, Clerk extension auth, API client, and Chrome Web Store artifacts. `packages/common` owns shared upload constants and API types consumed by both apps.

## Ground Truth Pointers

- Product: `vision.md`
- Architecture: `ARCHITECTURE.md`, app-level `ARCHITECTURE.md`/`CLAUDE.md`
- Web API docs: `apps/web/docs/API.md` must stay synced with route behavior
- Shared upload/API contract: `packages/common/src/*`
- Prisma schema/migrations: `apps/web/prisma`
- CI: `.github/workflows/ci.yml`; release: `.github/workflows/release.yml`

## Invariants

- Use pnpm. Do not introduce npm/yarn workflows.
- Default base branch is `origin/master`.
- Use `DATABASE_URL` for Prisma; do not invent env aliases.
- `@sploot/common` is the source of truth for upload limits, MIME validation, and shared API types.
- Source of truth for work tracking is local markdown files in `backlog.d/`, not GitHub Issues.
- Closure requires the backlog item to move to `backlog.d/_done/` with a `What Was Built` note plus conventional commit or `Backlog: backlog.d/<id>-<slug>.md` trailer linkage.
- Web deploy and extension release are separate surfaces.

## Gate Contract

Ship gate equals CI parity: `pnpm lint && pnpm type-check && pnpm --filter web test && pnpm --filter extension build`, with Prisma/pgvector DB-backed paths requiring `DATABASE_URL` against pgvector or explicit “DB path unverified” evidence. GitHub CI adds frozen install and `pnpm --filter web db:migrate` against `pgvector/pgvector:pg15`. Lefthook runs gitleaks, web lint, extension lint placeholder, and turbo type-check before local commit/push.

## Known Debt Map

| Tracker | Surface | Debt |
|---|---|---|
| Sentry #7117400497 / PR #151 | `apps/web/app/api/health/route.ts` | Stale Prisma serverless connections need runtime health evidence on future DB health changes. |
| GitHub PR #142 | embedding scheduler/rate-limit modules | Embedding spikes and duplicate job pressure are production risks; test scheduling and cost controls directly. |
| GitHub PR #153 | `.github/workflows/release.yml` | Semantic-release depends on `GH_RELEASE_TOKEN`; release fixes must prove token path without weakening permissions. |
| Backlog refs required | `apps/web/docs/API.md` | API docs are hand maintained and can drift from route behavior. |

## Harness Index

| Skill | What it does here |
|---|---|
| `research` | Triangulates Sploot stack facts from local docs plus primary docs for Next/WXT/Clerk/Prisma/Neon/Vercel/Sentry/Replicate. |
| `groom` | Refreshes `backlog.d/` from PRs, commits, Sentry incidents, release notes, docs, and code debt. |
| `shape` | Produces context packets with web/extension/common boundaries and CI parity oracle. |
| `implement` | Builds from backlog items or packets with TDD and Sploot mocking boundaries. |
| `qa` | Runs browser/API/extension/DB smoke paths beyond unit tests. |
| `demo` | Captures screenshots, request/response snippets, artifact notes, or release blurbs. |
| `code-review` | Reviews for auth, upload validation, Prisma/pgvector, embeddings, extension env, and release risks. |
| `refactor` | Simplifies touched hot paths without unrelated churn. |
| `ci` | Executes and diagnoses the CI parity gate. |
| `diagnose` | Traces CI/Sentry/Vercel/release/extension failures source-to-sink. |
| `monitor` | Watches health, Sentry, deploy, release, extension, and CI signals after changes. |
| `deliver` | Composes one backlog item to merge-ready. |
| `settle` | Polishes branch/PR to merge-ready, then stops. |
| `ship` | Lands merge-ready work with local backlog closure and post-merge checks. |
| `yeet` | Splits local changes into conventional commits and pushes. |
| `flywheel` | Runs the backlog-to-monitor outer loop. |
| `deploy` | Routes Vercel web deploy and extension production artifact release checks. |
| `office-hours`, `ceo-review`, `reflect` | Universal judgment and learning protocols copied verbatim. |

## Installed Agents

| Agent | Purpose |
|---|---|
| `builder` | Bounded implementation. |
| `critic` | Plan/rewrite critique. |
| `beck` | TDD discipline. |
| `carmack` | Shippability and scope pressure. |
| `grug` | Complexity audit. |
| `ousterhout` | Module depth and information hiding. |
| `cooper` | Test-double discipline. |
| `planner` | Design and portfolio planning. |
| `a11y-*` | Accessibility audit/fix/review for UI work. |
