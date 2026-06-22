/**
 * Cost-safe Next.js Image optimization settings.
 *
 * Kept here (not inline in next.config.ts) so a regression test can pin them —
 * see docs/adr/008-cap-image-optimization-cost.md. The grid serves its ~256px
 * thumbnails `unoptimized` (components/library/image-tile.tsx), so these settings
 * govern only the surfaces that stay optimized (the detail/landing pages, one
 * image at a time). Trim deviceSizes and cache long: optimized memes are
 * immutable (content-addressed blobs), so re-transforming and short-TTL cache
 * churn are pure cost.
 */

/** Responsive widths Next may generate. Trimmed 8 → 3 (mobile / desktop / cap). */
export const IMAGE_DEVICE_SIZES = [640, 1080, 2048];

/** Fixed-width variants for `sizes` that resolve to a px width. */
export const IMAGE_IMAGE_SIZES = [16, 32, 48, 64, 96, 128, 256, 384];

export const IMAGE_FORMATS = ['image/avif', 'image/webp'] as const;

/** 31 days. Immutable content → cache long to minimize cache-write churn. */
export const IMAGE_MINIMUM_CACHE_TTL = 60 * 60 * 24 * 31;
