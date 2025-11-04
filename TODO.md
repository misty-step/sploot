# TODO: Comprehensive Observability & Analytics Implementation

## Context

**Architecture**: Layered Observability Modules with HOF Middleware Pattern (see DESIGN.md)
**PRD**: TASK.md - Comprehensive observability covering analytics, performance, errors
**Key Pattern**: Reuses upload service orchestration pattern (thin coordinator, specialized services)
**Test Pattern**: `__tests__/lib/[module].test.ts` (following existing convention)

**Core Modules** (5 independent implementations):
1. Analytics Service (`lib/analytics.ts`) - Type-safe event tracking
2. Performance Monitor (`lib/performance-monitor.ts`) - Timing with percentiles
3. Observability Logger (`lib/observability-logger.ts`) - Structured logging + Sentry
4. Route Middleware (`lib/with-observability.ts`) - HOF wrapper for automatic instrumentation
5. Telemetry API (`app/api/telemetry/route.ts`) - Client-side error/performance collection

## Phase 1: Foundation & Core Modules (Days 1-2)

### Setup & Dependencies

- [x] Install @vercel/speed-insights and configure Sentry
  ```
  Commands:
    pnpm add @vercel/speed-insights
    npx @sentry/wizard@latest -i nextjs

  Files Created by Wizard:
    - instrumentation.ts
    - sentry.client.config.ts
    - sentry.server.config.ts
    - sentry.edge.config.ts
    - .sentryclirc (gitignored)
    - sentry.properties (gitignored)
    - Updates: next.config.ts, package.json

  Success:
    - pnpm install completes without errors
    - Sentry wizard completes, test error captured in dashboard
    - Build succeeds with new packages

  Test: Run `pnpm build`, verify no errors. Visit Sentry dashboard, throw test error, confirm capture.

  Time: 30min
  ```

- [x] Add SpeedInsights to app/layout.tsx
  ```
  File: app/layout.tsx
  Architecture: Client component import, render after {children}
  Pattern: Follow existing Analytics component integration (line 134)

  Code:
    import { SpeedInsights } from '@vercel/speed-insights/next';

    // In return statement, after <Analytics />:
    <SpeedInsights />

  Success: Component renders, no console errors, Vercel dashboard shows Web Vitals
  Test: Manual - Deploy to preview, check Vercel dashboard for Speed Insights data
  Time: 10min
  ```

- [x] Update .gitignore with Sentry files
  ```
  File: .gitignore
  Lines to Add:
    # Sentry
    .sentryclirc
    sentry.properties

  Success: Files added, `git status` doesn't show Sentry config files
  Time: 5min
  ```

### Module 1: Analytics Service

- [x] Implement lib/analytics.ts with type-safe event tracking
  ```
  File: lib/analytics.ts (NEW)
  Architecture: Implements Module 1 interface from DESIGN.md section "Module 1: Analytics Service"
  Pseudocode: See DESIGN.md "Algorithm 2: Analytics Event Tracking with PII Sanitization"
  Pattern: Similar to lib/share.ts (utility functions with error handling)

  Public Interface (from DESIGN.md):
    - type AnalyticsEvent (discriminated union - 13 event types)
    - export const ANALYTICS_EVENTS (event name constants)
    - export function track(event: AnalyticsEvent): void
    - export function trackServer(event: AnalyticsEvent): Promise<void>
    - export function trackFlow(flowName, step, metadata): void
    - export function trackTiming(operation, duration, success, metadata): void

  Internal Functions (hidden complexity):
    - sanitizeEventProperties(props): Redact emails, hash user IDs, strip query params
    - isValidAnalyticsEvent(event): Runtime validation against type union
    - checkDoNotTrack(): Client-side only, return navigator.doNotTrack === '1'

  Dependencies:
    - @vercel/analytics (client)
    - @vercel/analytics/server (server)
    - crypto (for SHA-256 hashing)

  Success:
    - All 13 AnalyticsEvent types defined with properties
    - track() validates events, sanitizes PII, calls Vercel API
    - trackServer() uses waitUntil pattern (non-blocking)
    - Do Not Track respected (client-side only)
    - All functions wrapped in try-catch (never throw)

  Test Strategy:
    Unit tests in __tests__/lib/analytics.test.ts:
      - Event validation (valid events pass, invalid rejected)
      - PII sanitization (emails redacted, user IDs hashed, URLs stripped)
      - Do Not Track (tracking skipped when enabled)
      - Server vs client detection (calls correct API)
    Mock: @vercel/analytics, navigator.sendBeacon

  Time: 2hr
  ```

- [x] Write unit tests for lib/analytics.ts
  ```
  File: __tests__/lib/analytics.test.ts (NEW)
  Pattern: Follow __tests__/lib/metrics-collector.test.ts structure

  Test Cases:
    1. Valid events pass validation
    2. Invalid events rejected with console.warn
    3. PII sanitization: emails → '[REDACTED]', user IDs → hashed
    4. URL sanitization: query params stripped
    5. Do Not Track: tracking skipped when navigator.doNotTrack === '1'
    6. Server vs client: calls correct Vercel API based on environment
    7. Error handling: Vercel API failure caught, logged, doesn't throw

  Mocks:
    - jest.mock('@vercel/analytics')
    - jest.mock('@vercel/analytics/server')
    - jest.spyOn(console, 'warn')

  Success: All tests pass, coverage >90%
  Time: 1hr
  ```

### Module 2: Performance Monitor

