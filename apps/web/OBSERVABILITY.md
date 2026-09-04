# observability

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

Runtime proof:

```bash
curl -fsS https://www.sploot.app/api/health/live | jq
curl -fsS https://www.sploot.app/api/health | jq
curl -fsS https://www.sploot.app/api/health/services | jq
DEPLOYMENT_URL=https://www.sploot.app pnpm validate:deployment
```

`/api/health/live` is the provider-free routing probe. `/api/health` is the
database/schema readiness oracle. Neither endpoint calls or reports Sentry.
Use [`docs/runbooks/sentry-error-response.md`](docs/runbooks/sentry-error-response.md)
for alert ownership and incident response.
