# Unify the hand-rolled asset→DTO mappers behind one canonical mapper

Priority: P3 · Status: ready · Estimate: M

## Goal

There is one canonical function that turns an asset row into the grid/client
asset DTO, used by every read path — so a field can't be silently dropped from
one surface again.

## Context

Delivering 048 (and 046's review) found the grid asset shape is hand-rolled in
**five** places, each with a slightly different source shape and field set:

- `app/api/assets/route.ts` `formattedAssets` (camelCase Prisma/shuffle rows)
- `app/api/assets/route.ts` shuffle raw SQL (`AssetListRow`)
- `lib/taste/taste-engine.ts` `getTasteWeightedAssets` (`TasteAssetRow`)
- `app/api/search/route.ts` (snake_case `vectorSearch` rows + tags)
- `app/api/assets/[id]/similar/route.ts` (snake_case `vectorSearch` rows)

`thumbnailUrl` was missing from all of them (048); `similar` even hardcoded it to
`null`. The divergence is the root cause: there is no single place that owns "what
shape does the grid get." Each new field (next: a perceptual-hash flag from 040,
or pile membership) risks the same per-path omission.

## Oracle

- [ ] A single `toGridAsset(row)` (or similar) mapper owns the grid/client asset
      DTO; the snake_case (`vectorSearch`) and camelCase (Prisma/shuffle/taste)
      sources are normalized into it.
- [ ] All five read paths build their response assets through it; no path
      hand-rolls the shape.
- [ ] A type (not `any`) defines the DTO so a missing field is a compile error,
      not a silent drop — removing the `any`-typed `.map((asset: any) => …)` casts
      that hid the 048 bug.

## Notes

From 048 / the 046 review (2026-06-22). The `any`-typed mappers are why `tsc`
didn't catch the dropped `thumbnailUrl`; an explicit DTO type is the real fix.
Watch the genuine per-path differences (search adds `similarity`/`relevance`/tags;
taste adds `tasteScore`; embedding shapes differ) — model them as explicit
extensions of the base DTO, not as a reason to keep five mappers.
