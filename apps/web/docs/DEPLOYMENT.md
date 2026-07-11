# deployment

the web application runs as a long-lived DigitalOcean App Platform service.
the canonical public origin is `https://www.sploot.app`; merges to `master`
trigger the configured source deployment.

## runtime dependencies

- Neon Postgres with pgvector, supplied as `DATABASE_URL`;
- Vercel Blob, supplied as `BLOB_READ_WRITE_TOKEN` (the one intentional Vercel
  data-plane dependency);
- Clerk identity;
- Replicate embeddings;
- Canary diagnostics.

the embedding limiter and daily spend ceiling live in Postgres. there is no KV,
Redis, or Upstash runtime dependency.

## required environment

```env
NODE_ENV=production
DEPLOYMENT_ENV=production
DATABASE_URL=
DATABASE_URL_DIRECT=
NEXT_PUBLIC_BASE_URL=https://www.sploot.app
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
BLOB_READ_WRITE_TOKEN=
REPLICATE_API_TOKEN=
CANARY_ENDPOINT=https://canary.mistystep.io
CANARY_API_KEY=
CANARY_SERVICE_NAME=sploot-web
```

`DATABASE_URL_DIRECT` is preferred for migrations; the migration helper derives
the direct Neon endpoint from the pooled URL when it is absent.

## deploy contract

```bash
pnpm install --frozen-lockfile
pnpm --filter web db:migrate
pnpm --filter web build
pnpm --filter web start
```

CI applies migrations to a pgvector test database before running the web suite.
on `master`, the `migrate-prod` job applies pending migrations before the new
source build becomes the intended runtime. migrations in this repository are
forward-only and additive unless their own SQL says otherwise.

## verification

```bash
DEPLOYMENT_URL=https://www.sploot.app pnpm --filter web validate:deployment
EXPECT_CANARY_CONFIGURED=1 pnpm --filter web smoke:deployed
```

the health contract requires database `up`, embedding limiter `up`, and
share-slug cache `local`. a green process without that end-to-end response is
not a verified deployment.

## rollback

roll back the DigitalOcean source deployment to the last green commit, then
repeat both verification commands. ADR-010's limiter tables are additive and
may remain. a rollback to code that expected KV fails embedding generation
closed; forward recovery is preferred.
