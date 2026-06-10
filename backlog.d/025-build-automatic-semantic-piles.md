# Build automatic semantic piles

Priority: P1 · Status: pending · Estimate: L

## Goal

The library actually sorts itself: assets cluster into labeled semantic piles
without the user typing a query, making "self-organizing piles" a shipped
feature instead of north-star copy.

## Oracle

- [ ] An authenticated user with ≥50 embedded assets sees named piles (label +
      count + thumbnails) generated without typing anything, on a real surface
      (pile rail, sheet, or grid grouping — decided in shaping).
- [ ] Clusters come from the existing CLIP embeddings in pgvector (no new
      embedding provider); recomputation is incremental or cheap enough to run
      on upload/cron.
- [ ] Labels are auto-generated (e.g. nearest text anchors to the cluster
      centroid) and lowercase product voice.
- [ ] Landing copy may then truthfully say "automatic piles" — flip the
      feature-true framing in `DESIGN.md` §7 and the hero back from
      "piles on demand".
- [ ] `pnpm lint:design` and full web suite green; live render evidence of
      piles on desktop + mobile.

## Notes

This is the product's stated north star (`vision.md`, Meme Atlas direction in
`design-contract.md`). The 2026-06-10 audit confirmed no clustering code
exists; landing claims were recast as search-result piles until this ships.

Technical sketch: k-means or graph community detection over `asset_embeddings`
vectors (768-dim CLIP), k chosen by heuristic or silhouette; store
`pile_id`/`pile_label` per asset (or a piles table); label via cosine-nearest
phrases from a curated anchor list embedded once. UX questions (navigation
surface vs. background organization, pile pinning, overlap handling) need
`/shape` before building.
