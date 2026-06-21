# Detect near-duplicate memes with a perceptual hash

Priority: P2 · Status: ready · Estimate: M

## Goal

Re-encoded/re-shared copies of the same meme are recognized as near-duplicates,
not stored and surfaced as distinct assets.

## Oracle

- [ ] A perceptual hash (dHash/pHash) is computed at ingest alongside the SHA-256.
- [ ] Visually-identical uploads that differ in bytes (Twitter `name=orig` vs
      screenshot vs Discord re-encode) are flagged as near-dups — flagged, not
      silently rejected; the user decides.
- [ ] "More like this" and piles no longer fill with near-identical copies.

## Notes

Dedupe today is exact-checksum only (`lib/upload/deduplication-service.ts:91-96`);
no perceptual hash anywhere (grep clean). As the library grows (the stated goal),
near-dup pollution erodes search and pile quality — and compounds the taste/piles
work (037). Evidence lanes: groom 2026-06-21 "ingestion breadth" + "core loop".
