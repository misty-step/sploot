# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Sploot is a **Vercel-first meme library with text→image semantic search** - a private, personal collection tool for storing, browsing, and semantically searching meme images using natural language queries.

## Technology Stack

### Core Technologies
- **Next.js** (App Router) with TypeScript
- **Vercel** ecosystem (Blob storage, Postgres/Neon with pgvector, deployment)
- **Clerk** for authentication (Google/Apple + magic link)
- **CLIP/SigLIP** embeddings via external API for semantic search
- **Tailwind CSS** with custom design tokens
- **PWA** capabilities for installable web app

## Development Commands

```bash
# Initial Setup (when implemented)
pnpm install              # Install dependencies
pnpm dev                  # Start development server on http://localhost:3000
pnpm build                # Build for production
pnpm start                # Start production server
pnpm lint                 # Run ESLint
pnpm type-check          # Run TypeScript type checking

# Database (once configured)
pnpm db:migrate          # Run database migrations
pnpm db:seed             # Seed development data
pnpm db:reset            # Reset database

# Testing (when implemented)
pnpm test                # Run all tests
pnpm test:unit           # Run unit tests
pnpm test:e2e            # Run end-to-end tests
```

## Architecture

### Key Directories
- `/app` - Next.js app router pages and API routes
- `/components` - React components (search bar, image grid, upload zone)
- `/lib` - Core utilities (embeddings, database, storage, auth)
- `/public` - Static assets and PWA manifest
- `/styles` - Global styles and Tailwind configuration

### Core Services
- **Embedding Service**: External API for CLIP/SigLIP text and image embeddings
- **Storage**: Vercel Blob for image files
- **Database**: Vercel Postgres with pgvector extension for similarity search
- **Auth**: Clerk for user authentication and session management

### Database Schema
```sql
-- users: Managed by Clerk
-- assets: Image metadata (id, user_id, blob_url, filename, size, created_at)
-- asset_embeddings: Vector embeddings for search (asset_id, embedding vector[512])
-- tags: Optional tagging system
-- asset_tags: Many-to-many relationship
```

### API Routes Structure
- `/api/upload` - Handle image uploads and processing
- `/api/search` - Semantic search with text queries
- `/api/assets` - CRUD operations for user's images
- `/api/embeddings` - Generate embeddings for text/images

## Observability Patterns

**Analytics Tracking**: Use `lib/analytics.ts` for all event tracking
- Import: `import { track, ANALYTICS_EVENTS } from '@/lib/analytics'`
- Client-side: `track({ name: 'upload_completed', properties: { assetId, size } })`
- Server-side: Use `trackServer()` with await

**Performance Monitoring**: Use `lib/performance-monitor.ts` for timing
- Import: `import { getPerformanceMonitor, PERF_OPERATIONS } from '@/lib/performance-monitor'`
- Usage: `perfMonitor.measureAsync(PERF_OPERATIONS.UPLOAD_SINGLE, async () => { ... })`

**Structured Logging**: Use `lib/observability-logger.ts`, NOT console.log
- Import: `import { logger } from '@/lib/observability-logger'`
- Info: `logger.logInfo('Operation completed', { assetId, duration })`
- Error: `logger.logError('Operation failed', error, { assetId })`
- Timing: `logger.logTiming('upload', duration, true, { size })`

**API Route Instrumentation**: Wrap all new routes with `withObservability`
- Template:
  ```typescript
  import { withObservability } from '@/lib/with-observability';

  async function handler(req: NextRequest) {
    // route logic
  }

  export const POST = withObservability(handler, { operation: 'my-route' });
  ```

**Error Handling**: All telemetry wrapped in try-catch, never throws
- Telemetry failures logged to console, execution continues
- User flows never blocked by observability failures

## Design System

### Brand Aesthetic: Technical Neo-Brutalist

Sploot's visual identity is **bold, technical, and intentionally rough-edged** - think Swiss grid precision meets punk zine energy. This is NOT minimal terminal aesthetic. It's maximalist technical design with strong opinions.

### Typography
- **Headlines**: Bebas Neue - ALL-CAPS, wide tracking, bold presence
  - Use via `style={{ fontFamily: "var(--font-bebas-neue)" }}`
  - Always uppercase for section headers
- **Body**: Geist Sans - clean, readable, professional
- **Technical/Code**: JetBrains Mono - timestamps, metadata, badges, stats

### Color System (Light/Dark Adaptive)

Three accent colors used consistently across sections:

| Class Name | Actual Color | Usage |
|------------|-------------|-------|
| `electric-lime` | Cyan (`--accent-cyan`) | Primary accent, first sections |
| `hot-pink` | Coral (`--accent-coral`) | Warm accent, middle sections |
| `cyber-blue` | Violet (`--accent-violet`) | Bridge accent, later sections |

