# Sploot Monorepo Consolidation

## Overview

This monorepo consolidates two previously separate repositories:
- **sploot** (web app) → `apps/web`
- **sploot-extension** (Chrome extension) → `apps/extension`

Into a Turborepo-powered pnpm workspace with shared code in `packages/common`.

## Current Status: Phase 1 & 2 Complete

### Completed Work

#### Phase 1: Foundation
- [x] Created fresh monorepo with git subtree merge preserving full history
- [x] Created `@sploot/common` package with shared constants and types
- [x] Configured pnpm workspaces (`pnpm-workspace.yaml`)
- [x] Configured Turborepo (`turbo.json`)
- [x] Updated `apps/web` to import from `@sploot/common`
- [x] Updated `apps/extension` to import from `@sploot/common` via WXT alias
- [x] Fixed TypeScript errors (Date→number conversions, Clerk SignOutButton)

#### Phase 2: Quality Infrastructure
- [x] GitHub Actions CI (`.github/workflows/ci.yml`)
- [x] Lefthook git hooks (`lefthook.yml`)
- [x] Sentry placeholder in extension

### Quality Gates Verified
- Type-check passes (all 3 packages)
- Lint passes (no errors)
- Extension build succeeds
- Pre-commit hooks work (gitleaks, lint, typecheck)
- Pre-push hooks work (typecheck only - tests require database)

## Remaining Work

### Phase 3: Deployment Migration

#### 3.1 Vercel Project Update
```bash
# Update Vercel project to point to new monorepo
# Root directory: apps/web
# Build command: pnpm turbo run build --filter=web
# Install command: pnpm install
```

**Environment Variables Required:**
- `DATABASE_URL` - Neon postgres connection string (with pooler)
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` - Clerk public key
- `CLERK_SECRET_KEY` - Clerk secret key
- `BLOB_READ_WRITE_TOKEN` - Vercel Blob storage token
- `SENTRY_DSN` - Sentry error tracking
- `SENTRY_AUTH_TOKEN` - Sentry source maps upload
- `CRON_SECRET` - Vercel cron job authentication

#### 3.2 Extension Store Update
- Update Chrome Web Store listing to pull from new repo
- Ensure `apps/extension/.output/` artifact is used for submissions

#### 3.3 Archive Old Repositories
After successful deployment verification:
```bash
# Archive old repos (read-only)
gh repo archive misty-step/sploot
gh repo archive misty-step/sploot-extension
```

### Phase 4: Enhanced Shared Package (Optional)

Consider moving more shared code to `@sploot/common`:

```
packages/common/src/
├── constants.ts      # Done - UPLOAD constants
├── types.ts          # Done - API types
├── validation.ts     # TODO: Shared validation functions
├── errors.ts         # TODO: Error codes and messages
└── api-client.ts     # TODO: Shared API client (if extension uses same patterns)
```

### Phase 5: CI Enhancements (Optional)

- [ ] Add Chromatic for visual regression testing
- [ ] Add extension E2E tests with Playwright
- [ ] Add release automation with changesets
- [ ] Add PR size labeling

## Architecture

```
sploot-monorepo/
├── apps/
│   ├── web/                 # Next.js 15 web application
│   │   ├── app/            # App router pages
│   │   ├── components/     # React components
│   │   ├── lib/            # Core utilities
│   │   └── prisma/         # Database schema
│   │
│   └── extension/          # Chrome extension (WXT + React)
│       ├── entrypoints/    # Background, popup, content scripts
│       ├── components/     # Extension UI components
│       ├── shared/         # Extension-internal shared code
│       └── lib/            # Extension utilities
│
├── packages/
│   └── common/             # Shared code between apps
│       └── src/
│           ├── constants.ts  # UPLOAD limits, allowed types
│           ├── types.ts      # API response types
│           └── index.ts      # Barrel export
│
├── turbo.json              # Turborepo pipeline config
├── pnpm-workspace.yaml     # Workspace definition
├── lefthook.yml            # Git hooks
└── .github/workflows/ci.yml # CI pipeline
```

## Key Decisions Made

### 1. Git History Preservation
Used `git subtree add` to merge both repos, preserving full commit history with proper attribution.

### 2. Shared Package Scope
`@sploot/common` contains only truly shared code:
- Upload constants (file size limits, allowed MIME types)
- API types (upload response, error format)

Avoided premature abstraction of code that isn't actually shared.

### 3. Backward Compatibility
`apps/web/lib/blob.ts` exports backward-compatible aliases:
```typescript
export const ALLOWED_FILE_TYPES: string[] = [...UPLOAD.allowedTypes];
export const MAX_FILE_SIZE = UPLOAD.maxSize;
```

This allows gradual migration without breaking existing imports.

### 4. Extension Build System
WXT uses Vite, which required a custom alias configuration:
```typescript
// wxt.config.ts
vite: () => ({
  resolve: {
    alias: {
      '@sploot/common': resolve(__dirname, '../../packages/common/src')
    }
  }
})
```

### 5. CI Strategy
- **Type-check**: Runs on all packages in parallel via Turborepo
- **Lint**: Runs per-app (web uses next lint, extension has none configured)
- **Build**: Skipped in CI (requires Clerk keys) - Vercel handles production builds
- **Tests**: Run in CI with postgres service - skipped locally without database

### 6. Pre-push Tests Disabled Locally
Tests require PostgreSQL with pgvector. CI has the database service; local development typically doesn't. Pre-push hook only runs typecheck.

## Development Workflow

### Setup
```bash
cd ~/Development/sploot-monorepo
pnpm install
```

### Development
```bash
# Web app
pnpm --filter web dev

# Extension
pnpm --filter extension dev
```

### Type Check
```bash
pnpm turbo run type-check
```

### Build
```bash
# All packages
pnpm turbo run build

# Specific app
pnpm --filter web build
pnpm --filter extension build
```

### Adding Shared Code
1. Add to `packages/common/src/`
2. Export from `packages/common/src/index.ts`
3. Import in apps: `import { X } from '@sploot/common'`

## Troubleshooting

### "Cannot find module '@sploot/common'"
```bash
pnpm install  # Ensure workspace links are set up
```

### Extension TypeScript errors about @sploot/common
Check `apps/extension/tsconfig.json` has the path alias:
```json
{
  "paths": {
    "@sploot/common": ["../../packages/common/src"],
    "@sploot/common/*": ["../../packages/common/src/*"]
  }
}
```

### Turbo cache issues
```bash
pnpm turbo run build --force  # Skip cache
```

### Pre-commit hook failures
```bash
# Check what's failing
pnpm turbo run type-check
pnpm turbo run lint
gitleaks protect --staged --verbose
```

## Repository URLs

- **Monorepo**: https://github.com/misty-step/sploot-monorepo
- **Original Web**: https://github.com/misty-step/sploot (to be archived)
- **Original Extension**: https://github.com/misty-step/sploot-extension (to be archived)
