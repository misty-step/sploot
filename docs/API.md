# Sploot API Documentation

## Overview

Sploot's [published token API](./PUBLIC_API.md) owns the external **save/search**
contract. The self-contained Go runtime implements that contract:

- **Go product — `apps/server`**: canonical hosted and local SQLite/sqlite-vec,
  private filesystem media, local CPU CLIP inference, real password accounts,
  browser sessions, and paired-device credentials.
The Next.js predecessor is retired. Its source and provider data remain
historical recovery material, not another runnable workspace or API authority.
The explicit offline conversion is documented in [DEPLOYMENT.md](./DEPLOYMENT.md).
The route inventory and authentication boundary below own hosted and local Go
clients; unsupported predecessor routes are not compatibility aliases.

### Local Go route ownership

`apps/server/internal/httpapi/server.go` registers product routes;
`internal/httpapi/auth.go` registers account/device routes.

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

HTML routes include `/`, `/sign-in`, `/sign-up`, `/claim`, `/app`, `/app/feed`,
`/app/search`, `/app/settings`, `/app/connect`, and `/app/shortcut`. The last
downloads unsigned Shortcut source configured for this instance. PWA routes
are `/manifest.json`, `/sw.js`, and `GET`/`POST /share-target`; Web Share Target
availability depends on the browser and is not an iOS share-sheet claim.
There is no local QA login route or seeded-account authority.

Explicit public shares use `/s/{slug}` and `/s/{slug}?media=1` without a session.
`/m/{id}` redirects only when that asset has an enabled share slug and is not
deleted. The converter retains compatible predecessor slugs; old-domain link
continuity still requires a separately authorized redirect/cutover.
An unshared asset's `/media/{id}` URL remains private even when its ID is known.

`GET /api/library/export` returns a completed owner ZIP rather than the
predecessor's multipart export-session lifecycle. The old export subroutes,
SSE, piles/taste, advanced search, cache diagnostics, direct embedding endpoints,
and consumer billing routes are not Go APIs. Runtime and migration boundaries
remain in [DEPLOYMENT.md](./DEPLOYMENT.md).

## Base URL

```text
Canonical hosted Go: https://sploot.mistystep.io/api
Local Go: http://127.0.0.1:3001/api
```

Use the selected instance's exact canonical origin (`SPLOOT_BASE_URL` for Go),
including for relative media URLs and device approval. Off-loopback Go access
requires HTTPS. Local and production credentials are not interchangeable.

