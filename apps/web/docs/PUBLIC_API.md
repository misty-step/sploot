# Sploot Public API (Personal API Token)

This is the **published, token-scoped external API contract** — the surface
Sploot supports for programmatic clients that are not a browser holding a
Clerk session: agents, automations, the iPhone "Save to Sploot" shortcut, and
the [sploot MCP server](../../mcp/README.md). If you are building an
integration against Sploot, start here, not `API.md` (which documents the
full session-authenticated product surface consumed by the web app and
extension).

## Auth: personal API token

Every call in this doc authenticates with a **personal API token** —
`Authorization: Bearer splt_…`. Mint one from a signed-in session:
**Settings → Upload tokens** in the web app, or `POST /api/upload-tokens`
(session-authenticated; see `API.md#personal-upload-tokens`). The plaintext
token is shown exactly once at mint time; only its hash is ever stored.

- Format: `splt_` + 32 random bytes, base64url-encoded.
- Hashed at rest (`sha256`); revoked and unknown tokens are indistinguishable
  (no timing or error-message tell).
- Not a session cookie: it has no CSRF exposure and never expires on its own —
  revoke it from Settings when it's no longer needed.

### Scope: what a token can call today

Scope is enforced **per route by an explicit opt-in policy**
(`allowUploadToken`), not by a scope field baked into the token — every route
either accepts a token or it doesn't, and the default is closed. As of this
contract, three routes opt in, covering the product's two core agent-facing
verbs, **save** and **search**:

| Verb | Route | Notes |
|---|---|---|
| Save (bytes) | `POST /api/upload` | multipart form upload |
| Save (URL) | `POST /api/upload/url` | server fetches and ingests a remote image |
| Search | `POST /api/search` | semantic text→image search |

Every other route (`/api/assets`, `/api/tags`, `/api/stats`, token
management, …) is Clerk/qa-local session-only and returns the stable
`401 {"error":"Unauthorized"}` for a token, by design — a personal API token
cannot read your full library, delete anything, or manage other tokens. See
`AUTH.md` for the auth-door architecture this is built on.

New account enrollment is a separate server-owned boundary. Signed-out public
surfaces and token-scoped save/search calls never mint a new account or token;
existing users can continue using their already-issued personal token. When
the boundary is paused or unavailable, save/search return the documented
`403 enrollment_closed` or `503 enrollment_unavailable` response. A configured
runtime gate can independently return `503 uploads_disabled` for save or
`503 embeddings_disabled` for a search that needs a new embedding; those are
operational pauses, not enrollment/configuration failures.

## Base URL

```
Production: https://www.sploot.app/api
Development: http://localhost:3001/api
```

## Save — upload bytes

`POST /api/upload` · `multipart/form-data`

Accepted media types: JPEG, PNG, WebP, GIF, MP4, WebM.

**Form fields:**

- `file` (required) — the image/video bytes.
- `tags` (optional) — JSON array of tag name strings.

Optional `Idempotency-Key` header: use the same 1–128 character key for every
retry of one queued file. A completed key replays the original result; a live
concurrent request returns `409` with `code: "UPLOAD_IN_PROGRESS"`. The server
keeps this receipt durably so a second tab cannot re-run the vendor-costing
ingestion pipeline. The browser's durable claim lease is two minutes, longer
than its ten-second network timeout. Receipts are retained for seven days and
then cleaned up only after that replay window. The key fences request replay;
checksum uniqueness remains the server-side asset deduplication oracle.

**`201` (created):**

```json
{
  "success": true,
  "isDuplicate": false,
  "asset": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "blobUrl": "https://blob.vercel-storage.com/abc123/funny-meme.jpg",
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
`403 {"code":"quota_exceeded"}` storage quota exceeded or
`{"code":"enrollment_closed"}` new-account admission paused · `503
{"code":"enrollment_unavailable"}` enrollment/configuration or database boundary unavailable · `413` file too
large · `429` rate limited · `503 {"code":"uploads_disabled"}` the independent
upload runtime gate is paused.

```bash
curl -X POST https://www.sploot.app/api/upload \
  -H "Authorization: Bearer splt_…" \
  -F "file=@meme.png"
```

## Save — upload by URL

`POST /api/upload/url` · `application/json`

Fetches a remote image server-side and ingests it through the same
dedupe/quota pipeline as bytes upload.

**Request:**

```json
{ "url": "https://example.com/meme.png" }
```

**Response contract:** identical `201`/`409` asset shape as bytes upload above.

**Errors:** `400` missing/invalid/private URL · `401` bad or missing token ·
`422` remote fetch failed or was not an image · `403` quota exceeded or
`{"code":"enrollment_closed"}` new-account admission paused · `503
{"code":"enrollment_unavailable"}` enrollment/configuration or database boundary
unavailable · `503 {"code":"uploads_disabled"}` the independent upload
runtime gate is paused.

```bash
curl -X POST https://www.sploot.app/api/upload/url \
  -H "Authorization: Bearer splt_…" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/meme.png"}'
```

## Search

`POST /api/search` · `application/json`

Semantic text→image search over the token owner's library (CLIP/SigLIP
embeddings, pgvector cosine similarity). Same route and response contract the
web app itself calls.

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
- `threshold` (number, optional, 0–1, default 0.12; see
  `apps/web/lib/search-config.ts`) — results below this
  similarity are not returned; a real miss is an empty `results` array, never
  low-similarity padding.
- `favoriteOnly` (boolean, optional, default `false`) — restrict results to
  favorited assets.
- `tagId` (string, optional) — restrict results to assets carrying this tag.

Semantic results are always ordered by descending vector relevance, with asset
id as the deterministic tie-breaker. The gallery shuffle seed is not part of
this endpoint. Each opaque cursor is cryptographically signed by the server
 and binds the authenticated token owner, embedding-model revision, normalized
 query, threshold, relevance order, favorite/tag filters, and page size; a
tampered, cross-user, or cross-context replay returns `400 {"error":"Search cursor does not match search context"}` before vector or database work.

**`200`:**

```json
{
  "results": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "blobUrl": "https://blob.vercel-storage.com/abc123/funny-meme.jpg",
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

**Errors:** `400` missing/invalid/too-long query · `401` bad or missing token ·
`403 {"code":"enrollment_closed"}` admission paused ·
`409 {"code":"enrollment_identity_conflict"}` identity repair required ·
`503 {"code":"enrollment_unavailable"}` admission boundary unavailable or
embedding admission limiter unavailable · `503 {"code":"embeddings_disabled"}`
the embedding runtime gate is paused. A provider configuration failure without
a stable code remains a generic 503.

```bash
curl -X POST https://www.sploot.app/api/search \
  -H "Authorization: Bearer splt_…" \
  -H "Content-Type: application/json" \
  -d '{"query":"distracted boyfriend"}'
```

## Rate limits

There is no per-request rate limiter on `/api/upload`, `/api/upload/url`, or
`/api/search` today — an accepted residual documented in
[ADR-006](./adr/006-personal-upload-tokens.md#consequences). A leaked or
abused token is bounded by storage quota (uploads) and revocation from
Settings, not a request-rate throttle.

Full error-code table: `API.md#error-codes`.

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
