# local setup

This is the retained Next.js predecessor's local harness, not the root
`pnpm dev:local` command (which starts the persistent Go library). From the
repository root, to start the separate seeded Next.js harness:

```bash
pnpm install --frozen-lockfile
pnpm --filter web dev:local
```

The web launcher starts a disposable pgvector Postgres, applies migrations,
boots the predecessor, and writes a doctor packet under `.sploot-local/`.
Do not use `pnpm --filter web dev:local:down` as routine cleanup: its script
recursively removes the shared `.sploot-local/` directory, including a Go
library if one exists there.

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

there is no secondary remote cache for this predecessor. the DigitalOcean
Sploot runtime has been retired; see `docs/DEPLOYMENT.md` for the canonical
hosted Go instance and retained provider history.
