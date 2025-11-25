# BACKLOG: Sploot Strategic Roadmap

Last groomed: 2025-11-18
Analyzed by: 8 specialized perspectives (complexity-archaeologist, architecture-guardian, security-sentinel, performance-pathfinder, maintainability-maven, user-experience-advocate, product-visionary, design-systems-architect)
Quality gates audit: 2025-11-18

---

## Now (Sprint-Ready, <2 weeks)

### [Security] SSRF Vulnerability in Image Embeddings
**File**: `app/api/embeddings/image/route.ts:17-65`
**Perspectives**: security-sentinel
**Impact**: User-provided URLs passed to external service without validation - could expose cloud metadata or internal services
**Attack Scenario**: Attacker provides `http://169.254.169.254/latest/meta-data/` to access AWS metadata
**Fix**: Validate URL protocol (HTTPS only), block internal IP ranges (localhost, 10.*, 172.16.*, 192.168.*, 169.254.*)
```typescript
const allowedProtocols = ['https:'];
const blockedHosts = ['localhost', '127.0.0.1', '169.254.', '10.', '172.16.', '192.168.'];
```
**Effort**: 30m | **Risk**: HIGH
**Acceptance**: URL validation blocks internal addresses, only HTTPS allowed

---

### [Performance] Fix N+1 Tag Queries in Search Results
**File**: `app/api/search/route.ts:149-180`
**Perspectives**: performance-pathfinder, maintainability-maven
**Impact**: Search SLO violation - 31 queries for 30 results, adds 300-600ms latency
**Current**: Individual tag query per search result inside `Promise.all(map(...))`
**Fix**: Batch fetch all tags with single `{ assetId: { in: resultIds } }` query, build lookup map
```typescript
const allAssetTags = await prisma!.assetTag.findMany({
  where: { assetId: { in: resultIds } },
  include: { tag: true },
});
const tagsByAssetId = allAssetTags.reduce((acc, at) => {
  if (!acc[at.assetId]) acc[at.assetId] = [];
  acc[at.assetId].push({ id: at.tag.id, name: at.tag.name });
  return acc;
}, {} as Record<string, Array<{ id: string; name: string }>>);
```
**Effort**: 30m | **Impact**: 31 queries → 2, 600ms → 40ms (15x improvement)
**Acceptance**: Search <500ms SLO met, ≤2 database queries per search

---

### [Performance] Fix N+1 Tag Queries in Upload
**File**: `app/api/upload/route.ts:146-180`
**Perspectives**: performance-pathfinder
**Impact**: 800ms additional latency with 5 tags - violates 2.5s upload SLO
**Current**: 4 queries per tag × 5 tags = 20 queries
**Fix**: Batch `findMany` for existing tags, `createMany` for new tags, `createMany` for associations
**Effort**: 1h | **Impact**: 800ms → 50ms (16x improvement)
**Acceptance**: Upload with 5 tags ≤100ms for tag operations, query count ≤3

---

### [Performance] Fix N+1 Tag Queries in Tag Assignment
**File**: `app/api/assets/[id]/tags/route.ts:121-152`
**Perspectives**: performance-pathfinder
**Impact**: 3 sequential queries per tag in loop
**Current**: Adding 5 tags = 15 queries
**Fix**: Batch verify ownership, batch check existing, batch create with `skipDuplicates`
**Effort**: 1h | **Impact**: 15 queries → 3 (5x improvement)
**Acceptance**: Tag assignment uses ≤3 queries regardless of tag count

---

### [Security] Add Rate Limiting to Critical Endpoints
**Files**: `app/api/upload/route.ts`, `app/api/search/route.ts`, `app/api/embeddings/text/route.ts`
**Perspectives**: security-sentinel, product-visionary
**Impact**: No protection against API abuse - potential financial damage from Replicate costs
**Attack Scenario**: Attacker floods search endpoint, incurs embedding generation costs
**Implementation**: Upstash Redis rate limiter
```typescript
const ratelimit = new Ratelimit({
  redis: kv,
  limiter: Ratelimit.slidingWindow(10, '60 s'),
});
```
**Effort**: 2h | **Risk**: HIGH
**Acceptance**: Rate limits enforced, friendly error messages with upgrade path

---

### [UX] Add Keyboard Navigation to Image Modal
**File**: `app/app/page.tsx:858-982`
**Perspectives**: user-experience-advocate
**Impact**: WCAG violation - keyboard users cannot close modal with Escape
**Fix**: Add `useEffect` with keydown listener for Escape key
**Effort**: 30m | **Value**: All keyboard users can navigate app
**Acceptance**: Escape closes modal, focus management correct

---

### [UX] Replace Generic Upload Error Messages in Production
**File**: `app/api/upload/route.ts:291-300`
**Perspectives**: user-experience-advocate
**Impact**: All upload errors show "Upload failed" with no actionable guidance
**Fix**: Use existing `getUploadErrorDetails()` function for all errors - it provides excellent user messages
**Effort**: 15m | **Value**: Users understand issues and can take action
**Acceptance**: Production errors show specific, actionable messages

---

