# Sploot Public API (Personal API Token)

This is the **published, personal-token-scoped save/search contract** for agents,
automations, the iPhone Shortcut source, and the
[Sploot MCP server](../../mcp/README.md). `@sploot/common` owns the shared
upload/MIME/response types. The full route and credential-scope inventory is in
[API.md](./API.md).

Native production is **https://sploot.mistystep.io**. The self-contained Go
runtime owns password accounts, SQLite/sqlite-vec, private media, and CPU CLIP.
The retained Next.js predecessor used Clerk/Postgres/Blob/Replicate; its
guidance below is historical, not the current production authority. Local and
other self-hosted instances have separate accounts and libraries. Starting one
does not migrate another instance's data, and tokens do not cross instances.

## Auth: personal API token

Every save/search call in this contract authenticates with a **personal API token** —
`Authorization: Bearer splt_…`. Sign in through the **selected instance's browser
UI**, then mint one in **Settings → Personal access tokens** in native Go.
Production sign-in is at https://sploot.mistystep.io/sign-in; local accounts use
the local instance's sign-in page. The historical predecessor called this
**Settings → Upload tokens**. `POST /api/upload-tokens` is browser-session-only;
see [token management](./API.md#personal-upload-tokens). The plaintext token is
shown once at mint time; only its hash is stored.

- Format: `splt_` + 32 random bytes, base64url-encoded.
- Hashed at rest (`sha256`); revoked and unknown tokens are indistinguishable
  (no timing or error-message tell).
- Not a browser/device session: it has no cookie-CSRF exposure and does not
  expire on a timer. Revoke it in Settings when no longer needed.
- In native Go, a password change revokes personal tokens, and portable
  backup/restore removes them from the restored copy. Sign in with the preserved
  password and mint a new token after restore; source credentials are untouched.

### Scope: what a token can call today

Scope is enforced by explicit per-route opt-in, not by a caller-provided scope
or user ID. Exactly three routes accept a personal token, covering the core
verbs **save** and **search**:

| Verb | Route | Notes |
|---|---|---|
| Save (bytes) | `POST /api/upload` | multipart form upload |
| Save (URL) | `POST /api/upload/url` | server fetches and ingests a direct media URL |
| Search | `POST /api/search` | semantic text→image search |

Every other protected route rejects a personal-token-only request. A personal
token cannot list the full library, fetch private local media, delete assets,
export, pair devices, or manage credentials. Search necessarily returns matching
asset metadata; it does not grant a new media-download capability.

Native Go's paired `spld_` device token is a **different, broader credential**.
Extensions obtain it only through browser-approved device pairing, not by
minting a personal token or borrowing browser cookies. Its scope and the
predecessor's Clerk/session boundary are documented separately in
[API.md](./API.md#authentication). Invalid/revoked personal tokens return `401`;
Go includes `code: "unauthorized"` alongside `error: "Unauthorized"`.

New account admission is separate from save/search. On native Go, register or
sign in through the selected instance's browser UI; a closed registration policy
does not revoke existing users or tokens. Only the predecessor uses the
Clerk/enrollment errors `enrollment_closed`, `enrollment_unavailable`, and
`enrollment_identity_conflict` described below. Neither token clients nor device
clients create accounts or bypass registration.

Both runtimes can independently pause saves with `SPLOOT_UPLOADS_ENABLED=false`
(`503 uploads_disabled`) or inference with `SPLOOT_EMBEDDINGS_ENABLED=false`.
Native Go rejects search with `503 embeddings_disabled` while inference is
disabled even if a query vector was cached; it never disguises a disabled engine
with seeded retrieval.

## Base URL

```text
Native production (MCP default): https://sploot.mistystep.io/api
Self-contained local Go: http://127.0.0.1:3001/api
```

Use the exact configured origin for the intended library. MCP defaults to
native production; set `SPLOOT_API_BASE_URL` explicitly, including `/api`, for
any other instance. Local Go defaults to `http://127.0.0.1:3001`; custom
off-loopback instances require HTTPS. Supply `SPLOOT_API_TOKEN` from your
private client configuration, not a checked-in file, and mint it on the same
instance as the base URL.

The historical predecessor API was `https://www.sploot.app/api`. After approved
legacy routing is enabled, API requests on `sploot.app` and `www.sploot.app`
return **`410 Gone`**, rather than redirecting token-bearing requests. Browser
redirects are not an API migration mechanism; update clients to the canonical
origin instead.

For the recipes below, set the origin without `/api`:

```sh
SPLOOT_ORIGIN=https://sploot.mistystep.io
```

For a local library, use `SPLOOT_ORIGIN=http://127.0.0.1:3001` instead.
[Startup and recovery](./DEPLOYMENT.md#self-contained-go-runtime) owns the local
account/data/cache setup.

### Private media references

The `blobUrl` field name is retained for contract compatibility. In native Go,
its value is `/media/{assetID}` and a thumbnail reference is
`/media/{assetID}?thumbnail=1`, **relative to the selected instance**, not a
public Blob URL. Resolve relative references only against that instance.

`GET`/`HEAD /media/{assetID}` requires the owner's browser cookie or paired
device bearer; a personal `splt_` token cannot fetch those bytes. Extensions
must use a same-instance authenticated fetch with cookies omitted rather than
an unauthenticated image URL. Never append a credential to a media URL or send
it to an arbitrary returned host. A user can open the library in their signed-in
browser; public `/s/{slug}` sharing is a separate explicit owner operation.
Predecessor results may still contain absolute Blob delivery URLs; that does not
make local relative media public.

## Save — upload bytes

`POST /api/upload` · `multipart/form-data`

Accepted media types: JPEG, PNG, WebP, GIF, MP4, WebM.

**Form fields:**

- `file` (required) — the image/video bytes.
- `tags` (optional) — JSON array of tag name strings.

Optional `Idempotency-Key` header: use the same 1–128 character key for each
retry of one captured original (letters, digits, `.`, `_`, `:`, or `-`). A
completed key replays its original receipt; a live concurrent request returns
`409` with `code: "UPLOAD_IN_PROGRESS"` and a retry hint. Keep the original bytes
and key rather than refetching a mutable source after an uncertain response.
The server keeps durable receipts for seven days; the key fences replay and
owner/content-checksum uniqueness remains the deduplication authority.

**`201` (created):**

```json
{
  "success": true,
  "isDuplicate": false,
  "asset": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "blobUrl": "/media/550e8400-e29b-41d4-a716-446655440000",
    "filename": "funny-meme.jpg",
    "mimeType": "image/jpeg",
    "size": 2048576,
    "checksum": "sha256:abc123...",
    "createdAt": "2026-07-07T12:00:00.000Z",
    "needsEmbedding": true
  },
  "message": "Upload successful"
}
```

**`409` (duplicate):** same shape with `isDuplicate: true` and
`needsEmbedding: false`.

**Errors:** `400` missing/invalid file · `401` bad or missing token ·
`403 {"code":"quota_exceeded"}` storage quota exceeded · `413` file too large ·
`409 {"code":"UPLOAD_IN_PROGRESS"}` retained work still processing ·
`429` busy/rate-limited operation · `503 {"code":"uploads_disabled"}` saves
paused or another required operation unavailable.

Predecessor-only admission errors additionally include `403 enrollment_closed`
and `503 enrollment_unavailable`; these are not local Go registration errors.

```bash
curl -X POST "$SPLOOT_ORIGIN/api/upload" \
  -H "Authorization: Bearer $SPLOOT_API_TOKEN" \
  -F "file=@meme.png"
```

## Save — upload by URL

`POST /api/upload/url` · `application/json`

Fetches direct media server-side through the same shared MIME/size,
deduplication, quota, and receipt boundary as byte upload. This is not arbitrary
page scraping or streaming-player extraction. Private/loopback destinations and
unsafe redirects are rejected; the ordinary local product has no general SSRF
bypass for URLs on the operator's LAN.

**Request:**

```json
{ "url": "https://example.com/meme.png" }
```

**Response contract:** identical `201`/`409` asset shape as bytes upload above.

**Errors:** `400` missing/invalid/private URL · `401` bad or missing token ·
`422` remote fetch failed or unsupported media · `403 quota_exceeded` ·
`409 UPLOAD_IN_PROGRESS` · `503 uploads_disabled` or another required operation
unavailable. Predecessor-only enrollment errors are the same as byte upload.

```bash
curl -X POST "$SPLOOT_ORIGIN/api/upload/url" \
  -H "Authorization: Bearer $SPLOOT_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/meme.png"}'
```

## Search

`POST /api/search` · `application/json`

Semantic text→image search over the token owner's library. Local Go uses the
SHA-pinned quantized CLIP text/vision encoders and normalized 512-D projections
in [`bundle.json`](../../server/internal/inference/bundle.json), executed by
ONNX Runtime on the CPU with sqlite-vec retrieval. New media and new queries
are computed locally; the reusable model cache is not a seeded-vector library.
The predecessor retains its existing Replicate CLIP/pgvector implementation.
Both serve the published request/result shape, without promising numerically
identical rankings from different model artifacts.

**Request:**

```json
{ "query": "distracted boyfriend", "limit": 30, "threshold": 0.12, "favoriteOnly": false, "tagId": null }
```

- `query` (string, required, max 500 chars)
- `limit` (number, optional, default 30, max 100) — each page is bounded.
- `cursor` (string, optional) — opaque cursor from the previous response for
  deterministic keyset traversal. It is the pagination mechanism for results
  beyond the legacy offset window.
- `offset` (number, optional, default 0, max 500) — retained for backwards
  compatibility on the first 500 results; do not combine it with `cursor`.
- `threshold` (number, optional, 0–1, default 0.12) — results below it are not
  returned; a real miss is an empty `results` array, never low-similarity padding.
- `favoriteOnly` (boolean, optional, default `false`) — restrict results to
  favorited assets.
- `tagId` (string, optional) — restrict results to assets carrying this tag.

Semantic results are always ordered by descending vector relevance, with asset
id as the deterministic tie-breaker. The gallery shuffle seed is not part of
this endpoint. Each opaque cursor is cryptographically signed by the server
and binds the authenticated token owner, embedding-model revision, normalized
query, threshold, relevance order, favorite/tag filters, and page size.
A tampered, cross-owner, or cross-context cursor returns `400`; local Go uses
`code: "invalid_search_cursor"`. Cursors are opaque and not portable between
instances or model revisions.

**`200`:**

```json
{
  "results": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "blobUrl": "/media/550e8400-e29b-41d4-a716-446655440000",
      "filename": "funny-meme.jpg",
      "mime": "image/jpeg",
      "favorite": false,
      "similarity": 0.95,
      "relevance": 95,
      "tags": []
    }
  ],
  "query": "distracted boyfriend",
  "total": 1,
  "hasMore": false,
  "limit": 30,
  "threshold": 0.12,
  "processingTime": 245
}
```

When `hasMore` is true, the response also includes `nextCursor`; send it as
`cursor` on the next request.

**Common errors:** `400` missing/invalid/too-long query or invalid cursor ·
`401` bad or missing token · `503 embeddings_disabled` inference paused.
Local Go also returns `429 embedding_busy` with `Retry-After` when local compute
is occupied, or `503 embedding_inference_failed` when a real query cannot be
encoded. Neither is a successful empty result.

**Predecessor-only errors:** `403 enrollment_closed` admission paused ·
`409 enrollment_identity_conflict` identity repair required ·
`503 enrollment_unavailable` admission/limiter unavailable. A predecessor
provider-configuration failure without a stable code remains a generic `503`.

```bash
curl -X POST "$SPLOOT_ORIGIN/api/search" \
  -H "Authorization: Bearer $SPLOOT_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"distracted boyfriend"}'
```

## Rate limits

There is no general per-request rate throttle on these three published routes.
Storage quota and revocation remain important controls for leaked/abused tokens;
the predecessor's accepted residual is documented in
[ADR-006](./adr/006-personal-upload-tokens.md#consequences). Local Go also bounds
local inference concurrency and can return `429 embedding_busy`; that is not a
claim of a per-minute request quota. Account/device-protocol rate limits belong
to their separate auth routes.

Treat `Retry-After`, failed receipts, quota, and inference errors honestly rather
than presenting them as saved/search-success states. See the full
[error reference](./API.md#error-codes) and [credential scopes](./API.md#authentication).

## Changelog

- **2026-07-24 (sploot-share-revoke-minimum):** Corrected the rate-limits
  section — the previously documented 10/30 requests-per-minute figures were
  never implemented; replaced with the honest ADR-006 residual.
- **2026-07-07 (sploot-071):** `POST /api/search` opted into personal API
  token auth (previously the token was upload-only). This file published as
  the token-scoped external contract; superseded the implicit "ask the
  iPhone-shortcut doc" status quo. Consumers: the sploot MCP server
  (`apps/mcp`), the `misty-sploot` agent skill.
- **2026-06-18 (sploot-033/035):** Personal upload tokens shipped, upload-only.
