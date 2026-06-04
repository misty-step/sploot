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
- The legacy harness has been removed. Do not require legacy harness config, schemas, evidence directories, or repo-local lifecycle skill catalogs; use globally installed Harness Kit skills plus backlog/docs evidence unless a future Sploot-specific exception is explicitly justified.

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

## Harness Routing

Use the globally configured Harness Kit skills. Do not vendor lifecycle skill
catalogs, generated skill references, provider adapters, or cross-harness skill
symlinks into this repo unless the behavior is an extreme Sploot-specific
exception that cannot live in Harness Kit. If such an exception is needed,
document the narrow surface here and keep the bridge/config pointing only at
that exception. Substantive work should start from the backlog/docs anchors
above, respect the web/extension/common boundary, and close with CI-parity
evidence plus any surface-specific DB, deployed-smoke, or extension-release
proof named by the ticket.