### [Maintainability] Fix Type Safety in Database Layer
**Files**: `lib/db.ts:37,62,116,220,274,317`, `lib/upload/asset-recorder-service.ts:160`, `hooks/use-assets.ts:525`
**Perspectives**: maintainability-maven, complexity-archaeologist
**Impact**: 60+ `any` types break TypeScript safety in critical operations
**Fix**: Define `PrismaTransaction` type, replace `any` with proper types/satisfies assertions
**Effort**: 4-6h | **Impact**: Compile-time safety for database layer
**Acceptance**: Zero `any` types in lib/db.ts, all functions have explicit return types

---

### [Security] Remove Error Details from Client Responses
**Files**: `app/api/upload/route.ts:519,556`, `lib/error-response.ts:56-59`
**Perspectives**: security-sentinel
**Impact**: Database schema and stack traces leak to client in production
**Fix**: Return generic error to client, log full details server-side via structured logger
**Effort**: 30m | **Risk**: HIGH
**Acceptance**: Production errors show generic message, full details in Vercel logs only

---

### [Security] Fix Timing Attack in Cron Authorization
**Files**: `app/api/cron/process-embeddings/route.ts:47`, `purge-deleted-assets/route.ts:52`, `audit-assets/route.ts:58`
**Perspectives**: security-sentinel
**Impact**: String comparison `!==` vulnerable to timing attacks
**Fix**: Use `crypto.timingSafeEqual()` with Buffer comparison
**Effort**: 15m | **Risk**: MEDIUM
**Acceptance**: All cron auth uses timing-safe comparison

---

### [Design] Add Semantic Status Color Tokens
**Files**: 44 instances across 12 components (image-tile.tsx, embedding-status-indicator.tsx, upload-progress-header.tsx, etc.)
**Perspectives**: design-systems-architect
**Impact**: Hardcoded `text-green-500`, `text-yellow-500` prevents dark mode optimization and global theming
**Fix**: Define `--color-success`, `--color-warning`, `--color-info` tokens in globals.css with OKLCH colors
```css
:root {
  --color-success: oklch(0.55 0.15 145);
  --color-warning: oklch(0.65 0.15 85);
  --color-info: oklch(0.55 0.15 230);
}
.dark {
  --color-success: oklch(0.75 0.18 145);
  --color-warning: oklch(0.80 0.18 85);
  --color-info: oklch(0.75 0.18 230);
}
```
**Effort**: 6h (2h tokens + 4h migrate 44 instances) | **Impact**: Dark mode support, consistent theming
**Acceptance**: All status colors use tokens, dark mode appearance correct

---

### [Design] Migrate Inline Font Styles to Utility Classes
**Files**: 15 instances across landing page and components
**Perspectives**: design-systems-architect
**Impact**: Inline `style={{ fontFamily: "var(--font-bebas-neue)" }}` bypasses Tailwind, requires JS hydration
**Fix**: Replace with `className="font-display"` (already configured in @theme)
**Effort**: 30m | **Impact**: Consistent styling, better performance
**Acceptance**: Zero inline fontFamily styles remaining

---

### [Infrastructure] Add Pre-commit Quality Gates
**Perspectives**: architecture-guardian
**Impact**: Quality checks only run in CI after push - broken builds pushed to remote
**Fix**: Add Lefthook configuration
```yaml
pre-commit:
  parallel: true
  commands:
    lint:
      glob: "*.{ts,tsx}"
      run: pnpm eslint {staged_files}
    typecheck:
      run: pnpm type-check
pre-push:
  commands:
    test:
      run: pnpm test --run
```
**Effort**: 1h | **Impact**: Catches 80% of issues before push
**Acceptance**: Lefthook installed, pre-commit runs lint+typecheck, pre-push runs tests

---

### [Communications] Usage Emails Deferred (Resend domain limit)
**Context**: Usage alerts (welcome + 90% warning) require adding `sploot.app` as a Resend sending domain, which needs the $20/mo plan (current plan limited to one domain already used by mistystep.io).
**Decision**: Defer implementation until a paid plan or alternate provider is approved; avoid half-wired stubs that don't deliver.
**Next Step**: When approved, add `mail.sploot.app` (or switch to Postmark/SES) and implement transactional sends.
**Impact**: MVP launches without proactive usage emails; acceptable risk for freemium.

---

# BACKLOG: neon cost containment

## Future Enhancements
- [push stats via sse]: stream status-line numbers off `pg_notify`/SSE instead of polling; slashes egress to zero when idle, keeps UI live.
- [vector quantization]: shrink pgvector storage via ivfflat+quantization or 8-bit compression; could halve index size if recall acceptable.

## Nice-to-Have Improvements
- [auto-vacuum tuning]: add doc'd VACUUM schedule for `asset_embeddings` and `search_logs` to cap bloat when cron purges run.

## Technical Debt Opportunities
- [metrics visibility]: add SQL view for per-table size (`pg_total_relation_size`) and expose in an admin endpoint to catch bloat before caps hit.

---

### [Observability] Add Sentry Release Tracking to CI/CD
**Files**: `.github/workflows/deploy.yml` (new or existing)
**Perspectives**: architecture-guardian
**Impact**: Cannot correlate errors with specific deployments - debugging requires guessing which release introduced issues
**Current State**: No Sentry releases created on deploy, no deployment annotations
**Implementation**:
```yaml
- name: Create Sentry release
  uses: getsentry/action-release@v1
  env:
    SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}
    SENTRY_ORG: misty-step
    SENTRY_PROJECT: sploot
  with:
    environment: production
    version: ${{ github.sha }}
```
Alternative: Enable in Vercel → Integrations → Sentry → Releases
**Effort**: 30m | **Impact**: Error → deployment correlation, automatic release tracking
**Acceptance**: Sentry shows releases, errors tagged with commit SHA

