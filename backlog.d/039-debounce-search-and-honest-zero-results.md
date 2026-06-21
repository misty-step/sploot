# Debounce search and make zero-results honest

Priority: P2 · Status: ready · Estimate: S

## Goal

Search fires one embedding call per settled query (not per keystroke), and a query
with no real matches shows an honest empty state instead of padding with random
memes.

## Oracle

- [ ] Typing a query issues at most one `/api/search` after input settles (~300ms),
      matching the documented contract; verified by counting calls in a test or
      network trace.
- [ ] When no result clears the similarity threshold, the UI shows an empty /
      "no matches yet" state (or a clearly separated "loose matches" section), not
      threshold-0 padding presented as matches.

## Notes

`apps/web/CLAUDE.md` specifies "Debounced search input (300ms)" but no debounce
exists: `components/search/search-bar.tsx:156-166` + `app/app/page.tsx:306-310`
feed `useSearchAssets` on every change; the stale comment `hooks/use-assets.ts:597`
("SearchBar handles it") is false. Each keystroke can trigger a Replicate text
embedding (`lib/embeddings.ts:55-104`, 20s timeout). `app/api/search/route.ts:116-145`
pads any <10-result query with threshold-0 matches, surfaced only by a faint
sub-line. Both hurt the "fast, knows-your-taste" feel of the core loop.
Evidence lane: groom 2026-06-21 "core loop".
