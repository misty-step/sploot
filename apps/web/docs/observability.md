# observability and monitoring

## dashboard links

### canary diagnostics

- endpoint: `https://canary-obs.fly.dev`
- sploot query: `GET /api/v1/query?service=sploot-web&window=1h`
- health target: `https://www.sploot.app/api/health`

### vercel

- deployments, logs, analytics, and environment variables live under the
  misty-step `sploot` project.

### neon

- console: `https://console.neon.tech/`
- project: `lively-lake-63852609`
- branches: `main` for production, `development` for local/dev, previews per PR.

### clerk

- dashboard: `https://dashboard.clerk.com/`

## health checks

```bash
curl -L https://www.sploot.app/api/health | jq
curl -L https://www.sploot.app/api/health/services | jq '.services.canary'
```

before promoting to production:

```bash
pnpm validate:deployment
EXPECT_CANARY_CONFIGURED=1 pnpm --filter web smoke:deployed
```

the validation path checks required env vars, database connectivity, canary
configuration, neon integration status, type checking, and the health endpoint.

## error tracking

canary is the only runtime error sink.

- server route errors go through `lib/observability-logger.ts`.
- request errors from next instrumentation go through the same logger.
- client boundaries send sanitized events to `/api/telemetry`.
- `/api/telemetry` logs client errors as `client:error`, which the logger
  forwards to canary.
- metadata keys shaped like tokens, cookies, secrets, sessions, API keys, DSNs,
  or credentials are redacted before ingest.

## investigation workflow

1. query canary for the service and time window.
2. use the canary group hash or trace metadata to pivot into vercel logs.
3. reproduce locally with the same route, auth state, and database branch.
4. fix on a branch, run focused tests, then run the repo gate.
5. deploy and read back the synthetic canary smoke event.

## troubleshooting

### deployment failed

```bash
vercel logs deployment-url
pnpm type-check
vercel env ls production
```

common causes: type errors, missing env vars, database migration failures, or
canary env drift.

### database connection issues

```bash
neonctl projects list --api-key "$NEON_API_KEY" --output json
DATABASE_URL="..." pnpm prisma db execute --stdin <<< "SELECT 1"
vercel env pull .env.production.local --environment production
grep POSTGRES_URL .env.production.local
```

common causes: suspended compute, wrong connection string, deleted branch, or
network issues.

### canary not receiving errors

```bash
vercel env ls production | grep CANARY
curl -L https://www.sploot.app/api/health/services | jq '.services.canary'
```

common causes: missing `CANARY_ENDPOINT`, missing `CANARY_API_KEY`, wrong
`CANARY_SERVICE_NAME`, or a network problem between the app and canary.

## maintenance

weekly:

- review canary error groups for `sploot-web`.
- check vercel analytics for usage patterns.
- monitor database storage growth.

monthly:

- review and clean up old preview branches.
- check dependency updates.
- review canary target/alert configuration.

quarterly:

- optimize slow database queries.
- verify the deployed canary smoke path.
- update documentation.
