# Context Packet: taste engine v1

## Goal

Sploot surfaces memes that are semantically close to a user's marked bangers
without changing uniform shuffle as the default library experience.

## Non-Goals

- Do not add a new embedding provider or vector store.
- Do not generate images in this ticket.
- Do not persist taste profiles as new tables until runtime evidence shows
  recomputation is too slow.
- Do not make taste weighting the default order.

## Constraints

- Existing CLIP image embeddings in `asset_embeddings.image_embedding` are the
  only similarity substrate.
- `favorite` remains the user signal for bangers.
- Uniform seeded shuffle must keep its current deterministic contract and
  remain the default.
- Libraries with too few ready banger embeddings must return an honest
  insufficient-signal state, not fake confidence.
- Pagination must stay bounded by the existing `limit`/`offset` contract.

## Repo Anchors

- Powder card `sploot-029` — premise and oracle.
- `apps/web/app/api/assets/route.ts` — current asset listing, seeded shuffle,
  sort validation, pagination, and raw SQL pattern.
- `apps/web/lib/piles/semantic-piles.ts` — vector parsing, cosine helpers,
  anchor-label pattern, and honest insufficient status.
- `apps/web/hooks/use-assets.ts` and `apps/web/hooks/use-sort-preferences.ts`
  — client request parameters and persisted sort state.
- `apps/web/app/app/page.tsx` — library workbench and automatic pile rail.
- `apps/web/components/chrome/sort-dropdown.tsx` and
  `apps/web/components/chrome/mobile-command-dock.tsx` — visible mode controls.
- `apps/web/__tests__/api/assets.test.ts` and
  `apps/web/__tests__/api/assets.integration.test.ts` — API and DB-backed
  shuffle oracles to extend.
- `apps/web/scripts/qa-evidence.ts` — live evidence packet harness.

## Alternatives

1. **Extend `/api/assets` with `sortBy=taste`** — recommended. Reuses the
   existing list/pagination surface, keeps a visible toggle in existing sort
   controls, and allows seeded proof that taste order differs from uniform.
   Failure mode: raw SQL grows, so isolate vector math in a small module.
2. **Build a separate `/api/taste` recommendation service** — rejected for v1.
   It creates another pagination/result contract when the UI needs a list
   order, not a new domain surface.
3. **Persist taste profiles in a new table** — rejected for v1. Centroids over
   a user's ready banger embeddings are cheap enough to compute on demand for
   the current single-user/personal-library scale; add persistence only after
   evidence.
4. **Generate memes from taste immediately** — rejected by ADR 0004. Provider
   cost, safety, and prompt quality need a future opt-in product shape.

## Design

Add a deep, narrow `lib/taste/taste-engine.ts` module that exposes:

- `getTasteProfile(userId)` for a minimal profile surface.
- `getTasteWeightedAssets(options)` for ordered assets.
- pure helpers for centroid, cosine scoring, and labels.

Taste mode computes a centroid from ready image embeddings on favorited assets.
Asset ranking then scores ready embedded assets by cosine similarity to that
centroid, ordering by score descending with stable ID tie-breakers. Non-embedded
assets do not appear in taste mode; the API response includes metadata saying
how many ready banger embeddings powered the ranking.

Expose:

- `GET /api/assets?sortBy=taste&limit=...&offset=...` for taste-weighted
  library ordering.
- `GET /api/taste/profile` for `"your taste"` status, labels, banger count,
  and representative assets.
- Sort controls with a visible "TASTE" option. Uniform shuffle stays default.

Taste labels reuse curated anchor text embeddings only if the text cache can
serve them; otherwise profile status remains ready with neutral copy and no
provider call in the hot path.

## Oracle

- `pnpm --filter web exec vitest run __tests__/lib/taste/taste-engine.test.ts
  __tests__/api/assets.test.ts __tests__/api/taste-profile.test.ts`
- `DATABASE_URL=postgresql://test:test@localhost:5432/sploot_test?sslmode=disable
  pnpm --filter web exec vitest run __tests__/api/assets.integration.test.ts`
- `pnpm --filter web qa:evidence -- --slug taste-engine --routes /app
  --seed-count 60 --tests __tests__/lib/taste/taste-engine.test.ts,__tests__/api/taste-profile.test.ts
  --risk "taste-matched generation intentionally not implemented; see ADR 0004"`
- Full ship gate: `pnpm lint && pnpm type-check && pnpm --filter web test &&
  pnpm --filter extension build`.

Live acceptance:

- On the seeded DB, uniform shuffle and taste mode return visibly different
  first-page orders.
- With fewer than two ready banger embeddings, profile returns
  `insufficient_bangers` and taste mode returns a typed 200 empty state rather
  than fake recommendations.
- ADR `docs/adr/0004-taste-matched-generation.md` exists before generation
  code.

## Premise Source

sha256:7e0e09355da9e7e48810349f78f70c75bde467b82d80a70fb6fd7da55c051074
Powder card `sploot-029`

## Risks + Rollout

- **Sparse signal:** new users may have no bangers. Keep uniform default and
  show an insufficient-state message.
- **Vector SQL drift:** add DB-backed tests using deterministic embeddings.
- **Cost creep:** no generation and no new provider calls in v1 hot paths.
- **Rollback:** remove `sortBy=taste`, the `/api/taste/profile` route, and UI
  controls; existing data remains unchanged because v1 adds no persistent
  taste state.
