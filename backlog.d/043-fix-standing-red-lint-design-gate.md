# Fix the standing-red lint:design gate

Priority: P3 · Status: ready · Estimate: S

## Goal

`pnpm lint:design` passes (or is honestly scoped) on master, so gate output is
trustworthy again.

## Oracle

- [ ] `pnpm lint:design` exits 0 on master.
- [ ] The gate no longer hard-requires docs that don't exist, OR those docs
      (`docs/design/component-library.md`, `docs/design/tokens.md`) are written.

## Notes

`pnpm lint:design` exits 1: `scripts/check-design-system.mjs:34,113-114`
hard-requires `docs/design/component-library.md` (Pile/cluster grammar) and
`docs/design/tokens.md`, which are **absent** — yet `apps/web/CLAUDE.md` tells devs
to "read those." Debt from the recent piles work; not introduced by any single
ticket. A standing-red gate trains everyone to ignore gate output. Since the design
system is being imported separately (the docs may arrive with it), prefer relaxing
the checker to match current reality over writing throwaway docs — decide at
delivery. Evidence lanes: groom 2026-06-21 "architecture" + "onboarding/delight".