- [x] Implement lib/performance-monitor.ts with timing and percentiles
  ```
  File: lib/performance-monitor.ts (NEW)
  Architecture: Implements Module 2 interface from DESIGN.md "Module 2: Performance Monitor"
  Pseudocode: Copy PerformanceTracker class from lib/performance.ts, add Analytics integration
  Pattern: Singleton pattern like existing (getGlobalPerformanceTracker)

  Public Interface (from DESIGN.md):
    - export function getPerformanceMonitor(): PerformanceMonitor
    - class PerformanceMonitor {
        startTiming(operation: string): void
        endTiming(operation: string): number | undefined
        measureAsync<T>(operation: string, fn: () => Promise<T>): Promise<T>
        measureSync<T>(operation: string, fn: () => T): T
        getSummary(operation: string): PerformanceSummary | null
        getAllSummaries(): PerformanceSummary[]
        reset(operation?: string): void
      }
    - export const PERF_OPERATIONS (operation name constants)

  Internal Implementation (from lib/performance.ts):
    - Circular buffer: Map<string, number[]> (last 100 samples)
    - Percentile calculations: sort samples, index at Math.ceil(length * percentile)
    - Debug mode: localStorage.getItem('debug_performance') === 'true' → console.log

  New: Analytics Integration
    - Call trackTiming() from lib/analytics.ts on endTiming() and measureAsync()
    - Include operation name, duration, success (always true for perf metrics)

  Dependencies:
    - lib/analytics.ts (trackTiming function)

  Success:
    - PerformanceMonitor class with all methods implemented
    - Circular buffer limits samples to 100 per operation
    - Percentile calculations (P50, P95, P99) correct
    - measureAsync() times async operations accurately
    - Analytics integration: trackTiming() called on completion
    - Debug mode works (localStorage flag enables console.log)

  Test Strategy:
    Unit tests in __tests__/lib/performance-monitor.test.ts:
      - startTiming() + endTiming() calculates correct duration
      - measureAsync() times async function correctly
      - Circular buffer keeps last 100 samples, discards oldest
      - Percentile calculations match expected values (P50, P95, P99)
      - getSummary() returns correct statistics
      - Analytics integration: trackTiming() called with correct data
    Mock: lib/analytics.ts (trackTiming)

  Time: 1.5hr
  ```

- [x] Write unit tests for lib/performance-monitor.ts
  ```
  File: __tests__/lib/performance-monitor.test.ts (NEW)
  Pattern: Follow __tests__/lib/seeded-random.test.ts structure (pure functions)

  Test Cases:
    1. startTiming() + endTiming() measures duration correctly
    2. endTiming() without startTiming() logs warning, returns undefined
    3. measureAsync() times async operations (use setTimeout mock)
    4. Circular buffer limits to 100 samples
    5. Percentile calculations (P50, P95, P99) correct for known datasets
    6. getSummary() returns all statistics
    7. Analytics integration: trackTiming() called on endTiming()
    8. Debug mode: localStorage flag enables console logging

  Mocks:
    - jest.mock('lib/analytics', () => ({ trackTiming: jest.fn() }))
    - jest.spyOn(console, 'log')

  Success: All tests pass, coverage >90%
  Time: 1hr
  ```

### Module 3: Observability Logger

- [x] Implement lib/observability-logger.ts with traceId and Sentry
  ```
  File: lib/observability-logger.ts (NEW)
  Architecture: Implements Module 3 interface from DESIGN.md "Module 3: Structured Logger"
  Base: Copy lib/vercel-logger.ts, enhance with traceId and timing methods
  Pattern: Class-based logger with factory function (withTraceId)

  Public Interface (from DESIGN.md):
    - export function logInfo(context: string, metadata?): void
    - export function logError(context: string, error: unknown, metadata?): void
    - export function logTiming(operation, duration, success, metadata?): void
    - export function withTraceId(traceId: string): ObservabilityLogger
    - export interface ObservabilityLogger { /* same methods */ }
    - export const logger: ObservabilityLogger (default instance, no traceId)

  Internal Implementation:
    - Class ObservabilityLoggerImpl implements ObservabilityLogger
    - private traceId?: string (instance variable)
    - JSON serialization: JSON.stringify() for all log entries
    - Error normalization: Handle Error, string, unknown → { name, message, stack }
    - Environment context: Add nodeEnv, vercelRegion, vercelUrl from process.env
    - Sentry integration: Conditional import, call Sentry.captureException() in logError()
    - Console routing: logInfo → console.log, logError → console.error

  Dependencies:
    - @sentry/nextjs (conditional import, graceful if missing)

  Success:
    - All log methods output structured JSON
    - traceId included in log entries when set (via withTraceId)
    - Sentry.captureException() called on logError() (if Sentry available)
    - Error serialization handles Error objects, strings, unknown types
    - Graceful degradation if Sentry unavailable

  Test Strategy:
    Unit tests in __tests__/lib/observability-logger.test.ts:
      - logInfo() outputs JSON to console.log with correct structure
      - logError() outputs JSON to console.error + calls Sentry
      - logTiming() outputs JSON with duration and success fields
      - withTraceId() creates logger with traceId in all log entries
      - Error serialization: Error object → { name, message, stack }
      - Sentry unavailable: logs locally only, doesn't throw
    Mock: @sentry/nextjs, console.log, console.error

  Time: 1.5hr
  ```