---

### [Observability] Configure Error Rate Spike Alert
**Perspectives**: security-sentinel, architecture-guardian
**Impact**: Only alerted on new error types - production spike goes unnoticed until user reports
**Current**: One alert (new error types) configured via CLI script
**Implementation**: Sentry UI → Alerts → Create Alert
- Type: "Number of Errors"
- Threshold: >10 events in 1 hour
- Environment: production
- Action: Email notification
**Effort**: 10m | **Risk**: HIGH (silent production incidents)
**Acceptance**: Alert configured, test by triggering errors

---

### [Observability] Set Up External Uptime Monitoring
**Perspectives**: architecture-guardian
**Impact**: Downtime detected only when users report - no synthetic monitoring
**Current**: Health endpoint exists but no external monitoring
**Implementation**:
- Sign up for BetterUptime (free: 1 monitor) or UptimeRobot (free: 50 monitors)
- Monitor: `https://sploot.app/api/health`
- Alert: Email/Slack on failure
- Check interval: 5 minutes
**Effort**: 15m | **Impact**: Immediate downtime awareness, uptime SLA tracking
**Acceptance**: Monitor configured, receives alerts, uptime dashboard accessible

---

### [Observability] Enable Sentry Source Map Upload
**Files**: `next.config.ts`, `.sentryclirc` (new)
**Perspectives**: maintainability-maven
**Impact**: Production stack traces may be minified - debugging requires manual source mapping
**Implementation**:
```typescript
// next.config.ts
const nextConfig = {
  sentry: {
    hideSourceMaps: true,
    widenClientFileUpload: true,
  },
}
```
```ini
# .sentryclirc
[defaults]
org=misty-step
project=sploot
```
**Effort**: 20m | **Impact**: Readable production stack traces
**Acceptance**: Sentry errors show original source code, not minified

---

### [Code Review] PR #17 Accessibility Feedback
**Source**: CodeRabbit review - deferred items
**Files**: Multiple components
**Items**:
- SearchBar: Add `aria-label="Clear search history"` to clear button
- BenefitGrid: Add `aria-hidden="true"` to decorative icons
- LandingFooter: Add IntersectionObserver guards and reduced-motion support
- Hero: Use `<h1>` instead of `<p>` for primary tagline (SEO)
**Effort**: 2h total | **Impact**: WCAG compliance
**Acceptance**: Screen reader testing passes

---

### [Code Review] PR #17 Component Organization Feedback
**Source**: CodeRabbit review - deferred items
**Items**:
- Move OverlappingCircles to `@/components/ui/` or `@/components/branding/` (used in landing + navbar)
- Extract Bebas Neue utility class: `.heading-display { font-family: var(--font-bebas-neue); }`
- Make ScrollIndicator configurable with `targetSectionId` prop
- Hoist breakpointCols constant in ImageGridSkeleton to module-level
**Effort**: 2h total | **Impact**: Code organization, maintainability
**Acceptance**: Components properly located, no inline font styles

---

### [Testing] Add Integration Tests for Upload Pipeline
**File**: `app/api/upload/route.ts`
**Perspectives**: maintainability-maven
**Impact**: Upload orchestration untested - race conditions and cleanup flow unverified
**Test Scenarios**:
1. Happy path: upload → dedupe → blob → db → embedding
2. Duplicate detection flow
3. Race condition handling (P2002 unique constraint)
4. Cleanup on failure (blob deletion)
**Effort**: 4-6h | **Priority**: CRITICAL
**Acceptance**: Integration tests pass, cover 6-service pipeline, catch regressions

---

### [Testing] Add Tests for Search Route
**File**: `app/api/search/route.ts`
**Perspectives**: maintainability-maven
**Impact**: Core feature completely untested
**Test Scenarios**:
1. Search with valid query
2. Empty query handling
3. Cache hit/miss behavior
4. Threshold fallback logic
5. Tag fetching for results
**Effort**: 3-4h | **Priority**: CRITICAL
**Acceptance**: Tests cover happy path and edge cases

---

### [Testing] Add Integration Tests for Shuffle Feature
**Source**: PR #11 review feedback
**Files**: `__tests__/api/shuffle-integration.test.ts` (new)
**Test Scenarios**:
1. Pagination stability - same seed produces identical order
2. Search shuffle - results relevant AND randomized
3. Shuffle with filters - favorites-only and tag filters work
4. Edge cases - empty library, single asset, invalid seed
**Effort**: 4-6h | **Priority**: HIGH
**Acceptance**: Integration tests pass, catch connection pooling regressions

---

### [Testing] Add Tests for Auth Layer
**Files**: `lib/auth/server.ts` (11% coverage), `lib/auth/verify-bearer.ts` (0%)
**Perspectives**: security-sentinel, maintainability-maven
**Impact**: Authentication layer has 8% test coverage - security-critical code completely unverified
**Test Scenarios**:
1. User sync success/failure
2. Bearer token validation
3. Database sync error handling
**Effort**: 3-4h | **Priority**: CRITICAL
**Acceptance**: Auth modules >80% coverage, all auth flows tested

