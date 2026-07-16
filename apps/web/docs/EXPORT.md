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
  256 MB and 10,000 entries (always ≥ 1 asset), with at most 10,000 parts
  per export. Parts are pure functions of the snapshot: an
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
- **Cost bound.** Egress is admitted by *reservation*, not counted after the
  fact. Before the first byte of a part or the manifest streams, a
  conservative upper bound for the whole response is atomically charged
  against the export's budget (`3 × (totalOriginalBytes + 3,072 × totalAssets + measuredManifestMetadataBytes) + 128 MB`); the metadata term includes measured
UTF-8 manifest/tag framing and keeps tiny-asset exports bounded; if it
  doesn't fit, the request is refused (`429 export_egress_exhausted`) and no
  bytes stream. A cleanly completed download settles its charge down to the
  bytes actually streamed; an aborted or interrupted download keeps the full
  reservation — interruptions are exactly what the retry headroom is for.
  Streams hard-cap at their reservation, so a size-drifted object can never
  stream past the budget.
- **Tenant window bound.** Restarting sessions (force / cancel / expiry)
  never mints fresh budget: across a rolling 24-hour window, all of a user's
  export sessions may collectively egress at most `2 ×` one export allowance
  (`6 × (totalOriginalBytes + 3,072 × totalAssets + measuredManifestMetadataBytes) + 256 MB`). Beyond that:
  `429 export_egress_window_exhausted` (retryable — the window slides, so a
  full export is always possible again; data is never held hostage and there
  is no billing gate).
- **Bounded streaming.** Producers await downstream capacity; a stalled consumer
  is failed closed after 60 seconds, while a slow consumer that makes progress
  continues. Provider headers and read-idle waits are separately capped at 60
  seconds, and cancellation aborts the active provider body.
- **Input bounds.** Tag names are at most 128 characters, colors at most 32,
  users may own 10,000 tags, and an asset may have 256 tags. Asset IDs are at
  most 128 characters. Requests over these bounds are rejected before database
  work.
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

  "tags": [ { "name": "reaction", "color": "#ff00ff" } ],

  "assets": [
    {
      "id": "ck…",
      "archivePath": "assets/ck….png",
      "part": 0,
      "mime": "image/png",
      "bytes": 123456,
      "sha256": "…",
      "width": 800, "height": 600,
      "favorite": true,
      "phash": "…",
      "createdAt": "…", "updatedAt": "…",
      "tags": ["reaction"]
    }
  ],

  // Final authoritative summary, emitted after the paged asset scan.
  // Partial success never masquerades as complete.
  "complete": false,
  "incompleteReasons": ["parts_not_fully_downloaded", "objects_missing_or_failed"],
  "totals": {
    "assets": 1234,
    "snapshotAssets": 1234,
    "originalBytes": 987654321,
    "parts": 4,
    "servedParts": 3,
    "failedObjects": 1
  },
  "failures": [
    { "assetId": "ck…", "archivePath": "assets/ck….png", "reason": "object_missing" }
  ],
  "parts": [
    { "index": 0, "file": "sploot-export-cm0…-part-001-of-004.zip",
      "assets": 400, "bytes": 260000000, "served": true }
  ]
}
``````

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
| Download interrupted | Re-request the same part; it is idempotent. The interrupted attempt's reservation stays spent — the `3×` budget exists to absorb this. |
| Object missing at the provider | Entry skipped, recorded in `failures`; the part still serves everything else. |
| Clean retry of a previously failed part | That part's failure list is replaced wholesale — recovered objects clear their failure records. |
| Export expired / canceled | `410` with `export_expired` / `export_unavailable`; start a new export. |
| Asset permanently deleted | Active exports are canceled in the same transaction before the row is removed; later part/manifest requests return `410 export_unavailable` instead of claiming a complete historical snapshot. |
| Per-export egress cap reached | `429 export_egress_exhausted`; start a new export (subject to the rolling window). |
| Rolling 24h window cap reached | `429 export_egress_window_exhausted`; retryable — wait for the window to slide. |
