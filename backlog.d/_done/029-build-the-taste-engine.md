# Build the taste engine

Priority: P3 · Status: done · Estimate: XL

## Goal

Sploot starts acting like "the meme app that knows your taste": the user's
bangers and behavior shape what the app surfaces, building toward
taste-matched generation.

## Oracle

- [x] Shuffle has a taste-weighted mode: assets similar (cosine, existing
      CLIP embeddings) to the user's favorited bangers surface more often
      than uniform random, behind a visible toggle; uniform shuffle remains
      default.
- [x] A "your taste" surface exists (even minimal): what the app thinks the
      user finds funny, derived from banger embedding centroids — lowercase
      product voice, no new embedding provider.
- [x] A written feasibility verdict on taste-matched generation (provider,
      cost per image, prompt-from-centroid approach) lives in `docs/adr/`
      before any generation code is written.
- [x] Full web suite green; live evidence of taste-weighted shuffle
      returning visibly different results from uniform on a seeded library.

## Notes

Vision's north star sentence is literally "the meme app that knows your
taste," and generation is its named future — but zero taste code exists
beyond the favorite boolean. The cheap first step needs no new
infrastructure: banger embeddings already live in pgvector, so
taste-weighted shuffle and a taste profile are similarity math over
existing vectors. Generation (child 3+) stays gated on the ADR; this epic
is deliberately sequenced so the first two children ship value even if
generation is killed. Raw idea — needs `/shape` before any child is built.

## Children

1. Taste-weighted shuffle (banger-centroid similarity reweighting + toggle).
2. Minimal taste profile surface ("sploot thinks you like…").
3. Generation feasibility ADR (providers, cost, safety, prompt strategy).
4. Taste-matched generation v1 — only if the ADR survives.

## What Was Built

- Added `sortBy=taste` for `/api/assets`, backed by a banger embedding centroid
  over existing ready CLIP vectors. The response includes typed `taste`
  metadata and rounded per-asset `tasteScore` values.
- Kept seeded uniform shuffle as the default library order for new/reset users,
  with taste as an explicit sort option in desktop and mobile controls.
- Added `/api/taste/profile` for a minimal "near your bangers" profile derived
  from the same taste signal.
- Added ADR 0004 deferring taste-matched generation until recommendation
  quality proves itself.
- Hardened pgvector writes in the app helper and QA seed path by casting
  embedding arrays through `double precision[]`.
- Extended `qa:evidence` with `--expect-taste`; evidence lives in
  `docs/qa/evidence/2026-06-11-taste-engine/packet.md`.

## Closure

Backlog: backlog.d/029-build-the-taste-engine.md
Ships-backlog: backlog.d/029-build-the-taste-engine.md
