-- Restore the cosine HNSW access path removed by the text-cache and vector
-- dimension migrations. This migration is deliberately a no-op: HNSW graph
-- builds scan and link every row in asset_embeddings, so building this
-- index here, blocking, could exceed migrate-deploy's PGOPTIONS
-- statement_timeout=30s on a production-sized table and fail predeploy,
-- gating the owner-visibility migration chain behind it. The actual
-- concurrent, autocommit, bounded-but-generous-timeout online index build
-- runs as its own post-Prisma-migrate stage --
-- applyOnlineHnswIndex() in scripts/apply-online-embedding-index.mjs,
-- invoked by scripts/migrate-deploy.mjs after `prisma migrate deploy`
-- completes. Canonical migration history is immutable, so this file stays
-- in sequence as a marker; both fresh installs and legacy upgrades still
-- end with the same vector(768) index contract, just built online instead
-- of inside this transaction.
BEGIN;
COMMIT;
