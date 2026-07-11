# database connection failure

## detect

```bash
curl -fsS https://www.sploot.app/api/health | jq
```

- `dependencies.database=down` means Postgres is unreachable or Prisma could
  not reconnect;
- `dependencies.database=up` with `embedding_limiter=down` means migration
  `20260710000000_add_embedding_rate_limits` is missing;
- `diagnostics.database_url_configured=false` means the runtime lacks
  `DATABASE_URL`.

## diagnose

1. read the matching Canary group and DigitalOcean runtime log by timestamp;
2. validate the connection string locally without printing it:
   `DATABASE_URL=... pnpm validate:env`;
3. run `DATABASE_URL=... pnpm db:migrate` from `apps/web`;
4. query `SELECT 1`, then confirm both limiter tables with `to_regclass`;
5. re-run `pnpm validate:deployment` against the public origin.

Neon pooled URLs need TLS and the pooler parameters documented by Neon. prefer
`DATABASE_URL_DIRECT` for DDL. do not mutate environment variables in
JavaScript after Prisma initialization.

## recover

restore the last known-good secret or Neon branch, apply pending migrations,
restart/redeploy the web component, and verify health plus one signed-out API
contract. do not mark recovery complete from a successful SQL query alone.