---

### [Testing] Add Tests for Database Layer
**Files**: `lib/db.ts` (5% coverage)
**Perspectives**: maintainability-maven, architecture-guardian
**Impact**: Core data layer at 5% coverage - data integrity unverified
**Test Scenarios**:
1. User creation/retrieval
2. Asset CRUD operations
3. Embedding storage/retrieval
4. Transaction rollback on failure
**Effort**: 4-6h | **Priority**: CRITICAL
**Acceptance**: lib/db.ts >60% coverage, critical paths tested

---

### [Infrastructure] Add Type Check and Lint to CI
**Files**: `.github/workflows/test.yml`
**Perspectives**: architecture-guardian
**Impact**: CI only runs tests - type errors and lint violations caught after merge
**Fix**: Add steps before test:
- `pnpm type-check`
- `pnpm lint`
**Effort**: 15m | **Impact**: Catches 80% of issues in CI
**Acceptance**: CI fails on type errors and lint violations

---

### [Security] Add Gitleaks Secrets Scanning
**Perspectives**: security-sentinel
**Impact**: No automated detection of accidentally committed secrets
**Implementation**:
- Add Gitleaks to Lefthook pre-commit (when installed)
- Add Gitleaks GitHub Action as backup
**Effort**: 30m | **Risk**: HIGH
**Acceptance**: Pre-commit blocks commits with secrets, CI alerts on violations

---

### [Security] Configure Dependabot for Dependency Updates
**Files**: `.github/dependabot.yml` (new)
**Perspectives**: security-sentinel
**Impact**: No automated dependency vulnerability alerts or updates
**Implementation**:
```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10
```
**Effort**: 15m | **Impact**: Automated security patches
**Acceptance**: Dependabot PRs appear for outdated deps

---

## Next (This Quarter, <3 months)

### [Architecture] Decompose UploadZone God Object
**File**: `components/upload/upload-zone.tsx` (1,408 lines, 15+ state variables, 10+ responsibilities)
**Perspectives**: complexity-archaeologist, architecture-guardian, design-systems-architect
**Responsibilities to extract**:
1. `useUploadOrchestrator.ts` - Queue management logic
2. `useUploadProgress.ts` - Stats and throttling
3. `useUploadRetry.ts` - Retry queue with backoff
4. `UploadProgressCard.tsx` - Progress UI
5. `UploadRecoveryBanner.tsx` - Recovery notification
**Why**: Every upload feature change requires understanding 1,400+ lines, bugs must be fixed multiple times
**Effort**: 12-16h | **Impact**: 1,408 lines → 6-8 focused 150-200 line modules
**Acceptance**: Each module testable independently, page orchestrates composition

---

### [Architecture] Decompose Library Page God Object
**File**: `app/app/page.tsx` (1,099 lines, 25+ state variables)
**Perspectives**: complexity-archaeologist, architecture-guardian
**Extract**:
1. `ImagePreviewModal.tsx` (lines 858-982)
2. `RetryProgressModal.tsx` (lines 984-1053)
3. `useLibraryFilters.ts` - Consolidated filter/sort state
4. `LibraryHeader.tsx` - Status bar and controls
5. `useEmbeddingRetryManager.ts` - Retry logic
**Effort**: 12h | **Impact**: Page becomes ~300-line orchestrator
**Acceptance**: 5 focused modules, parallel UI development enabled

---

### [Architecture] Split lib/db.ts into Repositories
**File**: `lib/db.ts` (658 lines, 8+ functions, 5 concerns)
**Perspectives**: complexity-archaeologist, architecture-guardian
**Split into**:
- `lib/db/client.ts` - Prisma initialization (50 lines)
- `lib/db/user-repository.ts` - User sync/migration (100 lines)
- `lib/db/asset-repository.ts` - Asset CRUD (150 lines)
- `lib/db/embedding-repository.ts` - Vector operations (200 lines)
- `lib/db/search-repository.ts` - Search + logging (100 lines)
**Why**: 29 files depend on this monolith, cannot mock for tests, tight coupling
**Effort**: 8h | **Impact**: Testable modules, enables caching layer, DB migration path
**Acceptance**: Repository interfaces defined, existing code migrated

---

### [Architecture] Merge Upload Queue Implementations
**Files**: `lib/upload/upload-queue-service.ts` (335 lines), `lib/upload-queue.ts` (439 lines), inline in upload-zone.tsx
**Perspectives**: complexity-archaeologist, architecture-guardian
**Problem**: Three separate queue implementations with overlapping functionality
**Fix**: Create unified `UploadOrchestrator` that:
- Manages all queue logic (from UploadQueueService)
- Handles persistence (from upload-queue.ts)
- Exposes simple `enqueue(files)` and `onProgress` interface
**Effort**: 6h | **Impact**: Eliminates ~200 lines duplication, single source of truth
**Acceptance**: One queue implementation, upload-zone delegates to it

---

