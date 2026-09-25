# database connection failure

Retained Next.js predecessor only. There is no live DigitalOcean Sploot app;
the legacy `www.sploot.app` API now returns `410`. Diagnose the current Go
service with [native runtime operations](../DEPLOYMENT.md#canonical-hosted-go-instance),
not this Postgres runbook.

## detect

```bash
NEXT_ORIGIN=http://localhost:3001 # explicitly started predecessor
curl -fsS "$NEXT_ORIGIN/api/health/live" | jq   # process liveness
curl -fsS "$NEXT_ORIGIN/api/health" | jq        # Postgres readiness
```

- `/api/health/live` returning `alive` while `/api/health` is `503` means the
  process is healthy and a dependency (usually the database) is degraded —
  platform routing stays up by design (incident 2026-07-15: routing on the
  deep oracle produced `no_healthy_upstream` during a database stall);
- `dependencies.database=down` means Postgres is unreachable or the bounded
  health probe could not complete;
- `dependencies.database=up` with `embedding_limiter=down` means migration
  `20260710000000_add_embedding_rate_limits` is missing;
- `diagnostics.database_url_configured=false` means the runtime lacks
  `DATABASE_URL`.

## diagnose

1. read the matching Sentry issue and the selected predecessor instance's logs by timestamp;
2. validate the connection string locally without printing it:
   `DATABASE_URL=... pnpm validate:env`;
3. run `DATABASE_URL=... pnpm db:migrate` from `apps/web`;
4. query `SELECT 1`, then confirm both limiter tables with `to_regclass`;
5. re-run `DEPLOYMENT_URL="$NEXT_ORIGIN" pnpm --filter web validate:deployment` against that instance.

Neon pooled URLs need TLS and the pooler parameters documented by Neon. prefer
`DATABASE_URL_DIRECT` for DDL. do not mutate environment variables in
JavaScript after Prisma initialization.

## recover

restore a last known-good secret or Neon branch only for an explicitly authorized
predecessor instance, apply pending migrations, restart it, and verify health
plus one signed-out API contract. do not recreate the retired DigitalOcean app
or treat a successful SQL query alone as recovery of the hosted Go library.
