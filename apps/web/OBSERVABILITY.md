# observability playbook

## overview

canary is sploot's diagnostic sink for agents: grouped errors, health checks,
replay, and annotations. vercel logs remain useful for raw execution logs, but
runtime error reporting should route through canary.

## canary integration

server-side route failures and authenticated client error telemetry are
forwarded to canary when these production environment variables are present:

```env
CANARY_ENDPOINT=https://canary-obs.fly.dev
CANARY_API_KEY=<ingest-scoped key>
CANARY_SERVICE_NAME=sploot-web
```

forwarding is best-effort: failures are swallowed so observability never blocks
upload, search, auth, or telemetry responses. payloads are sanitized before
ingest; token, cookie, secret, session, and API-key shaped metadata keys are
redacted.

runtime proof points:

- `/api/health` includes `diagnostics.canary_configured`.
- `/api/health/services` includes `services.canary` with `healthy`,
  `degraded`, or `not_configured`.
- `EXPECT_CANARY_CONFIGURED=1 pnpm --filter web smoke:deployed` fails deployed
  smoke when canary is missing or unreachable.
- query path: `GET /api/v1/query?service=sploot-web&window=1h`.

## useful checks

```bash
curl -fsS https://www.sploot.app/api/health | jq
curl -fsS https://www.sploot.app/api/health/services | jq '.services.canary'
curl -fsS "$CANARY_ENDPOINT/api/v1/query?service=sploot-web&window=1h" \
  -H "Authorization: Bearer $CANARY_READ_API_KEY" | jq
```

## vercel logs

use vercel logs for raw request traces and timing queries:

- `traceId:"abc123"` follows one request.
- `context:"request:error"` isolates route failures emitted by
  `withObservability`.
- `boundary:"image-tile-error-boundary"` catches client rendering failures.

client-side error boundaries ship sanitized payloads: no stack traces, no
`componentStack`, no query strings. expect `location.origin`,
`location.pathname`, `hasStack`, a `boundary` tag, and whitelisted metadata.

## troubleshooting

| problem | quick checks |
| --- | --- |
| no logs appearing | ensure `withObservability` wraps the route and the trace header is not stripped. |
| missing analytics events | verify `@vercel/analytics` is loaded and the client is not blocking analytics. |
| canary not receiving errors | check `CANARY_ENDPOINT`, `CANARY_API_KEY`, `CANARY_SERVICE_NAME`, and `/api/health/services`. |
| telemetry endpoint returning 401 | `/api/telemetry` requires an authenticated user from `getAuth`. |
| high cost alerts | pull `/api/analytics/usage` and cross-check with vercel log queries. |

keep this doc updated whenever instrumentation or alert thresholds change.