- [x] Write unit tests for lib/observability-logger.ts
  ```
  File: __tests__/lib/observability-logger.test.ts (NEW)
  Pattern: Follow __tests__/lib/upload/deduplication-service.test.ts (service with external deps)

  Test Cases:
    1. logInfo() outputs JSON to console.log
    2. logError() outputs JSON to console.error
    3. logError() calls Sentry.captureException() with error + context
    4. logTiming() outputs JSON with duration, success, operation
    5. withTraceId() creates logger with traceId in all entries
    6. Error serialization: Error → { name, message, stack }
    7. Error serialization: string → { name: 'Error', message: string }
    8. Sentry unavailable: catches import error, logs locally

  Mocks:
    - jest.mock('@sentry/nextjs', () => ({ captureException: jest.fn() }))
    - jest.spyOn(console, 'log')
    - jest.spyOn(console, 'error')

  Success: All tests pass, coverage >90%
  Time: 1hr
  ```

### Module 4: Route Middleware

- [x] Implement lib/with-observability.ts HOF wrapper
  ```
  File: lib/with-observability.ts (NEW)
  Architecture: Implements Module 4 interface from DESIGN.md "Module 4: API Route Middleware"
  Pseudocode: See DESIGN.md "Algorithm 1: withObservability HOF Wrapper"
  Pattern: HOF like hooks (e.g., hooks pattern wrapping functions)

  Public Interface (from DESIGN.md):
    - export function withObservability<T>(
        handler: RouteHandler<T>,
        options?: ObservabilityOptions
      ): RouteHandler<T>
    - type RouteHandler = (req: NextRequest, context?) => Promise<NextResponse>
    - interface ObservabilityOptions {
        operation?: string
        skipTiming?: boolean
        skipLogging?: boolean
        metadata?: Record<string, any>
      }

  Internal Implementation (from DESIGN.md Algorithm 1):
    1. Generate traceId: nanoid() (12 chars, URL-safe)
    2. Extract operation: options.operation || pathname from req.url
    3. Create logger: withTraceId(traceId)
    4. Log request start (unless skipLogging)
    5. Start performance timing (unless skipTiming)
    6. Execute handler (try-catch)
    7. Calculate duration, extract status code from response
    8. Log timing and result
    9. On error: Call unstable_rethrow(), log error with traceId, rethrow

  Dependencies:
    - nanoid (for traceId generation)
    - lib/observability-logger.ts (withTraceId, logger)
    - lib/performance-monitor.ts (getPerformanceMonitor)
    - next/navigation (unstable_rethrow)

  Success:
    - Returns wrapped handler with same signature
    - Generates unique traceId per request
    - Logs request start, timing, result
    - Errors logged with traceId, then rethrown (preserves Next.js error handling)
    - unstable_rethrow() called before catch (allows Next.js redirects/not-found)
    - Options (skipTiming, skipLogging) respected

  Test Strategy:
    Unit tests in __tests__/lib/with-observability.test.ts:
      - Wrapped handler returns same result as original
      - traceId generated (unique per call)
      - Timing calculated correctly (startTime to endTime)
      - Success determination: 200-399 = success, 400-599 = failure
      - Error handling: logs error with traceId, then rethrows
      - unstable_rethrow() called for Next.js errors
      - Options: skipTiming and skipLogging work
    Mock: NextRequest, NextResponse, nanoid, logger, perfMonitor

  Time: 2hr
  ```

- [x] Write unit tests for lib/with-observability.ts
  ```
  File: __tests__/lib/with-observability.test.ts (NEW)
  Pattern: Follow __tests__/hooks/use-file-validation.test.ts (function testing)

  Test Cases:
    1. Wrapped handler returns original handler's response
    2. traceId generated (verify logger.withTraceId called)
    3. Timing calculated: duration = endTime - startTime
    4. Status code 200 → logged as success
    5. Status code 500 → logged as failure
    6. Error thrown → logged with traceId, then rethrown
    7. unstable_rethrow() called before catch
    8. Options.skipTiming: timing skipped
    9. Options.skipLogging: logging skipped
    10. Options.operation: custom operation name used

  Mocks:
    - jest.mock('nanoid', () => ({ nanoid: jest.fn(() => 'test-trace-id') }))
    - jest.mock('lib/observability-logger')
    - jest.mock('lib/performance-monitor')
    - Mock NextRequest and NextResponse

  Success: All tests pass, coverage >90%
  Time: 1.5hr
  ```

### Module 5: Telemetry API Enhancement

