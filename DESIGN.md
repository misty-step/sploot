# Observability Architecture Design

## Architecture Overview

**Selected Approach**: Layered Observability Modules with HOF Middleware Pattern

**Rationale**: Chosen for simplicity (reuses existing patterns from upload service orchestration), module depth (simple interfaces hide telemetry complexity), and explicitness (zero magic, clear dependency chains). Beats alternatives by providing automatic instrumentation without forcing developers to think about observability while maintaining type safety and testability.

**Core Modules**:
- **Analytics Service** (`lib/analytics.ts`): Type-safe event tracking with domain vocabulary
- **Performance Monitor** (`lib/performance-monitor.ts`): Operation timing with P50/P95/P99 calculation
- **Structured Logger** (`lib/observability-logger.ts`): Enhanced vercel-logger with traceId + Sentry
- **Route Middleware** (`lib/with-observability.ts`): Automatic API route instrumentation (HOF pattern)
- **Telemetry API** (`app/api/telemetry/route.ts`): Client-side error/performance collection endpoint

**Data Flow**:
```
User Action (Client)
  → Client Track Event (sendBeacon)
  → API Route (wrapped with withObservability)
    → Generate TraceId
    → Start Timing
    → Execute Handler Logic
      → Domain Services (upload, search, etc.)
        → Performance Monitor (measureAsync)
        → Structured Logger (logInfo/logError with traceId)
        → Database (Prisma middleware tracks queries)
    → End Timing
    → Log Result (success/error with timing)
  → Response to Client
  → Analytics Dashboard (Vercel Analytics + Sentry)
```

**Key Design Decisions**:
1. **HOF Middleware over Decorator Pattern**: Next.js route handlers are async functions, not classes. Higher-order functions wrap handlers cleanly without TypeScript decorator complexity.
2. **Service Locator for Logger**: Pass logger instance through services vs global singleton. Enables testing with mock loggers, explicit dependencies.
3. **Event Constants over String Literals**: `ANALYTICS_EVENTS.UPLOAD_COMPLETED` vs `"upload_completed"` prevents typos, enables IDE autocomplete.
4. **Non-blocking Telemetry via Try-Catch**: Wrap all telemetry in try-catch, never throw. Degrading telemetry better than breaking user flows.

---

## Module 1: Analytics Service

**File**: `lib/analytics.ts`

**Responsibility**: Hide @vercel/analytics complexity behind type-safe domain event API. Handles server/client tracking differences, PII sanitization, Do Not Track detection.

**Public Interface**:
```typescript
// Event type definitions (discriminated union for type safety)
export type AnalyticsEvent =
  | { name: 'upload_file_selected'; properties: { count: number; totalSize: number } }
  | { name: 'upload_started'; properties: { assetId: string; size: number } }
  | { name: 'upload_completed'; properties: { assetId: string; duration: number; size: number } }
  | { name: 'upload_failed'; properties: { reason: string; size: number } }
  | { name: 'search_query_submitted'; properties: { queryLength: number; hasFilters: boolean } }
  | { name: 'search_results_shown'; properties: { count: number; latency: number; hasFilters: boolean } }
  | { name: 'search_result_clicked'; properties: { position: number; score: number; assetId: string } }
  | { name: 'search_no_results'; properties: { query: string } }
  | { name: 'asset_favorited'; properties: { assetId: string } }
  | { name: 'asset_unfavorited'; properties: { assetId: string } }
  | { name: 'asset_deleted'; properties: { assetId: string; hadTags: boolean } }
  | { name: 'tag_added'; properties: { assetId: string; tagName: string } }
  | { name: 'tag_removed'; properties: { assetId: string; tagName: string } };

// Main tracking function (client-side)
export function track(event: AnalyticsEvent): void;

// Server-side tracking with waitUntil
export function trackServer(event: AnalyticsEvent): Promise<void>;

// Flow tracking for multi-step journeys
export function trackFlow(flowName: string, step: string, metadata?: Record<string, any>): void;

// Timing tracking for performance
export function trackTiming(operation: string, duration: number, success: boolean, metadata?: Record<string, any>): void;
```

**Internal Implementation** (hidden complexity):
- Detect environment: `typeof window !== 'undefined'` for client vs server
- Client: Use `@vercel/analytics` `track()` with `navigator.sendBeacon` for reliability
- Server: Use `@vercel/analytics/server` `track()` with Next.js `waitUntil` for non-blocking
- Do Not Track: Check `navigator.doNotTrack === '1'`, skip tracking if enabled
- PII Sanitization: Redact email regex matches, redact user IDs (no hashing for simpler privacy compliance), strip URL query params
- Event Validation: Runtime check against AnalyticsEvent union, log validation errors to console
- Privacy Rationale: Complete redaction (not hashing) prevents any potential PII leakage via rainbow tables or hash reversal

**Dependencies**:
- Requires: `@vercel/analytics`, `@vercel/analytics/server`
- Used by: All client components (hooks), API routes (via withObservability)

**Data Structures**:
```typescript
// Event name constants (for IDE autocomplete)
export const ANALYTICS_EVENTS = {
  UPLOAD_FILE_SELECTED: 'upload_file_selected',
  UPLOAD_STARTED: 'upload_started',
  UPLOAD_COMPLETED: 'upload_completed',
  UPLOAD_FAILED: 'upload_failed',
  SEARCH_QUERY_SUBMITTED: 'search_query_submitted',
  SEARCH_RESULTS_SHOWN: 'search_results_shown',
  SEARCH_RESULT_CLICKED: 'search_result_clicked',
  SEARCH_NO_RESULTS: 'search_no_results',
  ASSET_FAVORITED: 'asset_favorited',
  ASSET_UNFAVORITED: 'asset_unfavorited',
  ASSET_DELETED: 'asset_deleted',
  TAG_ADDED: 'tag_added',
  TAG_REMOVED: 'tag_removed',
} as const;

// Helper to sanitize properties before sending
type SanitizedProperties = Record<string, string | number | boolean>;
function sanitizeProperties(props: Record<string, any>): SanitizedProperties;
```