**Note**: Class names are legacy but actively used. They map to semantic color variables.

### Visual Patterns

**Backgrounds** (use on sections):
- `.bg-diagonal-stripes` - 45° stripe pattern
- `.bg-grid` - 24px grid overlay

**Structural**:
- `.brutalist-border` - 1px solid borders
- `.brutalist-corners` - Sharp corners (no radius)
- `.corner-bracket` - Technical corner framing

**Effects**:
- `.accent-glow` - Cyan glow effect
- Gradient classes: `.from-electric-lime`, `.via-hot-pink`, `.to-cyber-blue`

### Landing Page Section Structure

Each section follows this pattern:
```tsx
<section className="relative min-h-screen flex items-center px-6 py-12 md:py-20 bg-diagonal-stripes">
  <div className="max-w-7xl mx-auto w-full">
    <h2 style={{ fontFamily: "var(--font-bebas-neue)" }}>
      SECTION TITLE
    </h2>
    {/* Content with accent color consistent with section */}
  </div>
  <ScrollChevron targetId="next-section" />
</section>
```

Sections alternate between `bg-diagonal-stripes` and `bg-grid`, separated by `<SectionDivider color="lime|coral|cyan|violet" />`.

### Component Energy

- **Headlines**: Large (text-5xl to text-8xl), ALL-CAPS, Bebas Neue
- **Subheadlines**: text-xl to text-2xl, muted-foreground
- **Accent lines**: Colored dividers with monospace labels (e.g., "AI POWERED")
- **CTAs**: Bold buttons with accent backgrounds, Bebas Neue text
- **Badges**: Small rotated labels (e.g., "TRY IT!")

### Animation Guidelines
- Fade-in with stagger delays (150ms between elements)
- Use `animate-[fadeIn_1s_ease-out_forwards]` pattern
- Scroll-triggered via IntersectionObserver
- Respect `prefers-reduced-motion`

### App vs Landing

The **landing page** uses full brutalist treatment (Bebas Neue, patterns, bold colors).
The **app** (`/app/*`) uses more restrained styling for usability but maintains sharp corners and accent colors.

## Performance Requirements

### SLOs (Service Level Objectives)
- **Upload processing**: < 2.5 seconds
- **Search response**: < 500ms
- **Initial page load**: < 1.5 seconds
- **Image grid render**: < 300ms for 100 images

### Optimization Strategies
- Lazy loading for image grids
- Virtual scrolling for large collections
- Edge caching for embeddings
- Optimistic UI updates

## Development Milestones

Currently implementing milestone-based development:
- **M0**: Skeleton app with auth setup
- **M1**: Upload functionality with Vercel Blob
- **M2**: Embeddings and semantic search
- **M3**: Polish features (favorites, PWA, keyboard shortcuts)
- **M4**: Hardening and optimization

## Key Implementation Notes

### Authentication
- Use Clerk's React hooks for auth state
- Protect all API routes with auth middleware
- Single-user private library (no sharing initially)

### Image Processing
- Resize on upload to max 2048px longest edge
- Generate thumbnails for grid view
- Support formats: JPEG, PNG, WebP, GIF
- Max file size: 10MB

### Search Implementation
- Text embeddings via external API (not self-hosted)
- pgvector for similarity search (cosine distance)
- Client-side caching of recent searches
- Debounced search input (300ms)

### PWA Requirements
- Service worker for offline caching
- App manifest with icons
- Install prompt on mobile/desktop
- Offline fallback pages

## Testing Strategy

### Unit Tests
- Components with React Testing Library
- API routes with mock dependencies
- Utility functions with Jest

### E2E Tests
- Critical user flows with Playwright
- Upload → Search → View flow
- Auth flow testing
- PWA installation

## Deployment

### Environment Variables
```env
# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=

# Database (CRITICAL: Use DATABASE_URL, not POSTGRES_URL)
DATABASE_URL=postgresql://user:pass@ep-xxx-pooler.neon.tech/db?sslmode=require&pgbouncer=true

# Vercel Blob
BLOB_READ_WRITE_TOKEN=

# Embeddings API
EMBEDDINGS_API_KEY=
EMBEDDINGS_API_URL=

# Agent observability (Canary)
CANARY_ENDPOINT=https://canary-obs.fly.dev
CANARY_API_KEY=
CANARY_SERVICE_NAME=sploot-web
```

### Environment File Structure

**Local Development:**
- `.env.example` - Template with comprehensive documentation (only file committed to git)
- `.env.local` - Your local secrets (gitignored, create from .env.example)
- `e2e/.env.test` - E2E test credentials (gitignored)

