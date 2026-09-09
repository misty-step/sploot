# Sploot API Documentation

## Overview

Sploot's [published token API](./PUBLIC_API.md) owns the external **save/search**
contract. Two independent runtimes implement that contract:

- **Local Go product — `apps/server`**: persistent SQLite/sqlite-vec, private
  filesystem media, local CPU CLIP inference, real password accounts, browser
  sessions, and paired-device credentials.
- **Deployed Next.js predecessor — `apps/web`**: existing Clerk, Postgres/pgvector,
  Blob, and Replicate behavior. Production and its old real library are unchanged,
  not migrated into the local product.

The Go API does not claim every legacy route. Its inventory and auth boundary
below are authoritative for local clients; unless explicitly marked otherwise,
the detailed endpoint recipes later in this document describe the predecessor.
Do not infer local auth or media access from a predecessor example.

### Local Go route ownership

`apps/server/internal/httpapi/server.go` registers product routes;
`internal/httpapi/auth.go` registers account/device routes. Next.js route files
do not own the Go API.

| Surface | Local Go routes | Authority |
|---|---|---|
| Public operations | `GET /api/health/live`, `/api/health`, `/api/health/services`, `/api/health/enrollment`, `/api/version` | None; readiness/configuration only |
| Published save/search | `POST /api/upload`, `POST /api/upload/url`, `POST /api/search` | Browser, paired device, or personal `splt_` token |
| Owner library | `GET /api/assets`; `GET`, `PATCH`, `DELETE /api/assets/{id}`; `POST /api/assets/{id}/restore` | Browser or paired device |
| Permanent trash reclamation | `DELETE /api/assets/{id}/purge` | Browser only; owner-scoped, already-trashed asset |
| Owner sharing/indexing | `POST`, `DELETE /api/assets/{id}/share`; `GET /api/assets/{id}/embedding-status`; `POST /api/assets/{id}/generate-embedding` | Browser or paired device |
| Owner tags | `GET`, `POST /api/tags`; `PATCH`, `DELETE /api/tags/{id}`; `GET`, `POST`, `DELETE /api/assets/{id}/tags` | Browser or paired device |
| Other owner operations | `POST /api/upload/check`; `GET /api/stats`; `GET /api/library/export`; `POST /api/telemetry` | Browser or paired device |
| Private media | `GET`/`HEAD /media/{id}` | Owner browser or paired device, never a personal token |
| Personal token management | `GET`, `POST /api/upload-tokens`; `DELETE /api/upload-tokens/{id}` | Browser only |

Local `GET /api/assets` uses `sortBy=shuffle&shuffleSeed=<0..1000000>`
for deterministic owner-scoped shuffle. Preserve the seed, filters and limit
when following `nextCursor`. The HTML `/app` and `/app/feed` URLs instead use
`seed`; that browser navigation parameter is not an alias on the JSON API.

HTML routes include `/`, `/sign-in`, `/sign-up`, `/app`, `/app/feed`,
`/app/search`, `/app/settings`, `/app/connect`, and `/app/shortcut`. The last
downloads unsigned Shortcut source configured for this instance. PWA routes
are `/manifest.json`, `/sw.js`, and `GET`/`POST /share-target`; Web Share Target
availability depends on the browser and is not an iOS share-sheet claim.
There is no local QA login route or seeded-account authority.

Explicit public shares use `/s/{slug}` and `/s/{slug}?media=1` without a session.
`/m/{id}` redirects only when that asset has an enabled share slug and is not
deleted. These are local-library shares, not migrated production links.
An unshared asset's `/media/{id}` URL remains private even when its ID is known.

`GET /api/library/export` returns a completed owner ZIP rather than the
predecessor's multipart export-session lifecycle. The old export subroutes,
SSE, piles/taste, advanced search, cache diagnostics, direct embedding endpoints,
and consumer billing routes are not Go APIs. Runtime and migration boundaries
remain in [DEPLOYMENT.md](./DEPLOYMENT.md).

## Base URL

```text
Local Go: http://127.0.0.1:3001/api
Production predecessor: https://www.sploot.app/api
Next.js development (separate process): http://localhost:3001/api
```

Use the selected instance's exact canonical origin (`SPLOOT_BASE_URL` for Go),
including for relative media URLs and device approval. Off-loopback Go access
requires HTTPS. Local and production credentials are not interchangeable.
Do not run both development servers on the same port.

## Authentication

### Auth boundary — local Go

`apps/server/internal/auth` owns local accounts and credential resolution.
Registration creates real persistent accounts; there is no Clerk, inherited
owner ID, or QA-auth fallback. Passwords are Argon2id-hashed and must contain
12–128 characters (at most 512 UTF-8 bytes). Email is an account identifier,
not a verified email-delivery or reset-password integration.

| Credential | Authority and lifetime |
|---|---|
| `sploot_session` browser cookie | Full owner UI/API plus account-security actions; opaque secret, hashed server-side, 30-day lifetime; HttpOnly, SameSite=Lax, Secure on HTTPS |
| `Authorization: Bearer spld_…` | Revocable paired device, 90-day lifetime; owner-library/save/search/private-media/export operations, but no permanent purge, password changes, device approval/list management, or personal-token management |
| `Authorization: Bearer splt_…` | Personal token; only the three published save/search routes opt in. No library listing, direct private media, export, deletion, or account/token management |

Invalid, expired, or revoked credentials return `401` with
`{"error":"Unauthorized","code":"unauthorized"}`. An explicit bad bearer never
falls back to a browser cookie. A valid device credential on a browser-only
operation returns `403` with `code: "browser_required"`.

Cookie-authenticated mutations, including login/registration, require the exact
configured `Origin`; cross-site requests cannot borrow cookie authority.
Recognized Chrome-extension origins may use bearer endpoints, not the browser
cookie. CORS credentials are granted only to the instance origin, never with a
wildcard. If supplied, `X-Sploot-User-ID` must match the authenticated owner
(`409`, `code: "ACCOUNT_CHANGED"` on mismatch); it is a retry fence, not identity
authority. Account/password work and device creation/polling are bounded and
can return `429` with `Retry-After`.

### Local account and device routes

Auth request bodies are JSON. Registration is enabled by default on loopback
development/test only; closing `SPLOOT_REGISTRATION_OPEN` returns `403`,
`code: "registration_closed"` for new registration without revoking existing
accounts. Hosted exposure requires an explicit policy.

| Route | Request / response | Authority |
|---|---|---|
| `POST /api/auth/register` | `{email,password}` → `201 {user:{id,email}}`, sets browser cookie | No session; same-origin browser request |
| `POST /api/auth/login` | `{email,password}` → `200 {user:{id,email}}`, sets browser cookie; incorrect credentials return `401 invalid_credentials` | No session; same-origin browser request |
| `GET /api/auth/session` | `200 {user:{id,email}}` or `401` | Browser or paired device |
| `POST /api/auth/logout` | `204`, revokes current browser session and clears cookie | Browser only |
| `POST /api/auth/password` | `{currentPassword,password}` → `204` | Browser only; retains this session and revokes other browser/device sessions, personal tokens, and approved pending pairings |
| `POST /api/auth/device` | `{name}` (1–64 characters) → `201` challenge | No session; pairing origin policy, no bearer authority |
| `GET /api/auth/device?userCode=…` | `{name,userCode,expiresAt}` | Browser only |
| `POST /api/auth/device/approve` | `{userCode,approve:true\|false}` → `204` | Browser only; approval selects that signed-in account |
| `POST /api/auth/device/token` | `{deviceCode}` → pending or one-time authorization | No session; proof of the secret device code |
| `GET /api/auth/devices` | `{devices:[{id,name,createdAt,lastUsedAt,expiresAt}]}` | Browser only |
| `DELETE /api/auth/devices/{id}` | `204`, owner-scoped revocation | Browser only |
| `DELETE /api/auth/device/session` | `204`, revokes the presented device session | Device bearer only |

