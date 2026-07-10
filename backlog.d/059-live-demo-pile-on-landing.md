# 059 — Live demo pile on the landing page

Status: todo
Created: 2026-07-10

## Goal

Operator ruling (2026-07-10, lab-035 round-1 verdicts): the landing demo
stops being a static mock and becomes a real working micro-gallery. Seed a
public demo corpus of ~1,000 real classic memes ("all the classics"),
embed them, and let unauthenticated visitors search that corpus live from
the landing meme-finder — the product proving itself before sign-up.

## Acceptance oracle

- A public demo corpus (~1,000 memes) exists: sourced, downloaded, stored
  in Blob, embedded in pgvector, isolated from user piles (demo tenant or
  `demo` flag — visible only on the landing surface, never in user search).
- Unauthenticated `/` shows a randomized subset of the corpus at rest;
  submitting a query re-ranks live and shows the closest matches WITH
  similarity scores; each search refreshes the wall.
- Demo cells expose no favorite/share/delete affordances and no mutation
  endpoints; the public search endpoint is read-only and rate-limited
  (per-IP) with a Canary-visible breach signal.
- Ingest is a resumable idempotent one-shot script (DATABASE_URL +
  BLOB_READ_WRITE_TOKEN + REPLICATE_API_TOKEN) reporting counts.
- Deployed smoke: a fresh incognito visitor searches "cat losing it" and
  gets sensible classics with scores.

## Notes

- Sourcing needs a deliberate pass: classic/meme-template sources with
  acceptable reuse posture (e.g. Imgflip popular templates API as seed,
  curated classics list for the rest). Record source per asset.
- Embedding cost: ~1,000 × Replicate SigLIP calls — respect
  EMBEDDING_DAILY_BUDGET or run with an explicit one-shot override.
- Landing layout for this ships from design lab-035 (LAND section
  winners are being drilled around this exact behavior).
- Complements 026 (ingest where memes live); distinct: this is a public
  marketing corpus, not user ingestion.
