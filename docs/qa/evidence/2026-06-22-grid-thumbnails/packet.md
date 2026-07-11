# Evidence Packet: serve the grid 256px thumbnails, not full originals (048)

- Date: 2026-06-22
- Branch: `deliver-048-grid-thumbnails`
- Ticket: Powder card `sploot-048`
- Builds on: ADR-008 (the deferred grid-`unoptimized` part)

## Intent

The grid silently served full ≤2048px originals: thumbnails are stored on upload,
but the grid read paths omitted `thumbnailUrl`, so `getTileImageSrc` fell through
to `blobUrl`. Wire the thumbnail into every grid read path, then serve it
`unoptimized` (no Vercel optimizer) — ~20× fewer grid bytes + zero optimization
cost on the highest-volume surface.

## What changed (all 5 grid read paths + the tile)

- **Regular list** (`assets/route.ts`): `findMany` select + the `formattedAssets`
  mapping now include `thumbnailUrl`.
- **Shuffle** (`assets/route.ts` `fetchShuffleSegment`): `thumbnail_url` added to
  the CTE + outer `… as "thumbnailUrl"`; `AssetListRow` type updated.
- **Taste** (`taste-engine.ts` `getTasteWeightedAssets`): SQL `… AS "thumbnailUrl"`
  + `TasteAssetRow` type.
- **Search** (`db.ts` `vectorSearch` + `search/route.ts`): `a.thumbnail_url` in
  the SQL + row type; route maps `result.thumbnail_url`.
- **Similar** (`similar/route.ts`): was hardcoded `thumbnailUrl: null` → real value.
- **Tile** (`image-tile.tsx`): grid `<Image unoptimized>` (detail/share stay
  optimized).

## Checks — automated (run)

- **PASS — real-DB integration** (`assets.integration.test.ts`): a new case
  asserts the **shuffle SQL returns the seeded `thumbnailUrl`** for every tile,
  run against pgvector. This catches a missing/mistyped `thumbnail_url` alias that
  unit mocks and `tsc` cannot see. Ran and passed locally + CI.
- **PASS — regular-list unit** (`assets.test.ts`): `findMany` select includes
  `thumbnailUrl: true`; the mapping carries it through to the response.
- **PASS — type-check**: the typed row shapes (`AssetListRow`, `TasteAssetRow`,
  `vectorSearch` row, `similar` inline) all carry the column consistently.
- **PASS — full suite**: 92 files, **1039 tests**. lint + auth-guard green.

## Coverage note

The shuffle path is covered end-to-end against a real DB. Taste, search, and
similar use the **identical raw-SQL-alias + mapping pattern** the shuffle
integration test proves, and are type-checked; they are verified by inspection
rather than a dedicated integration test (each would need embedding seeds — a
heavier follow-up not warranted for this S change).

## Operator / residual

- **Live grid check**: load `/app` — grid `<img src>` should now be the
  `…/thumb-…` thumbnail blob URL served directly (not `/_next/image?…`); the
  detail page stays on `/_next/image`.
- **Backfill caveat**: assets with `thumbnailUrl = null` (older uploads, or
  formats without a thumbnail) fall back to the original served `unoptimized` —
  renders correctly, just larger bytes for those specific assets. If many are
  null, a thumbnail backfill is worthwhile; can't count from here.
- The remaining thumbnail egress is zeroed later by R2 (epic 044 child 2).
- Follow-up **049**: unify the 5 hand-rolled asset→DTO mappers behind one
  canonical mapper so a field can't be dropped per-path again.