- [x] Enhance app/api/telemetry/route.ts with forwarding logic
  ```
  File: app/api/telemetry/route.ts (MODIFY)
  Architecture: Implements Module 5 interface from DESIGN.md "Module 5: Telemetry API Endpoint"
  Current: Stubbed with TODO comment (line 38)
  Pattern: Follow app/api/upload/route.ts (service orchestration with validation)

  Interface (HTTP API from DESIGN.md):
    POST /api/telemetry
    Body: { type: 'error' | 'performance' | 'usage', payload: <type-specific> }

    Error payload: { name, message, stack, componentStack, url, timestamp }
    Performance payload: { operation, duration, success, metadata }
    Usage payload: { userId, action, count, timestamp, metadata }

  Implementation:
    1. Auth: Use existing getAuth(), require userId (return 401 if missing)
    2. Validation: Type guards for error/performance/usage payloads (return 400 if invalid)
    3. Error forwarding: Call Sentry.captureException() with error + user context
    4. Performance forwarding: Call trackTiming() from lib/analytics.ts
    5. Usage forwarding: Call logger.logInfo() with "usage_metric" tag
    6. Non-blocking: Wrap all forwarding in try-catch, return 200 even on partial failure

  Dependencies:
    - @sentry/nextjs (captureException)
    - lib/analytics.ts (trackTiming)
    - lib/observability-logger.ts (logger)
    - @/lib/auth/server (getAuth)

  Success:
    - POST with valid error payload → Forwarded to Sentry, returns 200
    - POST with valid performance payload → Tracked in Analytics, returns 200
    - POST with valid usage payload → Logged with "usage_metric", returns 200
    - POST without auth → Returns 401
    - POST with invalid payload → Returns 400
    - Sentry failure → Logs error, returns 200 (non-blocking)

  Test Strategy:
    Integration tests in __tests__/api/telemetry.integration.test.ts:
      - Error payload forwarded to Sentry
      - Performance payload tracked in Analytics
      - Usage payload logged with tag
      - Auth required (401 without token)
      - Invalid payload rejected (400)
      - Sentry unavailable → returns 200 (graceful degradation)
    Mock: Sentry, Analytics, Auth

  Time: 1hr
  ```

- [x] Write integration tests for app/api/telemetry/route.ts
  ```
  File: __tests__/api/telemetry.integration.test.ts (NEW)
  Pattern: Follow __tests__/api/* integration test structure

  Test Cases:
    1. POST /api/telemetry with error payload → Sentry.captureException called
    2. POST /api/telemetry with performance payload → trackTiming called
    3. POST /api/telemetry with usage payload → logger.logInfo called
    4. POST without auth token → Returns 401
    5. POST with invalid payload (missing fields) → Returns 400
    6. POST with unknown type → Returns 400
    7. Sentry API failure → Logs error, returns 200 (non-blocking)

  Mocks:
    - jest.mock('@sentry/nextjs')
    - jest.mock('lib/analytics')
    - jest.mock('@/lib/auth/server', () => ({ getAuth: jest.fn() }))

  Success: All tests pass, coverage >90%
  Time: 1hr
  ```

### Critical Routes Instrumentation

- [x] Wrap 3 critical routes with withObservability
  ```
  Files:
    - app/api/upload/route.ts (line 42, export async function POST)
    - app/api/search/route.ts (line ~20, export async function POST)
    - app/api/assets/route.ts (line ~15, export async function GET)

  Architecture: Wrap existing handlers with withObservability HOF
  Pattern:
    // Before:
    export async function POST(req: NextRequest) { ... }

    // After:
    import { withObservability } from '@/lib/with-observability';

    async function handler(req: NextRequest) { ... }
    export const POST = withObservability(handler, { operation: 'upload' });

  Success:
    - All 3 routes wrapped
    - Build succeeds (no TypeScript errors)
    - Routes function identically (no behavior change)
    - Logs appear in Vercel with traceId (verify in preview deployment)

  Test Strategy:
    Manual verification:
      - Deploy to preview
      - Call each route (upload, search, get assets)
      - Check Vercel logs for structured JSON with traceId
      - Verify timing appears in logs

  Time: 30min
  ```

### Prisma Middleware Integration

- [x] Add Prisma middleware for database query timing
  ```
  File: lib/db.ts (MODIFY)
  Architecture: Integration from DESIGN.md "Database: Prisma Middleware" section
  Pseudocode: See DESIGN.md "Algorithm 3: Prisma Middleware for Query Timing"
  Location: After PrismaClient initialization (line 24, after export const prisma)

  Implementation (from DESIGN.md):
    if (prismaClient) {
      const { getPerformanceMonitor } = require('./performance-monitor');
      const { logger } = require('./observability-logger');

      prismaClient.$use(async (params, next) => {
        const operation = `db:${params.model}:${params.action}`;
        const startTime = Date.now();
        const perfMonitor = getPerformanceMonitor();

        perfMonitor.startTiming(operation);

        try {
          const result = await next(params);
          const duration = Date.now() - startTime;
          perfMonitor.endTiming(operation);

          if (duration > 100) {
            logger.logInfo('Slow query detected', { model: params.model, action: params.action, duration });
          }

          return result;
        } catch (error) {
          const duration = Date.now() - startTime;
          perfMonitor.endTiming(operation);
          logger.logError('Query failed', error, { model: params.model, action: params.action, duration });
          throw error;
        }
      });
    }

  Dependencies:
    - lib/performance-monitor.ts (getPerformanceMonitor)
    - lib/observability-logger.ts (logger)

  Success:
    - Middleware registered (prismaClient.$use called)
    - All queries timed automatically
    - Slow queries (>100ms) logged
    - Query failures logged with error details
    - Build succeeds, no TypeScript errors

  Test Strategy:
    Integration test in __tests__/lib/db.integration.test.ts:
      - Execute slow query (add setTimeout in middleware test)
      - Verify logger.logInfo called with "Slow query detected"
      - Execute failing query
      - Verify logger.logError called with query details
    Mock: logger, perfMonitor

  Time: 30min
  ```

---

## Phase 2: Comprehensive Coverage (Days 3-4)

### Remaining API Routes Instrumentation

