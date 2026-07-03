# Detect near-duplicate memes with a perceptual hash

Priority: P2 · Status: done · Estimate: M

## Goal

Re-encoded/re-shared copies of the same meme are recognized as near-duplicates,
not stored and surfaced as distinct assets.

## Oracle

- [x] A perceptual hash (dHash/pHash) is computed at ingest alongside the SHA-256.
- [x] Visually-identical uploads that differ in bytes (Twitter `name=orig` vs
      screenshot vs Discord re-encode) are flagged as near-dups — flagged, not
      silently rejected; the user decides.
- [x] "More like this" and piles no longer fill with near-identical copies.

## What Was Built

- Added a sharp-backed dHash perceptual hash service. Ingest now computes and
  stores `Asset.phash` alongside SHA-256.
- Added advisory near-duplicate lookup by Hamming distance. A near match is
  attached to successful upload responses as `asset.nearDuplicate`; exact
  checksum duplicates still use the existing duplicate path.
- Surfaced near-duplicate upload warnings in the upload list as “looks similar”
  without blocking the upload.
- Filtered near-identical phashes from `/api/assets/[id]/similar` and automatic
  pile grouping so near-duplicate copies do not fill recommendation/pile slots.
- Added focused tests for hash stability/Hamming distance and pile near-dup
  suppression.

Evidence:

- `pnpm lint`
- `pnpm type-check`
- `DATABASE_URL=postgresql://test:test@localhost:5432/sploot_test pnpm --filter web test -- --run`
- `pnpm --filter extension build`
- `docs/qa/evidence/2026-07-02-backlog-040-near-duplicates/packet.md`

Residual risk: QA screenshots prove the upload route still renders; the actual
near-duplicate flagging is verified by unit/API-boundary coverage, not by a live
browser upload of two re-encoded copies in this run.

## Notes

Dedupe today is exact-checksum only (`lib/upload/deduplication-service.ts:91-96`);
no perceptual hash anywhere (grep clean). As the library grows (the stated goal),
near-dup pollution erodes search and pile quality — and compounds the taste/piles
work (037). Evidence lanes: groom 2026-06-21 "ingestion breadth" + "core loop".
