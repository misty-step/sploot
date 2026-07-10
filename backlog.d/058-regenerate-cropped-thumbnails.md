# 058 — Regenerate square-cropped legacy thumbnails

Status: todo
Created: 2026-07-10

## Goal

Thumbnail generation was fixed (2026-07-10, commit d27ffad) from fit:cover
center-crop to aspect-preserving fit:inside — but every asset uploaded
before the fix still serves its stored square-cropped thumbnail from Blob.
The grid shows those memes cropped until their thumbnails are regenerated.

## Acceptance oracle

- A backfill script/job walks all assets whose thumbnail was generated
  pre-fix (or whose thumbnail dims are exactly 256x256 while the source
  aspect is non-square), regenerates via lib/image-processing.ts
  generateThumbnail, uploads to Blob, and updates thumbnailUrl + stored
  dims.
- Idempotent, rate-limited against Blob, resumable, and reports counts.
- Verified on production: a previously-cropped portrait/landscape meme
  renders complete in the grid.

## Notes

- Grid tiles serve thumbnailUrl unoptimized per ADR-008; no CDN cache-bust
  concerns beyond the new blob URL.
- Consider running as a one-shot script with DATABASE_URL +
  BLOB_READ_WRITE_TOKEN rather than a cron.
