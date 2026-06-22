# Evidence Packet: cap the CDN / image-optimization cost blast radius (046)

- Date: 2026-06-22
- Branch: `deliver-046-cap-cost-blast-radius`
- Ticket: `backlog.d/046-cap-cdn-image-optimization-cost-blast-radius.md`
- Decision: `apps/web/docs/adr/008-cap-image-optimization-cost.md`

## Intent

The first-to-explode cost line is Vercel Image Optimization + CDN bandwidth: the
grid optimized into 8 deviceSizes × AVIF/WebP with no cache TTL, uncapped on a
viral share. Cap it in place, independent of any migration.

## What changed

- `next.config.ts` → `lib/image-config.ts`: `deviceSizes` 8 → `[640, 1080,
  2048]`; `minimumCacheTTL` set to 31 days. Bounds variants-per-image and
  cache-write churn on every optimized surface.
- `app/api/cron/process-embeddings/route.ts`: removed the inert
  `includeRecent`/`batchSize` params (foreclosing a future unbounded re-embed);
  named the per-run cap; documented the `embeddings` runtime gate as the
  kill-switch. (The feared cron runaway did not exist — params were dead, batch
  is bounded at 10/5min.)
- The grid stays `next/image`-optimized. A fresh-context review caught that the
  grid sources the **full original** (its read paths omit `thumbnailUrl`), so
  serving it `unoptimized` would ship full-res originals — the opposite of the
  goal. Wiring the thumbnail + then serving unoptimized is **ticket 048**.

## Checks — automated (run)

- **PASS — config guard** (`__tests__/lib/image-config.test.ts`):
  `deviceSizes.length ≤ 3`, max ≤ 2048 (no 4K variant), `minimumCacheTTL ≥ 7
  days`. Pins ADR-008 against regression.
- **PASS — type-check** (`pnpm --filter web type-check`, exit 0).
- **PASS — lint + auth guard** (`pnpm --filter web lint`, exit 0).
- **PASS — full suite** (`pnpm --filter web test` → 92 files, 1038 tests).

## Checks — operator (not runnable here)

Needs Vercel/Neon account access (and a running app with data):

1. **Vercel Spend Management cap** (the hard ceiling): Vercel → project →
   Settings → Billing → Spend Management → set an amount + enable the pause/notify
   action. No CLI; dashboard-only. **This is the true uncapped-bill backstop.**
2. **Neon autosuspend**: Neon console → project `lively-lake-63852609` → Compute →
   confirm autosuspend (suspend after idle) is on so solo idle floors near $0.
3. **Observability sanity** (optional): confirm in Vercel Observability that
   Image-Optimization transform + cache-write volume drops after this deploy
   (fewer deviceSizes + long TTL).

## Residual

- The grid still optimizes full originals (bounded now: 3 variants, 31-day
  cache). The ~20× win — grid serving 256px thumbnails directly — is **048**
  (wire `thumbnailUrl` into the list/shuffle/search/similar reads, then
  `unoptimized`), which needs a live render/fallback check this env can't run.
- The dashboard caps (1, 2) remain operator activation items and are the real
  hard ceiling.