### [Architecture] Consolidate Search Bar Components
**Files**: 4 implementations totaling 784 lines
- `SearchBar` (298 lines) - full-featured with history
- `SearchBarElastic` (236 lines) - expand-on-focus
- `SearchBarCompact` (147 lines) - icon-to-input
- `SearchBarWithResults` (103 lines) - wrapper
**Perspectives**: design-systems-architect, complexity-archaeologist
**Fix**: Extract shared logic into composition-based system with variants
**Effort**: 6h | **Impact**: 784 lines → ~300, single source of truth
**Acceptance**: One SearchBar component with variant prop

---

### [Observability] Migrate to Single Logger
**Files**: `lib/logger.ts` (145 lines), `lib/observability-logger.ts` (273 lines), 125+ console.* calls
**Perspectives**: architecture-guardian, maintainability-maven
**Problem**: Two logging systems, inconsistent structured logging, can't query logs by trace
**Fix**:
1. Adopt observability-logger as standard
2. Replace all logger.ts imports
3. Replace raw console.* with logger.logInfo/logError
4. Consider Pino for production-grade structured logging
**Effort**: 4h | **Impact**: Unified observability, queryable logs
**Acceptance**: Single logger used throughout, structured metadata on all logs

---

### [Observability] Add Prisma Query Instrumentation
**Files**: `lib/db.ts`
**Perspectives**: performance-pathfinder
**Impact**: Cannot identify slow database queries - optimization requires guessing
**Current**: Performance monitor tracks operations but not individual Prisma queries
**Implementation**:
```typescript
// lib/db.ts - add middleware
prisma.$use(async (params, next) => {
  const before = Date.now();
  const result = await next(params);
  const after = Date.now();

  trackTiming(`db:${params.model}.${params.action}`, after - before, true);
  logger.logTiming(`db:${params.model}.${params.action}`, after - before, true, {
    model: params.model,
    action: params.action,
  });

  return result;
});
```
**Effort**: 1h | **Impact**: Visibility into all database operations, slow query detection
**Acceptance**: All Prisma queries logged with timing, integrated with existing performance monitor

---

### [Observability] Create SLO Tracking Dashboard
**Perspectives**: architecture-guardian, performance-pathfinder
**Impact**: Cannot verify if SLO targets are being met (upload <2.5s, search <500ms)
**Current**: Performance data collected but not aggregated for SLO compliance
**Implementation Options**:
1. Simple: Add `/api/health/slos` endpoint returning compliance percentages
2. Advanced: Grafana dashboard with query to Vercel Analytics
**Targets** (from CLAUDE.md):
- Upload processing: < 2.5 seconds
- Search response: < 500ms
- Initial page load: < 1.5 seconds
- Image grid render: < 300ms for 100 images
**Effort**: 2h | **Impact**: Proactive performance regression detection
**Acceptance**: SLO compliance visible, alerts when below threshold

---

### [Observability] Set Up Log Aggregation with Grafana Loki
**Perspectives**: architecture-guardian, maintainability-maven
**Impact**: Logs only in Vercel dashboard with 30-day retention - cannot query across services or retain history
**Current**: Structured JSON logging exists but no centralized aggregation
**Implementation**:
- Sign up for Grafana Cloud (free: 50GB logs/month)
- Add OTLP log exporter to observability-logger
- Forward structured logs to Loki
**Benefits**:
- Query logs by traceId, userId, operation
- Retention beyond 30 days
- Correlation with traces (if added later)
**Effort**: 2h | **Impact**: Queryable log history, cross-service correlation
**Acceptance**: Logs appear in Grafana, can query by metadata fields

---

### [Maintainability] Standardize Error Handling Across API Routes
**Files**: 15+ API routes with 3 different patterns
**Perspectives**: maintainability-maven
**Patterns**:
1. Throw exceptions
2. Return error objects
3. Custom error classes with `createErrorResponse()`
**Fix**: Create `lib/api-response.ts` with standard `errorResponse()` helper, single `ApiErrorResponse` interface
**Effort**: 4h | **Impact**: Consistent error UX, easier frontend error boundaries
**Acceptance**: All routes use standard pattern, requestId in all errors

---

### [Testing] Configure Meaningful Coverage Thresholds
**File**: `vitest.config.ts:37-42`
**Perspectives**: maintainability-maven
**Current**: lines: 8%, statements: 8% (essentially no floor)
**Fix**: Set per-module thresholds for critical paths only
```typescript
thresholds: {
  'lib/auth/**': { lines: 80, functions: 80 },
  'lib/db.ts': { lines: 60, functions: 60 },
  'lib/upload/**': { lines: 90 }, // maintain existing high coverage
}
```
**Effort**: 1h (after tests added) | **Impact**: Prevents coverage regression
**Acceptance**: CI fails if critical path coverage drops

---

### [Infrastructure] Enhance ESLint Configuration
**File**: `eslint.config.mjs`
**Perspectives**: maintainability-maven
**Current**: Only `next/core-web-vitals` - missing TypeScript-specific rules
**Add**:
- `@typescript-eslint/recommended`
- `@typescript-eslint/no-explicit-any` (warning initially)
- Import ordering
**Effort**: 1h | **Impact**: Catches type issues before runtime
**Acceptance**: ESLint runs with TS rules, no new errors introduced

---

