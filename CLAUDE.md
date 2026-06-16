# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Sploot Monorepo - Turborepo-powered pnpm workspace consolidating:
- **apps/web**: Next.js 15 meme library with text→image semantic search (CLIP/SigLIP embeddings, pgvector)
- **apps/extension**: Chrome extension (WXT + React) for one-click image saving
- **packages/common**: Shared constants and types (`@sploot/common`)

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

**CRITICAL: Always use `DATABASE_URL`, not custom names like `POSTGRES_URL`.**

Prisma's Rust engine reads `DATABASE_URL` before Node.js starts - runtime modifications are too late in serverless.

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

## Git Hooks (Lefthook)

Pre-commit runs: gitleaks, lint, typecheck
Pre-push runs: typecheck (tests skipped locally - require database)

## CI/CD

- GitHub Actions: lint, type-check, test (with postgres service), extension build
- Vercel: Automatic deploys from main (web app)
- Extension: Manual submission to Chrome Web Store from `apps/extension/.output/`

## Adding Shared Code

1. Add to `packages/common/src/`
2. Export from `packages/common/src/index.ts`
3. Import in apps: `import { X } from '@sploot/common'`

Work tracking lives in `backlog.d/` (see `backlog.d/README.md`), not GitHub Issues.
