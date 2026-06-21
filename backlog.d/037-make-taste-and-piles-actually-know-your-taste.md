# Make the taste and piles intelligence actually know your taste

Priority: P1 · Status: ready · Estimate: XL

## Goal

sploot's piles and taste ranking reflect each user's actual humor — discovered
from their own embeddings — not a fixed 12-category taxonomy or a single average
vector.

## Context

The north star is "the meme app that **knows your taste**." A groom sweep
(2026-06-21) found the headline intelligence is geometry-thin:

- **Piles are fixed-anchor classification, not clustering.**
  `lib/piles/semantic-piles.ts:14-27` hardcodes 12 English anchor labels; every
  asset is assigned to its nearest anchor (`:163-219`), and the centroid relabel
  maps back to the *same 12* (`:373-383`). No k-means/HDBSCAN/community detection
  exists (grep clean). The shipped ticket 025 sketched real clustering ("k by
  silhouette") but shipped a classifier. Memes that don't fit the 12 anchors get
  generic or empty piles.
- **Taste is a single mean centroid** of favorited embeddings
  (`lib/taste/taste-engine.ts:174-184`); ranking is cosine to that one point
  (`:223`). One average collapses multi-modal taste (cursed + wholesome) into a
  meaningless midpoint.
- **"Banger" = the `favorite` boolean** (`taste-engine.ts:107-110`); no implicit
  signal. Taste learns only from manual stars (min 2).
- **Piles cover only the newest 240 assets** (`semantic-piles.ts:10`); a large
  library's piles silently ignore most of it.

The substrate is real and generation-ready: genuine CLIP-768 image embeddings in
pgvector, anchors are real cached CLIP text embeddings with a hard gate (no
keyword fallback). The gap is purely the analysis layer above the embeddings.

## Oracle

- [ ] Piles are formed by clustering the user's own embeddings (k chosen by a
      quality metric such as silhouette), labeled by nearest-anchor as a
      *dictionary* — not bucketed into a fixed taxonomy. A library of unusual
      memes still produces coherent, non-empty piles.
- [ ] Taste is represented as multiple exemplars/centroids (or kNN-over-bangers),
      so a user with diverse humor is ranked sensibly; verified by a ranking test
      over a synthetic two-cluster favorite set.
- [ ] Piles cover the whole library (assignment persisted per asset, computed on
      ingest/cron), not a 240-row request-time scan.
- [ ] At least one implicit taste signal beyond `favorite` feeds the model.

## Verification System

- **Claim:** piles and taste reflect the user's real, possibly multi-modal taste.
- **Falsifier:** a two-cluster favorite set ranks the off-taste cluster as highly
  as the on-taste one (mean-centroid failure); a library that avoids all 12
  anchors yields empty/garbage piles; piles ignore assets beyond the newest 240.
- **Driver:** unit/integration over a synthetic embedding set with known clusters;
  live walk of piles on a seeded library > 240 assets.
- **Grader:** ranking separates the clusters; piles are coherent and cover the
  library.
- **Evidence packet:** `docs/qa/evidence` — pile screenshots + ranking test output.
- **Cadence:** after the clustering core, and after the taste-model change.

## Children

1. **Real pile clustering.** Replace fixed-anchor assignment with embedding
   clustering (k-means/HDBSCAN, k by silhouette); keep anchors only as a label
   dictionary, not bucket definers. Delete `PILE_ANCHORS` as definers + the
   `nearestAnchor` self-relabel.
2. **Real taste model.** Represent taste as exemplars/multi-centroid (or
   kNN-over-bangers); add ≥1 implicit signal (shuffle-keep, dwell, re-share).
3. **Whole-library pile coverage.** Persist `pile_id` per asset on ingest/cron;
   remove the 240-asset request-time ceiling.

## Notes

- The #1 gap between the live repo and the north star, and the de-risking step for
  the "generate memes matching your taste" future — generation needs a real taste
  distribution, not one averaged point.
- Apply the "match implementation to product premise" doctrine: the product brain
  is the embedding geometry; stop approximating taste with a counter.
- Evidence lane: groom 2026-06-21 "taste-native quality". Pairs with 040
  (perceptual dedup) — cleaner embeddings make clusters sharper.