### [Product] Implement Freemium Pricing Tiers
**Perspectives**: product-visionary
**Business Case**: No revenue while incurring API costs - existential for sustainability
**Tiers**:
- **Free**: 500 assets, basic search
- **Pro** ($12/mo): Unlimited assets, priority embeddings
- **Team** ($49/mo): Shared libraries, 5 users
**Implementation**: Stripe integration, usage tracking, feature gates, billing portal
**Effort**: 5-7 weeks | **Value**: Creates recurring revenue stream
**Acceptance**: Users can sign up free, upgrade to Pro, billing works, limits enforced

---

### [Product] Add Data Export / Portability
**Perspectives**: product-visionary
**Impact**: Users cannot backup library, no GDPR compliance, creates adoption fear
**Implementation**:
- ZIP export endpoint with metadata.json
- Individual image download option
- Include tags, favorites, timestamps
**Effort**: 3-4 days | **Value**: Removes major adoption objection
**Acceptance**: Export works, includes all metadata, GDPR compliant

---

### [Product] Add Bulk Operations
**Perspectives**: product-visionary, user-experience-advocate
**Impact**: Deleting 20 images = 40 clicks, power users will churn
**Implementation**:
- Checkbox selection mode in ImageGrid
- Floating action bar for bulk delete/favorite/tag
- API batch endpoints
**Effort**: 6h | **Value**: 40 clicks → 3, power user retention
**Premium Gate**: Free tier limited to 10 items, Pro unlimited
**Acceptance**: Multi-select works, bulk actions execute correctly

---

### [Product] Add Collections/Folders Organization
**Perspectives**: product-visionary, user-experience-advocate
**Impact**: Flat list with tags only - users with 200+ memes cannot find anything
**Competitive Gap**: Pinterest boards, Google Photos albums, Apple Photos albums
**Implementation**:
- Collections model: `id, name, userId, createdAt`
- CollectionAssets junction table
- UI: Collection sidebar, drag-to-add
**Effort**: 5-7 days | **Value**: Unlocks power user segment
**Acceptance**: Collections CRUD works, assets can belong to multiple collections

---

### [Product] Meme Detail Page with Semantic Recommendations
**Files**: `/app/meme/[id]/page.tsx` (new), `/components/related-memes.tsx` (new)
**Perspectives**: product-visionary, user-experience-advocate
**Impact**: "More like this" using existing embeddings - major retention driver
**Implementation**: Detail page route, related memes via vector similarity, threshold to avoid duplicates
**Effort**: 3-4 days | **Value**: Better discovery, increased engagement, viral loop
**Acceptance**: Detail page shows related memes, uses existing infrastructure

---

### [Security] Update Vulnerable Dependencies
**Perspectives**: security-sentinel
**Findings from `pnpm audit`**:
- `glob@10.4.5` - Command injection (HIGH)
- `js-yaml@4.1.0` - Prototype pollution (MODERATE)
- `vite@5.4.20` - Path traversal (MODERATE)
- `esbuild@0.21.5` - CORS bypass (MODERATE)
**Fix**: `pnpm update @vitejs/plugin-react @eslint/eslintrc @vitest/coverage-v8`
**Effort**: 15m + testing | **Risk**: HIGH for glob

---

### [Security] Restrict Public Meme Page Access
**File**: `app/m/[id]/page.tsx:116-120`
**Perspectives**: security-sentinel
**Issue**: Any user can access any meme by ID without authentication - privacy expectation mismatch
**Fix Options**:
1. Require shareSlug to be set: `where: { id, deletedAt: null, shareSlug: { not: null } }`
2. Document clearly to users
3. Add optional "private mode" flag
**Effort**: 30m | **Risk**: HIGH (privacy concern)
**Acceptance**: Only explicitly shared assets accessible via /m/

---

### [Performance] Add Database Indexes for Common Queries
**File**: prisma/schema.prisma
**Perspectives**: performance-pathfinder
**Missing indexes**:
- `@@index([ownerUserId, deletedAt, createdAt])` - List with date sort
- `@@index([ownerUserId, deletedAt, favorite])` - Bangers filter
**Effort**: 20m + migration | **Impact**: 20-50% improvement on filtered queries
**Acceptance**: Migration runs successfully, query plans show index usage

---

### [Performance] Move Client-Side Filtering to Server
**File**: `app/app/page.tsx:300-309`
**Perspectives**: performance-pathfinder
**Problem**: Fetches 50 results, filters client-side - wastes bandwidth, may miss relevant results
**Fix**: Add `favoriteOnly` and `tagId` params to `/api/search`, apply in SQL
**Effort**: 1-2h | **Impact**: More accurate results, reduced bandwidth
**Acceptance**: Filters applied server-side, result counts accurate

---

### [Performance] Create Stats API Endpoint
**File**: `hooks/use-status-stats.ts:17-19`
**Perspectives**: maintainability-maven
**Problem**: Fetches 1000 assets every 2-10s just for count/sum/max aggregates
**Fix**: Create `/api/stats` with Prisma aggregates
```typescript
const stats = await prisma.asset.aggregate({
  where: { ownerUserId: userId, deletedAt: null },
  _count: true,
  _sum: { size: true },
  _max: { createdAt: true }
});
```
**Effort**: 2h | **Impact**: Removes continuous DB load
**Acceptance**: Stats hook uses new endpoint, no full asset fetch

---

