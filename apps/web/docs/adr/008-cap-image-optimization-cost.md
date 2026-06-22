# ADR-008: Cap the image-optimization / CDN cost blast radius

Status: Accepted (2026-06-22)

## Context

A 2026-06-22 cost audit found the first-to-explode line item is **Vercel Image
Optimization + CDN bandwidth**, not Blob storage or Replicate. The grid
(`components/library/image-tile.tsx`) renders every meme through `next/image`,
and `next.config.ts` declared **8 `deviceSizes` × AVIF+WebP** with **no
`minimumCacheTTL`** — so each tile is transformed into many variants in two
formats, billed per transform + per cache-write ($4–6.40/1M) + bandwidth. For an
image-heavy library this is uncapped on a viral share link or a crawler: solo
~$30–40/mo, ~$500–1,100 at 1k users.

A fresh-context review corrected an early assumption: the grid does **not**
source the pre-built 256px thumbnail. The list/shuffle/search/similar read paths
omit `thumbnail_url`, so `getTileImageSrc` falls through to the full original.
Serving the grid `unoptimized` would therefore ship full-res originals — *more*
egress, not less — so the grid must stay optimized until the thumbnail is wired
into those reads (ticket 048).

The embeddings cron was *suspected* to be a second runaway, but it is already
bounded: batch of 10, every 5 min, only `embedding: null` assets — no re-embed
path. Its `includeRecent`/`batchSize` POST params were inert dead code, and a
kill-switch already exists (the `embeddings` runtime gate).

## Decision

Cap the cost in place, independent of any stack migration:

1. **Trim `deviceSizes` 8 → 3** (`[640, 1080, 2048]`) and set a long
   `minimumCacheTTL` (31 days). This bounds variants-per-image and minimizes
   cache-write churn for the optimized surfaces (grid + detail + landing).
   Optimized memes are immutable (content-addressed blobs), so caching long is
   safe. Extracted to a testable `lib/image-config.ts` with a regression guard.
2. **Keep the grid optimized for now** — `unoptimized` is deferred to ticket 048,
   which first wires `thumbnailUrl` into the grid read paths so the grid sources
   the ~256px thumbnail; only then is `unoptimized` a strict win (and it also
   fixes the latent waste of optimizing full originals in the grid).
3. **Remove the inert `includeRecent`/`batchSize` cron params** and name the
   per-run cap + the runtime-gate kill-switch, so the dead params can't later be
   wired into an unbounded re-embed.
4. **Operator backstops (one-time, dashboard) — the true hard ceiling:** a Vercel
   Spend Management cap + auto-pause webhook, and explicit Neon autosuspend.

## Consequences

- Variants-per-image drop 8 → 3 and the long TTL collapses cache-write churn —
  the two biggest optimization-cost drivers — without any rendering regression.
  The hard ceiling is the Vercel Spend cap (operator).
- A config-guard test pins the cost-safe `deviceSizes`/TTL so they can't silently
  regress to 8 / no-TTL.
- The bigger structural win (grid serves 256px thumbnails directly, ~20× fewer
  bytes) is tracked as **048** — it needs `thumbnailUrl` added to the
  list/shuffle/search/similar reads plus a live render/fallback check, which is
  more than this in-place cost cap should carry.
- **Rejected:** serving the grid `unoptimized` now — without the thumbnail in the
  grid src it would serve full originals, inverting the cost goal.
