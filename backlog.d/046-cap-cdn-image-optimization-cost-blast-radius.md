# Cap the CDN / image-optimization cost blast radius

Priority: P1 · Status: ready · Estimate: S

## Goal

No uncapped Vercel bill from serving images; the runaway-cost vectors have hard
ceilings — independent of any stack migration.

## Context

A 2026-06-22 cost audit found the first-to-explode line item is **Vercel Image
Optimization + CDN bandwidth**, not Blob or Replicate: `next/image` with
`deviceSizes:[640…3840]` × AVIF+WebP re-transforms per viewport (cache writes
$4–6.40/1M, FDT up to $0.15/GB); solo ~$30–40/mo but ~$500–1,100 at 1k users, and
**uncapped** on a viral share link or a crawler. This is the "unnecessary bills"
the operator senses — and it's fixable in hours, in place.

## Oracle

- [ ] Vercel Spend Management cap + auto-pause webhook is set (a hard ceiling).
- [ ] Grid thumbnails are served without per-request optimization (pre-built
      256px thumbnails / `unoptimized`), `deviceSizes` is trimmed to 2–3 entries,
      and `minimumCacheTTL` is raised. (The single biggest cost lever.)
- [ ] The embeddings cron (`process-embeddings`, every 5 min, batch 10) has a hard
      daily ceiling + a kill-switch on `includeRecent`, so a reprocess loop can't
      run Replicate spend unbounded.
- [ ] Neon autosuspend is explicitly set so solo idle cost floors near $0.

## Notes

Cost lane 2026-06-22. Entirely in-place (config + one grid component + a cron
guard) — do NOT wait on the stack epic (044); this is the urgent,
migration-independent safety fix. **First** pull the actual Blob/CDN numbers from
Vercel Observability to confirm the dominant line item before tuning (the grid
may already bypass `next/image` — verify the live `<img src>` path). A storage
move to R2 (044 child 2) later removes the egress line entirely, but the
optimization/transform cost is a Vercel-config problem to cap now.
