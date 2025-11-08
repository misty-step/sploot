# Observability & Monitoring

Comprehensive guide to monitoring, debugging, and maintaining Sploot in production.

## Table of Contents

- [Dashboard Links](#dashboard-links)
- [Health Checks](#health-checks)
- [Error Tracking](#error-tracking)
- [Analytics](#analytics)
- [Database Monitoring](#database-monitoring)
- [Alert Configuration](#alert-configuration)
- [Troubleshooting](#troubleshooting)

## Dashboard Links

### Sentry (Error Tracking)
- **Production**: https://sentry.io/organizations/misty-step/projects/sploot/
- **Issues**: https://sentry.io/organizations/misty-step/issues/?project=sploot
- **Performance**: https://sentry.io/organizations/misty-step/performance/?project=sploot
- **Alerts**: https://sentry.io/organizations/misty-step/alerts/sploot/

### Vercel (Hosting & Analytics)
- **Deployments**: https://vercel.com/moomooskycow/sploot
- **Analytics**: https://vercel.com/moomooskycow/sploot/analytics
- **Logs**: https://vercel.com/moomooskycow/sploot/logs
- **Environment Variables**: https://vercel.com/moomooskycow/sploot/settings/environment-variables

### Neon (Database)
- **Console**: https://console.neon.tech/
- **Project**: lively-lake-63852609 (neon-amber-lamp)
- **Branches**:
  - Production: `main`
  - Development: `development`
  - Preview: Auto-created per PR (e.g., `preview/feat/feature-name`)

### Clerk (Authentication)
- **Dashboard**: https://dashboard.clerk.com/
- **Applications**: https://dashboard.clerk.com/apps

## Health Checks

### Production Health Endpoint
```bash
curl https://sploot.app/api/health | jq
```

**Expected Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-11-08T02:00:00.000Z",
  "checks": {
    "database": {
      "status": "pass",
      "message": "Database connection successful",
      "responseTime": 624
    },
    "sentry": {
      "status": "pass",
      "message": "Sentry DSN configured"
    }
  }
}
```

### Deployment Validation

Before promoting to production:
```bash
pnpm validate:deployment
```

This checks:
- ✓ All required environment variables
- ✓ Database connectivity
- ✓ Sentry configuration
- ✓ Neon integration status
- ✓ TypeScript compilation
- ✓ Health endpoint response time

## Error Tracking

### Sentry Configuration

**Environments:**
- Production: Errors from `sploot.app`
- Preview: Errors from preview deployments
- Development: Disabled (only logged to console)

**Key Features:**
- Server-side error capture (Next.js instrumentation)
- Client-side error boundaries
- Session replay on errors (100%)
- PII scrubbing (emails, tokens, sensitive headers)
- Source maps for readable stack traces

### Error Investigation Workflow

1. **Check Sentry Dashboard**
   - Filter by environment: `production`
   - Sort by: "Frequency" or "First Seen"

2. **Analyze Error Context**
   - Stack trace (with source maps)
   - User context (ID, not email)
   - Request context (path, method, route type)
   - Breadcrumbs (user actions before error)

3. **Reproduce Locally**
   - Check if error occurs in development
   - Verify database connectivity
   - Check environment variable configuration

4. **Fix and Deploy**
   - Create fix branch
   - Test in preview environment
   - Merge to master for production deployment

### Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `Database connection failed` | Neon database offline or credentials changed | Check Neon console, verify `POSTGRES_URL` |
| `Unauthorized` | Clerk session expired | Check Clerk dashboard for outages |
| `auth:db-sync-failed` | Database sync failed but auth proceeded | Check database connectivity, migrations |

## Analytics

### Vercel Analytics

**Custom Events Tracked:**
- Upload: file selection, started, completed, failed
- Search: query submitted, results shown, result clicked, no results
- Assets: favorited, unfavorited, deleted
- Tags: added, removed

**Web Vitals:**
- **CLS** (Cumulative Layout Shift): Target < 0.1
- **LCP** (Largest Contentful Paint): Target < 2.5s
- **FCP** (First Contentful Paint): Target < 1.8s
- **FID** (First Input Delay): Target < 100ms
- **TTFB** (Time to First Byte): Target < 600ms

### Event Schema

See `lib/analytics.ts` for full event definitions. All events are type-safe with discriminated unions.

## Database Monitoring

### Environment Separation

| Environment | Branch | Endpoint |
|-------------|--------|----------|
| Production | `main` | `ep-broad-credit-adnne0ox-pooler` |
| Development | `development` | `ep-round-unit-adq9jm2y-pooler` |
| Preview | Auto-created | Unique per PR |

### Connection Info

```bash
# List all branches
neonctl branches list \
  --project-id "lively-lake-63852609" \
  --api-key "$NEON_API_KEY" \
  --output json

# Get connection string
neonctl connection-string main \
  --project-id "lively-lake-63852609" \
  --api-key "$NEON_API_KEY" \
  --pooled
```

### Database Metrics

Monitor in Neon console:
- Active connections
- Query performance
- Storage usage
- Compute hours

## Alert Configuration

### Sentry Alerts

**Configured Alerts:**
1. **New Error Type** (Production)
   - Trigger: First occurrence of new error
   - Action: Email to project owners
   - Throttle: 30 minutes

**Manual Configuration Required:**
2. **High Error Rate**
   - Navigate to: Sentry → Alerts → Create Alert
   - Type: "Number of Errors"
   - Threshold: >10 events in 1 hour
   - Environment: production
   - Action: Email notification

3. **Crash-Free Sessions**
   - Type: "Crash Free Sessions"
   - Threshold: <98% in 1 hour
   - Environment: production
   - Action: Email notification

### Configure Alerts Script

```bash
export SENTRY_AUTH_TOKEN="your_token_here"
bash scripts/configure-sentry-alerts.sh
```

## Troubleshooting

### Deployment Failed

**Symptoms:** Vercel deployment shows "Error" status

**Diagnosis:**
```bash
# Check build logs
vercel logs deployment-url

# Check TypeScript errors
pnpm type-check

# Verify environment variables
vercel env ls production
```

**Common Causes:**
- TypeScript compilation errors
- Missing environment variables
- Database migration failures
- Sentry configuration issues

### Database Connection Issues

**Symptoms:** Health check shows database: fail

**Diagnosis:**
```bash
# Check Neon status
neonctl projects list --api-key "$NEON_API_KEY" --output json

# Test connection directly
DATABASE_URL="..." pnpm prisma db execute --stdin <<< "SELECT 1"

# Check environment variables
vercel env pull .env.production.local --environment production
grep POSTGRES_URL .env.production.local
```

**Common Causes:**
- Neon compute suspended (auto-resumes on connection)
- Wrong connection string in environment variables
- Database branch deleted
- Network issues

### Sentry Not Capturing Errors

**Symptoms:** No errors in Sentry dashboard despite app issues

**Diagnosis:**
```bash
# Check Sentry configuration
vercel env ls production | grep SENTRY

# Verify DSN format
# Should be: https://[hash]@o[org-id].ingest.us.sentry.io/[project-id]

# Test Sentry locally
# Trigger error in development and check console
```

**Common Causes:**
- `SENTRY_DSN` not set for server-side
- `NEXT_PUBLIC_SENTRY_DSN` not set for client-side
- Sentry disabled in development (expected)
- Source maps not uploaded

### Performance Degradation

**Symptoms:** Slow page loads, high TTFB, timeouts

**Diagnosis:**
```bash
# Check health endpoint response time
curl -w "@-" -o /dev/null -s https://sploot.app/api/health <<< \
'time_namelookup: %{time_namelookup}
time_connect: %{time_connect}
time_starttransfer: %{time_starttransfer}
time_total: %{time_total}'

# Check database query performance in Neon console
# Navigate to: Neon → Project → Branches → Insights
```

**Common Causes:**
- Database connection pooling exhausted
- Slow database queries (check Neon Insights)
- Vercel function cold starts
- Large asset transfers

## Best Practices

### Error Handling

```typescript
// Always use structured logging
import { logger } from '@/lib/observability-logger';

try {
  await riskyOperation();
} catch (error) {
  logger.logError('operation-failed', error as Error, {
    context: 'additional-info',
    userId: user.id,
  });
  throw error; // Re-throw to trigger error boundary
}
```

### Performance Monitoring

```typescript
import { getPerformanceMonitor } from '@/lib/performance-monitor';

const perfMonitor = getPerformanceMonitor();

perfMonitor.measureAsync('upload-single', async () => {
  // Your operation here
});
```

### Analytics Tracking

```typescript
import { track } from '@/lib/analytics';

track({
  name: 'upload_completed',
  properties: {
    assetId: 'asset_123',
    duration: 1234,
    size: 56789,
  },
});
```

## Maintenance Tasks

### Weekly
- [ ] Review Sentry error trends
- [ ] Check Vercel Analytics for usage patterns
- [ ] Monitor database storage growth

### Monthly
- [ ] Review and clean up old preview branches
- [ ] Check for dependency updates
- [ ] Review alert configurations

### Quarterly
- [ ] Review Sentry quota usage
- [ ] Optimize slow database queries
- [ ] Update documentation
