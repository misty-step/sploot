# Serve the grid 256px thumbnails, not full originals

Priority: P2 · Status: ready · Estimate: S

## Goal

The browse/search/related grid renders the pre-built ~256px thumbnail (served
directly, `unoptimized`), not the full ≤2048px original — cutting grid bytes and
image-optimization cost ~20×.

## Context

A 2026-06-22 review (during 046) found the grid has been silently serving **full
originals**: thumbnails are generated and stored on upload
(`lib/upload/blob-uploader-service.ts:134`, schema `thumbnailUrl`), and
`image-tile.tsx`'s `getTileImageSrc` prefers `thumbnailUrl` — but the grid read
paths never SELECT it, so it falls through to `blobUrl`:

- `app/api/assets/route.ts` shuffle/list raw SQL omits `thumbnail_url`.
- `lib/db.ts` `vectorSearch` (search results) omits it.
- `app/api/assets/[id]/similar/route.ts:62` hardcodes `thumbnailUrl: null`.

So 046 could only trim the optimizer (deviceSizes/TTL); it could not flip the
grid to `unoptimized` (that would have shipped full originals). This ticket
closes that.

## Oracle

- [ ] The list/shuffle (`assets/route.ts`), search (`vectorSearch`), and similar
      (`similar/route.ts`) read paths return `thumbnailUrl`, so grid tiles source
      the 256px thumbnail (with the existing thumbnail→blob error fallback intact).
- [ ] The grid `<Image>` is `unoptimized` (serves the thumbnail directly; the
      detail/share pages stay optimized). The config-guard / a render check
      confirms grid `<img src>` is the thumbnail blob URL, not `/_next/image`.
- [ ] Live check: a seeded grid renders correctly desktop + mobile; a
      thumbnail-missing asset still falls back to the original without a broken
      tile.

## Notes

Review finding 2026-06-22 (046). This is the structural cost win 046 deferred;
it also pairs with epic 044 child 2 (R2 zeroes the remaining thumbnail egress).
Verify thumbnails actually populate for older assets (backfill if some are null)
before flipping `unoptimized`, or the fallback serves originals for them.
