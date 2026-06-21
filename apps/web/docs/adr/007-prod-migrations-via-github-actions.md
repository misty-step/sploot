# ADR-007: Apply production migrations via GitHub Actions, not the Vercel build

Status: Accepted (2026-06-21)

## Context

Schema and code must not ship apart (incident 2026-06-09: a migration never ran;
2026-06-20: the `upload_tokens` table for #033 could not be applied to prod from
a developer/agent machine). The web `build` script already runs
`scripts/migrate-deploy.mjs` before `next build`, but on Vercel the production
`DATABASE_URL` is a **Sensitive** environment variable: injected at runtime,
withheld at build time and from `vercel env pull`. So the build-time migrate step
always skips on prod, and applying a migration requires a human holding the
sequestered connection string — there is no hands-off path. The prod Neon project
also lives on an account a developer's `neonctl`/`op` may not be logged into.

## Decision

Apply pending production migrations from a dedicated **GitHub Actions job**
(`migrate-prod` in `.github/workflows/ci.yml`) that runs on push to `master`
after the merge gate passes. The job reads the prod connection string from the
`PRODUCTION_DATABASE_URL` **repository secret** and runs `prisma migrate deploy`
through the existing `migrate-deploy.mjs` (which derives a direct, non-pooler
URL). The secret lives in GitHub; no human or agent handles it per-deploy.

Until the secret is set the job emits a visible `::warning::` and no-ops, so it
is inert-but-loud rather than silently green.

Activation (one-time): `gh secret set PRODUCTION_DATABASE_URL` with the same
value as Vercel's prod `DATABASE_URL` (the script derives the direct URL itself).

## Consequences

- A merged migration is applied to prod with **no human credential step**. Closes
  the #033 prod-migration gap and epic 036 child 1.
- Deploy (Vercel) and migrate (Actions) race by a couple of minutes, so
  migrations must stay **backward-compatible (expand/contract)**: add
  columns/tables before the code that requires them; never drop in the same
  release as the code that stops using them.
- `migrate deploy` is idempotent, so running on every `master` push is a cheap
  no-op when nothing is pending. A `paths: prisma/migrations/**` filter is a
  possible later optimization.
- The Vercel build's migrate step stays as a harmless skip; the runtime app is
  unaffected.
- **Rejected:** un-marking `DATABASE_URL` as Sensitive so the build could migrate
  — a security downgrade that would also run migrations on every preview build.
