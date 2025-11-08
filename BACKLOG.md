# BACKLOG

Last groomed: 2025-10-27
Analyzed by: 7 specialized perspectives (complexity, architecture, security, performance, maintainability, UX, product)

---

## Now (Sprint-Ready, <2 weeks)

### [Feature] Meme Detail Page with Semantic Recommendations
**Files**: `/app/meme/[id]/page.tsx` (new), `/components/related-memes.tsx` (new)
**Perspectives**: product-visionary, user-experience-advocate, performance-pathfinder
**Context**: Convert fullscreen modal to dedicated meme detail page. Show semantically similar memes using existing embedding infrastructure for improved discovery.
**Implementation**: Create detail page route, add related memes section using vector similarity search (reuse existing search infrastructure), improve fullscreen UX
**Effort**: 3-4 days | **Priority**: HIGH
**Impact**: Better discovery, increased engagement, viral loop potential

### [Performance] Optimize Search Performance
**Files**: `/app/api/search/route.ts`, `/lib/db.ts`, embedding service
**Perspectives**: performance-pathfinder, architecture-guardian
**Context**: Search latency varies based on embedding generation and vector search complexity
**Investigation Needed**: Profile bottlenecks (embedding API vs pgvector query), add query optimization, implement better caching
**Effort**: 2-3 days | **Priority**: HIGH
**Impact**: Faster search improves core user experience

