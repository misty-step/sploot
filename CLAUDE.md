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

### Theme Configuration - Minimal × Technical Aesthetic
- **Primary**: Neon Violet (#7C5CFF) - used sparingly for interactive elements
- **Background**: Pure Black (#000000) - terminal aesthetic foundation
- **Terminal Colors**:
  - Success/High Confidence: Terminal Green (#4ADE80)
  - Error/Failed: Terminal Red (#EF4444)
  - Warning/Medium: Terminal Yellow (#FBBF24)
  - Metadata/Secondary: Terminal Gray (#888888)
- **Typography**:
  - UI Text: Geist Sans
  - Metadata/Technical: JetBrains Mono (monospace for timestamps, file info, scores)
- **Spacing**: 4px base unit system

### Component Patterns
- High information density with technical precision
- Linear's minimal visual language
- Corner brackets for viewport framing
- Monospace typography for all technical/metadata displays
- Color-coded data based on confidence/state
- Dark mode only with pure black backgrounds
- Subtle animations (200-300ms transitions)

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

# Database
POSTGRES_URL=
POSTGRES_URL_NON_POOLING=

# Vercel Blob
BLOB_READ_WRITE_TOKEN=

# Embeddings API
EMBEDDINGS_API_KEY=
EMBEDDINGS_API_URL=
```

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
