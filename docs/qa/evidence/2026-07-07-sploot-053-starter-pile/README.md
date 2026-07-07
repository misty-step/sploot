# QA evidence — sploot-053 stranger-to-aha starter pile (2026-07-07)

**Intent:** prove a stranger with no prior account gets from the landing page
to a successful plain-words search returning a correct meme in under 5
minutes, on real product machinery (real assets, real CLIP vectors, pgvector
cosine). Design decision: `docs/design/lab-053-stranger-aha.html` (7
structurally distinct mechanisms, winner: option 02 opt-in starter pile,
delegated-mode verdict recorded in-file).

**Runtime:** `pnpm dev:local` (docker pgvector + qa:seed + qa-local auth,
http://localhost:3001), walked with `agent-browser` in an isolated session.
The stranger is a fresh 0-asset qa-local principal
(`/api/qa-auth/login?user=qa-stranger-aha2` — locally the qa-auth login
stands in for Clerk sign-up; production sign-up is open, verified on
sploot-053's card body).

## Timed walk — 35 seconds landing → aha

Wall-clock epoch stamps: landing open `1783447143` → search results rendered
`1783447178` = **35 s** (acceptance budget: 300 s). Recording:
`stranger-to-aha.webm` (real time); demo asset `docs/demo/stranger-to-aha.gif`
(2.5× speed).

1. `01-landing.png` — signed-out landing (SIGN IN visible), hero pitch +
   honest token-overlap sim console.
2. `02-first-run-empty-state.png` — first `/app` load: 0-meme capture rig
   with the demo pile lane offering **LOAD THE STARTER PILE** ("8 demo memes,
   real vectors — delete anytime"). No dead empty grid.
3. (seeding) — one tap POSTs `/api/library/starter`: 8 bundled license-safe
   memes ingested through the normal upload pipeline (blob + record +
   `starter-pile` tag) with precomputed CLIP vectors upserted directly, then
   the client routes to `/app?q=two cats arguing at a table`.
4. `04-aha-search-results.png` — real `/api/search` over pgvector: the
   cats-arguing meme is the High match at 30 % similarity (next best 19 %),
   query latency 0.46 s, match states rendered.

## API readbacks (curl, second fresh user `qa-stranger-053b`)

- `POST /api/library/starter` → 200 in **3.58 s**:
  `{"seeded":8,"already":0,"failed":[],"total":8,"suggestedQueries":[...]}`.
- `POST /api/search {"query":"two cats arguing at a table"}` → top result =
  cats-arguing asset (similarity 0.30, `embeddingStatus":"ready"`, tag
  `starter-pile`), clear margin over #2 (0.19).

## Found & fixed during the walk

An aborted first walk (shared-browser interruption) exposed that ingest
scheduled async Replicate embedding generation for starter assets whose
vectors are already committed — wasted Replicate calls, rate-limit leases,
and budget slots racing the direct upsert. Fixed test-first:
`ingestImage({ scheduleEmbeddings: false })` skips the scheduler entirely on
the starter path (`__tests__/api/library-starter.test.ts`).

## Not covered

- Production deploy smoke (`pnpm --filter web smoke:deployed`) owed after
  merge deploys; local blob writes used the real Vercel Blob store.
- Clerk-hosted sign-up UI not exercised locally (qa-local auth stands in);
  `/sign-up` 200 verified on the card.
