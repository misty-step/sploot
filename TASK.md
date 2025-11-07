# Comprehensive Observability & Analytics Implementation

## Executive Summary

Implement production-grade observability covering analytics (user behavior), error tracking, and performance monitoring using free-tier Vercel tools. Replaces partial analytics with comprehensive system tracking all critical flows: upload, search, library interactions, and production errors. Supersedes "[Monitoring] Implement Usage Analytics & Abuse Detection" backlog item with unified approach covering abuse detection via usage metrics.

**User Value:** Visibility into feature usage, fast production debugging (MTTR 30min → 5min), SLO compliance monitoring (<500ms search, <2.5s upload), early abuse detection before cost runaway.

**Timeline:** 1 week comprehensive implementation
**Cost:** $0/month (free tier constraints: Vercel unlimited events, Sentry 5K errors/month)

**Success Criteria:**
- All 25 API routes instrumented with timing + structured error logging
- Core user flows tracked: upload (select → process → searchable), search (query → results → click), library (favorite/delete/tag)
- Web Vitals automatically captured (LCP, FCP, CLS, INP, TTFB)
- Production errors aggregated in Sentry with request context
- Abuse detection metrics: uploads/hour, sustained high-rate patterns (>200/hour for >2h)

## User Context

### Problems Being Solved

**Product Blindness** - Zero visibility into feature usage patterns, adoption curves, or churn triggers. Cannot answer: "Do users search before uploading?" "What causes bounces?" "Which features are ignored?"

**Slow Incident Response** - Production errors buried in unsearchable console logs. Debugging requires grep-ing Vercel logs, missing request context, cannot correlate errors across systems. MTTR: 30+ minutes.

**Performance Degradation** - No monitoring against SLOs (<500ms search P95, <2.5s upload P95). Performance regressions discovered by user complaints, not proactive alerts.

**Abuse Vulnerability** - No tracking of sustained high-rate usage. Vulnerable to runaway API costs (Replicate embeddings = $0.00022/upload × unlimited = uncapped burn).

**Technical Debt** - `lib/performance.ts` exists but unused (0 imports for months). Three different logging patterns across API routes. Telemetry endpoint stubbed with TODO. Orphaned code accumulates.

### Measurable Benefits

- **Faster debugging:** MTTR 30min → 5min via structured error logs with request traceId, user context, operation timing
- **Data-driven product:** Feature adoption metrics, conversion funnels, A/B test infrastructure
- **Cost control:** Early detection of abuse patterns before $190+ embedding cost spikes (600 req/min × 24h scenario)
- **SLO compliance:** Automatic detection when search latency exceeds 500ms P95, upload exceeds 2.5s P95
- **Code quality:** Remove unused performance tracker (309 lines), standardize logging (3 patterns → 1)

## Requirements

### Functional Requirements

**FR1: User Behavior Analytics**

Track core user journeys end-to-end:
- **Upload flow:** File select → upload initiated → blob stored → embedding generated → asset searchable
- **Search flow:** Query submitted → results shown (count, latency) → result clicked (position, score)
- **Library interactions:** Asset favorited, asset unfavorited, asset deleted (confirmation), tag added, tag removed
- **Share flow:** Page viewed (referrer sanitized), CTA clicked, bounce (<5 sec) — **already implemented**, validate only
- **PWA events:** Install prompt shown → prompt accepted → app installed, offline usage detected

**FR2: Performance Monitoring**

Automatic and manual instrumentation:
- **Automatic Web Vitals:** @vercel/speed-insights captures LCP, FCP, CLS, INP, TTFB with 10% production sampling
- **API route timing:** All 25 routes log `{ operation, duration, success, timestamp, traceId }`
- **Database performance:** Prisma middleware tracks query type (findMany, create, update), table, duration
- **External API timing:** Replicate embedding API calls, Vercel Blob upload/delete operations
- **SLO alerting:** Vercel log queries for P95 latency violations (search >500ms, upload >2.5s)

**FR3: Error Tracking**

