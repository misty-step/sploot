# ADR-008: Cap the image-optimization / CDN cost blast radius

Status: Accepted (2026-06-22)

## Context

A 2026-06-22 cost audit found the first-to-explode line item is **Vercel Image
Optimization + CDN bandwidth**, not Blob storage or Replicate. The grid
(`components/library/image-tile.tsx`) renders every meme through `next/image`,
and `next.config.ts` declared **8 `deviceSizes` × AVIF+WebP** with **no
`minimumCacheTTL`**. So each tile — though it already sources a pre-built ~256px
thumbnail — was re-optimized into up-to-1080px variants in two formats, billed
per transform + per cache-write ($4–6.40/1M) + bandwidth (up to $0.15/GB). For an
image-heavy library this is uncapped on a viral share link or a crawler: solo
~$30–40/mo, ~$500–1,100 at 1k users. This is the operator's "unnecessary bills."

The embeddings cron was *suspected* to be a second runaway, but it is already
bounded: batch of 10, every 5 min, only `embedding: null` assets — no re-embed
path. Its `includeRecent`/`batchSize` POST params were inert dead code, and a
kill-switch already exists (the `embeddings` runtime gate).

## Decision

Cap the cost in place, independent of any stack migration:

1. **Serve grid thumbnails `unoptimized`.** The grid is the high-volume surface
   and its source is already a purpose-built ~256px thumbnail — running it
   through the optimizer is pure waste. `unoptimized` bypasses the optimizer
   entirely (no transform, no cache-write, no optimization bandwidth); the
   thumbnail serves directly. The **detail view stays optimized** for crispness
   (one image, low volume).
2. **Trim `deviceSizes` 8 → 3** (`[640, 1080, 2048]`) and set a long
   `minimumCacheTTL` (31 days). Optimized memes are immutable (content-addressed
   blobs), so caching long minimizes cache-write churn for the surfaces that
   stay optimized.
3. **Remove the inert `includeRecent`/`batchSize` cron params** and name the
   per-run cap + the runtime-gate kill-switch explicitly, so the dead params
   can't later be wired into an unbounded re-embed.
4. **Operator backstops (one-time, dashboard):** a Vercel Spend Management cap +
   auto-pause webhook (the hard ceiling), and explicit Neon autosuspend.

## Consequences

- The grid's image cost drops to raw thumbnail egress (cheap; later zeroed by R2
  in epic 044). Grid thumbnails may be marginally softer on very large/retina
  viewports — acceptable for a 256px-sourced thumbnail; the detail view stays
  crisp. Animated images and videos were already handled separately.
- A config-guard test pins the cost-safe image config so it can't silently
  regress to 8 deviceSizes / no TTL.
- The dashboard caps are operator steps (they need Vercel/Neon account access);
  they are the true uncapped-bill ceiling and are tracked as activation items.
- **Rejected:** keeping optimization on the grid with a tighter `sizes` — still
  invokes the optimizer (transform + cache-write per variant); `unoptimized` on
  an already-thumbnail source is strictly cheaper.