- [ ] Wrap remaining 22 API routes with withObservability
  ```
  Files (25 total routes, 3 done in Phase 1, 22 remaining):
    app/api/embeddings/image/route.ts
    app/api/embeddings/text/route.ts
    app/api/tags/route.ts
    app/api/tags/[tagId]/route.ts
    app/api/assets/[id]/route.ts
    app/api/assets/[id]/share/route.ts
    app/api/assets/[id]/tags/route.ts
    app/api/assets/[id]/generate-embedding/route.ts
    app/api/assets/[id]/embedding-status/route.ts
    app/api/assets/batch/embedding-status/route.ts
    app/api/assets/audit/route.ts
    app/api/cron/purge-deleted-assets/route.ts
    app/api/cron/process-embeddings/route.ts
    app/api/cron/audit-assets/route.ts
    app/api/search/advanced/route.ts
    app/api/health/route.ts
    app/api/health/services/route.ts
    app/api/cache/stats/route.ts
    app/api/upload-url/route.ts
    app/api/upload/check/route.ts
    app/api/sse/embedding-updates/route.ts
    app/api/telemetry/route.ts (already done in Phase 1)

  Pattern (same as Phase 1):
    // Before:
    export async function POST(req: NextRequest) { ... }

    // After:
    import { withObservability } from '@/lib/with-observability';

    async function handler(req: NextRequest, context?) { ... }
    export const POST = withObservability(handler, {
      operation: 'embeddings:image' // or appropriate name
    });

  Success:
    - All 22 remaining routes wrapped
    - Build succeeds
    - Routes function identically
    - Logs appear in Vercel with traceId for all routes

  Test: Deploy to preview, call each route, verify logs
  Time: 2hr (5min per route × 22 routes + buffer)
  ```

### Client-Side Analytics: Upload Flow

- [ ] Add analytics tracking to upload flow (hooks/use-upload-queue.ts)
  ```
  File: hooks/use-upload-queue.ts (MODIFY)
  Architecture: Client-side flow tracking from DESIGN.md "FR1: User Behavior Analytics"
  Events to Track:
    - upload_file_selected: When user selects files (count, total size)
    - upload_started: When upload begins (assetId, size)
    - upload_completed: When upload finishes (assetId, duration, size)
    - upload_failed: When upload fails (reason, size)

  Implementation Locations:
    - File selection: In handleFileSelect or wherever files are added to queue
    - Upload start: In uploadFile function, before API call
    - Upload complete: In uploadFile function, after successful API response
    - Upload fail: In uploadFile function, catch block

  Dependencies:
    - lib/analytics.ts (track function)

  Success:
    - All 4 upload events tracked
    - Events include correct metadata (size, duration, etc.)
    - No errors in console
    - Events visible in Vercel Analytics dashboard

  Test Strategy:
    Manual verification:
      - Upload file in dev/preview
      - Open browser DevTools Network tab
      - Verify sendBeacon requests to Vercel Analytics
      - Check Vercel Analytics dashboard for events

  Time: 45min
  ```

### Client-Side Analytics: Search Flow

- [ ] Add analytics tracking to search flow (app/app/page.tsx or hooks)
  ```
  File: app/app/page.tsx (MODIFY) or hooks/use-search.ts if exists
  Architecture: Client-side flow tracking from DESIGN.md "FR1: User Behavior Analytics"
  Events to Track:
    - search_query_submitted: When search initiated (query length, has filters)
    - search_results_shown: When results displayed (count, latency, has filters)
    - search_result_clicked: When user clicks result (position, score, assetId)
    - search_no_results: When search returns 0 results (query)

  Implementation Locations:
    - Query submitted: In search input onChange or onSubmit
    - Results shown: After successful API response
    - Result clicked: In image grid onClick handler
    - No results: In API response handler, if count === 0

  Dependencies:
    - lib/analytics.ts (track function)

  Success:
    - All 4 search events tracked
    - Events include correct metadata
    - No errors in console
    - Events visible in Vercel Analytics dashboard

  Test Strategy:
    Manual verification:
      - Search in dev/preview
      - Click result
      - Verify events in Vercel Analytics

  Time: 45min
  ```

### Client-Side Analytics: Library Interactions

- [ ] Add analytics tracking to library interactions (hooks/use-assets.ts)
  ```
  File: hooks/use-assets.ts (MODIFY)
  Architecture: Client-side flow tracking from DESIGN.md "FR1: User Behavior Analytics"
  Events to Track:
    - asset_favorited: When user favorites asset (assetId)
    - asset_unfavorited: When user unfavorites (assetId)
    - asset_deleted: When user deletes (assetId, had tags)
    - tag_added: When tag added to asset (assetId, tagName)
    - tag_removed: When tag removed (assetId, tagName)

  Implementation Locations:
    - Favorite: In toggleFavorite mutation, after successful API response
    - Delete: In deleteAsset mutation, after successful API response
    - Tags: In addTag/removeTag mutations, after successful API responses

  Dependencies:
    - lib/analytics.ts (track function)

  Success:
    - All 5 library interaction events tracked
    - Events include correct metadata (assetId, tagName, hadTags)
    - No errors in console
    - Events visible in Vercel Analytics dashboard

  Test Strategy:
    Manual verification:
      - Favorite, delete, add/remove tags in dev/preview
      - Verify events in Vercel Analytics dashboard

  Time: 45min
  ```

### Error Boundaries Telemetry Integration

