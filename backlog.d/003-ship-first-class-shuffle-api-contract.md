# Ship First-Class Shuffle API Contract

Priority: high
Status: ready
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
