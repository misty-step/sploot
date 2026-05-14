# Sploot Repo Brief

## Vision & Purpose

Sploot is a personal meme library for people whose saved images are scattered across camera rolls, Twitter bookmarks, and folders. The product promise is simple: save images, search them with natural language, and shuffle through the collection. The current focus is the core loop of save, search, shuffle; generation and richer media are future work.

## Stack & Boundaries

Sploot is a pnpm Turborepo monorepo.

- `apps/web/` owns the Next.js 15 user experience, App Router API routes, Clerk auth, Prisma/Neon Postgres with pgvector, Vercel Blob storage, Replicate embedding jobs, Sentry, structured logging, and Vercel deployment.
- `apps/extension/` owns the WXT/React Chrome extension, context-menu capture, popup UI, Clerk extension auth, API upload client, and Chrome Web Store artifacts under `apps/extension/.output/`.
- `packages/common/` owns shared upload constraints and API types. Both apps import `@sploot/common`; upload limits and MIME rules should not fork.

## Load-Bearing Gate

Ship gate equals CI parity: `pnpm lint && pnpm type-check && pnpm --filter web test && pnpm --filter extension build`, with Prisma/pgvector DB-backed paths requiring `DATABASE_URL` against a pgvector-capable Postgres or explicit “DB path unverified” evidence. GitHub CI is the authoritative remote gate: frozen pnpm install, `pnpm --filter web db:migrate` against `pgvector/pgvector:pg15`, turbo lint, turbo type-check, `pnpm --filter web test`, then `pnpm --filter extension build`.

## Invariants

- Default branch is `origin/master`.
- Package manager is pnpm 10; do not introduce npm/yarn workflows.
- Use `DATABASE_URL` for Prisma. Custom aliases like `POSTGRES_URL` are wrong because Prisma reads `DATABASE_URL` before app code can remap env.
- Extension dev/build scripts need `VITE_API_BASE_URL`; production extension builds default to `https://www.sploot.app`.
- Web deploys are Vercel-first; extension releases are Chrome Web Store artifact-first.
- Source of truth for work tracking is GitHub Issues, not `backlog.d`.
- Closure requires issue reference plus conventional commit or trailer linkage. Backlog archive commands are not enforcement in this repo.

## Known Debts & Failure Modes

- Sentry #7117400497: stale Prisma serverless connection surfaced in `GET /api/health`; health and DB-ping paths need runtime proof, not adjacent test confidence.
- Embedding spikes: recent guard/rate-limit work touched `apps/web/lib/embedding-guard.ts`, `apps/web/lib/embedding-rate-limit.ts`, `apps/web/lib/embeddings.ts`, and scheduler routes. Treat embedding cost and duplicate job pressure as production risks.
- Release automation is sensitive to `GH_RELEASE_TOKEN`; semantic-release updates `CHANGELOG.md` and `package.json` on `master`.
- Cerberus PR review was removed from `.github/workflows`; review and readiness guidance now depend on local code review plus GitHub Actions CI, not an AI-review workflow.
- API docs under `apps/web/docs/API.md` are hand maintained and can drift from routes.

## Terminology

Use “web app” for `apps/web`, “extension” for `apps/extension`, “common package” for `packages/common`, “semantic search” for text-to-image vector search, “embedding job” for Replicate/pgvector indexing work, and “CI parity” for the local command set that mirrors GitHub CI.

## Session Signal

Validated patterns: pnpm-first commands, master as the base branch, GitHub Issues as tracker, Sentry incidents as production work inputs, and Vercel/Chrome extension releases as separate delivery surfaces. Recurring corrections to avoid: do not call `backlog.d` the active tracker, do not claim DB-backed code is tested without pgvector evidence, do not conflate web deploy with extension release, do not mutate extension env strictness to make Vercel installs pass, and do not lower quality gates to dodge missing secrets or DB setup.