**Vercel Deployments:**
- Production/Preview use Vercel dashboard env vars
- No local `.env.production` or `.env.preview` files needed
- Vercel CLI may create temp files (automatically ignored by git)

**First-time Setup:**
```bash
cp .env.example .env.local
# Fill in your actual credentials
```

**Gitignore Rules:**
- `.env*` - Ignore ALL .env files
- `!.env.example` - EXCEPT the template

### Vercel Configuration
- Auto-deploy from main branch
- Preview deployments for PRs
- Environment variables per environment
- Edge functions for API routes

## Security Considerations

- All assets are private to the authenticated user
- Implement rate limiting on upload/search endpoints
- Validate file types and sizes on upload
- Sanitize filenames and metadata
- Use signed URLs for blob storage access

## Database Configuration

**CRITICAL: Always use `DATABASE_URL`, never custom environment variable names.**

### Why DATABASE_URL is Non-Negotiable

Prisma uses a **compiled Rust query engine** (native binary) that:
- Reads `DATABASE_URL` directly from `process.env` **before** Node.js runtime starts
- Cannot access JavaScript-level environment variable modifications
- Has special hardcoded handling for `DATABASE_URL` that's battle-tested in serverless

**❌ WRONG - Custom env var names:**
```typescript
// This FAILS in Vercel serverless
process.env.DATABASE_URL = process.env.POSTGRES_URL;  // Too late!
// Prisma's Rust engine already tried to read DATABASE_URL during initialization
```

**✅ CORRECT - Use DATABASE_URL everywhere:**
```env
# .env.local, Vercel environment variables
DATABASE_URL="postgresql://user:pass@ep-xxx-pooler.neon.tech/db?sslmode=require&pgbouncer=true"
```

### Required Connection String Format

**For Vercel serverless (production/preview):**
```text
DATABASE_URL="postgresql://user:pass@ep-xxx-pooler.neon.tech/db?sslmode=require&pgbouncer=true"
                                         ^^^^^^^ pooler endpoint      ^^^^^^^^^^^^^^ REQUIRED
```

**Checklist:**
- [ ] Hostname contains `-pooler` suffix (PgBouncer connection pooler)
- [ ] Query string contains `pgbouncer=true` (disables prepared statements)
- [ ] Query string contains `sslmode=require` (TLS encryption)
- [ ] No trailing newline (use `printf '%s'` when setting via CLI)

### Why pgbouncer=true is Required

