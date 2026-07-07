# QA evidence — sploot-051 README front-door search screenshot (2026-07-07)

**Intent:** capture a real screenshot of text→image semantic search returning
ranked results, for use as the README's "search-in-action" proof (acceptance
criterion 1).

**Runtime:** existing `pnpm dev:local` server already running on
`http://localhost:3001` (docker pgvector + `qa:seed`, qa-local auth), walked
with `agent-browser`.

## Steps

1. Signed in via `GET /api/qa-auth/login?user=qa-design-user` (qa-local auth
   cookie, non-prod only).
2. Landed on `/app`; typed `reaction face meme` into the search box — this is
   one of the deterministic pile-anchor queries seeded by
   `apps/web/scripts/qa-seed.ts` (`apps/web/lib/piles/semantic-piles.ts`
   `PILE_ANCHORS`), so it has a real deterministic embedding and returns real
   ranked matches instead of the 0-result response an arbitrary query gets
   against seed data (no live Replicate in the local harness).
3. Search returned 4 results in 0.07s with confidence bands (`High match`,
   `Medium`, `Standard`) — captured in `app-search-in-action-1440x900.png`.

## Console

No errors observed during the walk beyond the pre-existing dev:local SSE
reconnect noise (no embedding worker in local harness) documented in
`docs/qa/evidence/2026-07-07-sploot-074-capture-rig/README.md`.

## Not covered

- Production search against real user content (seed data is deterministic
  placeholder assets, honestly labeled "qa seed" in the images themselves).
- This is a documentation screenshot only; no product code changed.
