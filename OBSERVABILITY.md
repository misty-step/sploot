# Observability Playbook

## Overview

This guide is the go-to reference when you need to peek behind the curtain of Sploot's behaviour in production. Everything below is tuned for Vercel Logs + Sentry. Copy, paste, tweak filters, and keep the vibes tidy.

## SLO Monitoring Queries

> Replace `sploot-prod` with the actual deployment name if different.

### Search P95 latency
```sql
source:sploot-prod level:info operation:"search:query" | stats p95(duration) by bin(5m)
```
- Filters down to our instrumentation logs for search queries.
- Focuses on 5-minute buckets so you can spot spikes fast.

### Upload P95 latency
```sql
source:sploot-prod level:timing operation:"upload:direct" | stats p95(duration) by bin(5m)
```
- Same pattern for upload timings; 5-minute bin gives good signal.

### Error rate by route
```sql
source:sploot-prod level:error | parse json metadata as meta | stats count() by meta.pathname
```
- Extracts the structured metadata blob to group errors per route.

## Cost Monitoring Queries

### Daily burn rate (uploads)
```sql
source:sploot-prod operation:"usage_metric" | stats sum(metadata.count) as uploads, sum(metadata.count)*0.00022 as costUSD by meta.userId
```
- Usage telemetry from clients includes the count; multiply by $0.00022 to estimate spend per user per day.

### Monthly projection
```sql
source:sploot-prod operation:"usage_metric" | stats sum(metadata.count)*0.00022 as dailyCost | eval monthlyCost = dailyCost * 30
```
- Quick-and-dirty run-rate projection based on current daily burn.

## Alert Thresholds (Phase 2 targets)

Use these to calibrate alerts in Vercel or external tooling:
- **100 uploads/hour**: normal burst (e.g., small collection import).
- **500 uploads/day**: typical weekend collection.
- **Sustained >200 uploads/hour for 2+ hours**: likely abuse; triggers escalations.

## Working with Vercel Logs

1. Open the project in Vercel → *Observability* → *Logs*.
2. Select the production environment (or preview if debugging a branch).
3. Use the **Structured search** panel, drop in the query from above.
4. Set the timeframe (last hour / day) depending on the SLO you’re checking.
5. Export results as CSV when you need to share a snapshot.

### Helpful Filters
- `traceId:"abc123"` – follow a single request across services.
- `context:"request:error"` – isolate our failure logs emitted by `withObservability`.
- `boundary:"image-tile-error-boundary"` – catch client rendering blowups.

## Using Sentry Effectively

### Finding Fresh Errors
- Sentry Dashboard → *Issues* → filter by environment `production`.
- Look for new issues with a spike beyond baseline; check the traceId to correlate with logs.

### Setting Alerts
- Sentry → *Alerts* → create a rule for `event.type:error` with tags like `operation:upload`.
- Recommended thresholds: 5 errors in 5 minutes for critical paths.

### Grouping & Deduping
- Use `fingerprint` hints (already set in the logger) to group similar errors.
- Link issues back to the relevant observability log via `traceId` for context.

## Troubleshooting Guide

| Problem | Quick Checks |
| --- | --- |
| No logs appearing | Ensure `withObservability` wraps the route; confirm `TRACE_ID` header not stripped by clients. |
| Missing analytics events | Verify client isn’t in Do Not Track mode; ensure `@vercel/analytics` is loaded. |
| Sentry not capturing | Check `SENTRY_DSN` in env + preview env; run `npx @sentry/wizard` if reinitialising. |
| Telemetry endpoint returning 401 | Requires authenticated user; confirm session in app/api/telemetry hits `getAuth`. |
| High cost alerts | Pull `/api/analytics/usage` to confirm counts per hour/day; cross-check with Vercel log queries above. |

---

Keep this doc updated whenever we introduce new instrumentation or change alert thresholds. Run through the queries after each deploy to ensure everything’s still emitting cleanly.