PgBouncer (Neon's connection pooler) operates in **transaction pooling mode**:
- Does NOT support prepared statements
- Prisma uses prepared statements by default
- Without `pgbouncer=true`, you get: `Error: prepared statement "s0" does not exist`

### Setting Environment Variables in Vercel

**CRITICAL: Avoid trailing newlines** (causes silent parse failures):

```bash
# ✅ CORRECT - Use printf to avoid trailing newline
printf '%s' "postgresql://user:pass@host-pooler.neon.tech/db?sslmode=require&pgbouncer=true" | \
  vercel env add DATABASE_URL production

# ❌ WRONG - echo adds trailing \n
echo "postgresql://..." | vercel env add DATABASE_URL production
```

**Verify no trailing newline:**
```bash
vercel env pull --environment production .env.check --yes
cat .env.check | grep "^DATABASE_URL=" | od -c
# Should NOT see \n before closing quote
```

### Prisma Schema

**Single source of truth** - trust the schema, don't override in code:

```prisma
// prisma/schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")  // ← Prisma's Rust engine reads this FIRST
}
```

**Don't do this:**
```typescript
// ❌ ANTI-PATTERN - Overriding doesn't work in serverless
const prisma = new PrismaClient({
  datasources: { db: { url: customUrl } }  // Ignored - connection already established
});

// ✅ CORRECT - Trust the schema
export const prisma = new PrismaClient();
```

### Environment Variable Timing in Serverless

**Vercel function cold start sequence:**
```text
1. Platform injects env vars → process.env
2. Prisma Rust engine starts and reads DATABASE_URL
3. Prisma parses connection string and establishes connection pool
4. Node.js runtime starts
5. Your application code runs (lib/env.ts, lib/db.ts) ← TOO LATE
```

**Key insight:** JavaScript-level code (step 5) cannot modify what Prisma's native binary read (step 2).

### Common Errors and Fixes

**Error:** `Authentication failed... credentials for '(not available)' are not valid`
- **Meaning:** Prisma couldn't **parse** the connection string (not an auth failure)
- **Fix:** Check `DATABASE_URL` exists and has correct format
- **Not:** Database credentials (check env var first)

**Error:** `prepared statement "s0" does not exist`
- **Meaning:** PgBouncer doesn't support prepared statements
- **Fix:** Add `pgbouncer=true` to connection string

**Error:** Database connection works locally but fails in Vercel
- **Meaning:** Custom env var name not accessible to Prisma's Rust engine
- **Fix:** Use `DATABASE_URL` (the standard), not `POSTGRES_URL` or custom names

### Validation

**Pre-deployment checks:**
```bash
pnpm validate:env       # Validates DATABASE_URL format and presence
pnpm type-check        # TypeScript compilation
pnpm test              # Run test suite
```

**Pre-commit hook automatically validates:**
- `DATABASE_URL` exists in `.env.example`
- No references to deprecated `POSTGRES_URL` in TypeScript code
- Runs on every commit (cannot bypass)

### References

- **Architecture docs:** [docs/architecture/database-connection.md](./docs/architecture/database-connection.md)
- **Incident runbook:** [docs/runbooks/database-connection-failure.md](./docs/runbooks/database-connection-failure.md)
- **Prisma docs:** [Datasource configuration](https://www.prisma.io/docs/reference/api-reference/prisma-schema-reference#datasource)
- **Neon docs:** [Connection pooling](https://neon.tech/docs/connect/connection-pooling)

### Historical Context

On **2025-11-25**, production went down for 20 minutes because:
1. We used custom `POSTGRES_URL` environment variable name
2. Prisma's Rust engine couldn't read it in Vercel serverless
3. Runtime "fixes" in JavaScript ran too late (after Prisma initialization)
4. Fix: Changed to standard `DATABASE_URL` (3 files, 5 minutes to implement)

**Lesson:** Use framework standards, not custom patterns. Fighting Prisma's conventions adds complexity without benefit.

## Observability & Monitoring

### Dashboard Links

**Sentry (Error Tracking):**
- Production Issues: https://sentry.io/organizations/misty-step/issues/?project=sploot
- Performance: https://sentry.io/organizations/misty-step/performance/?project=sploot
- Alerts: https://sentry.io/organizations/misty-step/alerts/sploot/

**Vercel (Hosting & Analytics):**
- Deployments: https://vercel.com/moomooskycow/sploot
- Analytics: https://vercel.com/moomooskycow/sploot/analytics
- Environment Variables: https://vercel.com/moomooskycow/sploot/settings/environment-variables

**Neon (Database):**
- Console: https://console.neon.tech/
- Project: lively-lake-63852609 (neon-amber-lamp)
- Branches: main (production), development (dev), preview/* (auto-created)

**Clerk (Authentication):**
- Dashboard: https://dashboard.clerk.com/

### Health Checks

**Production Health Endpoint:**
```bash
curl https://sploot.app/api/health | jq
```

Returns database connectivity, Sentry configuration, and response times.

**Deployment Validation:**
```bash
pnpm validate:deployment
```

Checks environment variables, database, Sentry, TypeScript compilation, and performance.

### Database Environment Separation

| Environment | Branch | Endpoint |
|-------------|--------|----------|
| Production | `main` | `ep-broad-credit-adnne0ox-pooler` |
| Development | `development` | `ep-round-unit-adq9jm2y-pooler` |
| Preview | Auto-created | Unique per PR |

**Neon Integration:** Installed - automatically creates database branches for preview deployments.

### Error Tracking

**Sentry Configuration:**
- Server-side: Captures via `instrumentation.ts` and `lib/auth/server.ts`
- Client-side: Error boundaries in `app/error.tsx` and `app/app/error.tsx`
- Session replay: 0% routine, 100% error sessions
- PII scrubbing: Emails, tokens, sensitive headers automatically redacted

**Auth Error Handling:**
- Database sync failures don't block authentication
- Errors logged and reported to Sentry
- Graceful degradation allows users to continue

### Analytics

**Vercel Analytics:** Configured in `app/layout.tsx`
- Custom events: Upload, search, asset actions, tag operations
- Web Vitals: CLS, LCP, FCP, FID, TTFB
- Type-safe event tracking via `lib/analytics.ts`

### Alert Configuration

**Sentry Alerts:**
```bash
export SENTRY_AUTH_TOKEN="your_token"
bash scripts/configure-sentry-alerts.sh
```

Configured:
- New error types in production (email notification)

Manual configuration required (Sentry UI):
- High error rate (>10/hour)
- Crash-free sessions (<98%)

### Troubleshooting

See `docs/observability.md` for comprehensive troubleshooting guide covering:
- Deployment failures
- Database connection issues
- Sentry not capturing errors
- Performance degradation

### Maintenance Scripts

```bash
# Validate deployment readiness
pnpm validate:deployment

# Configure Sentry alerts
bash scripts/configure-sentry-alerts.sh

# List Neon branches
neonctl branches list --project-id "lively-lake-63852609" --api-key "$NEON_API_KEY"
```