### [UX] Add Undo for Deletions
**File**: `components/ui/delete-confirmation-modal.tsx`
**Perspectives**: user-experience-advocate
**Impact**: "Don't ask again" + no undo = permanent accidental data loss risk
**Fix Options**:
- Add 5-second "Undo" toast after deletion
- Show "Recently Deleted" section (assets have deletedAt field)
- Remove "Don't ask again" option
**Effort**: 4h | **Value**: Prevents accidental data loss
**Acceptance**: Undo available for 5s after delete, or recently deleted visible

---

### [UX] Add Embedding Progress Indicators
**Perspectives**: user-experience-advocate
**Impact**: Users don't know if processing is stuck - see "pending" with no queue position
**Fix**: Show queue position ("3 of 15"), estimated time, active processing animation
**Effort**: 3h | **Value**: Users understand status and wait patiently
**Acceptance**: Queue position visible, estimated time shown

---

### [UX] Mobile Touch Target Improvements
**File**: `app/app/page.tsx:864-950`
**Perspectives**: user-experience-advocate
**Impact**: Action buttons 40px - below 44px minimum, accidental taps
**Fix**: Increase to 44x44px on mobile, add spacing between buttons
**Effort**: 2h | **Value**: Usable on all devices
**Acceptance**: Touch targets meet WCAG recommendations

---

### [UX] Search History ARIA Roles
**File**: `components/search/search-bar.tsx:243-291`
**Perspectives**: user-experience-advocate
**Impact**: Dropdown items are divs without proper ARIA roles
**Fix**: Add `role="option"`, `aria-selected`, `role="listbox"` to container
**Effort**: 1h | **Value**: Screen reader users can use history
**Acceptance**: ARIA audit passes

---

### [Testing] Add Shuffle Query Performance Monitoring
**Source**: PR #11 review feedback
**Files**: `app/api/assets/route.ts`, `lib/db.ts`, `app/api/search/route.ts`
**Implementation**: Timing instrumentation, Vercel structured logging, alert if >500ms SLO
**Effort**: 2h | **Priority**: MEDIUM
**Acceptance**: Shuffle timing logged, alerts configured, dashboard showing P95/P99

---

### [DX] Audit Logger Import Paths
**Source**: PR #13 review feedback
**Files**: All API routes, lib/logger.ts, lib/observability-logger.ts
**Task**: Inventory imports, ensure unified observability-logger usage, document in CLAUDE.md
**Effort**: 4h | **Priority**: MEDIUM
**Acceptance**: Single logger pattern, migration documented

---

### [Infra] Add Changelog Automation
**Perspectives**: architecture-guardian
**Problem**: Manual changelog, version bumps not enforced
**Fix**: Add Changesets
```bash
pnpm add -D @changesets/cli
pnpm changeset init
```
**Effort**: 2h | **Impact**: Enforced changelog entries, automated releases
**Acceptance**: PRs require changeset files

---

### [Design] Fix Card Border Radius
**File**: `components/ui/card.tsx:10`
**Perspectives**: design-systems-architect
**Issue**: `rounded-xl` but design system is brutalist (--radius: 0)
**Fix**: Change to `rounded-lg` or remove entirely
**Effort**: 5m | **Impact**: Visual consistency
**Acceptance**: Cards match brutalist aesthetic

---

### [Testing] Concurrency + Edge Coverage for Observability
**Source**: PR #13 review feedback
**Files**: `__tests__/lib/performance-monitor.test.ts`, edge-runtime spec
**Test Scenarios**: 50 parallel timings, edge runtime smoke, circular buffer saturation
**Effort**: 1 day | **Priority**: MEDIUM
**Acceptance**: Concurrency test passes, edge mock works

---

### monorepo consolidation
- consolidate `sploot` and `sploot-extension` into a monorepo
  * shared reusable components and design tokens etc

---

## Soon (Exploring, 3-6 months)

- **[Observability] Configure Crash-Free Sessions Alert** - Sentry UI → Alerts → Session → <98% threshold. Tracks reliability over time. (10m)

- **[Observability] Add Sentry Quota Usage Monitoring** - Monthly check of Sentry usage stats against 5k errors/month free tier. Create calendar reminder or simple script. (15m)

- **[Observability] OpenTelemetry Distributed Tracing** - Full request lifecycle visibility with @vercel/otel + Grafana Cloud. Enables trace context propagation to all services. (4h)

- **[Product] OCR Text Extraction for Search** - Tesseract/Cloud Vision at upload, hybrid semantic + full-text. 85% memes contain text - key differentiator. (4-6 weeks)

- **[Product] Team Workspaces & Collaboration** - Multi-user access with permissions, shared assets, real-time sync. Opens B2B market (agencies, brands). Team tier $49/mo. (6-10 weeks)

- **[Product] Ship Chrome Extension** - Phase 2-3 remaining: crop tool, offline queue, Chrome Web Store listing, Firefox. Major adoption driver. (2-3 weeks)

- **[Product] Keyboard Shortcuts Enhancement** - J/K navigation, E to edit tags, D delete, F favorite, Shift+Click bulk select. Power user retention. (2 days)

- **[Product] Public API v1** - REST API, API key auth, rate limiting, OpenAPI docs. Opens developer/enterprise segment. (15 days)