**Error Handling**:
- Validation failure → Log to console.warn, skip tracking (non-blocking)
- Network failure (sendBeacon) → Browser queues automatically, no action needed
- Server tracking error → Catch in try-catch, log with console.error, continue execution

---

## Module 2: Performance Monitor

**File**: `lib/performance-monitor.ts`

**Responsibility**: Track operation durations, calculate percentiles (P50/P95/P99), integrate with Analytics Service for visualization. Replaces unused `lib/performance.ts` with integrated design.

**Public Interface**:
```typescript
// Singleton pattern (like existing PerformanceTracker)
export function getPerformanceMonitor(): PerformanceMonitor;

export class PerformanceMonitor {
  // Manual timing
  startTiming(operation: string): void;
  endTiming(operation: string): number | undefined;

  // Automatic async timing (most common pattern)
  measureAsync<T>(operation: string, fn: () => Promise<T>): Promise<T>;

  // Automatic sync timing (rare, but provided)
  measureSync<T>(operation: string, fn: () => T): T;

  // Retrieve statistics
  getSummary(operation: string): PerformanceSummary | null;
  getAllSummaries(): PerformanceSummary[];

  // Export to Analytics
  exportToAnalytics(): void;

  // Reset for testing
  reset(operation?: string): void;
}

interface PerformanceSummary {
  operation: string;
  samples: number;
  average: number;
  median: number;
  min: number;
  max: number;
  p95: number;
  p99: number;
}
```

**Internal Implementation** (hidden complexity):
- Circular buffer: Last 100 samples per operation (prevents unbounded memory growth)
- Percentile calculation: Sort samples, index at Math.ceil(length * percentile)
- Debug mode: Check `localStorage.getItem('debug_performance') === 'true'`, log to console.log
- Analytics integration: Call `trackTiming()` on every `endTiming()` and `measureAsync()` completion
- Timing storage: `Map<string, number[]>` for samples, `Map<string, number>` for start times

**Dependencies**:
- Requires: `lib/analytics.ts` (trackTiming function)
- Used by: API routes (via withObservability), upload services, search service

**Data Structures**:
```typescript
// Operation name constants (mirrors existing PERF_OPERATIONS from lib/performance.ts)
export const PERF_OPERATIONS = {
  // Upload operations
  UPLOAD_SINGLE: 'upload:single',
  UPLOAD_BATCH: 'upload:batch',
  UPLOAD_TO_BLOB: 'upload:blob_storage',
  UPLOAD_TO_DB: 'upload:database_write',
  UPLOAD_TOTAL: 'upload:total',

  // Embedding operations
  EMBEDDING_GENERATE: 'embedding:generate',
  EMBEDDING_REPLICATE_API: 'embedding:replicate_api',
  EMBEDDING_DB_WRITE: 'embedding:db_write',
  EMBEDDING_TOTAL: 'embedding:total',

  // Search operations
  SEARCH_TEXT_EMBEDDING: 'search:text_embedding',
  SEARCH_VECTOR_QUERY: 'search:vector_query',
  SEARCH_TOTAL: 'search:total',

  // Database operations
  DB_QUERY: 'db:query',
  DB_WRITE: 'db:write',
  DB_TRANSACTION: 'db:transaction',
} as const;

type PerfOperation = typeof PERF_OPERATIONS[keyof typeof PERF_OPERATIONS];
```

**Error Handling**:
- `endTiming()` without `startTiming()` → Log warning, return undefined (graceful degradation)
- Analytics tracking failure → Catch error, log to console.error, don't rethrow
- Invalid operation name → Allow any string (flexibility), validate in constants usage

---

## Module 3: Structured Logger (Enhanced)

**File**: `lib/observability-logger.ts` (enhanced version of existing `lib/vercel-logger.ts`)

**Responsibility**: Standardized JSON logging with traceId correlation, Sentry integration for errors, environment context. Single source of truth for all logging.

**Public Interface**:
```typescript
// Core logging functions
export function logInfo(context: string, metadata?: Record<string, any>): void;
export function logError(context: string, error: unknown, metadata?: Record<string, any>): void;
export function logTiming(operation: string, duration: number, success: boolean, metadata?: Record<string, any>): void;

// TraceId management (for request correlation)
export function withTraceId(traceId: string): ObservabilityLogger;

// Logger instance interface (for dependency injection)
export interface ObservabilityLogger {
  logInfo(context: string, metadata?: Record<string, any>): void;
  logError(context: string, error: unknown, metadata?: Record<string, any>): void;
  logTiming(operation: string, duration: number, success: boolean, metadata?: Record<string, any>): void;
  getTraceId(): string | undefined;
}

// Default logger (no traceId)
export const logger: ObservabilityLogger;
```

**Internal Implementation** (hidden complexity):
- JSON Serialization: `JSON.stringify()` for all log entries, newline-separated
- Error Normalization: Handle `Error` objects, strings, unknown types → serialize to `{ name, message, stack }`
- Environment Detection: Check `process.env.NODE_ENV`, add `vercelRegion`, `vercelUrl` from env
- Sentry Integration: Import `@sentry/nextjs`, call `Sentry.captureException()` in `logError()`
- Console Routing: `logInfo` → `console.log`, `logError` → `console.error`, `logTiming` → `console.log`
- TraceId Storage: Class-based logger with instance variable `private traceId?: string`

**Dependencies**:
- Requires: `@sentry/nextjs` (conditional import, graceful if missing)
- Used by: All API routes (via withObservability), services, error boundaries

**Data Structures**:
```typescript
// Log entry interfaces
interface BaseLogEntry {
  timestamp: string;
  level: 'info' | 'error' | 'timing';
  context: string;
  traceId?: string;
  metadata?: Record<string, any>;
  environment: {
    nodeEnv?: string;
    vercelRegion?: string;
    vercelUrl?: string;
  };
}

interface InfoLogEntry extends BaseLogEntry {
  level: 'info';
}

interface ErrorLogEntry extends BaseLogEntry {
  level: 'error';
  error: {
    name: string;
    message: string;
    stack?: string;
  };
}

interface TimingLogEntry extends BaseLogEntry {
  level: 'timing';
  operation: string;
  duration: number;
  success: boolean;
}

type LogEntry = InfoLogEntry | ErrorLogEntry | TimingLogEntry;
```

