# Fix the standing-red lint:design gate

Priority: P3 · Status: done · Estimate: S

## Goal

`pnpm lint:design` passes (or is honestly scoped) on master, so gate output is
trustworthy again.

## Oracle

- [ ] `pnpm lint:design` exits 0 on master.
- [ ] The gate no longer hard-requires docs that don't exist, OR those docs
      (`docs/design/component-library.md`, `docs/design/tokens.md`) are written.

## What Was Built

- wrote the neo-brutalist design-system token contract in
  `docs/design/tokens.md`
- refreshed `docs/design/component-library.md` with the live sploot wrapper
  grammar and state rules
- hardened `scripts/check-design-system.mjs` so `pnpm lint:design` checks the
  current token/component docs and rejects stale landing-system leftovers
- left the broader 032 epic open for substrate dependency mapping, core app
  surfaces, changelog rendering, pricing, and full-surface evidence

Verification:

- `pnpm lint:design`
- `DATABASE_URL=postgresql://test:test@localhost:5432/sploot_test?sslmode=disable pnpm lint`
- `DATABASE_URL=postgresql://test:test@localhost:5432/sploot_test?sslmode=disable pnpm type-check`
- `DATABASE_URL=postgresql://test:test@localhost:5432/sploot_test?sslmode=disable pnpm --filter web test`
- `DATABASE_URL=postgresql://test:test@localhost:5432/sploot_test?sslmode=disable pnpm --filter extension build`

Ships-backlog: backlog.d/_done/043-fix-standing-red-lint-design-gate.md

## Notes

`pnpm lint:design` exits 1: `scripts/check-design-system.mjs:34,113-114`
hard-requires `docs/design/component-library.md` (Pile/cluster grammar) and
`docs/design/tokens.md`, which are **absent** — yet `apps/web/CLAUDE.md` tells devs
to "read those." Debt from the recent piles work; not introduced by any single
ticket. A standing-red gate trains everyone to ignore gate output. Since the design
system is being imported separately (the docs may arrive with it), prefer relaxing
the checker to match current reality over writing throwaway docs — decide at
delivery. Evidence lanes: groom 2026-06-21 "architecture" + "onboarding/delight".
