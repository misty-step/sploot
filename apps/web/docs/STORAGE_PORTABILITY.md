# Storage portability runbook

The storage boundary is `lib/storage`. Callers submit a canonical logical key
and bytes; provider choice, cutover phase, byte/SHA checks, readback, and
cleanup remain inside that boundary. `legacy` is the default and continues to
use Vercel Blob. `shadow`, `dual-write`, `target`, and `rollback` require an
explicit S3-compatible target and fail closed on a failed copy or parity check.

Keys are bounded printable ASCII paths. Empty components, traversal, percent
encoding, controls, query/hash syntax, Unicode, and oversized components are
rejected. Runtime S3 endpoints must be HTTPS. HTTP is accepted only when
`NODE_ENV=test` and `STORAGE_ALLOW_HTTP_TEST_FIXTURE=true` are both explicit.

The fingerprint includes only provider, endpoint, bucket, region, the
non-secret config version, and the validated legacy and S3 public delivery bases. It never includes
access keys, secret keys, or Blob tokens. Database rows store logical and
provider/physical identity in `storage_*` columns; legacy URL columns remain
read compatibility during the reversible transition and are not cutover
authority.

## Read-only inventory

```sh
pnpm --filter web storage:portability inventory --limit 1000 > manifest.json
```

The command reads active database rows only. `--limit` is a per-page batch
size (1-100), not a total cap; the command exhaustively pages until the
active set is complete and persists a cursor for bounded resume. A manifest consumed by the
verifier is a JSON array of `{logicalKey, sourceKey, size, sha256,
contentType}` entries. Generate or review it without Vercel credentials in the
environment when possible.

## Bounded verify and rollback

The mutating commands require the exact confirmation value below. They claim
at most 100 leased rows at a time, use PostgreSQL `SKIP LOCKED` plus a lease
generation fence, retry only up to three times, and write a receipt containing
every entry's final state and parity error. A target object is confirmed only
after exact-key readback and fresh byte/SHA verification.

```sh
export STORAGE_PROVIDER=s3
export STORAGE_PHASE=dual-write
export STORAGE_S3_ENDPOINT=https://objects.example.invalid
export STORAGE_S3_BUCKET=sploot
export STORAGE_S3_REGION=auto
export STORAGE_CONFIG_VERSION=v1
export STORAGE_MIGRATION_CONFIRM=sploot-blob-portability
pnpm --filter web storage:portability verify --manifest manifest.json --receipt receipt.json
pnpm --filter web storage:portability rollback --manifest manifest.json --receipt rollback.json
```

Do not run these commands against production from a builder lane. Required
external proof remains: read-only Vercel manifest, target byte/SHA parity,
authenticated upload/read/search corpus, verified DB URL cutover and rollback,
clean provider soak, and deletion readback before any legacy retention change.

Pending foundation PR #294 owns its migration/economic/CI work. This change
does not copy those changes; rebase conflicts with that foundation must be
resolved by the owner when this lane is integrated.


## Delivery and authority preconditions

Every persisted `blobUrl` and `thumbnailUrl` is a browser-fetchable HTTPS delivery URL. S3-compatible object identity (bucket/key/provider) is internal metadata; `s3://` values are never persisted. Target startup requires a validated HTTPS endpoint, credentials, config fingerprint, and manifest SHA.

Run inventory with the schema-migrator/operator `DATABASE_URL` only:

```sh
STORAGE_PROVIDER=vercel pnpm --filter web storage:portability inventory --limit 100 --cursor <last-id>
```

Inventory reads each legacy original and thumbnail, computes bounded size/SHA-256, persists metadata, advances a durable cursor, and records failures. It exits non-zero on any parity failure; repair the source and resume from the recorded cursor.

Before verify, set `STORAGE_CUTOVER_MANIFEST_SHA256` to the exact manifest digest. The CLI records provider fingerprint/manifest/phase in `storage_cutover_state`, refuses drift, and exits non-zero unless every journal row is verified (or rolled back). The restricted application role intentionally has no access to portability journal/state tables.