**Error Handling**:
- JSON.stringify failure → Catch error, log simpler version without problematic metadata
- Sentry unavailable → Catch import error, skip Sentry.captureException(), log locally only
- Console unavailable (edge runtime issues) → Skip logging silently (last resort fallback)

---

## Module 4: API Route Middleware

**File**: `lib/with-observability.ts`

**Responsibility**: Higher-order function wrapping Next.js route handlers. Automatic timing, error handling, request tracing, structured logging. Zero-boilerplate observability.

**Public Interface**:
```typescript
// Main HOF for wrapping route handlers
export function withObservability<T = any>(
  handler: RouteHandler<T>,
  options?: ObservabilityOptions
): RouteHandler<T>;

// Type definitions matching Next.js route handlers
type RouteHandler<T = any> = (
  req: NextRequest,
  context?: RouteContext
) => Promise<NextResponse<T>>;

interface RouteContext {
  params?: Promise<Record<string, string>>;
}

interface ObservabilityOptions {
  operation?: string; // Custom operation name (defaults to route path)
  skipTiming?: boolean; // Skip performance timing (for health checks)
  skipLogging?: boolean; // Skip structured logging (for noisy routes)
  metadata?: Record<string, any>; // Additional metadata to log
}
```

**Internal Implementation** (hidden complexity):
- **TraceId Generation**: Use `nanoid()` to generate unique request ID (12 chars, URL-safe)
- **Request Inspection**: Extract method, pathname, query params from NextRequest
- **Response Inspection**: Extract status code from NextResponse after handler executes
- **Timing Calculation**: `Date.now()` before/after handler, calculate duration
- **Success Determination**: Status code 200-299 = success, 400-599 = failure, 300-399 = success
- **Error Serialization**: Catch errors, extract message/stack, log with traceId
- **Logger Injection**: Create logger with traceId via `withTraceId()`, pass to handler context (future enhancement)

**Dependencies**:
- Requires: `nanoid`, `lib/observability-logger.ts`, `lib/performance-monitor.ts`
- Used by: All API routes (wrapped in route file)

**Data Structures**:
```typescript
// Internal timing context
interface RequestContext {
  traceId: string;
  operation: string;
  startTime: number;
  method: string;
  pathname: string;
  logger: ObservabilityLogger;
}

// Metadata logged for each request
interface RequestMetadata {
  method: string;
  pathname: string;
  query?: Record<string, string>;
  traceId: string;
  duration?: number;
  statusCode?: number;
  success?: boolean;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}
```

**Error Handling**:
- Handler throws error → Catch, log with traceId, rethrow (preserve Next.js error handling)
- `unstable_rethrow(error)` → Call before catch block (allow Next.js redirects/not-found)
- Timing/logging failure → Catch separately, don't interfere with handler execution
- TraceId generation failure → Fall back to `crypto.randomUUID()` (built-in)

---

## Module 5: Telemetry API Endpoint

**File**: `app/api/telemetry/route.ts` (enhance existing stub)

**Responsibility**: Non-blocking collection endpoint for client-side telemetry. Receives errors, performance metrics, usage stats. Forwards to Sentry, Analytics, Logs.

**Public Interface** (HTTP API):
```http
POST /api/telemetry
Content-Type: application/json
Authorization: Bearer <clerk-token>

{
  "type": "error" | "performance" | "usage",
  "payload": <type-specific-payload>
}

# Error telemetry
{
  "type": "error",
  "payload": {
    "name": "TypeError",
    "message": "Cannot read property 'x' of undefined",
    "stack": "Error: ...\n  at Component (file:///...)",
    "componentStack": "at ErrorBoundary\n  at Layout",
    "url": "/app/library",
    "timestamp": 1698765432000
  }
}

# Performance telemetry
{
  "type": "performance",
  "payload": {
    "operation": "upload:single",
    "duration": 1234,
    "success": true,
    "metadata": { "size": 2500000 }
  }
}

# Usage telemetry
{
  "type": "usage",
  "payload": {
    "userId": "user_123",
    "action": "upload",
    "count": 1,
    "timestamp": 1698765432000
  }
}
```

**Internal Implementation** (hidden complexity):
- **Authentication**: Use existing `getAuth()` from `@/lib/auth/server`, require userId
- **Payload Validation**: Type guards for error/performance/usage payloads, return 400 if invalid
- **Error Forwarding**: Call `Sentry.captureException()` with error payload + user context
- **Performance Forwarding**: Call `trackTiming()` from Analytics Service
- **Usage Forwarding**: Call `logger.logInfo()` with "usage_metric" tag for easy querying
- **Non-Blocking**: Wrap all forwarding in try-catch, return 200 even on partial failure
- **Rate Limiting**: Future enhancement, skip for MVP (Vercel protects at infra level)

**Dependencies**:
- Requires: `@sentry/nextjs`, `lib/analytics.ts`, `lib/observability-logger.ts`, `@/lib/auth/server`
- Used by: Client error boundaries, performance monitoring hooks

**Data Structures**:
```typescript
// Request body types
type TelemetryRequest =
  | { type: 'error'; payload: ErrorPayload }
  | { type: 'performance'; payload: PerformancePayload }
  | { type: 'usage'; payload: UsagePayload };

interface ErrorPayload {
  name: string;
  message: string;
  stack?: string;
  componentStack?: string;
  url: string;
  timestamp: number;
}

interface PerformancePayload {
  operation: string;
  duration: number;
  success: boolean;
  metadata?: Record<string, any>;
}

interface UsagePayload {
  userId: string;
  action: string;
  count: number;
  timestamp: number;
  metadata?: Record<string, any>;
}

// Response types
interface TelemetryResponse {
  success: boolean;
  message?: string;
}
```