- [ ] Update error boundaries to send telemetry
  ```
  Files:
    - components/image-tile-error-boundary.tsx (MODIFY)
    - components/share/share-page-error-boundary.tsx (MODIFY)

  Architecture: React error boundaries from DESIGN.md "Algorithm 4: Client Error Boundary with Telemetry"
  Pattern: Add componentDidCatch method if missing, send to /api/telemetry via sendBeacon

  Implementation (from DESIGN.md):
    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
      // Send to telemetry endpoint (non-blocking)
      if (navigator.sendBeacon) {
        const blob = new Blob([JSON.stringify({
          type: 'error',
          payload: {
            name: error.name,
            message: error.message,
            stack: error.stack,
            componentStack: errorInfo.componentStack,
            url: window.location.href,
            timestamp: Date.now(),
          },
        })], { type: 'application/json' });

        navigator.sendBeacon('/api/telemetry', blob);
      }

      console.error('Error boundary caught error:', error, errorInfo);
      this.setState({ hasError: true });
    }

  Success:
    - Both error boundaries send telemetry on error
    - Uses sendBeacon with Blob (correct content-type)
    - Non-blocking (wrapped in if check, no throw)
    - Errors appear in Sentry dashboard

  Test Strategy:
    Manual verification:
      - Trigger component error (throw in child component)
      - Check Network tab for sendBeacon request
      - Verify error in Sentry dashboard

  Time: 30min
  ```

### Next.js Error Boundaries

- [ ] Create app/error.tsx with Sentry integration
  ```
  File: app/error.tsx (NEW)
  Architecture: Next.js App Router error boundary from DESIGN.md "Integration Points"
  Pattern: Follow Next.js App Router error.tsx convention

  Implementation:
    'use client';

    import { useEffect } from 'react';
    import * as Sentry from '@sentry/nextjs';

    export default function Error({
      error,
      reset,
    }: {
      error: Error & { digest?: string };
      reset: () => void;
    }) {
      useEffect(() => {
        Sentry.captureException(error);
      }, [error]);

      return (
        <div>
          <h2>Something went wrong!</h2>
          <button onClick={() => reset()}>Try again</button>
        </div>
      );
    }

  Success:
    - Error boundary catches route errors
    - Errors sent to Sentry
    - User sees friendly error UI
    - Reset button works

  Test: Throw error in route, verify Sentry capture, check error UI
  Time: 15min
  ```

- [ ] Create app/global-error.tsx for root-level errors
  ```
  File: app/global-error.tsx (NEW)
  Architecture: Next.js root error boundary from DESIGN.md "Integration Points"
  Pattern: Similar to error.tsx but wraps entire app (including root layout)

  Implementation:
    'use client';

    import * as Sentry from '@sentry/nextjs';
    import NextError from 'next/error';
    import { useEffect } from 'react';

    export default function GlobalError({
      error,
    }: {
      error: Error & { digest?: string };
    }) {
      useEffect(() => {
        Sentry.captureException(error);
      }, [error]);

      return (
        <html>
          <body>
            <NextError statusCode={500} />
          </body>
        </html>
      );
    }

  Success:
    - Global error boundary catches root layout errors
    - Errors sent to Sentry
    - User sees error page

  Test: Throw error in root layout, verify Sentry capture
  Time: 10min
  ```

---

## Phase 3: Abuse Detection & Monitoring (Days 5-6)

### Usage Analytics Endpoint

- [ ] Create app/api/analytics/usage endpoint for abuse detection
  ```
  File: app/api/analytics/usage/route.ts (NEW)
  Architecture: From TASK.md "Phase 3: Abuse Detection & SLO Monitoring"
  Pattern: Follow app/api/cache/stats/route.ts (query aggregation endpoint)

  Interface:
    GET /api/analytics/usage
    Response: {
      uploadsLastHour: number
      uploadsLastDay: number
      uploadsLast7Days: number
      estimatedCost: number
      isSustainedHighRate: boolean
    }

  Implementation:
    1. Auth: Require userId
    2. Query Prisma:
       - Count assets created in last hour (createdAt > now - 1 hour)
       - Count assets created in last 24 hours
       - Count assets created in last 7 days
    3. Calculate cost: uploadCount × $0.00022
    4. Detect sustained pattern:
       - Query uploads by hour for last 2 hours
       - If both hours > 200 uploads: isSustainedHighRate = true
    5. Return JSON

  Dependencies:
    - @/lib/auth/server (getAuth)
    - @prisma/client (prisma)

  Success:
    - GET /api/analytics/usage returns correct counts
    - Cost calculated correctly ($0.00022 per upload)
    - Sustained pattern detection works (>200/hour for 2 consecutive hours)
    - Auth required (401 without token)

  Test Strategy:
    Integration test:
      - Seed database with test uploads (different timestamps)
      - Call endpoint, verify counts match expected
      - Test sustained pattern detection (seed >200 uploads in 2 consecutive hours)

  Time: 1hr
  ```

### SLO Monitoring Documentation

