Use Prisma/Neon operations through `pnpm --filter web <script>`. Prisma reads
`DATABASE_URL` before Node starts; keep the variable name, and use a pooled Neon
host containing `-pooler` plus `pgbouncer=true` for runtime connections.

- `db:migrate:dev` — create and apply a named development migration
- `db:migrate` — apply migrations in deploy mode
- `db:push` — prototyping only; do not use for shipping schema changes
- `db:generate` — regenerate the Prisma client
- `db:studio` — open Prisma Studio
- `db:seed` — seed data
- `db:sync`, `db:fingerprint`, `db:drift` — inspect environment and drift

Check `DATABASE_URL` points at the intended environment before a schema or
migration operation. CI uses `pgvector/pgvector:pg15`.