**Error Handling**:
- Missing auth token → Return 401 with `{ success: false, message: 'Unauthorized' }`
- Invalid payload → Return 400 with `{ success: false, message: 'Invalid payload: ...' }`
- Sentry unavailable → Log error, return 200 (telemetry shouldn't block client)
- Analytics failure → Log error, return 200 (partial success acceptable)

---

## Core Algorithms (Pseudocode)

### Algorithm 1: withObservability HOF Wrapper

```pseudocode
function withObservability(handler, options):
  return async function wrappedHandler(req, context):
    # 1. Initialize request context
    traceId = generateTraceId() # nanoid()
    operation = options.operation || extractOperationFromUrl(req.url)
    startTime = currentTimestamp()
    logger = createLoggerWithTraceId(traceId)
    perfMonitor = getPerformanceMonitor()

    # 2. Log request initiation (unless skipLogging)
    if !options.skipLogging:
      logger.logInfo("Request started", {
        method: req.method,
        pathname: req.nextUrl.pathname,
        operation: operation
      })

    # 3. Start performance timing (unless skipTiming)
    if !options.skipTiming:
      perfMonitor.startTiming(operation)

    try:
      # 4. Execute the actual route handler
      response = await handler(req, context)

      # 5. Calculate timing and log success
      duration = currentTimestamp() - startTime
      statusCode = response.status
      success = isSuccessStatus(statusCode) # 200-399

      if !options.skipTiming:
        perfMonitor.endTiming(operation)

      if !options.skipLogging:
        logger.logTiming(operation, duration, success, {
          method: req.method,
          pathname: req.nextUrl.pathname,
          statusCode: statusCode
        })

      # 6. Return response unchanged
      return response

    catch error:
      # 7. Handle errors (log, then rethrow)
      duration = currentTimestamp() - startTime

      # Check if this is a Next.js internal error (redirect, not-found)
      unstable_rethrow(error)

      # Log error with full context
      logger.logError("Request failed", error, {
        method: req.method,
        pathname: req.nextUrl.pathname,
        operation: operation,
        duration: duration
      })

      # End timing as failure
      if !options.skipTiming:
        perfMonitor.endTiming(operation)

      # Rethrow to preserve Next.js error handling
      throw error
```

### Algorithm 2: Analytics Event Tracking with Validation

```pseudocode
function track(event: AnalyticsEvent):
  try:
    # 1. Check Do Not Track (client-side only)
    if isClient && navigator.doNotTrack === '1':
      return # Skip tracking silently

    # 2. Validate event structure (runtime check)
    if !isValidAnalyticsEvent(event):
      console.warn("Invalid analytics event", event)
      return

    # 3. Sanitize properties (remove PII)
    sanitized = sanitizeEventProperties(event.properties)

    # 4. Track via appropriate method
    if isClient:
      # Client-side: Use sendBeacon for reliability
      import { track as vercelTrack } from '@vercel/analytics'
      vercelTrack(event.name, sanitized)
    else:
      # Server-side: Use waitUntil for non-blocking
      import { track as vercelTrackServer } from '@vercel/analytics/server'
      await vercelTrackServer(event.name, sanitized)

  catch error:
    # Never throw - telemetry failures shouldn't break app
    console.error("Analytics tracking failed", error)

function sanitizeEventProperties(properties):
  sanitized = {}

  for key, value in properties:
    # Skip if value is undefined
    if value === undefined:
      continue

    # Hash user IDs
    if key === 'userId':
      sanitized[key] = sha256Hash(value)
      continue

    # Redact emails
    if key.includes('email') || isEmail(value):
      sanitized[key] = '[REDACTED]'
      continue

    # Strip URLs of query params
    if key === 'url' || key === 'referrer':
      sanitized[key] = stripQueryParams(value)
      continue

    # Pass through safe values
    if isPrimitive(value):
      sanitized[key] = value
    else:
      sanitized[key] = '[OBJECT]'

  return sanitized
```

### Algorithm 3: Prisma Middleware for Query Timing

```pseudocode
function createPrismaQueryMiddleware(prisma, logger):
  prisma.$use(async (params, next):
    # 1. Extract query metadata
    model = params.model # e.g., "Asset", "User"
    action = params.action # e.g., "findMany", "create", "update"
    operation = "db:" + model + ":" + action # e.g., "db:Asset:findMany"

    # 2. Start timing
    startTime = currentTimestamp()
    perfMonitor = getPerformanceMonitor()
    perfMonitor.startTiming(operation)

    try:
      # 3. Execute the query
      result = await next(params)

      # 4. Calculate duration and log
      duration = currentTimestamp() - startTime
      perfMonitor.endTiming(operation)

      # Log slow queries (>100ms)
      if duration > 100:
        logger.logInfo("Slow query detected", {
          model: model,
          action: action,
          duration: duration
        })

      return result

    catch error:
      # 5. Log query errors
      duration = currentTimestamp() - startTime
      perfMonitor.endTiming(operation)

      logger.logError("Query failed", error, {
        model: model,
        action: action,
        duration: duration
      })

      throw error # Rethrow to preserve Prisma error handling
  )
```

### Algorithm 4: Client Error Boundary with Telemetry

```pseudocode
class ErrorBoundaryWithTelemetry extends React.Component:
  componentDidCatch(error, errorInfo):
    # 1. Extract error details
    errorPayload = {
      name: error.name,
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      url: window.location.href,
      timestamp: Date.now()
    }

    # 2. Send to telemetry endpoint (non-blocking)
    try:
      sendBeacon('/api/telemetry', {
        type: 'error',
        payload: errorPayload
      })
    catch sendError:
      # Telemetry failure shouldn't break error boundary
      console.error("Failed to send error telemetry", sendError)

    # 3. Log to console for local debugging
    console.error("Error boundary caught error:", error, errorInfo)

    # 4. Update state to show error UI
    this.setState({ hasError: true })
```

---

## File Organization

### New Files to Create

```
lib/
  analytics.ts              # Module 1: Analytics Service (type-safe event tracking)
  performance-monitor.ts    # Module 2: Performance Monitor (timing + percentiles)
  observability-logger.ts   # Module 3: Enhanced Structured Logger
  with-observability.ts     # Module 4: Route Middleware HOF

app/
  layout.tsx                # Update: Add SpeedInsights component
  error.tsx                 # Create: App-level error boundary with Sentry
  global-error.tsx          # Create: Root-level error boundary with Sentry

instrumentation.ts          # Create: Global Next.js instrumentation (Sentry onRequestError)

sentry.client.config.ts     # Create: Sentry client-side initialization
sentry.server.config.ts     # Create: Sentry server-side initialization
sentry.edge.config.ts       # Create: Sentry Edge Runtime initialization

.sentryclirc                # Create: Sentry CLI configuration (gitignored)
sentry.properties           # Create: Sentry project properties (gitignored)
```

### Files to Modify

```
lib/
  db.ts                     # Add: Prisma middleware for query timing
  vercel-logger.ts          # Keep: Use as base for observability-logger.ts

app/api/
  telemetry/route.ts        # Enhance: Add error/performance/usage forwarding
  upload/route.ts           # Wrap: withObservability(handler)
  search/route.ts           # Wrap: withObservability(handler)
  assets/route.ts           # Wrap: withObservability(handler)
  [22 more routes...]       # Wrap: All 25 routes with withObservability

components/
  image-tile-error-boundary.tsx          # Update: Add telemetry on error
  share/share-page-error-boundary.tsx    # Update: Add telemetry on error
  upload-zone.tsx                        # Add: Client analytics tracking

hooks/
  use-upload-queue.ts      # Add: Analytics tracking (upload flow)
  use-assets.ts            # Add: Analytics tracking (favorite/delete)

package.json               # Add: @vercel/speed-insights, @sentry/nextjs
.gitignore                 # Add: .sentryclirc, sentry.properties
```

### Files to Delete

```
lib/
  performance.ts            # Delete: Unused (0 imports), replaced by performance-monitor.ts
```

---

## Integration Points

### Database: Prisma Middleware

Add to `lib/db.ts` after PrismaClient initialization:

```typescript
if (prismaClient) {
  // Import after module exports to avoid circular dependency
  const { getPerformanceMonitor } = require('./performance-monitor');
  const { logger } = require('./observability-logger');

  prismaClient.$use(async (params, next) => {
    const operation = `db:${params.model}:${params.action}`;
    const perfMonitor = getPerformanceMonitor();
    const startTime = Date.now();

    perfMonitor.startTiming(operation);

    try {
      const result = await next(params);
      const duration = Date.now() - startTime;

      perfMonitor.endTiming(operation);

      if (duration > 100) {
        logger.logInfo('Slow query detected', {
          model: params.model,
          action: params.action,
          duration,
        });
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      perfMonitor.endTiming(operation);

      logger.logError('Query failed', error, {
        model: params.model,
        action: params.action,
        duration,
      });

      throw error;
    }
  });
}
```

### Next.js: Instrumentation Hook

Create `instrumentation.ts` in project root:

```typescript
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export async function onRequestError(
  error: Error,
  request: Request,
  context: {
    routerKind: 'Pages Router' | 'App Router';
    routePath: string;
    routeType: 'render' | 'route' | 'action' | 'middleware';
    renderSource: 'react-server-components' | 'server-rendering';
    revalidateReason?: 'on-demand' | 'stale';
    renderType: 'dynamic' | 'static';
  }
) {
  const { logger } = await import('./lib/observability-logger');

  logger.logError('Next.js Request Error', error, {
    url: request.url,
    routerKind: context.routerKind,
    routePath: context.routePath,
    routeType: context.routeType,
  });
}
```

### React: Error Boundaries

Update `components/image-tile-error-boundary.tsx`:

```typescript
'use client';

import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ImageTileErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Send to telemetry endpoint
    if (navigator.sendBeacon) {
      const payload = JSON.stringify({
        type: 'error',
        payload: {
          name: error.name,
          message: error.message,
          stack: error.stack,
          componentStack: errorInfo.componentStack,
          url: window.location.href,
          timestamp: Date.now(),
        },
      });

      navigator.sendBeacon('/api/telemetry', payload);
    }

    console.error('ImageTile error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || <div>Image failed to load</div>;
    }

    return this.props.children;
  }
}
```

### Vercel: Environment Variables

Add to Vercel project settings:

```env
# Sentry
SENTRY_DSN=https://[key]@[org].ingest.sentry.io/[project]
SENTRY_AUTH_TOKEN=[token-from-sentry]
SENTRY_ORG=[org-name]
SENTRY_PROJECT=[project-name]

# Already exists
NEXT_PUBLIC_BASE_URL=https://sploot.vercel.app
```

### Git: Ignore Sentry Files

Add to `.gitignore`:

```gitignore
# Sentry
.sentryclirc
sentry.properties
```

---

## State Management

**Client State**:
- No persistent state for observability modules
- Analytics events sent immediately via `sendBeacon` (no client-side queue)
- Performance metrics stored transiently in PerformanceMonitor singleton (last 100 samples)
- Do Not Track preference read from `navigator.doNotTrack` on each event

**Server State**:
- No persistent state (stateless API routes)
- TraceId generated per request, discarded after response
- Logger instances created per request (via `withTraceId()`), garbage collected
- PerformanceMonitor singleton maintains in-memory circular buffers (100 samples per operation)

**State Update Flow**:
1. User action (upload, search, etc.) → Client calls `track(event)`
2. Client tracks event → `navigator.sendBeacon()` queues request to Vercel Analytics
3. API route receives request → Middleware generates traceId, creates logger
4. Route handler executes → Logger writes to stdout/stderr (Vercel captures)
5. Response returned → TraceId discarded, logger garbage collected
6. Background: Vercel aggregates logs → Queryable in dashboard (3-day retention)
7. Background: Sentry aggregates errors → Permanent storage, grouped by type

**No Shared Mutable State**: All modules use:
- Functional patterns (pure functions)
- Singleton pattern for PerformanceMonitor (read-only after initialization)
- Request-scoped state (traceId, logger) passed explicitly

---

## Error Handling Strategy

**Error Categories**:

1. **Telemetry Errors** (Analytics, Sentry, Logger)
   - **Handling**: Try-catch around all telemetry, log to console, never throw
   - **User Impact**: None - telemetry failures are invisible to users
   - **Example**: `track()` fails → Log to console.error, continue execution

2. **Validation Errors** (Invalid event payloads, missing properties)
   - **Handling**: Validate at module boundaries, log warning, skip operation
   - **User Impact**: None - invalid events silently dropped
   - **Example**: Event missing required property → console.warn, return early

3. **Network Errors** (sendBeacon failures, Sentry API unavailable)
   - **Handling**: Browser auto-retries sendBeacon; server-side catch and log
   - **User Impact**: None - queued for retry or dropped
   - **Example**: Analytics API timeout → sendBeacon queues retry, then gives up

4. **Application Errors** (Route handler throws, database query fails)
   - **Handling**: Log with traceId + context, rethrow to preserve Next.js error handling
   - **User Impact**: User sees error page (app/error.tsx)
   - **Example**: Database connection fails → Log error, Sentry captures, show error UI

5. **Integration Errors** (Sentry SDK missing, Prisma middleware fails)
   - **Handling**: Conditional imports, graceful degradation, log warning
   - **User Impact**: None - observability degrades but app functions
   - **Example**: Sentry not installed → Skip `Sentry.captureException()`, log locally only

**Error Response Format** (already standardized via `lib/api-error.ts`):
```json
{
  "error": "User-friendly message",
  "code": "NOT_FOUND" | "UNAUTHORIZED" | "INTERNAL_ERROR",
  "requestId": "uuid",
  "timestamp": "2025-11-03T00:00:00.000Z"
}
```

**Logging Strategy**:
- Telemetry errors → console.error (debug locally, low priority)
- Application errors → logger.logError + Sentry (high priority, investigate immediately)
- Slow queries → logger.logInfo (medium priority, optimize if persistent)
- All errors include traceId (correlate across systems)

---

## Testing Strategy

**Unit Tests** (fast, isolated, no external dependencies):

**Module: Analytics Service** (`lib/analytics.test.ts`):
- Test: `track()` validates event structure → Rejects invalid events
- Test: `track()` sanitizes PII → Strips emails, hashes user IDs
- Test: `track()` respects Do Not Track → Skips tracking when enabled
- Test: Server vs client detection → Calls correct Vercel Analytics API
- Mock: `@vercel/analytics` package, `navigator.sendBeacon`

**Module: Performance Monitor** (`lib/performance-monitor.test.ts`):
- Test: `measureAsync()` times async operations correctly
- Test: Percentile calculations (P50, P95, P99) → Match expected values
- Test: Circular buffer limits samples → Keeps last 100, discards oldest
- Test: `exportToAnalytics()` → Calls `trackTiming()` with correct data
- Mock: `lib/analytics.ts` (trackTiming function)

**Module: Structured Logger** (`lib/observability-logger.test.ts`):
- Test: `logError()` serializes Error objects → Extracts name, message, stack
- Test: `withTraceId()` → Creates logger with traceId in all log entries
- Test: Sentry integration → Calls `Sentry.captureException()` on error
- Test: Graceful degradation → Works without Sentry installed
- Mock: `@sentry/nextjs`, `console.error`

**Module: Route Middleware** (`lib/with-observability.test.ts`):
- Test: `withObservability()` generates traceId → Unique per request
- Test: Timing calculation → Correct duration logged
- Test: Success/failure detection → Status codes 200-399 = success
- Test: Error handling → Logs error, then rethrows
- Test: `unstable_rethrow()` → Next.js errors not caught
- Mock: NextRequest, NextResponse, handler function

**Integration Tests** (slower, real dependencies):

**Database Middleware** (`lib/db.integration.test.ts`):
- Test: Prisma middleware logs slow queries → Query >100ms logged
- Test: Query timing → Duration calculated correctly
- Test: Error handling → Failed queries logged with error details
- Dependencies: Test database (Docker or in-memory SQLite)

**Telemetry API** (`app/api/telemetry/route.integration.test.ts`):
- Test: Error payload → Forwarded to Sentry successfully
- Test: Performance payload → Tracked in Analytics
- Test: Auth required → Returns 401 without token
- Test: Invalid payload → Returns 400 with error message
- Dependencies: Test Sentry DSN, mock Clerk auth

**Full Instrumentation** (`instrumentation.integration.test.ts`):
- Test: Wrapped route → Logs request, timing, response
- Test: Error in route → Logged with traceId, sent to Sentry
- Test: Multiple requests → Different traceIds, no collision
- Dependencies: Test Next.js server, mock routes

**E2E Tests** (slowest, full system):

**Upload Flow with Analytics** (`e2e/upload-analytics.spec.ts`):
- Test: Upload asset → All events tracked (file_selected, upload_started, upload_completed)
- Test: Upload failure → Error tracked, telemetry sent
- Assertion: Verify events in Vercel Analytics (via API or dashboard)

**Error Boundary with Telemetry** (`e2e/error-telemetry.spec.ts`):
- Test: Trigger component error → Error boundary catches, sends to /api/telemetry
- Test: Telemetry endpoint → Forwards to Sentry, returns 200
- Assertion: Verify error in Sentry dashboard

**Mocking Strategy**:
- **Minimize mocking**: Heavy mocking indicates tight coupling (bad design)
- **Mock external services**: Vercel Analytics, Sentry API (network calls expensive)
- **Use real database for integration tests**: Docker container with test schema
- **Don't mock core logic**: Test actual percentile calculations, event validation

**Coverage Targets**:
- Core modules (analytics, logger, middleware): 90%+ line coverage
- Integration tests: Cover happy path + 1 error path per endpoint
- E2E tests: Cover critical user flows (upload, search, error handling)

---

## Performance Considerations

**Expected Load**:
- 1000 uploads/day = 0.7 uploads/minute average, 5-10 uploads/minute peak
- 100 searches/hour = 1.7 searches/minute average, 10-20 searches/minute peak
- 25 API routes × 2 requests/minute average = 50 requests/minute baseline
- Expected errors: 20-50/day = <2/hour (well under Sentry 5K/month limit)

**Instrumentation Overhead**:
- **TraceId generation** (nanoid): <0.1ms per request (negligible)
- **Timing calculation** (Date.now() × 2): <0.01ms per request (negligible)
- **JSON serialization** (logging): ~1-2ms per log entry (acceptable)
- **sendBeacon** (client analytics): ~2-5ms queuing, async transmission (non-blocking)
- **Sentry.captureException**: ~5-10ms per error (acceptable for error path)
- **Total overhead**: <5ms per request (0.5% of 1-second API route = negligible)

**Optimization Techniques**:
- **Non-blocking telemetry**: All analytics/logging wrapped in try-catch, never blocks handler
- **Lazy loading**: Import heavy modules (Sentry) only when needed
- **Circular buffers**: PerformanceMonitor limits memory (100 samples × 25 operations = 2500 numbers = ~20KB)
- **Sampling**: Speed Insights samples 10% of production requests (reduce overhead 10×)
- **Batching** (future): Batch analytics events client-side, send every 10 seconds or 50 events

**Scaling Strategy**:
- **Horizontal**: Stateless API routes scale infinitely (Vercel serverless)
- **Vertical**: No vertical scaling needed (overhead <5ms per request)
- **Database**: Prisma connection pooling (already configured)
- **Storage**: Circular buffers in PerformanceMonitor prevent unbounded growth

**Performance Monitoring** (SLO Compliance):
- **Search P95**: Target <500ms, measured via `PERF_OPERATIONS.SEARCH_TOTAL`
- **Upload P95**: Target <2.5s, measured via `PERF_OPERATIONS.UPLOAD_TOTAL`
- **Alert Triggers**: Query Vercel logs for P95 > threshold, send alert (manual setup in Phase 3)

---

## Security Considerations

**Threats Mitigated**:

1. **PII Leakage in Analytics**
   - **Threat**: User emails, session tokens leaked to analytics dashboard
   - **Mitigation**: `sanitizeEventProperties()` redacts emails, hashes user IDs, strips URL query params
   - **Test**: Unit test validates no PII in sanitized output

2. **Telemetry Injection Attacks**
   - **Threat**: Malicious client sends crafted telemetry to pollute logs/Sentry
   - **Mitigation**: Require authentication (`getAuth()`) on `/api/telemetry`, validate payload structure
   - **Test**: Integration test verifies 401 without auth, 400 with invalid payload

3. **Log Injection / CRLF Attacks**
   - **Threat**: Attacker injects newlines to forge log entries
   - **Mitigation**: JSON.stringify() escapes newlines automatically, structured logging prevents injection
   - **Test**: Unit test verifies `\n` in message → JSON-escaped in output

4. **TraceId Enumeration**
   - **Threat**: Attacker guesses traceIds to correlate requests
   - **Mitigation**: nanoid() generates cryptographically random IDs (12 chars = 2^72 possibilities)
   - **Test**: Integration test verifies no sequential traceIds

5. **Sentry Token Exposure**
   - **Threat**: Sentry DSN leaked in client bundle
   - **Mitigation**: Use `NEXT_PUBLIC_SENTRY_DSN` for client (public), `SENTRY_DSN` for server (private)
   - **Test**: Build-time check verifies no `SENTRY_AUTH_TOKEN` in client bundle

**Security Best Practices**:
- **Principle of Least Privilege**: Telemetry endpoint requires user auth, no admin privileges
- **Input Validation**: Validate all payloads against TypeScript types, reject invalid
- **Secrets Management**: Store Sentry tokens in Vercel environment variables (encrypted at rest)
- **Audit Logging**: All `/api/telemetry` requests logged with userId (detect abuse)
- **Rate Limiting**: Future enhancement - limit telemetry requests per user (100/hour)

**Sensitive Data Handling**:
- **Never log**: Passwords, session tokens, API keys, credit card numbers
- **Hash before logging**: User IDs (SHA-256), IP addresses (future)
- **Redact in logs**: Email addresses replaced with `[REDACTED]`
- **Strip from URLs**: Query params (`?token=xyz`) removed before logging

---

## Alternative Architectures Considered

### Alternative A: OpenTelemetry (OTel) Full Stack

**Approach**: Use OpenTelemetry SDK for logs, metrics, traces. Single unified API, vendor-agnostic export.

**Pros**:
- Industry standard (CNCF project)
- Unified API for logs/metrics/traces
- Automatic instrumentation for Prisma, fetch, etc.
- Vendor-agnostic (switch backends without code changes)

**Cons**:
- Heavy SDK bundle size (~500KB client-side vs Vercel's ~50KB)
- Requires OpenTelemetry Collector for aggregation (operational overhead)
- Steep learning curve (spans, context propagation, exporters)
- Over-engineering for single-user MVP scale
- Free tier backends (Honeycomb) have lower limits than Vercel/Sentry

**Verdict**: Rejected - Too complex for MVP. OTel shines at microservices scale (100+ services), overkill for monolithic Next.js app.

### Alternative B: Custom Analytics Database (PostgreSQL)

**Approach**: Store all analytics events in PostgreSQL table. Query with SQL for insights.

**Pros**:
- Unlimited retention (vs Vercel 3-day logs)
- Custom queries (SQL > dashboard filters)
- No external dependencies (self-hosted)
- Zero third-party risk (data never leaves infra)

**Cons**:
- Requires building dashboard UI (weeks of work)
- Database bloat (1000 events/day = 365K rows/year)
- No built-in event deduplication (vs Vercel spam protection)
- No automatic bot filtering
- Query performance degrades with scale (need indexes, partitioning)
- Operational burden (backups, migrations, monitoring the monitoring system)

**Verdict**: Rejected - Engineering time better spent on features. Vercel Analytics solves this for $0/month.

### Alternative C: Decorator Pattern for Instrumentation

**Approach**: Use TypeScript decorators (`@track`, `@timed`) to annotate route handlers.

**Example**:
```typescript
class UploadRoute {
  @timed('upload')
  @track('upload_completed')
  async POST(req: NextRequest) {
    // handler logic
  }
}
```

**Pros**:
- Clean syntax (declarative annotations)
- Less boilerplate per route
- Standard pattern in other frameworks (NestJS, Spring)

**Cons**:
- TypeScript decorators still "experimental" (stage 3 proposal, not stable)
- Requires `experimentalDecorators: true` in tsconfig (breaks some tooling)
- Next.js route handlers are functions, not classes (awkward adapter needed)
- Decorator metadata not available at runtime (need custom reflection)
- Debugging harder (stack traces include decorator wrappers)

**Verdict**: Rejected - Decorators don't align with Next.js functional patterns. HOF approach simpler and standard.

### Alternative D: Event Sourcing for Analytics

**Approach**: Store all events in append-only log. Replay log to compute metrics.

**Pros**:
- Complete audit trail (every event preserved forever)
- Time-travel debugging (replay events to reproduce issues)
- Flexible schema (add fields retroactively)

**Cons**:
- Massive over-engineering for analytics use case
- Requires event store infrastructure (Kafka, EventStoreDB)
- Complex query model (CQRS projections)
- Hard to delete data (GDPR right to erasure conflicts with immutability)
- Operational complexity (Kafka = multi-node cluster, replication, partitioning)

**Verdict**: Rejected - Event sourcing solves consistency + audit problems we don't have. Analytics doesn't need strong consistency or event replay.

### Selected Architecture: Layered Modules + HOF Middleware

**Why This Wins**:
1. **Simplicity**: Reuses existing patterns (upload service orchestration, HOF in hooks). Developers already understand this structure.
2. **Module Depth**: Each module hides significant complexity (PII sanitization, Sentry integration, percentile math) behind simple interfaces (`track()`, `logError()`, `withObservability()`).
3. **Explicitness**: Zero magic - clear dependency chains, no hidden global state, no metaprogramming.
4. **Testability**: Each module unit-testable in isolation. HOF pattern easy to mock (pass stub handler).
5. **Incremental Adoption**: Routes can adopt `withObservability()` one at a time. No "big bang" refactor.
6. **Future-Proof**: If we outgrow Vercel/Sentry, swap implementations behind interfaces (e.g., replace `@vercel/analytics` with OpenTelemetry in `lib/analytics.ts`).

**Trade-offs Accepted**:
- Manual wrapping: Each route needs `withObservability()` call (vs automatic via framework plugin). Mitigation: Clear documentation, easy copy-paste template.
- No distributed tracing: Single-service architecture doesn't need trace propagation across services. If we split into microservices, add OpenTelemetry then.
- Limited analytics customization: Vercel Analytics dashboard less flexible than custom SQL queries. Mitigation: Export critical metrics to database if needed (Phase 4 enhancement).

---

## Implementation Notes

### Phase 1 Critical Path

**Must complete before other work**:
1. Install Sentry (`npx @sentry/wizard`) - Generates config files, updates next.config.ts
2. Create `lib/analytics.ts` - Required by all other modules (dependency)
3. Create `lib/observability-logger.ts` - Required by middleware and services
4. Create `lib/with-observability.ts` - Required for route instrumentation

**Can parallelize**:
- `lib/performance-monitor.ts` + Prisma middleware (independent)
- Error boundaries + telemetry endpoint (independent)
- Speed Insights installation (independent)

### Gotchas & Edge Cases

**Gotcha 1: Circular Dependencies**
- **Problem**: `lib/analytics.ts` imports `lib/observability-logger.ts`, logger imports analytics for timing
- **Solution**: Logger doesn't track itself. Only top-level modules call analytics.

**Gotcha 2: Next.js Edge Runtime Compatibility**
- **Problem**: Sentry SDK uses Node.js APIs (fs, crypto) incompatible with Edge Runtime
- **Solution**: Separate Sentry configs (`sentry.server.config.ts` for Node, `sentry.edge.config.ts` for Edge). Check `process.env.NEXT_RUNTIME` in instrumentation.ts.

**Gotcha 3: Prisma Middleware Timing**
- **Problem**: Prisma middleware runs in all environments (dev, test, prod). Test database slow, pollutes metrics.
- **Solution**: Skip timing in test environment: `if (process.env.NODE_ENV !== 'test') { // timing logic }`

**Gotcha 4: sendBeacon Content-Type**
- **Problem**: `navigator.sendBeacon()` defaults to `text/plain`, loses JSON structure
- **Solution**: Use `Blob` with explicit content-type:
  ```typescript
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  navigator.sendBeacon('/api/telemetry', blob);
  ```

**Gotcha 5: TraceId Propagation to Client**
- **Problem**: Client components can't access server traceId (different execution contexts)
- **Solution**: Phase 1 MVP: Server-side traceId only. Phase 2 enhancement: Return traceId in response header, client reads for correlation.

### Code Review Checklist

Before merging observability PRs, verify:
- [ ] All telemetry wrapped in try-catch (never throws)
- [ ] No PII in log messages or analytics events
- [ ] TraceId generated per request (not reused)
- [ ] Performance overhead <5ms per route (benchmark)
- [ ] Tests pass with Sentry unavailable (graceful degradation)
- [ ] `.sentryclirc` and `sentry.properties` in `.gitignore`
- [ ] No `console.log` in production code (use logger)
- [ ] Event names use constants (no string literals)

---

## Next Steps

**After Approval**:
1. Run `/plan` to break this architecture into atomic implementation tasks
2. Execute Phase 1 tasks (Days 1-2): Install tooling, create modules, instrument 3 routes
3. Validate in production: Deploy, check Sentry dashboard, Vercel Analytics, logs
4. Execute Phase 2-4 per TASK.md timeline (Days 3-7)

**Success Criteria**:
- Developer implements new route, wraps with `withObservability()` in <5 minutes (copy-paste template)
- All analytics events use type-safe `AnalyticsEvent` union (IDE autocomplete works)
- Zero production incidents caused by telemetry (non-blocking guarantees)
- Logs queryable in Vercel dashboard with traceId correlation

**This architecture bridges TASK.md (PRD) and implementation. Developers follow this design, not their own interpretations. Result: Consistent, testable, maintainable observability system.**