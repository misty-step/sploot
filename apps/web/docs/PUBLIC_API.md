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
`403 {"code":"quota_exceeded"}` storage quota exceeded · `413` file too large ·
`429` rate limited · `503 {"code":"uploads_disabled"}` uploads paused.

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
`422` remote fetch failed or was not an image · `403` quota exceeded ·
`503` uploads paused.

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
{ "query": "distracted boyfriend", "limit": 30, "threshold": 0.2 }
```

- `query` (string, required, max 500 chars)
- `limit` (number, optional, default 30)
- `threshold` (number, optional, 0–1, default 0.2) — results below this
  similarity are not returned; a real miss is an empty `results` array, never
  low-similarity padding.

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
  "limit": 30,
  "threshold": 0.2,
  "processingTime": 245
}
```

**Errors:** `400` missing/invalid/too-long query · `401` bad or missing token
· `503` embedding service unavailable (Replicate not configured or paused).

```bash
curl -X POST https://www.sploot.app/api/search \
  -H "Authorization: Bearer splt_…" \
  -H "Content-Type: application/json" \
  -d '{"query":"distracted boyfriend"}'
```

## Rate limits

- Upload endpoints: 10 requests/minute
- Search endpoint: 30 requests/minute

Full error-code table: `API.md#error-codes`.

## Changelog

- **2026-07-07 (sploot-071):** `POST /api/search` opted into personal API
  token auth (previously the token was upload-only). This file published as
  the token-scoped external contract; superseded the implicit "ask the
  iPhone-shortcut doc" status quo. Consumers: the sploot MCP server
  (`apps/mcp`), the `misty-sploot` agent skill.
- **2026-06-18 (sploot-033/035):** Personal upload tokens shipped, upload-only.