- [ ] Document Vercel log queries for SLO monitoring in OBSERVABILITY.md
  ```
  File: OBSERVABILITY.md (NEW)
  Architecture: From TASK.md "Phase 3: Abuse Detection & SLO Monitoring"
  Pattern: Operational playbook with queries and troubleshooting

  Sections:
    1. Introduction: What this playbook covers
    2. SLO Monitoring Queries:
       - Search P95 latency: Query logs for operation="search", calculate P95 of duration
       - Upload P95 latency: Query logs for operation="upload", calculate P95 of duration
       - Error rate: Query logs for level="error", group by route
    3. Cost Monitoring Queries:
       - Daily burn rate: Query logs for "usage_metric" tag, sum cost field per user
       - Monthly projection: Daily burn × 30
    4. Alert Thresholds (Phase 2 implementation):
       - 100 uploads/hour (supports bulk imports)
       - 500 uploads/day (weekend collection import)
       - Sustained >200/hour for >2 hours (likely abuse)
    5. How to Query Vercel Logs:
       - Access logs: Vercel Dashboard → Project → Logs
       - Filter by operation, level, traceId
       - Export logs for analysis
    6. How to Use Sentry:
       - Finding errors: Sentry Dashboard → Issues
       - Setting alerts: Sentry Dashboard → Alerts
       - Error grouping and deduplication
    7. Troubleshooting Guide:
       - "No logs appearing": Check traceId, verify instrumentation
       - "Missing events": Check Do Not Track, verify Analytics installed
       - "Sentry not capturing": Check SENTRY_DSN env var, verify initialization

  Success:
    - Document created with all sections
    - Queries are copy-paste ready (with placeholders for project-specific values)
    - Troubleshooting guide covers common issues

  Time: 2hr
  ```

---

## Phase 4: Cleanup & Documentation (Day 7)

### Code Cleanup

- [ ] Delete unused lib/performance.ts
  ```
  File: lib/performance.ts (DELETE)
  Reason: Replaced by lib/performance-monitor.ts (0 imports, 309 unused lines)

  Verification:
    - grep -r "from.*performance'" --include="*.ts" --include="*.tsx"
    - Should return 0 matches (except performance-monitor.ts)

  Success: File deleted, no import errors, build succeeds
  Time: 5min
  ```

- [ ] Remove TODO comment from app/api/telemetry/route.ts
  ```
  File: app/api/telemetry/route.ts
  Line: 38-39
  Change: Delete "// TODO: Send to external monitoring service" comment

  Success: Comment removed (already implemented in Phase 1)
  Time: 2min
  ```

- [ ] Audit and remove raw console.log calls in favor of structured logger
  ```
  Files: All application files (lib/, app/, components/, hooks/)
  Pattern: Find console.log calls, replace with logger.logInfo

  Commands:
    grep -r "console\\.log" --include="*.ts" --include="*.tsx" lib/ app/ components/ hooks/

  Exclusions (keep console.log):
    - lib/logger.ts (dev logger, intentional)
    - __tests__/** (test files, debugging okay)

  Replacements:
    // Before:
    console.log('Upload completed', { assetId, size });

    // After:
    import { logger } from '@/lib/observability-logger';
    logger.logInfo('Upload completed', { assetId, size });

  Success: All production console.log replaced, build succeeds
  Time: 1hr (depends on number of occurrences)
  ```

### Documentation Updates

- [ ] Update CLAUDE.md with observability patterns section
  ```
  File: /Users/phaedrus/Development/sploot/CLAUDE.md (MODIFY)
  Location: Add new section after "## Architecture" or similar

  Content to Add:
    ## Observability Patterns

    **Analytics Tracking**: Use lib/analytics.ts for all event tracking
    - Import: `import { track, ANALYTICS_EVENTS } from '@/lib/analytics'`
    - Client-side: `track({ name: 'upload_completed', properties: { assetId, size } })`
    - Server-side: Use `trackServer()` with await

    **Performance Monitoring**: Use lib/performance-monitor.ts for timing
    - Import: `import { getPerformanceMonitor, PERF_OPERATIONS } from '@/lib/performance-monitor'`
    - Usage: `perfMonitor.measureAsync(PERF_OPERATIONS.UPLOAD_SINGLE, async () => { ... })`

    **Structured Logging**: Use lib/observability-logger.ts, NOT console.log
    - Import: `import { logger } from '@/lib/observability-logger'`
    - Info: `logger.logInfo('Operation completed', { assetId, duration })`
    - Error: `logger.logError('Operation failed', error, { assetId })`
    - Timing: `logger.logTiming('upload', duration, true, { size })`

    **API Route Instrumentation**: Wrap all new routes with withObservability
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

  Success: Section added, examples clear, patterns documented
  Time: 30min
  ```

- [ ] Add JSDoc comments to all observability modules
  ```
  Files:
    - lib/analytics.ts
    - lib/performance-monitor.ts
    - lib/observability-logger.ts
    - lib/with-observability.ts

  Pattern: Add JSDoc for all exported functions and types
  Example:
    /**
     * Track a custom analytics event with type-safe validation.
     *
     * Events are sent to Vercel Analytics via sendBeacon (client) or
     * server-side track API. All PII is automatically sanitized.
     *
     * @param event - Typed analytics event with name and properties
     * @throws Never - Errors caught internally and logged to console
     *
     * @example
     * ```typescript
     * track({
     *   name: 'upload_completed',
     *   properties: { assetId: '123', duration: 1500 }
     * });
     * ```
     */
    export function track(event: AnalyticsEvent): void { ... }

  Success: All exported APIs documented, examples provided
  Time: 1hr
  ```

### Validation & Testing

- [ ] Run full test suite and validate coverage
  ```
  Commands:
    pnpm test:coverage

  Acceptance:
    - All unit tests pass
    - Coverage >80% for new modules:
      - lib/analytics.ts
      - lib/performance-monitor.ts
      - lib/observability-logger.ts
      - lib/with-observability.ts
    - Integration tests pass (telemetry, Prisma middleware)

  Success: All tests pass, coverage meets target
  Time: 15min (test execution)
  ```

