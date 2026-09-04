# local setup

from the repo root:

```bash
pnpm install --frozen-lockfile
pnpm dev:local
```

`dev:local` starts a disposable pgvector Postgres, applies migrations, boots the
web app, and writes a doctor packet under `.sploot-local/`. use
`pnpm dev:local:down` to stop and remove generated local state.

for an existing Postgres instance, copy `.env.example` to `.env.local`, set
`DATABASE_URL`, and run:

```bash
pnpm --filter web db:migrate
pnpm --filter web dev
```

core variables:

- `DATABASE_URL`: Postgres/pgvector connection;
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`: identity;
- `BLOB_READ_WRITE_TOKEN`: Vercel Blob storage;
- `REPLICATE_API_TOKEN`: embedding generation;
- `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_DSN`, and `SENTRY_AUTH_TOKEN`: error diagnostics and build-time source-map upload.

there is no secondary remote cache or retired compute-provider configuration. see
`docs/DEPLOYMENT.md` for the production contract and ADR-010 for the provider
boundary.
