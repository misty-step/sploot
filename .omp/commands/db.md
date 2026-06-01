Prisma / Neon database operations for apps/web.

CRITICAL: Prisma's Rust engine reads `DATABASE_URL` before Node starts —
runtime env edits are too late in serverless. Never use an alias like
`POSTGRES_URL`. The pooled Neon URL must include `-pooler` host + `pgbouncer=true`.

Available scripts (run via `pnpm --filter web <script>`):
- `db:migrate:dev`  — create + apply a dev migration (`prisma migrate dev`)
- `db:migrate`      — apply migrations in deploy mode (`prisma migrate deploy`)
- `db:push`         — push schema without a migration (prototyping only)
- `db:generate`     — regenerate the Prisma client
- `db:studio`       — open Prisma Studio
- `db:seed`         — seed data
- `db:sync` / `db:fingerprint` / `db:drift` — env sync + drift checks

Tell me which operation you want. Before any schema change, confirm
`DATABASE_URL` is set and pointed at the intended environment, and prefer a
named migration (`db:migrate:dev`) over `db:push` for anything that ships.
