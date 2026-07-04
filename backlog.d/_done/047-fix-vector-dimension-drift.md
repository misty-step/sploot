# Fix vector-dimension drift and version the embedding migration

Priority: P2 · Status: done · Estimate: S

## Goal

The embedding column's declared dimension matches live, the migration is
versioned (not an out-of-band ALTER), and a dimension mismatch fails loudly
instead of silently corrupting search.

## Oracle

- [x] The versioned migration matches the live column dimension. Today the only
      versioned migration (`prisma/migrations/20250101_init_pgvector/migration.sql:53`)
      declares `image_embedding vector(512)`, but `lib/embeddings.ts` and prod are
      **768** — drift from an out-of-band ALTER (the known "migrations don't
      auto-run on Vercel" pattern, now fixed by 036's migrate-on-deploy).
- [x] The query path no longer casts to an untyped `::vector`
      (`app/api/search/advanced/route.ts:166`) in a way that hides a dim
      mismatch; a mismatch errors loudly.
- [x] A guard/test asserts embedding dimension on write and query.

## What Was Built

- Added `EMBEDDING_DIMENSION` in `packages/common/src/embeddings.ts` and routed
  write/search/seed/test fixtures through the shared 768-dimensional contract.
- Added a guarded Prisma migration,
  `20260704000000_fix_embedding_vector_dimension`, that no-ops on already-768
  columns, converts empty stale lower-dimensional columns, and fails loudly with
  an explicit backfill/re-embed error when lower-dimensional rows exist.
- Replaced executable untyped vector casts with `embeddingVectorSql(...)`, which
  validates finite 768-dimensional vectors and emits `vector(768)` SQL casts.
- Added structural and pgvector-backed tests for schema agreement, wrong-sized
  query vectors, and wrong-sized writes.
- Updated 044 so future embedding-model swaps start from the shared dimension
  constant and a matching migration/backfill plan.

Verification: local pgvector `prisma migrate deploy`; focused dimension tests;
manual re-execution of the corrective migration against an already-768 DB
returned `768`; full gate `pnpm lint && pnpm type-check && pnpm --filter web
test && pnpm --filter extension build`.

## Notes

Embeddings lane 2026-06-22. Real latent hazard: the untyped `::vector` cast means
a future model/dim change — e.g. a Jina CLIP v2 pilot (044 child 3), where CLIP
768 → Jina 1024 is a hard cutover unless truncated — can serve a mixed-dim index
**without a hard failure**. This is a prerequisite for any embedding-model swap.
Cost of a full re-embed is trivial (~$0.80 via Jina for 10k); the risk is the
silent dim mismatch and backfill orchestration, not dollars.
