# Sentry error response

Retained Next.js predecessor only. The DigitalOcean Sploot runtime is retired;
the legacy `www.sploot.app` API returns `410`. For current Go operations use
[native runtime operations](../DEPLOYMENT.md#canonical-hosted-go-instance).

## detect

```bash
NEXT_ORIGIN=http://localhost:3001 # explicitly started predecessor
curl -fsS "$NEXT_ORIGIN/api/health/live" | jq
curl -fsS "$NEXT_ORIGIN/api/health" | jq
```

- `/api/health/live` returning `alive` while `/api/health` is `503` means the
  process is healthy and a dependency is degraded.
- A historical Sentry issue for project `sploot` with tag `service=sploot-web`
  concerns the predecessor. DigitalOcean runtime logs are historical records,
  not a current source of Sploot requests.

The recorded predecessor production new-issue alerts were partitioned by
`error.unhandled`:

- handled: rule `16434801`, team `Misty Step`;
- unhandled: rule `16664820`, team `Misty Step`.

Those recorded rules required `environment=production`. The repository
sanitizer remains in source; confirm provider-side scrubbing before relying
on retained Sentry data.

## diagnose

1. Open the Sentry issue and read `sploot.context`, `sploot.trace_id`,
   release, and environment. Do not treat request URLs, user ids, or raw
   client error text as available; the sanitizer removes them.
2. Correlate the same `traceId` and timestamp in retained predecessor logs.
3. Replay the affected route through a separately started predecessor instance
   or its authenticated QA harness, not the retired public origin.
4. Record the request/response pair and the Sentry issue URL.

## recover

For an explicitly authorized predecessor instance, fix the owning route or
dependency, deploy that instance, and confirm:

- `/api/health` returns `ok`;
- the Sentry issue is resolved or marked as a regression watch;
- no second error product remains configured (`CANARY_*` must stay absent).

Telemetry failure must never block upload, search, authentication, or health
responses.