### [Testing] Add Integration Tests for Shuffle Feature
**Source**: PR #11 review feedback (Claude Code + Codex)
**Files**: `__tests__/api/shuffle-integration.test.ts` (new), `__tests__/lib/shuffle-pagination.test.ts` (new)
**Context**: PR #11 implemented server-side seeded shuffle with comprehensive unit tests for hooks. Integration tests needed to validate full data flow (API → DB → response) and catch regressions in connection pooling, transaction handling, and query construction.
**Test Scenarios**:
1. Asset shuffle pagination stability - same seed produces identical order across multiple page requests
2. Search shuffle relevance + randomization - results semantically relevant AND randomized
3. Shuffle with filters - favorites-only and tag filters work with shuffle
4. Edge cases - empty library, single asset, invalid seed handling
**Why Important**: Unit tests cover individual components but don't validate end-to-end shuffle correctness. Connection pooling bugs (fixed in PR #11) could regress without integration tests.
**Effort**: 4-6h | **Priority**: HIGH (next sprint after PR #11 merge)
**Acceptance**: Integration tests pass, cover critical shuffle flows, catch connection pooling regressions

### [Performance] Add Shuffle Query Performance Monitoring
**Source**: PR #11 review feedback (Claude Code)
**Files**: `app/api/assets/route.ts`, `lib/db.ts`, `app/api/search/route.ts`
**Context**: Shuffle queries use PostgreSQL `ORDER BY RANDOM()` which has O(n log n) complexity. Performance SLO: <500ms P95 for 1000 asset libraries. Need production data to validate assumptions and identify optimization triggers.
**Implementation**: Add timing instrumentation to shuffle queries, log to Vercel with structured data (requestId, shuffleSeed, assetCount, durationMs). Alert if >500ms SLO violated.
**Why Important**: Manual testing shows acceptable performance for 1000 assets, but need real-world data on P95/P99 latency with diverse library sizes (100-10,000 assets). Monitoring enables data-driven optimization decisions (e.g., TABLESAMPLE for large libraries).
**Effort**: 2h | **Priority**: MEDIUM
**Acceptance**: Shuffle query timing logged to Vercel, alerts configured for SLO violations, dashboard showing P95/P99 latency by library size

### [Monitoring] Implement Usage Analytics & Abuse Detection
**Files**: `/app/api/upload/route.ts`, `/app/api/search/route.ts`
**Perspectives**: security-sentinel
**Impact**: Understanding real usage patterns before implementing limits; prevent sustained API abuse
**Reality Check**: 1,000 uploads = $0.22 in embeddings. Hobby plan blocks at 1GB storage automatically (no surprise bills possible). Real power users importing meme collections = legitimate use case we should support.
**Actual Abuse Scenario**: Sustained 600 req/min for 24 hours = $190 in embeddings (painful but not catastrophic). Detection needed: sustained max-rate usage >2 hours, avg file size >7MB.
**Phase 1 (Monitor First - 2 weeks)**: Add metrics tracking - uploads/hour per user, daily totals, avg file size, embedding costs. Identify P99 usage patterns. NO rate limits yet - gather real data first.
**Phase 2 (Protective Limits - After 1 month data)**: Implement soft limits based on real usage: 100 uploads/hour (supports bulk imports), 500/day (weekend collection import). Alert on sustained >200/hour for >2 hours.
**Why These Limits**: 100/hour allows user to import 500-image collection in 5 hours (legitimate power user). Prevents sustained spam (36k/hour impossible). NOT "10/min" - that's hostile to real users.
**Effort**: Phase 1: 4h (metrics) | Phase 2: 2h (limits based on data) | **Risk**: MEDIUM (cost manageable, Hobby plan self-protects)
**Acceptance**: Metrics dashboard showing per-user upload patterns, alert system for sustained abuse (>200/hour sustained), friendly error messaging with upgrade path (not bare 429s)

### [Security] Remove Error Details from Client Responses
**File**: `/app/api/upload/route.ts:519, 556`
**Perspectives**: security-sentinel
**Impact**: Information disclosure - database schema, stack traces leak to client even in production
**Fix**: Return generic error to client, log full details server-side only via structured logger
**Effort**: 30m | **Risk**: HIGH
**Acceptance**: Production errors show generic message, full details in Vercel logs only

### [Performance] Fix N+1 Tag Queries in Upload
**File**: `/app/api/upload/route.ts:146-180`
**Perspectives**: performance-pathfinder
**Impact**: 800ms additional latency when uploading with 5 tags (violates 2.5s upload SLO)
**Current**: 4 queries per tag × 5 tags = 20 queries
**Fix**: Batch operations - single `findMany` for existing tags, `createMany` for new tags, `createMany` for associations
**Effort**: 1h | **Impact**: 800ms → 50ms (16x improvement)
**Acceptance**: Upload with 5 tags completes in <100ms for tag operations, query count ≤3 regardless of tag count

### [Performance] Fix N+1 Tag Queries in Search Results
**File**: `/app/api/search/route.ts:147-178`
**Perspectives**: performance-pathfinder
**Impact**: 450ms search latency with 30 results (violates <500ms search SLO)
**Current**: 1 vector search + 30 tag queries = 31 queries
**Fix**: Single `assetTag.findMany` with `{ assetId: { in: assetIds } }`, build lookup map client-side
**Effort**: 45m | **Impact**: 450ms → 120ms (3.75x improvement)
**Acceptance**: Search with 30 results uses ≤2 database queries total, <200ms latency

### [UX] Replace Native Delete Confirmation with Modal
**File**: `/app/app/page.tsx:803`
**Perspectives**: user-experience-advocate
**Impact**: CRITICAL - Data loss risk from accidental deletes (native `confirm()` too easy to mis-tap on mobile)
**Fix**: Use existing `DeleteConfirmationModal` component (already in codebase) - shows image preview, clear warning, tap-friendly buttons
**Effort**: 15m | **Impact**: Prevents accidental deletions
**Acceptance**: Delete action shows modal with image preview, requires explicit confirmation, works on mobile

### [Maintainability] Fix Type Safety in lib/db.ts
**File**: `/lib/db.ts:37, 62, 116, 220, 274, 317`
**Perspectives**: complexity-archaeologist, maintainability-maven
**Impact**: 6+ `any` types break TypeScript safety in critical database operations - runtime errors slip through
**Fix**: Define `PrismaTransaction`, `MockUser` types; replace `as any` with `satisfies` type assertions
**Effort**: 2h | **Impact**: Compile-time safety for database layer
**Acceptance**: Zero `any` types in lib/db.ts, all functions have explicit return types, tests pass

---

## Next (This Quarter, <3 months)

### [Architecture] Decompose Library Page Component
**File**: `/app/app/page.tsx` (972 lines, 7 responsibilities)
**Perspectives**: complexity-archaeologist, architecture-guardian
**Approach**: Extract hooks (`useLibraryState.ts`, `useUrlSync.ts`) and components (`LibraryToolbar.tsx`, `ImageLightboxModal.tsx`, `EmbeddingRetryModal.tsx`). Page.tsx becomes ~150-line orchestrator.
**Effort**: 10-14h | **Impact**: Second most complex file, unlocks parallel UI development

### [Maintainability] Standardize Error Handling Across API Routes
**Files**: Multiple API routes (`/app/api/upload/route.ts`, `/app/api/search/route.ts`, etc.)
**Perspectives**: maintainability-maven (3 different error patterns confuse developers)
**Why**: Pattern 1: Throw exceptions. Pattern 2: Return error objects. Pattern 3: Custom error classes. Frontend must handle 3 different shapes.
**Approach**: Create `lib/api-response.ts` with `errorResponse()` helper. Single `ApiErrorResponse` interface. Update 15 routes to use standard pattern.
**Effort**: 4h | **Impact**: Consistent error UX, easier frontend error boundaries

### [Testing] Concurrency + edge coverage for observability stack
**Source**: PR #13 review (Claude) — https://github.com/phrazzld/sploot/pull/13#issuecomment-3492708426
**Files**: `__tests__/lib/performance-monitor.test.ts`, new edge-runtime spec, load test harness
**Context**: Reviewer asked for optional stress cases (concurrent `measureAsync`, edge runtime smoke, circular buffer saturation) to lock down new instrumentation. Valuable once core bugs are fixed.
**Effort**: 1 day | **Priority**: MEDIUM
**Acceptance**: Add concurrency test that runs 50 parallel timings without race conditions, edge-runtime mock confirms wrapper works without `nextUrl`, load test fixture exercises buffer rollover without perf hits.

### [DX] Audit logger import paths after observability rollout
**Source**: PR #13 review (Claude) — https://github.com/phrazzld/sploot/pull/13#issuecomment-3492708426
**Files**: `/app/api/**/route.ts`, `lib/logger.ts`, `lib/observability-logger.ts`
**Context**: Claude flagged possible mismatch between legacy `@/lib/logger` and new observability logger usage. Needs repo-wide sweep once current PR lands.
**Effort**: 4h | **Priority**: MEDIUM
**Acceptance**: Inventory all route/component imports, ensure unified `observability-logger` usage, document migration pattern in CLAUDE.md.

### [Maintainability] Enforce Logger Usage via ESLint
**Files**: 510+ raw `console.*` calls across 71 files vs well-designed `lib/logger.ts` being ignored
**Perspectives**: maintainability-maven (production logs lack structured data)
**Why**: Vercel logs missing context (asset ID, user ID, etc.) - impossible to debug production issues. Development vs production logging diverges.
**Approach**: Add ESLint rule `no-console: error`. Bulk find-replace to structured logger calls. Add context objects to all log statements.
**Effort**: 8h | **Impact**: Enable production debugging, queryable logs

### [Product] Implement Freemium Pricing Tiers
**Scope**: New feature - monetization model
**Perspectives**: product-visionary
**Business Case**:
- Currently no revenue while incurring Replicate API + Vercel Blob costs
- Freemium standard for productivity tools ($10-50/mo)
- 10-15% free → paid conversion typical for similar tools
**Tiers**: Free (500 assets) → Pro ($12/mo, unlimited) → Team ($49/mo for 5 users)
**Implementation**: Stripe integration, usage tracking/limits, billing portal, feature gates in API routes
**Effort**: 5-7 weeks | **Value**: Creates recurring revenue stream
**Acceptance**: Users can sign up for free, upgrade to Pro, billing works, limits enforced

### [Performance] Add ISR to Share Page
**File**: `/app/m/[id]/page.tsx`
**Perspectives**: performance-pathfinder
**Source**: PR #12 review (Claude)
**Context**: Share pages regenerated on every request. Architecture docs (TASK.md) specify ISR but missing from implementation.
**Implementation**: Add `export const revalidate = 3600` (1 hour cache). Monitor P95 response time improvement via Vercel Analytics.
**Trigger**: After 1 week production data on share page traffic patterns (validate cache hit ratio worthwhile)
**Effort**: 5min | **Priority**: MEDIUM
**Impact**: Edge caching reduces share page load time 200ms → 50ms (4x improvement)

### [Performance] Move Client-Side Filtering to Server
**File**: `/app/app/page.tsx:288-297`
**Perspectives**: performance-pathfinder
**Why**: Client-side filtering of search results after fetch wastes bandwidth & CPU. Filtering 100 results with tags takes ~80ms on each search.
**Approach**: Add `favoriteOnly` and `tagId` query params to `/api/search` route. Move WHERE clauses to SQL. Reduce payload size 50%+.
**Effort**: 30m | **Impact**: Eliminates client-side filtering lag

### [Performance] Add Database Indexes
**File**: Database schema
**Perspectives**: performance-pathfinder
**Why**: Missing composite index on `assets(owner_user_id, deleted_at)` causes sequential scan before vector search. 80ms additional latency on 10k+ asset libraries.
**Approach**: `CREATE INDEX idx_assets_user_deleted ON assets(owner_user_id, deleted_at) WHERE deleted_at IS NULL;`
**Effort**: 10m | **Impact**: 80ms → 5ms for user/deleted filtering

### [UX] Add Bulk Delete & Multi-Select
**File**: `/app/app/page.tsx` (feature missing)
**Perspectives**: user-experience-advocate
**Why**: Deleting 20 accidental uploads requires 40 clicks (delete + confirm each). Frustrating, tedious workflow.
**Approach**: Add multi-select mode with checkboxes in ImageGrid. Batch action bar when items selected. Single API call for bulk delete.
**Effort**: 6h | **Impact**: 40 clicks → 3 clicks
**Premium Gate**: Bulk actions limited to 10 assets on free, unlimited on Pro

---

## Soon (Exploring, 3-6 months)

- **[Hardening] Add Image Load Error Handling to Share Page** - Add `onError` handler to Next.js Image component on share page. React Error Boundaries don't catch image load failures (404, network issues). Show branded fallback UI matching SharePageErrorBoundary aesthetic. **Trigger**: If production monitoring shows >1% image load failure rate on share pages. **Source**: PR #12 review (Claude). **Why Deferred**: Vercel Blob URLs highly stable, no production evidence of failures, adds complexity for rare edge case. (1h)

- **[Testing] Add Tests for Share Page Metadata Generation** - Create `__tests__/app/m/[id]/metadata.test.ts` to test server-side `generateMetadata()` function. Mock Next.js metadata API, test OG tags, Twitter Card, Schema.org JSON-LD generation with various asset states (normal, missing dimensions, deleted). Currently indirectly covered by API share-flow tests. **Source**: PR #12 review (Claude). **Why Deferred**: Low-risk code (simple Prisma query + metadata object), indirect test coverage sufficient for MVP. (2h)

- **[Maintainability] Consolidate Duplicate formatFileSize Functions** - Two implementations in `components/share/share-page-metadata.tsx:14-18` and `lib/upload-errors.ts:219-223` with slight formatting differences (spaces: "10.5 KB" vs "10.5KB"). **Options**: Import from lib/upload-errors + `.replace(' ', '')`, add `compact: boolean` param to shared utility, or document intentional difference. **Source**: PR #12 review (CodeRabbitAI). **Why Deferred**: Code quality issue, not user-facing. Low maintenance risk (stable code). (15min)

- **[Documentation] Add Security Comment for Structured Data** - Add trust boundary comment to Schema.org JSON-LD block in `app/m/[id]/page.tsx`: "Safe: structured data sourced from database only, no user-provided content". **Source**: PR #12 review (Claude). **Why Deferred**: No functional impact, code clarity improvement for future security reviews. (2min)

- **[Product] Team Workspaces & Collaboration** - Multi-user library access with permissions, shared upload/search/tagging, real-time updates. Opens B2B market (agencies, brands, creators). 10x TAM expansion. Team pricing $40-100/mo vs $10/mo individual. Requires implementing user-scoped cache invalidation (spec in old BACKLOG lines 257-328). (6-10 weeks)

- **[Product] OCR Text Extraction for Search** - Extract text from meme overlays via Tesseract/Google Cloud Vision, enable hybrid search (semantic + full-text). Solves top user frustration: "can't find meme by text". 85% of memes contain text. Key differentiator vs competitors. (4-6 weeks)

- **[Platform] Mobile App (React Native)** - iOS/Android native app with camera integration, "share to Sploot" from other apps, push notifications, true offline mode. 60% of meme consumption is mobile. PWA adoption: 4% vs 96% native install rates. App Store presence = discovery channel. (12-16 weeks, phased)

- **[Integration] Public API & Developer Platform** - REST API v1, OAuth 2.0, Zapier integration, webhook system. Platform effects: developers build integrations → more valuable. 80% of enterprise deals require API. Unlocks 5000+ workflow integrations. (11-16 weeks)

- **[Content] Video & GIF Semantic Search** - Support MP4/WebM uploads, FFmpeg processing, extract keyframes, generate embeddings per frame. Search across video content with timestamp results. 45% of meme shares are video/GIF. Unique capability (no competitor has video semantic search). (13-19 weeks, phased: GIF → video → search)

- **[Workflow] Smart Collections & Auto-Tagging** - AI-powered tag suggestions using CLIP embeddings, smart collections (auto-generated "Screenshots", "Text Memes"), duplicate detection via pHash. Power users can manage 1000+ assets. Premium feature for Pro tier. (8-12 weeks)

- **[Testing] Test Coverage for Critical Paths** - Integration tests for upload route (concurrency, duplicate detection, blob cleanup), search route, auth flows. Current coverage: 0% on financial/data integrity code. Enables safe refactoring. (6h initial, ongoing)

- **[Performance] Optimize Shuffle for Large Libraries (10k+ assets)** - Add TABLESAMPLE optimization for shuffle queries when P95 latency exceeds 500ms SLO. Current `ORDER BY RANDOM()` scans all assets; TABLESAMPLE pre-filters to ~1000 candidates before sorting. Trade-off: slightly less uniform distribution (imperceptible to users). **Trigger**: Production monitoring shows P95 shuffle latency >500ms. **Source**: PR #11 review feedback. **Why Deferred**: No evidence of performance issue yet - current implementation handles 1000 assets <200ms. Premature optimization without data. Monitor first (see "Add Shuffle Query Performance Monitoring" above), optimize only if needed. (3-4h)

- **[Architecture] Repository Pattern for Database Layer** - Split `lib/db.ts` (559 lines, low cohesion) into domain repositories: `AssetRepository`, `EmbeddingRepository`, `TagRepository`. Testable via dependency injection. (3-4h)

- **[Maintainability] Add Migration Guides for Deprecated Code** - Document how to migrate from `UploadFile` legacy interface to `FileMetadata` + `FileStreamProcessor`. Prevents technical debt accumulation. (1h)

- **[UX] Search Empty State Guidance** - Educational empty state when no results: explain semantic search, show example queries, suggest alternatives. Users don't understand semantic search after one failed query. (1h)

---

## Later (Someday/Maybe, 6+ months)

### [Observability] Migrate Console Logging to Structured Logger
**Source**: PR #13 review feedback (CodeRabbit, Codex)
**Files**: `instrumentation.ts`, `lib/websocket-manager.ts`, `lib/embedding-queue.ts`, `app/api/cron/**/*.ts`
**Context**: Multiple files still use `console.error`/`console.warn` instead of the centralized `logger.logError`/`logger.logInfo` from `lib/observability-logger.ts`. This creates inconsistency and loses traceId correlation.
**Scope**:
- `instrumentation.ts:28-36` - onRequestError handler uses console.error
- `lib/websocket-manager.ts:98, 202, 271, 280, 327` - 5 error paths use console.error
- `lib/embedding-queue.ts:219, 259, 381, 399, 425` - 5 console.error calls
- `app/api/cron/purge-deleted-assets/route.ts:125-146, 175-177` - console.warn/console.error
- `app/api/upload/check/route.ts:123-136` - console.error
**Effort**: 2-3h (find-replace + test) | **Priority**: LOW (cosmetic, non-blocking)
**Impact**: Better log correlation, consistent structured logging across codebase

### [Observability] Optimize Sentry Trace Sampling for Production
**Source**: PR #13 review feedback (CodeRabbit)
**Files**: `sentry.client.config.ts:6-7`, `sentry.server.config.ts:3-14`, `sentry.edge.config.ts:4-4`
**Context**: All Sentry configurations use 100% trace sampling (`tracesSampleRate: 1.0`). While appropriate for initial deployment, this becomes expensive as traffic grows.
**Recommended**: Reduce to 10% sampling in production once baseline metrics are established:
```typescript
tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
```
**Alternative**: Implement dynamic sampling based on error rates or specific routes.
**When**: After 1 month of production data to establish baselines
**Effort**: 30min | **Priority**: LOW (optimization, not urgent)
**Impact**: Reduced Sentry costs, maintained observability coverage

### [Observability] Add Sentry DSN Validation
**Source**: PR #13 review feedback (CodeRabbit)
**Files**: `sentry.edge.config.ts:4-4`
**Context**: Current implementation silently fails if `SENTRY_DSN` is missing. Explicit validation would provide clearer feedback during setup.
**Implementation**:
```typescript
if (process.env.NODE_ENV === 'production' && !process.env.SENTRY_DSN) {
  console.warn('[Sentry] SENTRY_DSN environment variable is not set');
}
```
**Effort**: 10min | **Priority**: VERY LOW (nice-to-have warning)
**Impact**: Easier debugging during Sentry setup

### [Documentation] Update PR Description Consistency
**Source**: PR #13 review feedback (CodeRabbit)
**Context**: Minor PR description inconsistencies flagged during review. Not blocking, but good practice for future PRs.
**Effort**: 5min per PR | **Priority**: VERY LOW
**Impact**: Clearer PR documentation

### [Testing] Add Request Handling Fallback Tests
**Source**: PR #13 review feedback (CodeRabbit)
**Files**: `lib/with-observability.ts:166`, `__tests__/lib/with-observability.test.ts:322-346`
**Context**: Code reviewer flagged concern about `req.nextUrl` guard, but tests on lines 322-346 already confirm fallback to `Request.url` works correctly. No action needed, documented for reference.
**Status**: ✅ Already tested | **Priority**: N/A

---

- **[Social] Public Profiles & Sharing** - `sploot.com/@username` public profiles, follow/follower system, trending page, embed widgets. Viral growth potential but conflicts with "private by design" positioning.

- **[Analytics] Usage Analytics Dashboard** - Upload trends, search patterns, most-used tags. Export for teams. Team tier differentiator.

- **[Export] Data Portability (GDPR)** - Export to ZIP with metadata.json, scheduled backups to Google Drive/Dropbox. Required for enterprise, trust signal.

- **[Performance] Offline-First PWA Enhancement** - Full offline mode with IndexedDB cache, background sync for uploads when connection restored. Premium feature: 1GB cache vs 100MB free.

- **[Content] Advanced Video Understanding** - Custom ML models for video content classification, scene detection, object recognition in videos.

- **[Enterprise] Self-Hosted Deployment** - Docker/Kubernetes deployment option, custom integrations, SLA guarantees, dedicated support. Enterprise tier: custom pricing.

- **[Platform] Browser Extension** - Right-click "Save to Sploot" from any webpage, quick capture toolbar, search from omnibox.

---

## Learnings

**From this grooming session:**

- **God objects accumulate silently:** UploadZone (2001 lines), LibraryPage (972 lines), UploadRoute (669 lines) - all grew iteratively without refactoring triggers. Need size thresholds (500 lines = review checkpoint).

- **N+1 queries hide in loops:** Both critical performance issues (upload tags, search tags) follow same pattern - sequential queries inside `Promise.all(array.map(...))`. Should add ESLint rule to flag database calls inside map/forEach.

- **Type safety erosion compounds:** 6 `any` types in lib/db.ts spread to call sites (30+ total). One `any` → cascade of type loss. Strict TSConfig (`noImplicitAny: error`) needed.

- **Error handling patterns diverge:** 3 different patterns emerged organically (throw, return error object, custom Error class). Need to establish pattern BEFORE building 3rd API route, not after 15th.

- **Product-market fit question:** Currently positioned as hobbyist tool (single-user meme library). Market analysis shows B2B opportunity (team workspaces, API, enterprise) is 10x larger. Strategic decision needed: stay niche or expand to professional market?

- **Monetization blocks growth:** Operating costs (Replicate, Vercel) accumulate without revenue model. Freemium is NOW priority, not future consideration.

- **UX vs technical debt tradeoff:** 3 CRITICAL UX issues (delete confirmation, search guidance, upload progress) take 2h combined to fix. 3 CRITICAL architecture issues (god objects) take 32-46h. Ship UX wins first for user impact, then tackle architecture for velocity.

---

## Archive Notes

**Completed work moved to git history:**
- ✅ PR #9 landing page redesign (merged Oct 2025)
- ✅ Cache consolidation with strategy pattern (merged Oct 2025)
- ✅ Mobile share & actions (merged Oct 2025)

**Deferred as low-value:**
- Landing page error boundaries (nice-to-have defensive programming, no production errors observed)
- Animation polish (scroll indicators, reduced motion support completed)
- PWA manifest tweaks (current implementation sufficient)

**Multi-user cache invalidation spec:** Preserved in git history (old BACKLOG.md lines 257-328) for when team workspaces implemented. Design reviewed and approved, just needs execution trigger.