- **[Product] Saved Searches** - Pin favorite searches with cloud sync, optional notifications. Retention driver. (2-3 days)

- **[Product] Smart Suggestions** - "Create 'Cats' collection?", tag suggestions, duplicate detection. AI-native differentiator. (8-12 days)

- **[Performance] Add ISR to Share Page** - `export const revalidate = 3600`. Edge caching 200ms → 50ms. Trigger after traffic data. (5min)

- **[Performance] Optimize Shuffle for Large Libraries** - TABLESAMPLE for 10k+ assets when P95 >500ms. Monitor first. (3-4h)

- **[Architecture] Repository Pattern for Database Layer** - Full abstraction with interfaces, enables caching/testing/migration. (3-4h)

- **[Testing] Test Coverage for Critical Paths** - Integration tests for financial/data integrity code. Enables safe refactoring. (6h)

- **[UX] Search Empty State Guidance** - Explain semantic search, show examples, suggest alternatives. (1h)

- **[UX] Clear Filters Button in Empty State** - Add action to filtered empty state. (1h)

- **[Hardening] Image Load Error Handling on Share Page** - Add onError handler, branded fallback. Trigger if >1% failure rate. (1h)

- **[Maintainability] Consolidate Duplicate formatFileSize** - Two implementations with slight differences. (15min)

- **[Design] Extract Shared useDropZone Hook** - DRY drag-drop logic between EmptyState and UploadDropZone. (1.5h)

- **[Design] Move Keyframe Animations to globals.css** - Remove styled-jsx, centralize animations. (1h)

- **[Documentation] Add Component Library (Storybook)** - Document core 20 components, visual regression testing. (16h)

---

## Later (Someday/Maybe, 6+ months)

- **[Observability] Restore Sentry Health Check** - Add Sentry DSN verification to `/api/health` endpoint as non-blocking check. Removed during health check refactor (PR #20). While Sentry isn't critical for runtime like DB/Redis, monitoring teams may want visibility into error tracking status. **Effort**: 1h | **Priority**: Low | **Context**: Check `SENTRY_DSN` environment variable presence, return as optional check field.

- **[Platform] Mobile App (React Native)** - iOS/Android with camera integration, share sheet, push notifications. 60% meme consumption is mobile.

- **[Platform] GIF/Video Semantic Search** - MP4/WebM uploads, FFmpeg frame extraction, keyframe embeddings. 45% memes are video/GIF. No competitor has this.

- **[Product] Import from Other Services** - Google Photos, iCloud, Pinterest import. Reduces switching friction.

- **[Product] Advanced Video Understanding** - Custom ML for video classification, scene detection.

- **[Enterprise] Self-Hosted Deployment** - Docker/K8s, custom integrations, SLA guarantees.

- **[Social] Public Profiles & Sharing** - @username profiles, follow system, trending. Conflicts with "private by design" positioning.

- **[Analytics] Usage Analytics Dashboard** - Upload trends, search patterns. Team tier feature.

- **[Export] Scheduled Backups to Cloud** - Google Drive/Dropbox sync. Enterprise feature.

- **[Performance] Offline-First PWA Enhancement** - Full IndexedDB cache, background sync. Premium feature.

### [Observability] Migrate Console Logging to Structured Logger
**Source**: PR #13 review feedback
**Files**: `instrumentation.ts`, `lib/websocket-manager.ts`, `lib/embedding-queue.ts`, `app/api/cron/**/*.ts`
**Scope**: 5 error paths in websocket-manager, 5 in embedding-queue, cron routes
**Effort**: 2-3h | **Priority**: LOW (cosmetic)

### [Observability] Optimize Sentry Trace Sampling
**Source**: PR #13 review feedback
**Context**: 100% sampling appropriate for initial deployment, reduce to 10% after baseline established
**When**: After 1 month production data
**Effort**: 30min | **Priority**: LOW

---

## Learnings

**From this grooming session:**

- **God objects accumulate silently:** UploadZone (1408 lines), LibraryPage (1099 lines), lib/db.ts (658 lines) grew without refactoring triggers. Need size thresholds (500 lines = review checkpoint).

- **N+1 queries hide in loops:** All three critical N+1 issues follow same pattern - sequential queries inside `Promise.all(array.map(...))`. ESLint rule to flag database calls inside map/forEach would catch this.

- **Type safety erosion compounds:** 60+ `any` types in production code spread to call sites. One `any` → cascade of type loss. Strict `noImplicitAny: error` needed.

- **Error handling patterns diverge:** 3 different patterns emerged (throw, return error object, custom class). Need to establish pattern BEFORE building 3rd API route.

- **Security basics missing:** Rate limiting, SSRF protection, timing-safe comparison are all straightforward fixes but were never implemented. Security checklist for new endpoints needed.

- **Monetization is existential:** Operating costs accumulate without revenue model. Freemium is NOW priority - product cannot sustain development otherwise.

- **Multi-agent convergence = high signal:** Issues flagged by 3+ perspectives (UploadZone god object, N+1 queries, no rate limiting) are fundamental design problems affecting multiple quality dimensions.

- **UX vs architecture tradeoff:** 5 CRITICAL UX fixes take ~2h combined. Architecture fixes take 40+ hours. Ship UX wins first for user impact, tackle architecture for velocity.

---
