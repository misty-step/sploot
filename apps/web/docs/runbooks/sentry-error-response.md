# Sentry error response

## detect

```bash
curl -fsS https://www.sploot.app/api/health/live | jq
curl -fsS https://www.sploot.app/api/health | jq
```

- `/api/health/live` returning `alive` while `/api/health` is `503` means the
  process is healthy and a dependency is degraded.
- A Sentry issue for project `sploot` with tag `service=sploot-web` is the
  agent-facing error surface. DigitalOcean runtime logs remain the raw request
  record.

Production new-issue alerts are partitioned by `error.unhandled`:

- handled: rule `16434801`, team `Misty Step`;
- unhandled: rule `16664820`, team `Misty Step`.

Both rules require `environment=production`. Project-side default scrubbing,
IP-address scrubbing, and the repository sanitizer are all enabled.

## diagnose

1. Open the Sentry issue and read `sploot.context`, `sploot.trace_id`,
   release, and environment. Do not treat request URLs, user ids, or raw
   client error text as available; the sanitizer removes them.
2. Correlate the same `traceId` and timestamp in DigitalOcean runtime logs.
3. Replay the affected route through deployed-smoke or the authenticated QA
   harness.
4. Record the request/response pair and the Sentry issue URL.

## recover

Fix the owning route or dependency, deploy, and confirm:

- `/api/health` returns `ok`;
- the Sentry issue is resolved or marked as a regression watch;
- no second error product remains configured (`CANARY_*` must stay absent).

Telemetry failure must never block upload, search, authentication, or health
responses.