Comprehensive error capture:
- **Structured logging:** All 25 API routes use standardized `logError(context, error, metadata)` pattern
- **Client error boundaries:** React error boundaries send errors to `/api/telemetry` with component stack
- **Request correlation:** TraceId propagated through full lifecycle (client → API route → database → external API)
- **Error aggregation:** Sentry groups errors by type, deduplicates, provides permanent storage (vs Vercel's 3-day limit)
- **Non-blocking telemetry:** Errors logged but never thrown; telemetry failures don't break user flows

**FR4: Abuse Detection Metrics**

Usage analytics for cost protection:
- **Upload rate tracking:** Per-user uploads/hour, uploads/day, rolling 7-day totals
- **Sustained pattern detection:** Alert when user sustains >200 uploads/hour for >2 hours (abuse threshold)
- **File size analytics:** Average upload size, P95 size, anomaly detection (avg >7MB = suspicious)
- **Cost estimation:** Track Replicate API costs per user (`uploadCount × $0.00022`), project monthly burn
- **Phased limits:** Phase 1 (now): monitor only. Phase 2 (after 1 month real data): soft limits (100/hour, 500/day)

### Non-Functional Requirements

**NFR1: Zero Additional Cost**
- Use @vercel/analytics free tier: unlimited events, built-in spam protection
- Use @vercel/speed-insights free tier: automatic sampling, no quota limits
- Use Vercel runtime logs: 3-day retention, structured JSON logging
- Use Sentry free tier: 5K events/month (166/day budget, actual ~20-50/day)
- No paid services: no Datadog, New Relic, Honeycomb, custom log storage

**NFR2: Performance Impact**
- Client analytics tracking: <5ms overhead per event (non-blocking sendBeacon)
- Server timing instrumentation: <2ms overhead per route (Date.now() calls)
- Database middleware: <1ms overhead per query (wrapped in Prisma transaction)
- Non-blocking telemetry: Use Next.js `waitUntil` for fire-and-forget operations
- Sampling strategy: 100% dev/preview, 10% production for Speed Insights

**NFR3: Privacy & Security**
- Sanitize all URLs: strip query params (`?token=xyz`), fragments (`#section`)
- No PII in events: hash user IDs (SHA-256), redact email addresses
- Respect Do Not Track: Check `navigator.doNotTrack`, skip tracking if enabled
- GDPR compliance: beforeSend filter for sensitive routes (`/admin`, `/private`)
- Audit logging: Track who accessed what, when (separate from analytics)

**NFR4: Maintainability**
- Single logging pattern: All routes use `lib/vercel-logger.ts` (eliminate console.log)
- Type-safe events: TypeScript constants for all analytics events (`ANALYTICS_EVENTS.UPLOAD_COMPLETED`)
- Remove dead code: Delete unused `lib/performance.ts` (309 lines, 0 imports)
- Documentation: OBSERVABILITY.md playbook with queries, alerts, troubleshooting
- Future-proof: Patterns scale to multi-user, team workspaces (user-scoped metrics)

## Architecture Decision

### Selected Approach: **Native Vercel Stack + Sentry Free Tier**

**Components:**
1. `@vercel/analytics@1.5.0` (already installed) - user behavior tracking, custom events, page views
2. `@vercel/speed-insights` (NEW - install) - automatic Web Vitals, RUM, performance scoring
3. Vercel Runtime Logs - structured JSON to stdout/stderr, 3-day retention, queryable dashboard
4. `@sentry/nextjs` (NEW - install) - error tracking, grouping, deduplication, permanent storage
5. Enhanced `lib/vercel-logger.ts` - standardized logging with traceId, timing, Sentry integration

**Why This Approach Wins:**
- **Simplicity:** Minimal dependencies (2 new packages), zero operational overhead, built-in Vercel integration
- **User Value:** Comprehensive coverage (analytics + performance + errors) without paid tier features
- **Explicitness:** Free tier constraints force focused instrumentation (track what matters, not everything)
- **Risk:** Low - established tools, mature APIs, well-documented, used by thousands of Next.js apps

### Alternatives Considered

| Approach | User Value | Simplicity | Cost | Why Not Chosen |
|----------|-----------|-----------|------|----------------|
| **Full Datadog/New Relic** | 10/10 (APM, distributed tracing, dashboards) | 3/10 (complex setup, agent config) | $50-200/mo | Violates free-tier constraint. Over-engineering for MVP scale. |
| **Native Vercel Only** | 6/10 (basic analytics, no errors) | 10/10 (zero setup) | $0/mo | Missing error aggregation, permanent storage, deduplication. Errors lost after 3 days. |
| **Custom Analytics DB** | 7/10 (full control, unlimited) | 2/10 (build everything) | $0/mo | Engineering overhead too high for solo dev. Reinventing wheels (error grouping, dashboards). |
| **Mixpanel/Amplitude** | 9/10 (product analytics) | 7/10 (simple SDK) | $0-50/mo | Great for user analytics but missing performance + error tracking. Need 3 tools instead of 2. |
| **✅ Selected: Vercel + Sentry Free** | 8/10 (comprehensive) | 8/10 (simple integration) | $0/mo | Best balance. Covers analytics, performance, errors. Scales to paid tiers naturally. |

### Module Boundaries

**Module 1: Analytics Service** (`lib/analytics.ts`)
- **Interface:** `track(event, properties)`, `trackTiming(operation, duration, success)`, `trackFlow(flowName, step, metadata)`
- **Responsibility:** Type-safe wrapper around @vercel/analytics. Enforces event schema (constants, required properties). Handles server/client tracking differences.
- **Hidden Complexity:** Server-side `track()` from `@vercel/analytics/server`, client-side from `@vercel/analytics`. Sampling logic. Do Not Track detection. PII sanitization.
- **Module Value:** High functionality (all analytics), low interface complexity (3 functions).

**Module 2: Performance Monitor** (`lib/performance-monitor.ts`)
- **Interface:** `startTiming(operation)`, `endTiming(operation)`, `measureAsync<T>(operation, fn: () => Promise<T>)`, `getSummary(operation)`
- **Responsibility:** Replace unused `lib/performance.ts`. Track operation durations, calculate P50/P95/P99. Integrate with Vercel Analytics for visualization.
- **Hidden Complexity:** In-memory circular buffer (last 100 samples per operation). Percentile calculations. Debug mode (localStorage flag). Export to analytics.
- **Module Value:** Reuses existing PerformanceTracker design but adds Vercel integration.

**Module 3: Structured Logger** (enhance `lib/vercel-logger.ts`)
- **Interface:** `logInfo(context, metadata)`, `logError(context, error, metadata)`, `logTiming(operation, duration, success, metadata)`, `withTraceId(traceId)`
- **Responsibility:** Standardized JSON logging for Vercel logs. Request correlation via traceId. Sentry integration for errors.
- **Hidden Complexity:** JSON serialization. Error normalization (Error vs string vs unknown). Environment detection (NODE_ENV). Sentry captureException. Console routing (stdout vs stderr).
- **Module Value:** Single source of truth for all logging. Zero console.log/console.error in application code.

**Module 4: Telemetry Client** (enhance `app/api/telemetry/route.ts`)
- **Interface:** POST endpoint accepting `{ type: 'error' | 'performance' | 'usage', payload: any }`
- **Responsibility:** Non-blocking collection endpoint for client-side telemetry. Forward errors to Sentry, performance to analytics, usage to logs.
- **Hidden Complexity:** Payload validation. Batching (future). Retry logic (future). External service integration. Auth validation.
- **Module Value:** Decouples client from Sentry SDK (bundle size). Provides single telemetry ingestion point.

**Module 5: API Route Middleware** (`lib/with-observability.ts`)
- **Interface:** `withObservability(handler: RouteHandler, options?: { operation: string })`
- **Responsibility:** Higher-order function wrapping route handlers. Automatic timing, error handling, request tracing, structured logging.
- **Hidden Complexity:** TraceId generation (nanoid). Request/response inspection. Error serialization. Timing calculation. Success/failure determination (status code 2xx vs 4xx/5xx).
- **Module Value:** Zero-boilerplate observability for all routes. Apply once, get timing + errors + logging.

### Abstraction Layers

**Layer 1: Raw Telemetry** (console.log, @vercel/analytics track, Sentry captureException)
- **Vocabulary:** logs, events, errors, metrics, timestamps
- **Concepts:** Individual data points, no business meaning
- **Example:** `console.log({ message: "POST /api/upload", duration: 1230 })`

**Layer 2: Domain Operations** (lib/analytics.ts, lib/performance-monitor.ts, lib/vercel-logger.ts)
- **Vocabulary:** uploads, searches, embeddings, assets, favorites, tags
- **Concepts:** Business-meaningful operations, domain events
- **Transformation:** "POST /api/upload 1230ms" → `track('asset_uploaded', { duration: 1230, size: 2.5MB })`
- **Example:** `trackFlow('upload', 'blob_stored', { assetId, size })`

**Layer 3: User Flows** (components, route instrumentation)
- **Vocabulary:** upload flow, search flow, share flow, onboarding
- **Concepts:** Multi-step user journeys, conversion funnels
- **Transformation:** Individual events → flow state (initiated, in-progress, completed, abandoned)
- **Example:** Upload flow = file_select → upload_start → blob_store → embedding_generate → asset_searchable

**Layer 4: Product Insights** (Vercel/Sentry dashboards, manual queries)
- **Vocabulary:** conversion rates, feature adoption, churn triggers, abuse patterns, SLO compliance
- **Concepts:** Actionable product metrics, business KPIs
- **Transformation:** Flows → aggregated metrics (upload success rate = completed / initiated)
- **Example:** "85% upload success rate, 12% bounce on failed embeddings, 3 users sustaining >200 uploads/hour"

**Each layer changes vocabulary** - deep module design. Layer 3 doesn't know about console.log (Layer 1). Layer 4 doesn't know about @vercel/analytics API (Layer 2). Clean separation.

## Dependencies & Assumptions

### External Dependencies
- `@vercel/speed-insights@^1.1.0` (NEW - install via `pnpm add @vercel/speed-insights`)
- `@sentry/nextjs@^8.x` (NEW - install via `npx @sentry/wizard@latest -i nextjs`)
- `@vercel/analytics@1.5.0` (already installed)
- `nanoid@^5.1.6` (already installed - use for traceId generation)
- Vercel deployment (required for runtime logs, Speed Insights)
- Next.js 15.5.3 instrumentation API (`instrumentation.ts`, `onRequestError()`)

### System Assumptions
- **Scale:** Single-user MVP, <1000 uploads/day, <100 searches/hour
- **Retention:** 3-day Vercel log retention acceptable (no compliance requirements like SOC2, HIPAA)
- **Error volume:** <166 errors/day (5K Sentry free tier / 30 days), actual ~20-50/day expected
- **Network reliability:** Client `sendBeacon` API supported by 95%+ modern browsers
- **Budget:** $0/month indefinitely (upgrade trigger: Sentry quota exhausted, need session replay)

### Integration Requirements
- **Prisma middleware:** Add to `lib/db.ts` for query timing (`prisma.$use()`)
- **Next.js instrumentation:** Create `instrumentation.ts` for global error handler (`onRequestError()`)
- **React error boundaries:** Update existing boundaries (e.g., `ImageTileErrorBoundary`) to send telemetry
- **Vercel environment variables:**
  - `SENTRY_DSN` (from Sentry dashboard)
  - `SENTRY_AUTH_TOKEN` (for source maps upload)
  - `SENTRY_ORG`, `SENTRY_PROJECT` (from Sentry wizard)
- **Git ignore:** Add `.sentryclirc`, `sentry.properties` to `.gitignore`

### Constraints & Limitations
- **3-day log retention:** Acceptable for MVP. Workaround: Critical errors permanently stored in Sentry. Future: Export to S3 via script if compliance needed.
- **No custom log aggregation:** Use Vercel's built-in log search. No Elasticsearch, CloudWatch Insights, etc.
- **Sentry 5K/month limit:** Implement smart sampling if exceeded: 100% critical errors (upload, search, auth), 10% sampling for non-critical (tags, cache).
- **No session replay:** Not available on Sentry free tier. Upgrade trigger: debugging complex user-reported issues requires replay.
- **No distributed tracing:** Single-service architecture, so not needed. Future: Add OpenTelemetry if microservices.

## Implementation Phases

### Phase 1: Foundation (Days 1-2)
**Goal:** Install tooling, establish patterns, instrument 3 critical routes

**Tasks:**
1. Install dependencies:
   ```bash
   pnpm add @vercel/speed-insights
   npx @sentry/wizard@latest -i nextjs
   ```
2. Configure Sentry:
   - Create `instrumentation.ts` with `onRequestError()` hook
   - Update `app/error.tsx`, `app/global-error.tsx` to use Sentry
   - Test error capture (throw test error, verify in Sentry dashboard)
3. Create `lib/analytics.ts`:
   - Define event constants: `ANALYTICS_EVENTS = { UPLOAD_START, UPLOAD_COMPLETE, SEARCH_QUERY, ... }`
   - Implement `track()`, `trackTiming()`, `trackFlow()` wrappers
   - Add TypeScript types for event properties
4. Create `lib/performance-monitor.ts`:
   - Copy PerformanceTracker class from `lib/performance.ts`
   - Add Vercel Analytics integration: `trackTiming()` calls analytics
   - Export singleton: `getPerformanceMonitor()`
5. Enhance `lib/vercel-logger.ts`:
   - Add `withTraceId()` method for request correlation
   - Add `logTiming()` method for operation duration
   - Integrate Sentry: `logError()` calls `Sentry.captureException()`
6. Create `lib/with-observability.ts`:
   - HOF wrapping route handlers: `withObservability(handler)`
   - Generate traceId (nanoid), start timing, handle errors, log result
7. Instrument 3 critical routes:
   - `app/api/upload/route.ts` - already has logging, refactor to use new pattern
   - `app/api/search/route.ts` - add timing, error handling, structured logs
   - `app/api/assets/route.ts` - wrap in middleware, remove ad-hoc logging

**Validation:**
- Throw test error in `/api/search` → appears in Sentry dashboard with traceId
- Check Vercel Analytics → Speed Insights shows Web Vitals (LCP, CLS, etc.)
- Check Vercel logs → structured JSON logs with timing, traceId, operation
- Upload asset → track event appears in Vercel Analytics (custom events)

**Acceptance Criteria:**
- Sentry receives errors with full context (route, traceId, user, metadata)
- Speed Insights dashboard shows Web Vitals for at least 3 pages
- 3 routes log timing to Vercel in standardized format
- Upload flow tracked: `upload_start`, `upload_complete` events

### Phase 2: Comprehensive Coverage (Days 3-4)
**Goal:** Instrument all 25 API routes, add client-side flow tracking

**Tasks:**
1. Apply `withObservability` middleware to remaining 22 routes:
   - `/api/embeddings/image` (2 routes)
   - `/api/embeddings/text` (1 route)
   - `/api/tags/*` (4 routes)
   - `/api/assets/*` (8 routes)
   - `/api/cron/*` (3 routes)
   - `/api/health/*` (2 routes)
   - `/api/cache/stats`, `/api/telemetry`, `/api/sse/embedding-updates` (3 routes)
2. Add client-side flow tracking:
   - **Upload flow** (`components/upload-zone.tsx` or hooks/use-upload-queue.ts):
     - `upload_file_selected` (count, total size)
     - `upload_started` (assetId, size)
     - `upload_completed` (assetId, duration, size)
     - `upload_failed` (reason, size)
   - **Search flow** (`app/app/page.tsx` or hooks/use-search.ts):
     - `search_query_submitted` (query length, has filters)
     - `search_results_shown` (count, latency, has filters)
     - `search_result_clicked` (position, score, assetId)
     - `search_no_results` (query)
   - **Library interactions** (`app/app/page.tsx` or components):
     - `asset_favorited` (assetId)
     - `asset_unfavorited` (assetId)
     - `asset_deleted` (assetId, had tags)
     - `tag_added` (assetId, tagName)
     - `tag_removed` (assetId, tagName)
3. Update React error boundaries:
   - `components/image-tile-error-boundary.tsx` → send error to `/api/telemetry`
   - `components/share/share-page-error-boundary.tsx` → same pattern
   - Add component stack trace to error context
4. Add Prisma middleware for database query timing:
   - In `lib/db.ts`, add `prisma.$use()` middleware
   - Log query type (findMany, create, update), table, duration
   - Track slow queries (>100ms) separately
5. Instrument external API calls:
   - **Replicate API** (in upload route, embedding generation):
     - Wrap fetch with timing: `measureAsync('replicate_embedding', () => fetch(...))`
     - Log cost: `$0.00022 per embedding`
   - **Vercel Blob** (upload route):
     - Wrap `put()` with timing
     - Track upload size, URL generation

**Validation:**
- All 25 routes log timing + errors to Vercel logs
- User flows tracked end-to-end:
  - Upload: file select → start → complete appears in Analytics
  - Search: query → results → click appears in Analytics
  - Favorite: click → event appears in Analytics
- Error boundary triggers → error sent to Sentry with component name
- Database queries logged with table, operation, duration
- Replicate API timing + cost tracked

**Acceptance Criteria:**
- 100% API route coverage (25/25 routes instrumented)
- All core user flows trackable in Vercel Analytics dashboard
- Error boundaries integrated with telemetry (test by throwing error in component)
- Database queries visible in Vercel logs (check for "db:query" entries)
- External API timing visible (Replicate, Blob operations)

### Phase 3: Abuse Detection & SLO Monitoring (Days 5-6)
**Goal:** Usage analytics for abuse detection, SLO alerting setup

**Tasks:**
1. Create `/api/analytics/usage` endpoint:
   - Query Prisma for user upload stats:
     - Uploads in last hour (rolling window)
     - Uploads in last 24 hours
     - Uploads in last 7 days
   - Calculate cost: `uploadCount × $0.00022`
   - Detect sustained patterns: >200 uploads/hour for >2 consecutive hours
   - Return JSON: `{ uploadsLastHour, uploadsLastDay, estimatedCost, isSustainedHighRate }`
2. Add upload rate tracking to upload route:
   - After successful upload, log: `{ userId, timestamp, size, cost: 0.00022 }`
   - Tag as "usage_metric" for easy querying
3. Create Vercel log queries for SLO monitoring:
   - **Search P95 latency:** Query logs for `operation = "search"`, calculate P95 of `duration` field
   - **Upload P95 latency:** Query logs for `operation = "upload"`, calculate P95 of `duration` field
   - **Error rate:** Query logs for `level = "error"`, group by route, calculate errors / total requests
   - Save queries in OBSERVABILITY.md for copy-paste
4. Document alert thresholds (Phase 2 implementation):
   - **Phase 1 (now):** Monitor only, no rate limits, gather 1 month baseline data
   - **Phase 2 (after 1 month):** Implement soft limits:
     - 100 uploads/hour (supports bulk imports)
     - 500 uploads/day (weekend collection import)
     - Alert on sustained >200/hour for >2 hours (likely abuse)
   - Why these thresholds: 100/hour = import 500-image collection in 5 hours (legitimate power user). 36K/hour impossible for real users.
5. Add cost estimation dashboard query:
   - Query logs for upload events, sum `cost` field per user
   - Calculate daily burn rate, project monthly cost
   - Alert if user exceeds $5/month in embeddings (23K uploads)

**Validation:**
- Call `/api/analytics/usage` → returns correct upload counts (test with sample data)
- Run Vercel log query for search P95 → returns latency percentile
- Run Vercel log query for upload P95 → returns latency percentile
- Simulate high-rate uploads (script) → sustained pattern detected
- Cost estimation query returns accurate Replicate API costs

**Acceptance Criteria:**
- Usage analytics endpoint functional, returns upload stats per user
- SLO monitoring queries documented, return expected results
- Sustained high-rate detection working (test with >200 uploads/hour for 2 hours)
- Cost tracking accurate (validate against real Replicate bills)
- Documentation for Phase 2 limits complete (thresholds, implementation plan)

### Phase 4: Cleanup & Documentation (Day 7)
**Goal:** Remove dead code, document patterns, validate complete coverage

**Tasks:**
1. Delete unused code:
   - Remove `lib/performance.ts` (309 lines, 0 imports) - replaced by `performance-monitor.ts`
   - Remove TODO comments in `app/api/telemetry/route.ts` (now implemented)
   - Remove orphaned console.log calls (replace with structured logger)
2. Update project documentation:
   - Update `CLAUDE.md` with observability patterns section
   - Create `OBSERVABILITY.md` playbook:
     - How to query Vercel logs (examples: error rate, P95 latency, cost)
     - How to use Sentry (finding errors, setting alerts)
     - How to add tracking to new features (code examples)
     - Troubleshooting guide (common issues, solutions)
3. Add inline code examples:
   - Document how to instrument new API routes (template)
   - Document how to add new analytics events (pattern)
   - Add JSDoc comments to all observability modules
4. Validate 100% coverage:
   - Audit all 25 API routes → confirm all use `withObservability` or manual instrumentation
   - Audit all user-facing components → confirm all critical flows tracked
   - Check Sentry event volume → confirm <166 errors/day (5K/month budget)
5. Test error scenarios:
   - Sentry API down → telemetry doesn't break app
   - Network offline → sendBeacon queues events
   - Analytics blocked by ad blocker → no console errors
6. Create usage dashboard:
   - Vercel Analytics dashboard with custom events
   - Sentry dashboard with error grouping
   - Document how to access, interpret metrics

**Validation:**
- Zero `lib/performance.ts` references in codebase
- Zero TODO comments related to observability
- Zero raw console.log calls (all use structured logger)
- OBSERVABILITY.md complete, reviewed for clarity
- All 25 routes confirmed instrumented (manual audit)
- Sentry event volume <5K/month (check dashboard quota)

**Acceptance Criteria:**
- Dead code removed, codebase clean
- Documentation complete: CLAUDE.md updated, OBSERVABILITY.md created
- 100% API route coverage validated
- Error scenarios tested, no telemetry failures break app
- Usage dashboards accessible, documented

## Risks & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| **Sentry free tier exceeded (>5K errors/month)** | Medium | High | Implement smart sampling: 100% for critical errors (upload, search, auth failures), 10% sampling for non-critical (tags, cache misses). Add Sentry quota alert via email. Document upgrade trigger. |
| **Performance overhead degrades UX** | Low | Medium | Benchmark: analytics <5ms per event, timing <2ms per route. Use non-blocking `waitUntil`, client `sendBeacon`. Monitor Web Vitals - if LCP increases >100ms, reduce tracking. |
| **3-day log retention insufficient for debugging** | Low | Medium | Critical errors permanently stored in Sentry. Document log export script (Vercel CLI, save to S3). Acceptable for MVP scale (solo dev, low traffic). |
| **Telemetry failures break user flows** | Low | High | Wrap all telemetry in try-catch, never throw. Test error scenarios: Sentry down, network offline, localStorage blocked. Telemetry should degrade gracefully. |
| **Analytics PII leakage (GDPR violation)** | Medium | High | Audit all `track()` calls for PII. Sanitize URLs (strip query params). Hash user IDs (SHA-256). Add automated PII detection tests (regex for emails, tokens). Use `beforeSend` filter in Analytics. |
| **Unused instrumentation (metrics not actionable)** | Medium | Low | Document how to use metrics in OBSERVABILITY.md. Create example queries for common questions. Build habit: check dashboards daily. Quarterly review: remove unused events. |
| **Instrumentation drift (new routes not tracked)** | Medium | Medium | Add PR checklist: "Does this route use withObservability?" ESLint rule to enforce (future). Document pattern in CONTRIBUTING.md. |

## Key Decisions

### Decision 1: Native Vercel Stack vs Third-Party APM

**Choice:** Native Vercel (Analytics + Speed Insights) + Sentry free tier

**Alternatives Considered:**
- Datadog ($50/mo): APM, distributed tracing, custom dashboards, alerting
- New Relic ($100/mo): APM, error tracking, browser monitoring, alerting
- Custom solution: Build own analytics DB, logging system, dashboards

**Rationale:**
- **User Value:** Free tier covers MVP scale (5K errors/month = 166/day, actual ~20/day). Comprehensive coverage: analytics + performance + errors.
- **Simplicity:** Built-in Vercel integration (zero config for Speed Insights), Sentry Next.js wizard (5-minute setup), no agent configuration.
- **Explicitness:** Free tier constraints force prioritization (track critical paths, not everything). Makes dependencies explicit (no hidden APM agent).

**Trade-offs:**
- ❌ No distributed tracing (acceptable: single-service architecture)
- ❌ No session replay (upgrade trigger if user-reported bugs require it)
- ❌ 3-day log retention (acceptable: Sentry stores critical errors permanently)
- ✅ $0/month vs $50-200/month (budget constraint met)
- ✅ Scales naturally to paid tiers (same tools, just more quota)

### Decision 2: Replace lib/performance.ts vs Activate Existing Code

**Choice:** Delete `lib/performance.ts`, replace with new `lib/performance-monitor.ts`

**Alternatives Considered:**
- Activate existing class: Add imports, wire to analytics
- Delete entirely: Use only external tool timing (Vercel, Sentry)

**Rationale:**
- **User Value:** Existing code unused for months (0 imports) signals wrong abstraction. New module designed for current architecture (integrates Vercel Analytics).
- **Simplicity:** Starting fresh simpler than debugging why existing code never adopted. Clearer integration points.
- **Explicitness:** Explicit Vercel Analytics integration vs standalone utility that "could" integrate.

**Trade-offs:**
- ❌ Rewrite cost: ~2 hours (copy PerformanceTracker class, add analytics integration)
- ✅ vs ❌ Debug cost: Unknown hours to understand why unused, fix design issues
- ✅ Fresh start: API designed for actual usage patterns (measureAsync, trackTiming)
- ✅ Remove dead code: Delete 309 unused lines

### Decision 3: Comprehensive Coverage (25 routes) vs Critical Paths Only

**Choice:** Instrument all 25 API routes

**Alternatives Considered:**
- Top 5 critical routes: upload, search, assets, tags, health
- Progressive rollout: 5 routes per week

**Rationale:**
- **User Value:** Complete visibility prevents "mystery errors" in edge routes. Long-tail routes often have highest error rates (less tested).
- **Simplicity:** `withObservability` middleware makes adding routes trivial (~5 minutes each). Incremental approach adds decision fatigue ("is this route important enough?").
- **Explicitness:** Standardized pattern across entire codebase. No mixed instrumented/uninstrumented routes.

**Trade-offs:**
- ❌ 1 extra day implementation (25 routes × 5 min = 2 hours, plus testing)
- ✅ vs ❌ Incomplete coverage: Debugging errors in uninstrumented routes requires adding instrumentation anyway
- ✅ Future-proof: All new routes follow same pattern (copy-paste template)
- ✅ Completeness: Can confidently say "all routes monitored"

### Decision 4: Add Sentry vs Native Vercel Errors Only

**Choice:** Add Sentry free tier (5K events/month)

**Alternatives Considered:**
- Native Vercel runtime logs only (3-day retention)
- Log export script (Vercel CLI → S3, manual)

**Rationale:**
- **User Value:** Error grouping, deduplication, permanent storage (Vercel = 3 days). Search by error type, user, route. Stack trace symbolication with source maps.
- **Simplicity:** Zero-config Next.js integration (npx @sentry/wizard). Automatic source maps upload. First-class Next.js support (App Router, Edge Runtime, middleware).
- **Explicitness:** Free tier limit (5K/month) forces smart sampling (critical errors only). Makes error priorities explicit.

**Trade-offs:**
- ❌ One more dependency (adds ~50KB client bundle for error boundaries)
- ✅ vs ❌ Losing errors after 3 days (production bugs discovered 1 week later = no stack trace)
- ✅ Error grouping: "TypeError: Cannot read property 'X'" grouped across 100 occurrences
- ✅ Upgrade path: Same tool, just higher quota ($26/mo Team tier)

### Decision 5: Client + Server Performance vs Server-Only

**Choice:** Track both client (Web Vitals, user flows) and server (API timing)

**Alternatives Considered:**
- Server-only: API route timing, database queries (simpler)
- Client-only: Web Vitals, user-perceived latency (limited insight)

**Rationale:**
- **User Value:** User experience = client performance (LCP, INP). System health = server performance (API SLOs). Need both for complete picture.
- **Simplicity:** @vercel/speed-insights is automatic (zero code). Client analytics tracking minimal (<5 minutes per flow).
- **Explicitness:** Explicit separation: client = user experience metrics, server = system health metrics. Different dashboards, different alerts.

**Trade-offs:**
- ❌ Slightly more code: Client tracking hooks, sendBeacon calls
- ✅ Complete picture: Diagnose "app feels slow" (client) vs "API is slow" (server)
- ✅ Automatic Web Vitals: Speed Insights requires zero configuration
- ✅ User-centric metrics: LCP, INP directly correlate with user satisfaction

## Next Steps After Approval

Run `/plan` to break down implementation into executable tasks with specific file paths, code changes, and validation steps.