A challenge contains `deviceCode`, `userCode`, `verificationUri`,
`verificationUriComplete`, `expiresIn: 600`, and `interval: 2`. Open the
instance's `/app/connect?code=…`, verify the displayed code and signed-in account,
then explicitly approve or deny. A cookie, claimed email, or extension-supplied
owner ID cannot approve the request.

Polling returns `202 {"status":"pending"}` until approval, then once returns
`200 {status:"authorized",token:"spld_…",user:{id,email},expiresAt}`. Denial is
`403 device_denied`; expiry or already-consumed authorization is
`410 device_expired`; premature/rate-limited polling returns `429` with
`Retry-After`. Persist the pending deadline and follow the server's interval;
never treat offline or malformed responses as authorization.

Backup/restore deliberately removes portable session/device/pairing/PAT
credentials while preserving password accounts. A restored user must sign in,
mint personal tokens, and pair devices again; see
[recovery credential lifetime](./DEPLOYMENT.md#snapshot-contents-and-credential-lifetime).

### Local private media and published save/search

The shared `@sploot/common` save/search shapes, MIME limits, idempotency behavior,
and created/duplicate receipts remain the published contract. Go indexes new
captures and new queries using the SHA-pinned 512-D local CPU CLIP bundle, not
Replicate or a seeded cache.

Go asset `blobUrl` values are relative `/media/{assetID}` paths; thumbnails use
`/media/{assetID}?thumbnail=1`. Media supports HEAD and byte ranges for original
video, and `?download=1` supplies an attachment filename. Requests are owner
authenticated and `Cache-Control: private, no-store`; filesystem paths are
never a public static directory.

Resolve relative references against the selected instance, not the extension
origin. An extension must fetch private media with its same-instance `spld_`
bearer credential and omitted cookies; a bare `<img>` URL or notification-image
URL cannot supply that bearer. Do not forward credentials to arbitrary URLs
from a response or to a different instance. A personal `splt_` search result
exposes matching metadata but does not authorize a subsequent private media
download. Public sharing is a separate, explicit owner action.

### Local storage, trash and errors

Go uses operator-configured **instance** storage admission, not the predecessor's
per-user quota. `SPLOOT_STORAGE_LIMIT_BYTES=0` removes the artificial ceiling;
`SPLOOT_STORAGE_RESERVE_BYTES` defaults to 1 GiB of free disk. Both are
nonnegative byte counts. Originals, previews and trash consume retained capacity;
unfinished physical reclamation remains charged until bytes are removed.

`GET /api/stats` returns owner-only `assetCount`, `favoriteCount`, `trashCount`,
`storageBytes`, `activeStorageBytes`, `trashStorageBytes` and `lastUploadAt`.
There is no local `storageLimitBytes`, remaining allowance, usage percentage,
quota snapshot, or disclosure of another owner's usage.

`DELETE /api/assets/{id}` remains reversible trash. The separate
`DELETE /api/assets/{id}/purge` returns 204 after permanent reclamation; its browser
UI asks for confirmation. It requires browser-cookie authority and the normal
origin/owner checks, not a JSON confirmation field. A live asset returns
409 `asset_not_trashed`; foreign/unknown assets return 404. Interrupted reclamation
returns retryable 503 `purge_incomplete` and resumes on retry/startup. A completed
purge is idempotent. Replaying a saved receipt for a purged asset returns
410 `asset_purged`, never duplicate success or recreated media. Existing backups
are unaffected.

| Local admission failure | HTTP / retry behavior |
|---|---|
| `storage_limit_exceeded` | 507, `retryable: false`; manage storage or change instance policy |
| `storage_reserve_exceeded` | 507, `retryable: false`; free disk or change the operator reserve |
| `storage_unavailable` | 503, `retryable: false`; repair filesystem availability inspection |

Storage errors link to `/app/settings` with the shared `manage_storage` action.
They do not include an account quota. Go typed errors serialize `retryable`
explicitly, including `false`; clients must not infer retries solely from 5xx.
The predecessor's `quota_exceeded` contract remains unchanged below.

One HTTP file-upload slot bounds multipart memory. `/api/upload` receives at most
the shared file bound plus 1 MiB of multipart overhead without temporary-file
spooling. `/share-target` processes files sequentially through storage admission,
with at most 100 files, 1,000 parts and 250 MiB per request. Its redirect reports
`shared`, `duplicates` and `failed`; already saved files survive a later failure.
Network read deadlines are cleared after each body read; an exceeded deadline cannot be extended, including on HTTP/2.

### Local inference readiness and admission

`/api/health/live` reports process liveness. With healthy SQLite/schema,
`/api/health` stays HTTP 200 and exposes `libraryReady: true`; loading/unavailable
search sets `status: "degraded"`, `searchReady: false`, and
`dependencies.search` to `loading` or `unavailable`. Search states are
`loading`, `ready`, `unavailable`, or explicitly `disabled`.
`/api/health/services` returns 503 while enabled inference is not ready.
Explicitly disabled inference can return configured-service health 200 without
claiming `searchReady`.

Saved media, account access, saves and export remain available after model
initialization failure. Search and indexing fail truthfully; even cached query
vectors do not bypass unavailable inference. Loading returns 503
`embedding_loading`, `retryable: true`, `Retry-After: 2`; unavailable returns
503 `embedding_unavailable`, and explicitly disabled returns
503 `embeddings_disabled`, both nonretryable until operator intervention.

Interactive projections use the same bounded native executor as indexing:
eight FIFO waiting queries, a 15-second wait bound, and one waiting indexing turn
after four queries. Active native work is not preempted. Queue overflow/expiry
returns 429 `embedding_busy`, `retryable: true`, `Retry-After: 1`.


### Auth Boundary — deployed Next.js

- browser page traffic on `https://sploot.app` redirects to
  `https://www.sploot.app` before auth checks, so signed-in users do not get
  dumped into the wrong-host landing page. api routes stay on their requested
  host and keep json auth responses.
- `apps/web/next.config.ts` keeps PWA start-url document caching off because
  `/` is auth-dependent; the service worker may cache images and search data,
  but not the signed-out landing document.
- `apps/web/middleware.ts` protects only `/app(.*)` and redirects signed-out requests to `/sign-in`.
- Clerk middleware still matches API routes so Clerk server auth can resolve,
  but API routes enforce auth in route handlers rather than middleware.
- New protected API routes use `lib/auth/with-authenticated-api`; legacy direct
  Clerk/helper imports are temporarily allowlisted by
  `pnpm --filter web auth:guard` until route migration is complete.
- The protected product JSON APIs listed below return this exact payload for
  missing auth:

```json
{
  "error": "Unauthorized"
}
```

with status `401`. Local Go errors and credential scopes are specified above;
the predecessor's [`AUTH.md`](./AUTH.md) is not the Go account/device authority.

Protected product API route inventory — deployed predecessor:

- `/api/upload`, `/api/upload/url`, `/api/upload/check`
- `/api/upload-tokens`, `/api/upload-tokens/{id}` (session-only; manage upload tokens)
- `/api/assets`, `/api/assets/{id}`, `/api/assets/{id}/tags`, `/api/assets/audit`, `/api/assets/{id}/share`, `/api/assets/{id}/similar`
- `/api/assets/{id}/embedding-status`, `/api/assets/batch/embedding-status`, `/api/assets/{id}/generate-embedding`
- `/api/taste/profile`
- `/api/search`, `/api/search/advanced`
- `/api/stats`
- `/api/library/export`, `/api/library/export/{exportId}`, `/api/library/export/{exportId}/parts/{partIndex}`, `/api/library/export/{exportId}/manifest`
- `/api/tags`, `/api/tags/{tagId}`
- `/api/analytics/usage`, `/api/telemetry`
- `/api/cache/stats`, `/api/embeddings/text`, `/api/embeddings/image`, `/api/sse/embedding-updates`

`GET /api/analytics/usage` returns upload-count telemetry and a sustained-rate
signal. It intentionally does not return spend or an estimated dollar amount:
the application has no billed-dollar authority for observed upload cost.

## Response Format

Successful responses are endpoint-specific JSON objects. Local Go errors use
`{error,code,retryable?}`; meaningful HTTP statuses and `Retry-After` distinguish
auth, validation, quota, unavailable, and retryable conditions. The predecessor
may also include diagnostic fields:

```json
{
  "error": "Error message",
  "details": { ... }
}
```

## Rate Limiting — deployed predecessor

There is no general per-request rate limiter on upload, search, share, or
other product API routes — an accepted residual documented in
[ADR-006](./adr/006-personal-upload-tokens.md#consequences): storage quota and
revocable tokens/sessions are today's abuse control, not a request-rate
throttle.

Two routes do enforce a real, tested limit:

- `POST /api/telemetry`: 60 requests per minute per authenticated user
  (`lib/telemetry-rate-limit.ts`); exceeding it returns `429`.
- `POST /api/assets/{id}/generate-embedding` and the embedding pipeline:
  per-user and global concurrency/window admission control
  (`lib/embedding-rate-limit.ts`), returning `429` with `status:
  "provider_rate_limited"` or `503` with `status: "provider_backoff"` — this
  protects the Replicate provider budget, not general API traffic.

---

## Endpoint reference — deployed Next.js unless marked

### Health Check

#### GET /api/health/live

Process-liveness probe dedicated to platform routing (DigitalOcean routes the
web service on this path). Both runtimes retain `status: "alive"` and
`service: "sploot-web"`. It proves only that the process is responding:
no database, provider, Clerk, telemetry, network, or
model dependency, and no sensitive output. It must never be used as a
dependency oracle.

**Authentication:** Not required

**Response (always `200` while the process is up):**

```json
{
  "status": "alive",
  "service": "sploot-web"
}
```

Local Go adds `commit` from configured/build revision metadata. The deployed
predecessor does not expose a commit here. This extra local field is not
evidence that Go is serving production.

#### GET /api/health

**Deployed Next.js:** database connectivity, embedding limiter schema, and
(when `STRIPE_LEDGER_BOOTSTRAP_REQUIRED=true`) the Stripe bootstrap marker.
Failure is `503`. Concurrent predecessor requests share one bounded database
probe; a request timeout never launches duplicate database work.

**Local Go:** a bounded SQLite query checks `vec_version()` and required tables.
The response includes `runtime: "go"`, `database: "sqlite"`,
`storage: "filesystem"`, `commit`, `dependencies.database` (`up`/`down`),
`dependencies.search` (`ready`/`disabled`), and schema/connection diagnostics.
SQLite/schema failure returns `503` with `status: "degraded"`. This is not a
pgvector, Prisma migration, provider-limiter, or Stripe readiness oracle.

Operators use deep readiness; platform routing deliberately uses shallow
`/api/health/live`. Neither health endpoint exercises a semantic query.

**Authentication:** Not required

**Healthy predecessor fields (illustrative subset, not a complete payload):**

```json
{
  "status": "ok",
  "dependencies": {
    "database": "up",
    "embedding_limiter": "up",
    "share_slug_cache": "local"
  }
}
```

The predecessor returns a timestamp and package `version` on success, uses
`diagnostics.prisma_connection_test`, and reports `status: "error"` on `503`.
Do not replace its dependency fields with a version-only example or treat
a green liveness response as deep readiness.

#### GET /api/health/services — local Go

Anonymous readiness/configuration report used by `sploot doctor`: SQLite
health, local account registration policy, filesystem media, local embedding
enabled/model/dimensions, and optional Sentry configuration. It returns
`status: "ok"` with `allServicesConfigured: true` only when its SQLite/schema
probe succeeds; otherwise `503`/`degraded`. Configuration flags are not proof
of a completed upload, inference, or external telemetry call.

#### GET /api/version

**Authentication:** Not required.

- **Deployed Next.js:** `{"version":"v…"}` or `{"version":null}` when the latest
  release is unknown. This is the latest GitHub release tag, cached for one
  hour, **not** the active deployment commit or a package version.
- **Local Go:** `{"version":"0.1.0","commit":"…","runtime":"go"}`.
  This package version is not the predecessor's latest-release lookup and
  cannot be compared with a release tag as proof of the same running artifact.

Use the DigitalOcean completed deployment/source receipt for the running
revision; `/api/version` alone cannot prove a predecessor deployment.

---

### Upload Management

#### Pre-GA enrollment containment

The policy modes and response wording in this subsection describe the
predecessor only. Local Go registers password accounts according to
`SPLOOT_REGISTRATION_OPEN`; its anonymous enrollment probe returns
`{"status":"ok","mode":"open","configuration":"valid"}` or the same shape with
`mode: "closed"`. Its registration denial is `registration_closed`, not the
predecessor's Clerk admission error.

New account admission is server-owned and applies before any Blob, storage,
starter-pile, embedding, or search work. A request for an authenticated Clerk
identity that has not yet been admitted returns the stable denial below; UI
state, direct API calls, extension saves, URL imports, share-target posts, and
embedding endpoints cannot bypass it.

```json
{
  "success": false,
  "error": "New account enrollment is temporarily paused.",
  "code": "enrollment_closed",
  "retryable": true,
  "action": { "type": "try_later", "label": "Try again later" }
}
```

The response is `403`. Production configuration is fail-closed; see
[`DEPLOYMENT.md`](./DEPLOYMENT.md) for the capped mode, authenticated operator
readback, and the explicit `SPLOOT_ENROLLMENT_MODE=ga` lift action. Existing
users retain read, download/export, and delete behavior because they are not
re-admitted on each request.

If the server cannot prove the enrollment boundary because Prisma or an
admission lookup is unavailable, routes return `503` with
`code: "enrollment_unavailable"`; callers must not treat that response as a
new-account denial or bypass the boundary.

If a verified identity conflicts with an existing Clerk identity, routes return
`409` with `code: "enrollment_identity_conflict"`; this is an identity repair
condition, not a new-account admission.

The public probe is `GET /api/health/enrollment`. It returns only this
cache-disabled, anonymous-safe shape:

```json
{ "status": "paused", "mode": "closed", "configuration": "valid" }
```

`status` is `open` only after a live account-count read proves a GA or capped
configuration is available; a capped limit or malformed configuration is the
fail-closed `paused`. A GA/capped configuration whose database cannot answer
returns the distinct `{"status": "unknown"}` with HTTP `503` — still
fail-closed for sign-up, but never mislabeled as an ordinary policy pause.
The response sends
`Cache-Control: no-store, private`. Operators who need account count,
capacity, or deployment diagnostics must use the distinct authenticated
`GET /api/health/enrollment/readback` route with an operator/admin account.
Use the repo-owned `probe:enrollment` command against the exact active
deployment URL for the anonymous-safe mode/status check.

#### GET /api/health/enrollment

**Authentication:** Not required. **Response:** exactly
`SplootEnrollmentPublicState` (`status`, `mode`, `configuration`) with no
account count, capacity, deployment identity, commit, or operator fields.
`status` is one of `open`, `paused`, or `unknown`. Invalid configuration
returns the paused fail-safe with HTTP `503`; an unavailable enrollment
database under a valid GA/capped configuration returns `status: "unknown"`
with HTTP `503` (distinct from a policy pause, equally closed for sign-up);
a valid closed state returns `paused` with HTTP `200`.

#### POST /api/upload

Uploads are guarded by the same runtime and quota policy:

- `SPLOOT_UPLOADS_ENABLED=false` pauses uploads before server-side Blob writes and returns `503` with `code: "uploads_disabled"`.
- Per-user storage quota is checked after validation/deduplication and before image processing or Blob writes.
- Quota denials return `403` with `code: "quota_exceeded"`, a `quota` snapshot, and an action pointing to `/app/settings`.
- `POST /api/upload` is the supported upload contract for web, extension, and future queued replay clients. Direct client-upload URL generation is not a supported product API.
- Optional `Idempotency-Key` (1–128 ASCII letters, digits, `.`, `_`, `:`, or `-`) identifies a queued upload across retries and tabs. A completed key replays its original result; a live concurrent request returns `409` with `code: "UPLOAD_IN_PROGRESS"` and clients should retry the same key.
- The browser queue uses a two-minute durable claim lease, longer than the upload client's ten-second network timeout, so a timed-out request can be recovered without a second active worker. The receipt is retained for seven days and cleanup deletes only completed receipts after that replay window. The `Idempotency-Key` is a request/replay fence; checksum uniqueness in the ingest pipeline remains the server-side asset deduplication oracle.

Quota error example:

```json
{
  "success": false,
  "error": "Storage quota exceeded",
  "code": "quota_exceeded",
  "retryable": false,
  "quota": {
    "usedBytes": 104857600,
    "limitBytes": 1073741824,
    "remainingBytes": 0,
    "incomingBytes": 10485760
  },
  "action": {
    "type": "manage_storage",
    "label": "Manage storage",
    "href": "/app/settings"
  }
}
```

upload a meme through the api. this is the `SplootApiUploadResponse` contract
used by the chrome extension. accepted media types are JPEG, PNG, WebP, GIF,
MP4, and WebM. static images get optimized main/thumbnail blobs; animated GIFs
and videos keep the original blob as the playback source and store a poster
thumbnail for previews and embedding.

**Authentication:** Required

**Request:** `multipart/form-data`

**Form Fields:**

- `file` (file, required): meme file to upload (`image/jpeg`, `image/jpg`,
  `image/png`, `image/webp`, `image/gif`, `video/mp4`, or `video/webm`)
- `tags` (json string array, optional): Tag names to attach

**Headers:**

- `Idempotency-Key` (optional): Stable key for queued-upload retries. Reusing a completed key replays the original response; a concurrent request receives `409` with `code: "UPLOAD_IN_PROGRESS"`.

**Success Response (201):**

```json
{
  "success": true,
  "isDuplicate": false,
  "asset": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "blobUrl": "https://blob.vercel-storage.com/abc123/funny-meme.jpg",
    "pathname": "user123/funny-meme.jpg",
    "filename": "funny-meme.jpg",
    "mimeType": "video/mp4",
    "size": 2048576,
    "checksum": "sha256:abc123...",
    "createdAt": "2026-05-14T12:00:00.000Z",
    "needsEmbedding": true
  },
  "message": "Upload successful"
}
```

**Duplicate Response (409):**

```json
{
  "success": true,
  "isDuplicate": true,
  "asset": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "blobUrl": "https://blob.vercel-storage.com/abc123/funny-meme.jpg",
    "pathname": "user123/funny-meme.jpg",
    "filename": "funny-meme.jpg",
    "mimeType": "video/mp4",
    "size": 2048576,
    "checksum": "sha256:abc123...",
    "createdAt": "2026-05-14T12:00:00.000Z",
    "needsEmbedding": false
  },
  "message": "This image already exists in your library"
}
```

**Error Responses:**

- 400: Missing file or invalid upload. validation errors return `success: false`
  and `error`.
- 401: Unauthorized
- 413: Image too large
- 429: Too many uploads
- 500: Server error

---

#### GET /api/piles

Return automatic semantic piles for the authenticated user's library. Piles are
computed from existing CLIP image embeddings in `asset_embeddings`; the route
does not call a new embedding provider or create a second vector pipeline.
Libraries with fewer than 50 ready embedded assets return an empty pile list
with an `insufficient_embedded_assets` status so the UI can keep the flat grid.

Pile labels are generated by comparing each pile centroid with a curated set of
lowercase text anchors embedded through the existing text-embedding cache. Cold
instances may call the configured embedding service to fill missing anchor
embeddings; cached anchors make recomputation cheap enough to run on page load
or after uploads.

**Authentication:** Required

**Query Parameters:**

- `limit` (optional): maximum piles to return, 1-12, default 6
- `minAssets` (optional): minimum ready embedded assets required before piles
  are returned, 1-500, default 50

**Success Response (200):**

```json
{
  "status": "ready",
  "minimumAssets": 50,
  "embeddedAssetCount": 74,
  "piles": [
    {
      "id": "reaction-faces",
      "label": "reaction faces",
      "count": 18,
      "bangers": 4,
      "confidence": 0.82,
      "thumbnailAssets": [
        {
          "id": "asset_123",
          "blobUrl": "https://blob.vercel-storage.com/u/reaction.png",
          "thumbnailUrl": "https://blob.vercel-storage.com/u/reaction-thumb.jpg",
          "pathname": "u/reaction.png",
          "filename": "reaction.png",
          "mime": "image/png",
          "favorite": true
        }
      ]
    }
  ]
}
```

If the user has too few ready embedded assets:

```json
{
  "status": "insufficient_embedded_assets",
  "minimumAssets": 50,
  "embeddedAssetCount": 24,
  "piles": []
}
```

**Error Responses:**

- 401: Unauthorized
- 503: Embeddings are paused or the text-anchor embedding service is
  unavailable and anchors are not cached
- 500: Server error

---

### Personal Upload Tokens

Hashed, revocable credentials for non-session clients (the iPhone "Save to
Sploot" shortcut, the sploot MCP server, other agents/automation), scoped to
**save + search**, not library listing, direct asset APIs, export, deletion, or
token management. Search responses necessarily expose matching assets. See the
[Shortcut source/release procedure](./shortcuts/save-to-sploot.md),
[published external contract](./PUBLIC_API.md), and predecessor
[auth model](./AUTH.md). "Upload tokens" is a legacy UI/route name, not an
upload-only permission claim; local Go labels them personal access tokens.

Management is **browser-session-only**: Clerk/qa-local in the predecessor,
`sploot_session` in Go. Neither a personal token nor a Go device credential
can mint, list, or revoke personal tokens.

#### POST /api/upload-tokens

Mint a token. The plaintext `token` is returned **once** and never again; only
its hash is stored.

**Request:** `{ "name": "iphone" }` (1–64 chars)

**Response `201`:**

```json
{
  "id": "ckxyz…",
  "name": "iphone",
  "prefix": "splt_ab12cd",
  "createdAt": "2026-06-18T00:00:00Z",
  "token": "splt_…"
}
```

`400` if the name is missing/blank; `422` if you already have the maximum (10)
active tokens.

#### GET /api/upload-tokens

List your active tokens — metadata only, never the secret or its hash.

```json
{ "tokens": [ { "id": "…", "name": "iphone", "prefix": "splt_ab12cd", "lastUsedAt": null, "createdAt": "…" } ] }
```

#### DELETE /api/upload-tokens/{id}

Revoke a token (soft delete). Ownership-checked and idempotent: revoking a
missing or already-revoked token still returns `{ "success": true }`.

#### Using a token

```bash
curl -X POST https://www.sploot.app/api/upload \
  -H "Authorization: Bearer splt_…" \
  -F "file=@meme.png"
```

`POST /api/upload`, `POST /api/upload/url`, and `POST /api/search` accept a
personal API token in both runtimes. Other protected product routes reject
personal-token-only authentication. Go device `spld_` tokens are a different,
broader credential governed by the local authority table above.
Dedupe, quota, and the `201`/`409` contracts are identical to a session upload. See
[`PUBLIC_API.md`](./PUBLIC_API.md) for the full token-scoped contract.

---

### Asset Management

#### POST /api/assets

Create a new asset record after successful blob upload. Schedules embedding
generation through the shared durable admission boundary when embeddings are
enabled; the response may report `processing` while the scheduler persists
retryable, user-local, and terminal outcomes for cron recovery.

**Authentication:** Required

**Request Body:**

```json
{
  "blobUrl": "https://blob.vercel-storage.com/abc123/funny-meme.jpg",
  "pathname": "user123/funny-meme.jpg",
  "filename": "funny-meme.jpg",
  "mimeType": "image/jpeg",
  "size": 2048576,
  "width": 1920,
  "height": 1080,
  "checksum": "sha256:abc123..."
}
```

**Parameters:**

- `blobUrl` (string, required): URL from Vercel Blob storage
- `pathname` (string, required): Blob pathname to persist
- `filename` (string, required): Original filename
- `mimeType` (string, required): MIME type. upload APIs accept JPEG, PNG, WebP,
  GIF, MP4, and WebM; GIF/video assets should use their original `blobUrl` for
  playback and `thumbnailUrl` as a poster/embedding image when present.
- `size` (number, required): File size in bytes
- `width` (number, optional): Image width in pixels
- `height` (number, optional): Image height in pixels
- `checksum` (string, optional): SHA-256 checksum for deduplication. when
  omitted, the server generates a random checksum.

**Success Response (201):**

```json
{
  "asset": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "blobUrl": "https://blob.vercel-storage.com/abc123/funny-meme.jpg",
    "pathname": "user123/funny-meme.jpg",
    "filename": "user123/funny-meme.jpg",
    "mime": "image/jpeg",
    "size": 2048576,
    "width": 1920,
    "height": 1080,
    "favorite": false,
    "tags": [],
    "createdAt": "2025-09-16T12:00:00Z",
    "embeddingStatus": "processing"
  },
  "message": "Asset created successfully"
}
```

**Error Responses:**

- 400: Missing or invalid parameters
- 401: Unauthorized
- 500: Server error

#### GET /api/assets

List assets for the authenticated user with pagination, filtering, seeded shuffle,
and optional taste ranking from existing CLIP embeddings.

**Authentication:** Required

**Query Parameters:**

- `limit` (number, optional): number of results (default: 50, min: 1, max: 100)
- `offset` (number, optional): skip this many results (default: 0, min: 0)
- `sortBy` (string, optional): `createdAt`, `updatedAt`, `size`, `pathname`, `shuffle`, or `taste` (API default: `createdAt`; library UI default: `shuffle` with a generated seed)
- `sortOrder` (string, optional): `desc` or `asc` for non-shuffle, non-taste sorts (default: `desc`)
- `favorite` (boolean, optional): filter to favorites only
- `tagId` (string, optional): filter to one tag id
- `includeTags` (boolean, optional): include tag objects in each asset; enabled automatically with `tagId`
- `shuffleSeed` (number, required when `sortBy=shuffle`): deterministic shuffle seed from `0` to `1000000`

**Shuffle Contract:**

Use `sortBy=shuffle&shuffleSeed=<seed>&limit=<n>` to fetch a deterministic seeded ring order for the authenticated user's assets. Each asset has a stable `shuffle_key` (`BIGINT`), and the seed maps to a pivot on that keyspace. Results are ordered by walking the ring from the pivot and wrapping at the end. The same seed, filters, limit, and offset return the same order while the matching asset set is unchanged. Shuffle is private to the authenticated user's library and respects `favorite`, `tagId`, `limit`, and `offset`.

Tradeoff: this path is scalable and index-friendly, but it is not a per-request full-table random sort; it is a deterministic rotation over stable shuffle keys.

**Taste Contract:**

Use `sortBy=taste` to rank ready embedded assets by cosine similarity to the
centroid of the authenticated user's ready embedded bangers (`favorite=true`).
Taste ranking does not call a new embedding provider and does not change the
default library order. It respects `favorite`, `tagId`, `limit`, and `offset`.
If fewer than two ready embedded bangers exist, the response stays `200` with an
empty asset list and typed `taste.status: "insufficient_bangers"` metadata.

**Success Response (200):**

```json
{
  "assets": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "blobUrl": "https://blob.vercel-storage.com/abc123/funny-meme.jpg",
      "filename": "funny-meme.jpg",
      "mimeType": "image/jpeg",
      "size": 2048576,
      "width": 1920,
      "height": 1080,
      "favorite": false,
      "tags": [],
      "createdAt": "2025-09-16T12:00:00Z",
      "tasteScore": 0.912
    }
  ],
  "pagination": {
    "total": 150,
    "limit": 50,
    "offset": 0,
    "hasMore": true
  },
  "taste": {
    "status": "ready",
    "embeddedBangerCount": 8,
    "minimumBangerEmbeddings": 2
  }
}
```

**Shuffle Example:**

```http
GET /api/assets?sortBy=shuffle&shuffleSeed=424242&limit=30&offset=0
```

**Taste Example:**

```http
GET /api/assets?sortBy=taste&limit=30&offset=0
```

**Error Responses:**

- 400: Invalid `limit`, `offset`, `sortBy`, or `shuffleSeed`; `shuffleSeed` missing for `sortBy=shuffle`; `shuffleSeed` provided without `sortBy=shuffle`
- 401: Unauthorized
- 500: Server error

#### GET /api/taste/profile

Return a minimal taste profile for the authenticated user. The profile is
derived from existing ready CLIP image embeddings on favorited bangers and does
not create provider work in the request path.

**Authentication:** Required

**Success Response (200):**

```json
{
  "status": "ready",
  "bangerCount": 12,
  "embeddedBangerCount": 8,
  "label": "near your bangers",
  "summary": "sploot is comparing 8 embedded bangers against the rest of your library.",
  "representativeAssets": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "blobUrl": "https://blob.vercel-storage.com/abc123/funny-meme.jpg",
      "pathname": "funny-meme.jpg",
      "mime": "image/jpeg",
      "favorite": true,
      "tasteScore": 0.912
    }
  ]
}
```

When the user has fewer than two ready embedded bangers, the route returns
`status: "insufficient_bangers"` with an empty `representativeAssets` array.

**Error Responses:**

- 401: Unauthorized
- 500: Server error

#### GET /api/assets/{id}

Get details for a specific asset.

**Authentication:** Required

**Path Parameters:**

- `id` (string, required): Asset UUID

**Success Response (200):**

```json
{
  "asset": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "blobUrl": "https://blob.vercel-storage.com/abc123/funny-meme.jpg",
    "filename": "funny-meme.jpg",
    "mimeType": "image/jpeg",
    "size": 2048576,
    "width": 1920,
    "height": 1080,
    "favorite": false,
    "tags": [],
    "createdAt": "2025-09-16T12:00:00Z",
    "hasEmbedding": true
  }
}
```

**Error Responses:**

- 404: Asset not found
- 401: Unauthorized
- 403: Forbidden (not owner)

#### PATCH /api/assets/{id}

Update asset metadata (favorite status, tags).

**Authentication:** Required

**Path Parameters:**

- `id` (string, required): Asset UUID

**Request Body:**

```json
{
  "favorite": true,
  "tags": ["reaction", "drake"]
}
```

**Parameters:**

- `favorite` (boolean, optional): Set favorite status
- `tags` (array, optional): Up to 256 tag strings; each name is at most 128 characters

**Success Response (200):**

```json
{
  "asset": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "favorite": true,
    "tags": ["reaction", "drake"],
    "updatedAt": "2025-09-16T12:00:00Z"
  }
}
```

#### DELETE /api/assets/{id}

Delete an asset (soft delete by default).

**Authentication:** Required

**Path Parameters:**

- `id` (string, required): Asset UUID

**Query Parameters:**

- `permanent` (boolean, optional): Permanently delete if true

**Success Response (200):**

```json
{
  "message": "Asset deleted successfully",
  "permanent": false
}
```

#### GET /api/assets/{id}/tags

List tags attached to an asset you own.

**Authentication:** Required

**Error Responses:**

- 401: `{"error":"Unauthorized"}`
- 404: Asset not found
- 500: Server error

#### POST /api/assets/{id}/tags

Attach existing or new tags to an asset you own. The request accepts at most 256 tag IDs and 256 tag names; each name is at most 128 characters and each asset may have at most 256 tags.

**Authentication:** Required

**Error Responses:**

- 401: `{"error":"Unauthorized"}`
- 404: Asset not found
- 500: Server error

#### DELETE /api/assets/{id}/tags

Remove tag associations from an asset you own.

**Authentication:** Required

**Error Responses:**

- 400: Tag IDs missing/invalid
- 401: `{"error":"Unauthorized"}`
- 404: Asset not found
- 500: Server error

#### GET /api/assets/audit

Run a blob-url audit for the authenticated user's non-deleted assets.

**Authentication:** Required

**Error Responses:**

- 401: `{"error":"Unauthorized"}`
- 500: Failed to audit assets
- 503: Database unavailable

---

### Stats

#### GET /api/stats

Return per-user aggregate stats (`assetCount`, `storageBytes`, `storageLimitBytes`, `storageRemainingBytes`, `storageUsagePercent`, `lastUploadAt`).

**Authentication:** Required

**Error Responses:**

- 401: `{"error":"Unauthorized"}`
- 500: Failed to fetch stats
- 503: Database not available

---

### Library Export

**Runtime distinction:** the multipart lifecycle below belongs to the deployed
predecessor. In local Go, browser- or device-authenticated
`GET /api/library/export` prepares and returns a single `application/zip`
attachment containing owner metadata/vectors/tags and currently stored
source/thumbnail bytes, including soft-deleted asset records. It does not create the old export
session or serve its subroutes. It has one active export slot per process
(`429`, `code: "export_busy"`, `Retry-After: 30`) and a 15-minute deadline.
The archive is completed before success headers; transfer truncation is a
transport failure, not a completed download. This owner export is not the
operator [full-database backup/restore](./DEPLOYMENT.md#library-backup-and-isolated-restore).

#### Deployed predecessor export lifecycle

Complete-library export: every original plus a versioned, portable
`manifest.json`. Manifest schema, snapshot semantics, retry model, and
bounds are specified in **[`EXPORT.md`](./EXPORT.md)** — this section is the
endpoint reference. Session-authenticated only (no upload-token opt-in).

Export deliberately bypasses storage-quota, billing, and upload runtime
gates: over-limit, delinquent, and canceled accounts export normally.

#### POST /api/library/export

Create the caller's export session, or return the existing active session or durable completed manifest. A finalized manifest reports `status: complete`, is reused with `reused: true`,
and remains retryable for the manifest only. Body (optional): `{"force": true}` supersedes the active
session and snapshots fresh. At most one active session per user.

**Authentication:** Required (session)

**Response (201 created / 200 reused):**

```json
{
  "export": {
    "id": "cm0…",
    "status": "active",
    "createdAt": "…", "snapshotAt": "…", "expiresAt": "…",
    "manifestVersion": "1.0",
    "totals": { "assets": 1234, "originalBytes": 987654321 },
    "partCount": 4,
    "parts": [{ "index": 0, "count": 400, "bytes": 260000000, "served": false, "file": "sploot-export-…-part-001-of-004.zip" }],
    "failures": [],
    "complete": false,
    "incompleteReasons": ["parts_not_fully_downloaded"],
    "egress": { "usedBytes": 0, "allowanceBytes": 3108583235, "windowAllowanceBytes": 6217166470 },
    "downloads": {
      "status": "/api/library/export/cm0…",
      "manifest": "/api/library/export/cm0…/manifest",
      "parts": ["/api/library/export/cm0…/parts/0"]
    }
  },
  "reused": false
}
```

`force: true` is refused before snapshotting when 32 prior sessions must remain
to preserve rolling-window egress accounting or an unexpired finalized
manifest. The response is HTTP 429 with
`{"code":"export_egress_window_exhausted","retryable":true,"retryAfterSec":…}`
and a matching `Retry-After` header. Zero-egress canceled/superseded history is
cap-prunable even inside the window, so force-create spam cannot grow storage.

#### GET /api/library/export

Return the caller's active export session or durable completed manifest (same
shape as above), or `{"export": null}` — used to resume an interrupted export
or rediscover its finalized manifest. Completed sessions expose no part-download
affordance; their manifest URL remains available until expiry.

#### GET /api/library/export/{exportId}

Server-verified status/progress for one export (owner only; 404 otherwise).
`status` becomes `expired` after `expiresAt`.

#### DELETE /api/library/export/{exportId}

Cancel the export immediately; its download URLs answer 410 afterwards.
Returns `{"canceled": true|false}`.

#### GET /api/library/export/{exportId}/parts/{partIndex}

Stream one zip part (`application/zip`, attachment). Idempotent: re-request
the same part to retry an interrupted download. A part is marked served only
after its final byte was streamed.

Egress allowance is `3 × (totalOriginalBytes + 3,072 × totalAssets + measuredManifestMetadataBytes) + 128 MB`; the rolling 24-hour tenant allowance is twice that amount. The example above assumes 987,654,321 original bytes, 1,234 assets, and 10,000 measured UTF-8 manifest/tag metadata bytes.

Egress is reservation-admitted: a conservative bound for the whole response
is charged atomically before any byte streams, settled down to actual bytes
on clean completion, and kept in full if the download is aborted (see
[`EXPORT.md`](./EXPORT.md)).

**Error Responses:**

- 401: `{"error":"Unauthorized"}`
- 404: unknown export id, foreign export id, or out-of-range part index
- 410: `export_expired` | `export_unavailable` (canceled/superseded)
- 429: `export_egress_exhausted` (per-export download budget spent;
  `retryable: false`) | `export_egress_window_exhausted` (rolling 24h tenant
  budget or protected-session ceiling reached; `retryable: true`, with
  `Retry-After` — the window slides)

#### GET /api/library/export/{exportId}/manifest

Stream `manifest.json` (`application/json`, attachment). Download it after
the parts — it records explicit completeness including unserved parts and
failed/missing objects. Same error contract as parts.

---

### Tags

#### GET /api/tags

List tags for the authenticated user.

**Authentication:** Required

**Error Responses:**

- 401: `{"error":"Unauthorized"}`
- 500: Failed to fetch tags
- 503: Database unavailable

#### POST /api/tags

Create a tag for the authenticated user. Names are at most 128 characters, colors are at most 32 characters, and each user may own at most 10,000 tags.

**Authentication:** Required

**Error Responses:**

- 400: Invalid tag payload
- 401: `{"error":"Unauthorized"}`
- 409: Tag already exists
- 500: Failed to create tag
- 503: Database unavailable

#### PATCH /api/tags/{tagId}

Update an existing user-owned tag. Names are at most 128 characters and colors are at most 32 characters.

**Authentication:** Required

**Error Responses:**

- 401: `{"error":"Unauthorized"}`
- 404: Tag not found
- 409: Tag with this name already exists
- 500: Failed to update tag
- 503: Database unavailable

#### DELETE /api/tags/{tagId}

Delete an existing user-owned tag.

**Authentication:** Required

**Error Responses:**

- 401: `{"error":"Unauthorized"}`
- 404: Tag not found
- 500: Failed to delete tag
- 503: Database unavailable

---

### Embeddings

#### GET /api/assets/{id}/embedding-status

Check embedding generation status for an asset.

**Authentication:** Required

**Path Parameters:**

- `id` (string, required): Asset UUID

**Success Response (200):**

```json
{
  "assetId": "550e8400-e29b-41d4-a716-446655440000",
  "hasEmbedding": true,
  "status": "ready"
}
```

**Status Values:**

- `pending`: no embedding row exists yet
- `ready`: embedding row exists

**Error Responses:**

- 401: Unauthorized
- 404: Asset not found or access denied
- 500: Server error
- 503: Database unavailable

#### POST /api/assets/batch/embedding-status

Check embedding generation status for up to 50 assets.

**Authentication:** Required

**Request Body:**

```json
{
  "assetIds": [
    "550e8400-e29b-41d4-a716-446655440000",
    "660e8400-e29b-41d4-a716-446655440001"
  ]
}
```

**Success Response (200):**

```json
{
  "statuses": {
    "550e8400-e29b-41d4-a716-446655440000": {
      "hasEmbedding": true,
      "status": "ready"
    },
    "660e8400-e29b-41d4-a716-446655440001": {
      "hasEmbedding": false,
      "status": "failed",
      "error": "Asset not found or access denied"
    }
  }
}
```

**Status Values:**

- `pending`: asset exists and no embedding row exists yet
- `ready`: embedding row exists
- `failed`: asset was not found or access was denied

**Error Responses:**

- 400: `assetIds` is missing, not an array, or has more than 50 items
- 401: Unauthorized
- 500: Server error
- 503: Database unavailable

#### POST /api/assets/{id}/generate-embedding

Manually trigger embedding generation for an asset.

Embedding generation is guarded by `SPLOOT_EMBEDDINGS_ENABLED=false`; when disabled this route returns `503` with `code: "embeddings_disabled"` before calling Replicate. Ready, processing, cooldown, and unsupported-media responses are resolved before the provider circuit is read, so a circuit-table outage cannot hide no-work state. A durable provider circuit returns `503` with `status: "provider_backoff"` and `Retry-After`; an actual provider `429` returns `429` with `status: "provider_rate_limited"` and is counted as an asset attempt. Provider timeout and 5xx outcomes return typed `503` with `Retry-After` and are counted as asset attempts. Deterministic provider-client initialization failures return a non-retryable `503` with `X-Sploot-Embedding-Outcome: embedding_configuration`, are claim-fenced into terminal configuration state, and do not consume the asset attempt budget; they carry no `Retry-After`. User/global rate and daily-budget denials return typed `429` responses with `Retry-After`; an unavailable limiter returns typed `503`. An asset-local cooldown returns `429` with `status: "cooldown"`. Every embedding `429` has a finite `Retry-After`: missing or malformed provider metadata defaults to 30 seconds, and a valid provider value is preserved as a lower bound rather than shortened locally; daily- and monthly-budget responses point truthfully to their UTC reset. The cron embedding processor uses the same gate and circuit and includes per-item failure taxonomy in partial responses.

This route is also the only recovery path for a terminal asset (one that has exhausted its three-attempt budget; cron never rediscovers terminal rows). Within fifteen minutes of the terminal failure the route returns `429` with `status: "terminal_quarantine"` and a truthful `Retry-After`. After the quarantine, an owner request may atomically revive the row — resetting the attempt budget and passing through the full circuit/rate/daily admission boundary — and a successful revive-and-generate response includes `"revived": true`. An asset receives at most one revival over its lifetime. If that fresh three-attempt cycle re-poisons the row, requests remain quarantined for fifteen minutes and then return `422` with `status: "terminal_failure"` and `reason: "revival_exhausted"`; a database trigger preserves this cap across runtime rollback.

**Authentication:** Required

**Path Parameters:**

- `id` (string, required): Asset UUID

**Request Body:**

```json
{
  "force": false
}
```

**Parameters:**

- `force` (boolean, optional): Regenerate even if embedding exists

**Success Response (200):**

```json
{
  "success": true,
  "message": "Embedding generated successfully",
  "embedding": {
    "modelName": "…",
    "dimension": 768,
    "processingTime": 123
  }
}
```

#### POST /api/embeddings/text

Generate embeddings for text input (primarily for testing).

**Authentication:** Required

**Request Body:**

```json
{
  "query": "distracted boyfriend meme"
}
```

**Success Response (200):**

```json
{
  "success": true,
  "embedding": [0.123, 0.456, ...],
  "model": "krthr/clip-embeddings:1c0371070cb827ec3c7f2f28adcdde54b50dcd239aa6faea0bc98b174ef03fb4",
  "dimension": 768,
  "processingTime": 120
}
```

`dimension` is shown for the currently configured CLIP model and comes from the
model response at runtime.

#### POST /api/embeddings/image

Generate embeddings for an image URL (primarily for testing).

**Authentication:** Required

**Request Body:**

```json
{
  "imageUrl": "https://blob.vercel-storage.com/abc123/funny-meme.jpg",
  "assetId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Success Response (200):**

```json
{
  "success": true,
  "embedding": [0.789, 0.012, ...],
  "model": "krthr/clip-embeddings:1c0371070cb827ec3c7f2f28adcdde54b50dcd239aa6faea0bc98b174ef03fb4",
  "dimension": 768,
  "processingTime": 130,
  "assetId": "550e8400-e29b-41d4-a716-446655440000"
}
```

`assetId` is optional. when provided, the route verifies ownership and stores
the generated embedding. If a concurrent worker has already claimed or stored
the asset embedding, the claim-fenced write returns `409` with
`Embedding state changed; retry the request` instead of reporting a false
success.

---

### Search

#### POST /api/search

Perform semantic search using text queries.

**Authentication:** Required

**Request Body:**

```json
{
  "query": "distracted boyfriend",
  "limit": 30,
  "threshold": 0.12,
  "favoriteOnly": false,
  "tagId": null
}
```

**Parameters:**

- `query` (string, required): Search text (max 500 characters)
- `limit` (number, optional): requested result count (default: 30, max: 100).
  Every page is bounded.
- `cursor` (string, optional): opaque cursor from the previous response for
  deterministic keyset traversal beyond the legacy offset window.
- `offset` (number, optional): retained for backwards compatibility (default:
  0, max: 500); do not combine it with `cursor`.
- `threshold` (number, optional): Minimum similarity score (0-1, default: 0.12;
  the runtime source of truth is `lib/search-config.ts`)
  Results below this score are not returned; a real miss returns an empty
  `results` array rather than low-similarity padding.
- `favoriteOnly` (boolean, optional): Restrict results to favorited assets.
- `tagId` (string, optional): Restrict results to assets carrying this tag.

Semantic search is always ordered by descending vector relevance, with asset id
as the deterministic tie-breaker. The gallery's seeded shuffle is a library
view concern and is not applied to semantic search. Cursors are opaque,
cryptographically signed by the server, and bound to the authenticated owner,
embedding-model revision, normalized query, threshold, relevance order,
favorite/tag filters, and page size; tampering or replaying one with a
different user/context returns `400` with
`{"error":"Search cursor does not match search context"}` before vector or
database work.

**Success Response (200):**

```json
{
  "results": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "blobUrl": "https://blob.vercel-storage.com/abc123/funny-meme.jpg",
      "pathname": "user123/funny-meme.jpg",
      "filename": "funny-meme.jpg",
      "mime": "image/jpeg",
      "width": 1920,
      "height": 1080,
      "favorite": false,
      "size": 2048576,
      "createdAt": "2025-09-16T12:00:00Z",
      "embedding": {
        "assetId": "550e8400-e29b-41d4-a716-446655440000"
      },
      "embeddingStatus": "ready",
      "similarity": 0.95,
      "relevance": 95,
      "belowThreshold": false,
      "tags": []
    }
  ],
  "query": "distracted boyfriend",
  "total": 1,
  "hasMore": false,
  "limit": 30,
  "requestedLimit": 30,
  "threshold": 0.12,
  "requestedThreshold": 0.12,
  "processingTime": 245,
  "embeddingModel": "krthr/clip-embeddings:1c0371070cb827ec3c7f2f28adcdde54b50dcd239aa6faea0bc98b174ef03fb4",
  "cached": false,
  "thresholdFallback": false
}
```

When `hasMore` is true, the response also includes `nextCursor`; send it as
`cursor` on the next request.

When Replicate is not configured, the route returns `503` with an `error`
explaining search is unavailable.

Enrollment errors are stable on this route: `403` with
`code: "enrollment_closed"`, `409` with
`code: "enrollment_identity_conflict"`, or `503` with
`code: "enrollment_unavailable"`. The same statuses apply to search
suggestions and `/api/search/advanced` before cache or vector work.

#### GET /api/search

Get recent or popular search suggestions.

**Authentication:** Required

**Query Parameters:**

- `type` (string, optional): `recent` or `popular` (default: `recent`)

**Success Response (200):**

```json
{
  "searches": [
    {
      "query": "drake meme",
      "resultCount": 12,
      "timestamp": "2025-09-16T12:00:00Z"
    }
  ]
}
```

for `type=popular`, each search object contains `query` and `count`.

The same `403`/`409`/`503` enrollment responses apply before reading search
logs or aggregates.

#### POST /api/search/advanced

Advanced search with multiple filters and sorting options.

**Authentication:** Required

Enrollment errors are `403 enrollment_closed`, `409
enrollment_identity_conflict`, or `503 enrollment_unavailable`; they are
returned before cache, embedding, metadata, or vector work.

**Request Body:**

```json
{
  "query": "reaction",
  "filters": {
    "favorites": true,
    "mimeTypes": ["image/gif", "video/mp4"],
    "tags": ["reaction", "template"],
    "dateFrom": "2025-01-01T00:00:00Z",
    "dateTo": "2025-12-31T23:59:59Z",
    "minWidth": 500,
    "minHeight": 300
  },
  "sortBy": "relevance",
  "limit": 30,
  "offset": 0,
  "threshold": 0.5
}
```

**Parameters:**

- `query` (string, required): Search text
- `filters` (object, optional): Filter criteria
  - `favorites` (boolean): Only favorites
  - `mimeTypes` (array): MIME type filters
  - `tags` (array): Tag filters
  - `dateFrom` (string): Start date (ISO 8601)
  - `dateTo` (string): End date (ISO 8601)
  - `minWidth` (number): Minimum width
  - `minHeight` (number): Minimum height
- `sortBy` (string, optional): Sort order (`relevance`, `date`, or `favorite`)
- `limit` (number, optional): Results per page (default: 30)
- `offset` (number, optional): Pagination offset (default: 0)
- `threshold` (number, optional): Minimum similarity (0-1, default: 0.12;
  `0.5` above is an explicit request override)

**Success Response (200):**

```json
{
  "results": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "blobUrl": "https://blob.vercel-storage.com/abc123/funny-meme.jpg",
      "pathname": "user123/funny-meme.jpg",
      "filename": "funny-meme.jpg",
      "mime": "image/jpeg",
      "size": 2048576,
      "width": 1920,
      "height": 1080,
      "favorite": false,
      "createdAt": "2025-09-16T12:00:00Z",
      "updatedAt": "2025-09-16T12:00:00Z",
      "similarity": 0.89,
      "relevance": 89,
      "tags": []
    }
  ],
  "query": "reaction",
  "filters": { ... },
  "sortBy": "relevance",
  "pagination": {
    "total": 145,
    "limit": 30,
    "offset": 0,
    "hasMore": true
  },
  "processingTime": 320,
  "embeddingModel": "krthr/clip-embeddings:1c0371070cb827ec3c7f2f28adcdde54b50dcd239aa6faea0bc98b174ef03fb4",
  "searchType": "semantic",
  "cached": false
}
```

---

### Cache Management

#### GET /api/cache/stats

Get cache statistics and performance metrics.

**Authentication:** Required

**Success Response (200):**

```json
{
  "stats": {
    "l1": {
      "hits": 1250,
      "misses": 350,
      "size": 85,
      "maxSize": 100,
      "hitRate": 0.78
    },
    "l2": {
      "hits": 280,
      "misses": 70,
      "hitRate": 0.8,
      "avgLatency": 8.5
    },
    "overall": {
      "totalHits": 1530,
      "totalMisses": 420,
      "hitRate": 0.78,
      "avgL1Latency": 0.5,
      "avgL2Latency": 8.5
    }
  },
  "topQueries": [
    {
      "query": "drake meme",
      "count": 45,
      "lastAccess": "2025-09-16T12:00:00Z"
    }
  ]
}
```

#### POST /api/cache/stats

Clear or warm the cache.

**Authentication:** Required

**Request Body:**

```json
{
  "action": "clear",
  "layer": "all"
}
```

**Parameters:**

- `action` (string, required): Action to perform (clear, warm)
- `layer` (string, optional): Cache layer (l1, l2, all)
- `queries` (array, optional): Queries to warm (for warm action)

**Success Response (200):**

```json
{
  "message": "Cache cleared successfully",
  "layer": "all"
}
```

---

## Error Codes

| Code | Description                                 |
| ---- | ------------------------------------------- |
| 400  | Bad Request - Invalid parameters            |
| 401  | Unauthorized - Authentication required      |
| 403  | Forbidden - Access denied                   |
| 404  | Not Found - Resource doesn't exist          |
| 409  | Conflict - Duplicate resource               |
| 413  | Payload Too Large - File exceeds size limit |
| 429  | Too Many Requests - Rate limit exceeded     |
| 500  | Internal Server Error                       |
| 503  | Service Unavailable - Required dependency or operation unavailable |

## Local Development Without Vendor Credentials

`pnpm dev` / `pnpm dev:local` runs the persistent Go product at
`http://127.0.0.1:3001`. Register an account, upload original media, and search
with real local CPU CLIP. Data survives shutdown in repository
`.sploot-local/library`; verified model files live in a separate reusable cache.
No seeded account, cached-only query, QA login, Postgres, or vendor credential
is required.

