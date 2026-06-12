# Make automatic piles a filter rail, not the library

Priority: P1 · Status: done · Estimate: M

## Goal

The library opens as a full shuffled gallery of every meme. Automatic piles
become compact, confidence-aware suggestions that filter the gallery when the
user asks for them.

## Oracle

- [x] `/app` defaults to an all-memes seeded shuffle gallery; automatic piles
      never replace the primary browse surface.
- [x] The pile UI shows `all memes` with the true library total, and every pile
      count reads as a subset count, not the whole library.
- [x] Selecting a pile filters the visible gallery to that pile's loaded assets;
      clearing returns to the full shuffled gallery without changing the shuffle
      seed.
- [x] Weak pile labels are visually demoted or hidden so stretched labels do not
      read like confident folders.
- [x] Header/chrome is tighter and more feed-like on desktop and mobile while
      preserving upload/search/sort/banger controls.
- [x] Tests and QA evidence cover all-memes default, pile filtering, and
      browser screenshots.

## What Was Built

- Replaced the large automatic pile section on `/app` with a compact horizontal
  `PileFilterRail` that keeps `all memes` selected by default and shows the true
  library total.
- Added `assetIds` to semantic pile responses so selecting a pile filters the
  already-loaded gallery without changing the seeded shuffle feed.
- Demoted weak pile labels with `maybe` and hid very low-confidence labels from
  the rail.
- Tightened the `/app` header into a more feed-like command bar while preserving
  upload, search, sort, shuffle, bangers, retry, and tag controls.
- Extended QA evidence with a browser pile-filter exercise that clicks a real
  pile, verifies selected state, clears back to `all memes`, and proves the
  visible asset order is restored.

## Verification

- `pnpm --filter web exec vitest run __tests__/lib/piles/semantic-piles.test.ts __tests__/api/piles.test.ts __tests__/components/sploot/pile-filter-rail.test.tsx`
- `pnpm --filter web type-check`
- `pnpm --filter web lint`
- `pnpm qa:evidence --slug library-pile-filter-rail --intent "all memes stays the primary shuffled gallery while automatic piles act as compact filters" --routes /app --seed-count 60 --expect-piles --piles-min-assets 50 --exercise-pile-filter --tests __tests__/components/sploot/pile-filter-rail.test.tsx --tests __tests__/lib/piles/semantic-piles.test.ts --tests __tests__/api/piles.test.ts --risk "QA seed still uses local generated fixtures rather than the user's real meme library" --risk "Hydration mismatch console warnings are pre-existing on master; baseline docs/qa/evidence/2026-06-10-share-target/packet.md records the same /app warning"`
- `pnpm lint && pnpm type-check && pnpm --filter web test && pnpm --filter extension build`

## Evidence

- `docs/qa/evidence/2026-06-11-library-pile-filter-rail/packet.md`

Backlog: backlog.d/034-make-piles-a-filter-rail.md
Closes-backlog: backlog.d/034-make-piles-a-filter-rail.md
