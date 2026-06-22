# Fix vector-dimension drift and version the embedding migration

Priority: P2 · Status: ready · Estimate: S

## Goal

The embedding column's declared dimension matches live, the migration is
versioned (not an out-of-band ALTER), and a dimension mismatch fails loudly
instead of silently corrupting search.

## Oracle

- [ ] The versioned migration matches the live column dimension. Today the only
      versioned migration (`prisma/migrations/20250101_init_pgvector/migration.sql:53`)
      declares `image_embedding vector(512)`, but `lib/embeddings.ts` and prod are
      **768** — drift from an out-of-band ALTER (the known "migrations don't
      auto-run on Vercel" pattern, now fixed by 036's migrate-on-deploy).
- [ ] The query path no longer casts to an untyped `::vector`
      (`app/api/search/advanced/route.ts:166`) in a way that hides a dim
      mismatch; a mismatch errors loudly.
- [ ] A guard/test asserts embedding dimension on write and query.

## Notes

Embeddings lane 2026-06-22. Real latent hazard: the untyped `::vector` cast means
a future model/dim change — e.g. a Jina CLIP v2 pilot (044 child 3), where CLIP
768 → Jina 1024 is a hard cutover unless truncated — can serve a mixed-dim index
**without a hard failure**. This is a prerequisite for any embedding-model swap.
Cost of a full re-embed is trivial (~$0.80 via Jina for 10k); the risk is the
silent dim mismatch and backfill orchestration, not dollars.
