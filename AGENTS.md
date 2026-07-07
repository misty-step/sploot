# AGENTS

This file provides guidance to agents (Claude Code, Codex, and other
harnesses) when working with code in this repository. `CLAUDE.md` is a
symlink to this file — they are identical by construction.

## Project Overview

Sploot is a pnpm Turborepo monorepo consolidating:
- **apps/web** — Next.js 15 meme library: text→image semantic search (CLIP/SigLIP embeddings, pgvector), App Router API routes, Clerk auth, Prisma/Neon pgvector, Vercel Blob, Replicate embeddings, Canary diagnostics, deployed smoke, and Vercel release posture.
- **apps/extension** — Chrome extension (WXT + React) for one-click image saving: popup/background capture, Clerk extension auth, API client, store assets, and Chrome Web Store release packet.
- **packages/common** — `@sploot/common`, shared upload constants and API types consumed by both apps.

## Ground Truth Pointers

- Product: `VISION.md` — north star, audience, the capture→retrieval→taste→generation arc, and the agent-operability principle
- Architecture: `ARCHITECTURE.md`, `apps/web/ARCHITECTURE.md`, `apps/extension/ARCHITECTURE.md`
- Web API docs: `apps/web/docs/API.md` must stay synced with route behavior
- Shared upload/API contract: `packages/common/src/*`
- Prisma schema/migrations: `apps/web/prisma`
- CI: `.github/workflows/ci.yml`; release: `.github/workflows/release.yml`
- Extension release packet: `apps/extension/STORE_LISTING.md`, `apps/extension/scripts/validate-store-release.mjs`, `apps/extension/store-assets/`
- Tracker: `backlog.d/` and `backlog.d/_done/`

## Development Commands

```bash
# Root commands (via Turborepo)
pnpm install              # Install all dependencies
pnpm dev                  # Run all apps in dev mode
pnpm dev:web              # Web app only (--filter=web)
pnpm dev:extension        # Extension only (--filter=extension)
pnpm build                # Build all packages
pnpm lint                 # Lint all packages
pnpm type-check           # Type check all packages
pnpm test                 # Run all tests
pnpm clean                # Clean all build artifacts

# Per-app commands (use pnpm --filter <app>)
pnpm --filter web dev             # Start Next.js dev server
pnpm --filter web test            # Run Vitest tests
pnpm --filter web test:watch      # Watch mode
pnpm --filter web db:migrate:dev  # Prisma migrations
pnpm --filter web db:studio       # Open Prisma Studio
pnpm --filter extension build     # Build extension (dev mode)
pnpm --filter extension build:prod # Build extension (production)
```

## Architecture

```
sploot-monorepo/
├── apps/
│   ├── web/                 # Next.js 15 (App Router)
│   │   ├── app/            # Routes and API endpoints
│   │   ├── components/     # React components
│   │   ├── lib/            # Core utilities (auth, db, storage, embeddings)
│   │   ├── prisma/         # Database schema and migrations
│   │   └── __tests__/      # Vitest tests
│   │
│   └── extension/          # Chrome extension (WXT + React)
│       ├── entrypoints/    # background.ts, popup/
│       ├── shared/         # api-client.ts, env.ts
│       └── lib/            # Extension utilities
│
└── packages/
    └── common/             # @sploot/common
        └── src/
            ├── constants.ts  # UPLOAD limits, MIME types
            ├── types.ts      # API response types
            └── index.ts      # Barrel exports
```

### Cross-Package Imports

```typescript
// Both apps import from @sploot/common
import { UPLOAD, isValidMimeType } from '@sploot/common';
import type { SplootApiUploadResponse } from '@sploot/common';
```

Extension uses WXT alias configured in `wxt.config.ts`:
```typescript
vite: () => ({
  resolve: { alias: { '@sploot/common': resolve(__dirname, '../../packages/common/src') }}
})
```

## Key Technologies

| Layer | Web App | Extension |
|-------|---------|-----------|
| Framework | Next.js 15 (App Router) | WXT (Vite-based) |
| UI | React 19 + Tailwind + Radix | React 19 |
| Auth | Clerk | Clerk Chrome Extension |
| Storage | Vercel Blob | - |
| Database | Neon Postgres + pgvector | - |
| Search | CLIP/SigLIP embeddings | - |
| Build | Turbo | WXT |

## Testing

```bash
# Web app tests (requires postgres for some tests)
pnpm --filter web test           # Run all tests
pnpm --filter web test:watch     # Watch mode
pnpm --filter web test:coverage  # Coverage report

# Run single test file
pnpm --filter web vitest run path/to/file.test.ts
```

CI runs tests against `pgvector/pgvector:pg15` container. Local tests without database will skip integration tests.

## Database (Web App)

**CRITICAL: Always use `DATABASE_URL`; do not invent env aliases (e.g. custom names like `POSTGRES_URL`).**

Prisma's Rust engine reads `DATABASE_URL` before Node.js starts — runtime modifications are too late in serverless.