The [quick start](../../../README.md#quick-start) and
[runtime/recovery procedure](./DEPLOYMENT.md#self-contained-go-runtime) own
startup, doctor, model preparation, build, and private backup/restore commands.
Local web/Chromium acceptance does not migrate the unchanged production
library or establish physical iPhone, Apple signing, or Web Store acceptance.

## Client integration

Use the [published token API](./PUBLIC_API.md) for scriptable save/search recipes
instead of copying browser-session credentials into a client. Browser/device/
personal-token authority is specified [above](#authentication); there is no
separate shipped SDK implied by this reference. Shared upload/MIME/response
types live in `@sploot/common`, and the [MCP client](../../mcp/README.md) consumes
the published contract.

## Client behavior

- Preserve captured originals and their idempotency key across uncertain saves.
  Respect quota, retained failure state, and `Retry-After`; do not retry by
  fetching a mutable source again.
- Use opaque search cursors for traversal beyond the legacy offset window.
  Keep owner, model, query, and filters unchanged between cursor pages.
- Local Go caches model-version/owner-scoped query vectors, not result lists;
  newly indexed captures and favorite/tag/trash changes affect fresh requests.
- Local media is private; request the documented poster variant rather than
  assuming arbitrary Blob resizing parameters.
- Saving and indexing are distinct. Observe embedding status and expose a
  retryable failure rather than promising a fixed indexing latency.

## Changelog

### v1.0.0 (2025-09-16)

- Initial API release
- Core upload, search, and asset management
- Semantic search with SigLIP embeddings
- Multi-layer caching system
- PWA support with offline capabilities

