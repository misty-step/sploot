# observability

This describes the retained Next.js predecessor, not the currently hosted Go
library. The former DigitalOcean Sploot app is retired.

Sploot emits provider-neutral JSON logs from `lib/observability-logger.ts`.
Handled server errors and client error boundaries also report to Sentry project
`misty-step/sploot`. Sentry failure never affects request status, routing, or
dependency readiness.

```env
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_DSN=
SENTRY_AUTH_TOKEN=
SENTRY_TRACES_SAMPLE_RATE=0.1
SPLOOT_DEPLOYMENT_ENV=production
SPLOOT_DEPLOYMENT_COMMIT=${_self.COMMIT_HASH}
```

`SENTRY_AUTH_TOKEN` is build-only. Production builds fail closed when the DSN,
source-map token, or exact deployment commit is absent. The SDK sends no user
identity, cookies, headers, bodies, query strings, source context, browser
replays, or SDK logs. Production trace sampling defaults to 10% and is capped
at 20%.
`@sentry/nextjs` is exact-pinned at 10.71.0 because 10.72–10.73 crash
under jsdom ([upstream #23789](https://github.com/getsentry/sentry-javascript/issues/23789)).
Lift the pin only after the upstream module-load regression is fixed.


Browser product events use the authenticated first-party `/api/telemetry`
route through one typed client. The route accepts only bounded structural
fields and writes provider-neutral JSON logs. Browser error boundaries capture
the exception in Sentry and send only boundary/name/stack-presence fields to
the first-party route, so the server does not create a duplicate Sentry event.

To verify an explicitly started predecessor instance (not the legacy
`www.sploot.app` host, whose API returns `410`):

```bash
NEXT_ORIGIN=http://localhost:3001
curl -fsS "$NEXT_ORIGIN/api/health/live" | jq
curl -fsS "$NEXT_ORIGIN/api/health" | jq
curl -fsS "$NEXT_ORIGIN/api/health/services" | jq
DEPLOYMENT_URL="$NEXT_ORIGIN" pnpm --filter web validate:deployment
```

`/api/health/live` is the predecessor's provider-free routing probe.
`/api/health` is its database/schema readiness oracle. Neither endpoint
calls or reports Sentry. For current hosted Go readiness, use
`https://sploot.mistystep.io/api/health/services`. See
[`docs/runbooks/sentry-error-response.md`](docs/runbooks/sentry-error-response.md)
for retained predecessor alert history and incident response.