Hosted registration is closed. Extension clients select the canonical HTTPS
instance explicitly; MCP defaults to its `/api` origin. A local development
default is not a second production authority. Legacy-origin redirects and
retirement are operational routing, not API compatibility proxies; see
[current production operations](./DEPLOYMENT.md#canonical-hosted-go-instance).

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
| `Authorization: Bearer splt_…` | Revocable personal token, with no configured expiry lifetime; only the three published save/search routes opt in. No library listing, direct private media, export, deletion, or account/token management |

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
| `POST /api/auth/claim` | `{userId,token,password}` → `200 {user:{id,email}}`, sets browser cookie | No session; same-origin browser request and one-use operator invitation |
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

### Operator-invited migrated accounts

Imported identities remain separate. The offline importer accepts an explicit
source-ID → existing-native-ID mapping; email equality is never linking authority.
Mapped accounts keep their existing password hashes and sessions. Other DB and
Clerk-only identities have a deliberately unusable password marker until claimed.
No Clerk password, session, old personal token, or guessed password is imported.

The operator writes invitation links to a **new private mode0600 file**, never
stdout or an email sender. Links use `/claim#userId=…&token=…&email=…`; the
fragment is not sent in the GET request and the page removes it from browser
history immediately. Its email is a display hint, not account authority.
`POST /api/auth/claim` requires the exact `userId` and 256-bit random `spli_`
token plus a valid new password. Only SHA-256 of the token is stored. Validity
is operator-bounded from one minute to seven days (default 24 hours).

Claiming works when public registration is closed. The existing origin checks,
bounded password-work admission, Argon2id parameters, and browser-cookie rules
apply. Token consumption and password setup commit together, fenced to the one
unclaimed account; only one concurrent claimant succeeds. Wrong-owner, expired,
rotated or used tokens return `410 invitation_invalid`. A browser already signed
in as a different owner gets `409 ACCOUNT_CHANGED` and must sign out first.
GET never consumes an invitation. The operator may rotate an unclaimed account's
link, but cannot use this flow to reset an already activated account.

There is no public invitation-issuance endpoint, automatic email, email-based
account merging, or general password-reset service. See the
[offline importer and invitation commands](./DEPLOYMENT.md#offline-predecessor-conversion).

Backup/restore deliberately removes portable session/device/pairing/PAT and
invitation credentials while preserving password accounts. A restored user must
sign in, mint personal tokens, and pair devices again; an unclaimed account needs
a newly issued operator invitation. See
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

## Response Format

Successful responses are endpoint-specific JSON objects. Go errors use
`{error,code,retryable?}`; meaningful HTTP statuses and `Retry-After` distinguish
auth, validation, storage admission, unavailable, and retryable conditions.

## Health and version

- `GET /api/health/live` reports `status: "alive"` and `service: "sploot-web"`.
  It checks process liveness, not SQLite or inference readiness.
- `GET /api/health` checks SQLite/schema and reports `runtime: "go"`,
  `database: "sqlite"`, `storage: "filesystem"`, and deployment `commit`.
  Inference loading/unavailability is described [above](#local-inference-readiness-and-admission).
- `GET /api/health/services` is the anonymous readiness/configuration report
  consumed by `sploot doctor`; it includes no private account or media data.
- `GET /api/health/enrollment` returns
  `{status:"ok",mode:"open"|"closed",configuration:"valid"}`. It exposes
  registration policy, not an account-creation or authentication bypass.
- `GET /api/version` returns `{version:"0.1.0",commit:"…",runtime:"go"}`.
  The package version alone does not identify the deployed artifact; use its
  bound commit and the [deploy procedure](./DEPLOYMENT.md#deploy-and-rollback).


### Personal Upload Tokens

Hashed, revocable credentials for non-session clients (the iPhone "Save to
Sploot" shortcut, the sploot MCP server, other agents/automation), scoped to
**save + search**, not library listing, direct asset APIs, export, deletion, or
token management. Search responses necessarily expose matching assets. See the
[Shortcut source/release procedure](./shortcuts/save-to-sploot.md),
[published external contract](./PUBLIC_API.md), and
[credential scopes](#authentication). "Upload tokens" is the retained route
name, not an upload-only permission claim; Go labels them personal access tokens.

Management is **browser-session-only** through `sploot_session`. Neither a personal token nor a Go device credential
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
  "lastUsedAt": null,
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
curl -X POST "$SPLOOT_ORIGIN/api/upload" \
  -H "Authorization: Bearer splt_…" \
  -F "file=@meme.png"
```

`POST /api/upload`, `POST /api/upload/url`, and `POST /api/search` accept a
personal API token. Other protected product routes reject
personal-token-only authentication. Go device `spld_` tokens are a different,
broader credential governed by the local authority table above.
Dedupe, storage admission, and the `201`/`409` contracts are identical to a session upload. See
[`PUBLIC_API.md`](./PUBLIC_API.md) for the full token-scoped contract.


### Library Export

Browser- or device-authenticated
`GET /api/library/export` prepares and returns a single `application/zip`
attachment containing owner metadata/vectors/tags and currently stored
source/thumbnail bytes, including soft-deleted asset records. It does not create the old export
session or serve its subroutes. It has one active export slot per process
(`429`, `code: "export_busy"`, `Retry-After: 30`) and a 15-minute deadline.
The archive is completed before success headers; transfer truncation is a
transport failure, not a completed download. This owner export is not the

## Error Codes

| HTTP status | Meaning |
|---|---|
| 400 | Invalid parameters, media, or cursor |
| 401 | Missing, invalid, expired, or revoked authentication |
| 403 | Browser authority required, origin denied, or registration closed |
| 404 | Resource unknown or outside the authenticated owner's library |
| 409 | Duplicate save receipt, retained work, or owner/state conflict; inspect `success` and `code` |
| 410 | Purged asset or invalid/expired one-use invitation/device challenge |
| 413 | Shared upload/request size bound exceeded |
| 422 | Remote media fetch/decoding failure or active personal-token limit |
| 429 | Account/device admission, inference queue, or export slot busy; honor `Retry-After` |
| 500 | Internal server error |
| 503 | Required operation unavailable; inspect explicit `retryable` and `code` |
| 507 | Instance storage ceiling or free-disk reserve exceeded; manage storage rather than retry automatically |


## Local Development Without Vendor Credentials

`pnpm dev` / `pnpm dev:local` runs the persistent Go product at
`http://127.0.0.1:3001`. Register an account, upload original media, and search
with real local CPU CLIP. Data survives shutdown in repository
`.sploot-local/library`; verified model files live in a separate reusable cache.
No seeded account, cached-only query, QA login, Postgres, or vendor credential
is required.

The [quick start](../README.md#quick-start) and
[runtime/recovery procedure](./DEPLOYMENT.md#self-contained-go-runtime) own
startup, doctor, model preparation, build, and private backup/restore commands.
Local web/Chromium acceptance does not alter the separate hosted library or
prove production cutover. It also does not establish physical iPhone, Apple
signing, or Web Store acceptance.

## Client integration

Use the [published token API](./PUBLIC_API.md) for scriptable save/search recipes
instead of copying browser-session credentials into a client. Browser/device/
personal-token authority is specified [above](#authentication); there is no
separate shipped SDK implied by this reference. Shared upload/MIME/response
types live in `@sploot/common`, and the [MCP client](../apps/mcp/README.md) consumes
the published contract.

## Client behavior

- Preserve captured originals and their idempotency key across uncertain saves.
  Respect storage admission, retained failure state, and `Retry-After`; do not retry by
  fetching a mutable source again.
- Use opaque search cursors for traversal beyond the legacy offset window.
  Keep owner, model, query, and filters unchanged between cursor pages.
- Local Go caches model-version/owner-scoped query vectors, not result lists;
  newly indexed captures and favorite/tag/trash changes affect fresh requests.
- Local media is private; request the documented poster variant rather than
  assuming arbitrary Blob resizing parameters.
- Saving and indexing are distinct. Observe embedding status and expose a
  retryable failure rather than promising a fixed indexing latency.
