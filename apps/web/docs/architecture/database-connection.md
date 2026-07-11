# database connection architecture

Prisma reads one canonical `DATABASE_URL` at process initialization. production
uses Neon Postgres with pgvector; local and CI use ordinary pgvector-capable
Postgres. business logic does not know which provider serves the wire protocol.

use a pooled URL for the long-running web process and `DATABASE_URL_DIRECT` for
migrations when available. `scripts/migrate-deploy.mjs` owns that selection.

Postgres is authoritative for users, assets, vectors, share slugs, quotas,
embedding caches, rate windows, in-flight embedding leases, and the daily spend
ceiling. ADR-010 explains why the limiter shares this existing durability layer
instead of adding Redis/KV.

health probes connectivity and the limiter schema in one query. stale Prisma
connections get one disconnect/connect retry. missing limiter tables are a 503,
not a false `up`.

schema changes ship as reviewed migrations under `prisma/migrations/`, run
against a pgvector service in CI, and are applied before the application relies
on them. tests that exercise database invariants must run against the real
database boundary rather than an internal mock.