- [ ] Validate 100% API route coverage
  ```
  Method: Manual audit of all route files

  Check:
    - All 25 routes use withObservability or manual instrumentation
    - No routes missing traceId logging
    - Build succeeds without TypeScript errors

  Audit Command:
    grep -r "export.*function (GET|POST|PUT|DELETE|PATCH)" app/api --include="*.ts" | \
    grep -v "withObservability"

    # Output should be empty or only routes with manual instrumentation

  Success: All routes instrumented, audit command returns empty or documented exceptions
  Time: 30min
  ```

- [ ] Test error scenarios (Sentry down, network offline, etc.)
  ```
  Scenarios:
    1. Sentry API unavailable:
       - Mock Sentry.captureException to throw error
       - Trigger error boundary
       - Verify: Error logged locally, app continues

    2. Network offline (client):
       - Disconnect network
       - Trigger analytics event
       - Verify: sendBeacon queues, no console errors

    3. Analytics blocked by ad blocker:
       - Install ad blocker, block Vercel Analytics domain
       - Trigger analytics event
       - Verify: No console errors, app continues

    4. Prisma middleware failure:
       - Mock getPerformanceMonitor to throw
       - Execute database query
       - Verify: Query succeeds, error logged

  Success: All scenarios gracefully degraded, no user-facing errors
  Time: 1hr
  ```

### Production Validation

- [ ] Deploy to preview and validate observability
  ```
  Steps:
    1. Deploy branch to Vercel preview
    2. Execute all flows:
       - Upload file
       - Search
       - Favorite/delete asset
       - Add/remove tag
       - Trigger error boundary (throw in component)
    3. Check dashboards:
       - Vercel Analytics: Verify custom events appear
       - Vercel Speed Insights: Verify Web Vitals captured
       - Vercel Logs: Verify structured JSON logs with traceId
       - Sentry: Verify errors captured with context
    4. Query logs:
       - Find request by traceId
       - Verify timing logged correctly
       - Verify error correlation (same traceId across services)

  Acceptance:
    - All events visible in Vercel Analytics
    - Logs queryable by traceId in Vercel
    - Errors grouped in Sentry
    - Web Vitals data in Speed Insights

  Time: 1hr
  ```

---

## Design Iteration Checkpoints

**After Phase 1 (Core Modules Complete)**:
- Review module boundaries: Are interfaces simple enough? Too simple (shallow)?
- Identify emerging patterns: Common code to extract? Duplication across modules?
- Check dependencies: Circular imports? Too many dependencies per module?
- Refactor opportunity: Before adding 22 more routes, polish the pattern

**After Phase 2 (Comprehensive Coverage)**:
- Review instrumentation consistency: All routes follow same pattern? Outliers?
- Identify coupling: Routes tightly coupled to observability? Easy to remove?
- Test coverage: Integration tests catching real issues? False positives?
- Performance impact: Measure actual overhead (<5ms target). Optimize if needed.

**After Phase 3 (Monitoring)**:
- Usage analytics: Queries returning useful data? Missing metrics?
- SLO monitoring: Alerts firing correctly? False positives? Missing alerts?
- Documentation: OBSERVABILITY.md clear? Missing troubleshooting steps?
- Refactor opportunity: Repeated query patterns → extract to utility functions

---

## Automation Opportunities

**After Implementation Complete**:
1. **ESLint Rule**: Enforce structured logger usage (no raw console.log in production)
   - Custom rule: "no-console" with exceptions for lib/logger.ts and __tests__
   - Auto-fix: Replace console.log with logger.logInfo (future enhancement)

2. **Route Template**: Generate withObservability wrapper boilerplate
   - Script: `pnpm generate:route --name=my-route` creates instrumented template
   - Template includes: withObservability wrapper, operation name, basic error handling

3. **Analytics Event Generator**: Generate TypeScript types from event schema
   - Define events in JSON schema or YAML
   - Generate AnalyticsEvent discriminated union automatically
   - Ensures event definitions stay in sync with tracking code

4. **Test Coverage Report**: Automated check for observability module coverage
   - CI fails if coverage <80% on lib/analytics.ts, lib/performance-monitor.ts, etc.
   - Report missing tests to PR comments

---

## Notes

**Phase 1 Critical Path**:
Must complete in order: Install deps → Analytics → Logger → Middleware → Telemetry
Reason: Dependencies flow Analytics ← Logger ← Middleware

**Parallelization Opportunities**:
- Phase 1: Performance Monitor + Prisma middleware can be done in parallel with other modules (no dependencies)
- Phase 2: All 22 route instrumentations can be done in parallel (independent)
- Phase 2: Client analytics (upload, search, library) can be done in parallel
- Phase 3: Usage endpoint + OBSERVABILITY.md can be done in parallel

**Testing Philosophy** (from DESIGN.md):
- Minimize mocking (heavy mocking = design smell)
- Test behavior, not implementation
- Mock external services (Vercel Analytics, Sentry) - network calls expensive
- Use real Prisma for integration tests - validates actual SQL queries

**Time Estimate Summary**:
- Phase 1: 13hr (core modules, critical routes, Prisma middleware)
- Phase 2: 8hr (remaining routes, client analytics, error boundaries)
- Phase 3: 3hr (usage endpoint, monitoring documentation)
- Phase 4: 5hr (cleanup, documentation, validation)
- **Total: 29hr (~1 week at 4-5hr/day or 3-4 full days)**
