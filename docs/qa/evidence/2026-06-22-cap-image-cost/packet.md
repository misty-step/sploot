# Evidence Packet: cap the CDN / image-optimization cost blast radius (046)

- Date: 2026-06-22
- Branch: `deliver-046-cap-cost-blast-radius`
- Ticket: `backlog.d/046-cap-cdn-image-optimization-cost-blast-radius.md`
- Decision: `apps/web/docs/adr/008-cap-image-optimization-cost.md`

## Intent

The first-to-explode cost line is Vercel Image Optimization + CDN bandwidth: the
grid re-optimized 256px thumbnails into 8 deviceSizes × AVIF/WebP with no cache
TTL, uncapped on a viral share. Cap it in place, independent of any migration.

## Checks — automated (run)

- **PASS — config guard** (`__tests__/lib/image-config.test.ts`): asserts
  `deviceSizes.length ≤ 3`, max ≤ 2048 (no 4K variant), `minimumCacheTTL ≥ 7
  days`. Pins ADR-008 against regression.
- **PASS — type-check**: `pnpm --filter web type-check` (tsc --noEmit), exit 0.
- **PASS — lint + auth guard**: `pnpm --filter web lint`, exit 0.
- **PASS — full suite**: `pnpm --filter web test` → 92 files, **1038 tests**.
- **No QA-harness regression** (analysis): the grid already passes a
  `resolveQaSeedSrc`-rewritten local path to `<Image>`, and QA mode already
  served images unoptimized (`lib/qa/qa-image-loader.ts:24-27`); `unoptimized`
  is consistent with that.

## What changed

- `next.config.ts` → `lib/image-config.ts`: `deviceSizes` 8 → `[640, 1080,
  2048]`; `minimumCacheTTL` set to 31 days.
- `components/library/image-tile.tsx`: grid `<Image>` is now `unoptimized`
  (source is a pre-built ~256px thumbnail). Detail view stays optimized.
- `app/api/cron/process-embeddings/route.ts`: removed the inert
  `includeRecent`/`batchSize` params (foreclosing a future unbounded re-embed);
  named the per-run cap; documented the `embeddings` runtime gate as the
  kill-switch. (The feared cron runaway did not exist in code — the params were
  dead and the batch is bounded at 10/5min.)

## Checks — operator (not runnable here)

The live browser walk needs local Postgres/Blob/Clerk (absent in this env), and
the two dashboard caps need Vercel/Neon account access. Operator steps:

1. **Live grid check** (DevTools): load `/app`, open Network/Elements — grid
   image `src` should be a `*.blob.vercel-storage.com/...` thumbnail URL, **not**
   `/_next/image?url=...`. (Confirms the optimizer is bypassed for the grid.) The
   detail page (`/app/meme/[id]`) should still use `/_next/image`.
2. **Vercel Spend Management cap** (the hard ceiling): Vercel → project →
   Settings → Billing → Spend Management → set an amount + enable the pause/notify
   action. No CLI; dashboard-only.
3. **Neon autosuspend**: Neon console → project `lively-lake-63852609` → branch →
   Compute → confirm autosuspend (suspend after idle) is on so solo idle floors
   near $0.

## Residual

Grid thumbnails serve as raw blob egress now (cheap; zeroed later by R2, 044
child 2). Slightly softer on very large/retina viewports — acceptable for a
256px-sourced thumbnail; detail view unaffected. The dashboard caps (2, 3) are
the true uncapped-bill backstop and remain operator activation items.