```bash
# Connection string format (Neon with PgBouncer)
DATABASE_URL="postgresql://user:pass@ep-xxx-pooler.neon.tech/db?sslmode=require&pgbouncer=true"
#                                         ^^^^^^^ required    ^^^^^^^^^^^^^^ required

# Database commands
pnpm --filter web db:migrate:dev  # Create migration
pnpm --filter web db:push         # Push schema without migration
pnpm --filter web db:studio       # Open Prisma Studio
```

## Environment Variables

**Web app** (`.env.local`):
- `DATABASE_URL` - Neon postgres with pooler
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY`
- `BLOB_READ_WRITE_TOKEN` - Vercel Blob
- `CANARY_ENDPOINT` / `CANARY_API_KEY` / `CANARY_SERVICE_NAME`

**Extension** (`.env` for dev, `.env.production` for prod):
- `VITE_CLERK_PUBLISHABLE_KEY` - Must match environment (pk_test_ vs pk_live_)
- `VITE_API_BASE_URL` - sploot.app or localhost:3000

## Adding Shared Code

1. Add to `packages/common/src/`
2. Export from `packages/common/src/index.ts`
3. Import in apps: `import { X } from '@sploot/common'`

## Invariants

- Use pnpm. Do not introduce npm/yarn workflows.
- Default base branch is `origin/master`.
- Use `DATABASE_URL` for Prisma; do not invent env aliases.
- `@sploot/common` is the source of truth for upload limits, MIME validation, and shared API types.
- Source of truth for work tracking is local markdown files in `backlog.d/` (see `backlog.d/README.md`), not GitHub Issues.
- Closure requires the backlog item to move to `backlog.d/_done/` with `Status: done`, a `## What Was Built` note, and conventional commit/PR linkage such as `Backlog: backlog.d/<id>-<slug>.md`, `Closes-backlog:`, or `Ships-backlog:`.
- Web deploy and extension release are separate surfaces.
- The legacy harness has been removed. Do not require legacy harness config, schemas, evidence directories, or repo-local lifecycle skill catalogs; use globally installed Harness Kit skills plus backlog/docs evidence unless a future Sploot-specific exception is explicitly justified.

## Gate Contract

Ship gate equals CI parity: `pnpm lint && pnpm type-check && pnpm --filter web test && pnpm --filter extension build`, with Prisma/pgvector DB-backed paths requiring `DATABASE_URL` against a pgvector-capable Postgres or explicit `DB path unverified` evidence. GitHub CI adds frozen install, `pnpm --filter web db:migrate` against `pgvector/pgvector:pg15`, turbo lint/type-check, web tests, the retrieval-quality eval (`pnpm --filter web eval:search`, ratcheted against `apps/web/eval/baseline.json` — see `apps/web/eval/README.md`; changes touching embeddings, similarity thresholds, or query SQL must carry their paired eval delta), extension lint/test/build, and the `merge-gate` aggregate job.

### Git Hooks (Lefthook)

Pre-commit runs gitleaks, secrets scan, web lint, extension lint, and typecheck (root `lefthook.yml` runs gitleaks + secrets + lint-web + lint-extension + typecheck; `apps/web/lefthook.yml` runs gitleaks + secrets + validate-env + lint + typecheck — both agree on scope). Pre-push runs secrets + gitleaks + typecheck; tests are skipped locally in both configs because they require a pgvector-backed Postgres database (CI runs the full suite against the `pgvector/pgvector:pg15` service). Do not lower gates; diagnose env, DB, migration, WXT, or auth setup instead.

## CI/CD

- GitHub Actions: lint, type-check, test (with postgres service), extension build
- Vercel: Automatic deploys from main (web app)
- Extension: Manual submission to Chrome Web Store from `apps/extension/.output/`

## Known Debt Map

| Tracker | Surface | Debt |
|---|---|---|
| `backlog.d/_done/007-publish-extension-web-store-release.md` | `apps/extension`, Chrome Web Store | Current unpacked build is loaded, but authenticated right-click upload/duplicate proof and Web Store dashboard receipt remain. |
| PR #151 | `apps/web/app/api/health/route.ts` | Stale Prisma serverless connections need runtime health evidence on future DB health changes. |
| PR #142, bounded further by PR #251 (sploot-050) | `apps/web/lib/upload/embedding-scheduler-service.ts`, `apps/web/lib/embedding-rate-limit.ts` | Duplicate/concurrent job pressure was bounded by #142's DB lock + KV rate limiter, but the upload-path scheduler never consulted the limiter — only the manual regenerate-embedding route did. #251 wires `acquireEmbeddingRateLimit`/`acquireEmbeddingDailyBudget` into `EmbeddingSchedulerService`, adds an `EMBEDDING_DAILY_BUDGET` ceiling, and reports global-scope breaches (not routine per-user throttling) to Canary via `logger.logError`. Residual: the cron (`process-embeddings`) and manual regenerate route are unaffected — cron was already bounded per ADR-008; the manual route already had its own rate-limit call. |
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
