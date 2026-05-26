# AGENTS

## Stack & Boundaries

Sploot is a pnpm Turborepo monorepo. `apps/web` owns the Next.js 15 app, App Router API routes, Clerk auth, Prisma/Neon pgvector, Vercel Blob, Replicate embeddings, Sentry, deployed smoke, and Vercel release posture. `apps/extension` owns the WXT/React Chrome extension, popup/background capture, Clerk extension auth, API client, store assets, and Chrome Web Store release packet. `packages/common` owns shared upload constants and API types consumed by both apps.

## Ground Truth Pointers

- Product: `vision.md`
- Architecture: `ARCHITECTURE.md`, `apps/web/ARCHITECTURE.md`, `apps/extension/ARCHITECTURE.md`
- Web API docs: `apps/web/docs/API.md` must stay synced with route behavior
- Shared upload/API contract: `packages/common/src/*`
- Prisma schema/migrations: `apps/web/prisma`
- CI: `.github/workflows/ci.yml`; release: `.github/workflows/release.yml`
- Extension release packet: `apps/extension/STORE_LISTING.md`, `apps/extension/scripts/validate-store-release.mjs`, `apps/extension/store-assets/`
- Tracker: `backlog.d/` and `backlog.d/_done/`

## Invariants

- Use pnpm. Do not introduce npm/yarn workflows.
- Default base branch is `origin/master`.
- Use `DATABASE_URL` for Prisma; do not invent env aliases.
- `@sploot/common` is the source of truth for upload limits, MIME validation, and shared API types.
- Source of truth for work tracking is local markdown files in `backlog.d/`, not GitHub Issues.
- Closure requires the backlog item to move to `backlog.d/_done/` with `Status: done`, a `## What Was Built` note, and conventional commit/PR linkage such as `Backlog: backlog.d/<id>-<slug>.md`, `Closes-backlog:`, or `Ships-backlog:`.
- Web deploy and extension release are separate surfaces.
- The legacy harness has been removed. Do not require legacy harness config, schemas, or evidence directories; use Spellbook-tailored skills plus backlog/docs evidence.

## Gate Contract

Ship gate equals CI parity: `pnpm lint && pnpm type-check && pnpm --filter web test && pnpm --filter extension build`, with Prisma/pgvector DB-backed paths requiring `DATABASE_URL` against a pgvector-capable Postgres or explicit `DB path unverified` evidence. GitHub CI adds frozen install, `pnpm --filter web db:migrate` against `pgvector/pgvector:pg15`, turbo lint/type-check, web tests, extension lint/test/build, and the `merge-gate` aggregate job.

Lefthook runs gitleaks, web lint, extension lint, and turbo type-check before local commit/push. Do not lower gates; diagnose env, DB, migration, WXT, or auth setup instead.

## Known Debt Map

| Tracker | Surface | Debt |
|---|---|---|
| `backlog.d/007-publish-extension-web-store-release.md` | `apps/extension`, Chrome Web Store | Current unpacked build is loaded, but authenticated right-click upload/duplicate proof and Web Store dashboard receipt remain. |
| Sentry #7117400497 / PR #151 | `apps/web/app/api/health/route.ts` | Stale Prisma serverless connections need runtime health evidence on future DB health changes. |
| PR #142 | embedding scheduler/rate-limit modules | Embedding spikes and duplicate job pressure are production risks; test scheduling and cost controls directly. |
| PR #153 | `.github/workflows/release.yml` | Semantic-release depends on `GH_RELEASE_TOKEN`; release fixes must prove token path without weakening permissions. |
| Backlog refs required | `apps/web/docs/API.md` | API docs are hand maintained and can drift from route behavior. |

## Harness Index

| Skill | What it does here |
|---|---|
| `research` | Triangulates Sploot stack facts from local docs plus primary docs for Next/WXT/Clerk/Prisma/Neon/Vercel/Sentry/Replicate. |
| `groom` | Maintains `backlog.d` from production signals, release blockers, docs drift, and code debt. |
| `shape` | Produces Sploot context packets with web/extension/common boundaries and CI parity oracle. |
| `implement` | Builds from backlog items with TDD, shared-contract discipline, and pgvector/auth evidence requirements. |
| `qa` | Runs browser/API/extension/DB/deployed smoke paths beyond unit tests, using Computer Use for real Chrome UI. |
| `demo` | Captures screenshots, request/response snippets, extension receipts, release packets, and smoke evidence. |
| `code-review` | Reviews auth, upload validation, Prisma/pgvector, embeddings, extension env, release, and docs drift risks. |
| `refactor` | Simplifies touched hot paths without unrelated churn, preserving `@sploot/common` as shared contract. |
| `ci` | Executes and diagnoses CI parity. |
| `diagnose` | Traces CI/Sentry/Vercel/release/extension failures source-to-sink. |
| `monitor` | Watches health, Sentry, deploy, release, extension, and CI signals after risky changes. |
| `deliver` | Composes one backlog item to merge-ready and stops before merge. |
| `settle` | Polishes branches/PRs to merge-ready, then hands off to `ship`. |
| `ship` | Lands merge-ready work with backlog archival, structured closure, reflect, and post-merge checks. |
| `trace` | Persists durable breadcrumbs in backlog/docs/PR evidence without reviving legacy harness artifacts. |
| `yeet` | Splits local changes into conventional commits with backlog linkage. |
| `flywheel` | Runs the backlog-to-monitor outer loop. |
| `deploy` | Separates Vercel web deploy evidence from Chrome Web Store extension release evidence. |
| `office-hours`, `ceo-review`, `reflect` | Universal judgment and learning protocols. |

## Installed Agents

| Agent | Purpose |
|---|---|
| `planner` | Portfolio and implementation planning. |
| `builder` | Bounded implementation. |
| `critic` | Acceptance and rewrite critique. |
| `beck` | TDD discipline. |
| `carmack` | Shippability and scope pressure. |
| `grug` | Complexity audit. |
| `ousterhout` | Module depth and information hiding. |
| `cooper` | Test-double discipline. |
| `a11y-*` | Accessibility audit/fix/review for UI work. |
