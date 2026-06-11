# Build automatic semantic piles

Priority: P1 · Status: done · Estimate: L

## Goal

The library actually sorts itself: assets cluster into labeled semantic piles
without the user typing a query, making "self-organizing piles" a shipped
feature instead of north-star copy.

## Oracle

- [x] An authenticated user with ≥50 embedded assets sees named piles (label +
      count + thumbnails) generated without typing anything, on a real surface
      (pile rail, sheet, or grid grouping — decided in shaping).
- [x] Clusters come from the existing CLIP embeddings in pgvector (no new
      embedding provider); recomputation is incremental or cheap enough to run
      on upload/cron.
- [x] Labels are auto-generated (e.g. nearest text anchors to the cluster
      centroid) and lowercase product voice.
- [x] Landing copy may then truthfully say "automatic piles" — flip the
      feature-true framing in `DESIGN.md` §7 and the hero back from
      "piles on demand".
- [x] `pnpm lint:design` and full web suite green; live render evidence of
      piles on desktop + mobile.

## What Was Built

- Added authenticated `GET /api/piles`, backed by existing ready
  `asset_embeddings.image_embedding` pgvector rows and cached CLIP text-anchor
  embeddings.
- Added semantic pile construction that assigns assets to nearest lowercase
  anchor labels, drops singleton groups, computes counts/bangers/confidence,
  and returns deterministic thumbnail samples.
- Added `useAutomaticPiles` and an automatic pile rail on `/app` when the user
  is not actively searching or filtering.
- Updated QA seed to create deterministic 512d asset and text-anchor embeddings
  so the browser evidence loop can verify automatic piles without calling a
  new provider.
- Synced API docs, design truth copy, landing hero copy, route/service tests,
  and desktop/mobile QA evidence.

Evidence: `docs/qa/evidence/2026-06-11-automatic-piles/packet.md`
Backlog: `backlog.d/_done/025-build-automatic-semantic-piles.md`
Ships-backlog: `025-build-automatic-semantic-piles`

## Notes

This is the product's stated north star (`vision.md`, Meme Atlas direction in
`design-contract.md`). The 2026-06-10 audit confirmed no clustering code
exists; landing claims were recast as search-result piles until this ships.

Technical sketch: k-means or graph community detection over `asset_embeddings`
vectors (the repo stores pgvector image embeddings; current migration shape is
512d), k chosen by heuristic or silhouette; store
`pile_id`/`pile_label` per asset (or a piles table); label via cosine-nearest
phrases from a curated anchor list embedded once. UX questions (navigation
surface vs. background organization, pile pinning, overlap handling) need
`/shape` before building.
