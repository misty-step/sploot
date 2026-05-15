# Ship First-Class Shuffle API Contract

Priority: high
Status: done
Estimate: M

## Goal

Shuffle is a documented, mechanically testable API behavior for returning
randomized authenticated-user assets.

## Non-Goals

- Building AI meme generation
- Reworking all search ranking
- Adding anonymous/public shuffle

## Oracle

- [ ] A documented REST endpoint or documented query mode returns randomized
      authenticated-user assets.
- [ ] The contract includes `limit` and either seed semantics or an explicit
      decision that shuffle is intentionally non-deterministic.
- [ ] Focused route tests cover bounds and deterministic seed behavior when
      applicable.
- [ ] `apps/web/docs/API.md` describes the shipped contract.
- [ ] `pnpm lint && pnpm type-check && pnpm --filter web test && pnpm --filter extension build`
      passes, with DB-backed verification or an explicit DB-unverified note if
      pgvector/database paths are touched.

## Scope

- `apps/web` API route or existing assets/search query behavior
- `apps/web/docs/API.md`
- `apps/web/lib/db.ts`
- `apps/web/lib/filter-change.ts`
- Extension call path only if quick shuffle UX consumes the API directly

## Why Now

`vision.md` names save/search/shuffle as the current core experience and calls
shuffle a differentiator. Existing UI/database support should be grounded in a
backend contract before more clients depend on it.

## What Was Built

`GET /api/assets` now has a documented seeded shuffle mode:
`sortBy=shuffle&shuffleSeed=<0..1000000>&limit=<1..100>&offset=<n>`.
The route validates integer bounds strictly, requires `shuffleSeed` for shuffle,
rejects `shuffleSeed` outside shuffle mode, and uses PostgreSQL `setseed()` in
the same transaction as the raw shuffle query. `apps/web/docs/API.md` documents
the contract, pagination shape, shuffle example, and validation errors.

Focused route tests cover seed validation, strict pagination bounds, and the
shuffle-only seed contract. A pgvector-backed integration test applies Prisma
migrations to `pgvector/pgvector:pg15`, seeds private user assets, and proves
the same seed returns a deterministic authenticated-user shuffle page.

Verified on 2026-05-15:

- `DATABASE_URL=postgresql://test:test@localhost:5432/sploot_test?sslmode=disable CI=true pnpm lint`
- `DATABASE_URL=postgresql://test:test@localhost:5432/sploot_test?sslmode=disable CI=true pnpm type-check`
- `DATABASE_URL=postgresql://test:test@localhost:5432/sploot_test?sslmode=disable CI=true pnpm --filter web test`
- `DATABASE_URL=postgresql://test:test@localhost:5432/sploot_test?sslmode=disable CI=true pnpm --filter extension build`
