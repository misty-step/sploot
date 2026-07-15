# Library Export

Complete-library export (Powder card `sploot-057`): every original the user
saved plus a versioned, portable `manifest.json`. Session-authenticated only —
see the endpoint reference in [`API.md`](./API.md#library-export). This
document is the stability contract for the manifest schema and the operational
rules the endpoints enforce.

## Design

- **One visible operation.** Settings → *Export your library* creates (or
  resumes) the user's single active export session. Everything else — parts,
  manifest, progress, cancel — hangs off that session.
- **Frozen snapshot.** An export covers exactly the assets that existed and
  were not deleted at `snapshotAt`. Uploads and deletions during the export
  window change nothing; the entry set is recomputed deterministically from
  the predicate `createdAt <= snapshotAt AND (deletedAt IS NULL OR deletedAt >
  snapshotAt)` — no asset is duplicated or lost across parts.
- **Bounded, resumable parts.** Media is delivered as zip parts of at most
  256 MB (always ≥ 1 asset). Parts are pure functions of the snapshot: an
  interrupted or corrupted download is retried by requesting the same part
  again. A part counts as *served* only when the server streamed its final
  byte.
- **Nothing is buffered or persisted.** Parts and the manifest are streamed;
  no archive artifact is stored server-side. The only persistence is a
  bookkeeping row (`library_exports`), lazily deleted 7 days after expiry.
- **Expiring capability.** An export and its download URLs die 24 hours after
  creation (HTTP `410`), and immediately on cancel. Tenant-scoped: only the
  owner's session can resolve an export id; provider URLs never reach the
  client, so there are no signed URLs to go stale.
- **Cost bound.** Total egress per export is capped at
  `3 × totalOriginalBytes + 128 MB` (covers legitimate retries and manifest
  downloads). Beyond that: HTTP `429 export_egress_exhausted`; start a fresh
  export.
- **Always available.** Export never checks storage quota, billing state, or
  upload runtime gates. Over-limit, delinquent, and canceled accounts export
  normally (VISION.md: no data hostage-taking).
- **Derived media.** Thumbnails are regenerable renditions and are not
  included as bytes; their dimensions ride along as metadata. Embedding
  vectors are model-specific derived data and are likewise excluded.

## Manifest schema (`manifestVersion: "1.0"`)

Served at `GET /api/library/export/{exportId}/manifest` as
`sploot-export-{exportId}-manifest.json`. Download it **after** the parts: it
reflects what the server has actually served and is the export's integrity
record.

```jsonc
{
  "manifest": "sploot-library-export",
  "manifestVersion": "1.0",
  "exportId": "cm0…",
  "generatedAt": "2026-07-15T12:34:56.000Z",
  "snapshotAt": "2026-07-15T12:00:00.000Z",
  "expiresAt": "2026-07-16T12:00:00.000Z",

  // Explicit completeness — partial success never masquerades as complete.
  "complete": false,
  "incompleteReasons": ["parts_not_fully_downloaded", "objects_missing_or_failed"],

  "totals": {
    "assets": 1234,          // snapshot entry count
    "originalBytes": 987654321,
    "parts": 4,
    "servedParts": 3,        // parts fully streamed at least once
    "failedObjects": 1
  },

  "parts": [
    { "index": 0, "file": "sploot-export-cm0…-part-001-of-004.zip",
      "assets": 400, "bytes": 260000000, "served": true }
  ],

  // Objects that could not be exported, by asset. Reasons:
  // object_missing | object_fetch_failed | object_url_rejected | checksum_mismatch
  "failures": [
    { "assetId": "ck…", "archivePath": "assets/ck….png", "reason": "object_missing" }
  ],

  "tags": [ { "name": "reaction", "color": "#ff00ff" } ],

  "assets": [
    {
      "id": "ck…",
      "archivePath": "assets/ck….png",   // where the bytes live inside the parts
      "part": 0,                          // which part carries them (null if no parts)
      "mime": "image/png",
      "bytes": 123456,
      "sha256": "…",                     // verify your download against this
      "width": 800, "height": 600,
      "favorite": true,
      "phash": "…",                      // perceptual hash, may be null
      "createdAt": "…", "updatedAt": "…",
      "tags": ["reaction"]
    }
  ]
}
```

Portability notes:

- Archive paths are provider-neutral (`assets/{assetId}.{ext}`; extension
  derived from MIME, `bin` fallback). No provider URLs, hostnames, or storage
  paths appear anywhere in the manifest.
- `sha256` lets any consumer verify each extracted file byte-for-byte.
- A `checksum_mismatch` failure means bytes were delivered but did not match
  the recorded checksum — treat that asset as suspect and re-download its part.

## Versioning

`manifestVersion` follows `major.minor`:

- **Minor bump** — additive, backward-compatible fields.
- **Major bump** — renamed/removed fields or changed semantics.

Consumers should ignore unknown fields and refuse major versions they don't
know.

## Failure and retry model

| Situation | Behavior |
| --- | --- |
| Download interrupted | Re-request the same part; it is idempotent. |
| Object missing at the provider | Entry skipped, recorded in `failures`; the part still serves everything else. |
| Clean retry of a previously failed part | That part's failure list is replaced wholesale — recovered objects clear their failure records. |
| Export expired / canceled | `410` with `export_expired` / `export_unavailable`; start a new export. |
| Egress cap reached | `429 export_egress_exhausted`; start a new export. |
