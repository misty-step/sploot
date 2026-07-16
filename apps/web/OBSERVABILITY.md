# observability

Sploot emits provider-neutral JSON logs from `lib/observability-logger.ts`.
server errors and health check-ins are forwarded to Canary when these variables
are configured:

```env
CANARY_ENDPOINT=https://canary.mistystep.io
CANARY_API_KEY=
CANARY_SERVICE_NAME=sploot-web
DEPLOYMENT_ENV=production
```

browser product events use the authenticated first-party `/api/telemetry`
route through one typed client. non-success responses are treated as transport
failures instead of being silently accepted. the route validates and sanitizes
payloads, drops untrusted client error messages/stacks in favor of bounded
structural fields, then writes the same structured logs. public share pages do
not expose an unauthenticated analytics ingest surface.

runtime proof:

```bash
curl -fsS https://www.sploot.app/api/health/live | jq
curl -fsS https://www.sploot.app/api/health | jq
curl -fsS https://www.sploot.app/api/health/services | jq
DEPLOYMENT_URL=https://www.sploot.app pnpm validate:deployment
```

`/api/health/live` is the shallow process-liveness probe DigitalOcean routes
on; it must stay `alive` even while dependencies are degraded. `/api/health`
is the deep readiness oracle and must report database `up`, embedding limiter
`up`, share-slug cache `local`, and whether Canary is configured. raw request
logs live in the DigitalOcean component runtime; Canary is the agent-facing
error and check-in surface.
