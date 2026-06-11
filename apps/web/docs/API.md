# Sploot API Documentation

## Overview

Sploot provides a RESTful API for managing your personal meme library with
semantic search capabilities. Product APIs require Clerk authentication and
follow standard HTTP conventions; operational routes define their own contracts.

## Base URL

```
Production: https://www.sploot.app/api
Development: http://localhost:3001/api
```

## Authentication

User-facing product APIs require authentication through Sploot's auth boundary.
Production requests are still Clerk-backed. Local and CI authenticated smoke
tests may use the signed `qa-local` mode documented in `apps/web/docs/AUTH.md`.
Operational routes such as health and cron endpoints define their own auth
contracts.

### Auth Boundary

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

with status `401`.

Protected product API route inventory:

- `/api/upload`, `/api/upload/check`
- `/api/assets`, `/api/assets/{id}`, `/api/assets/{id}/tags`, `/api/assets/audit`, `/api/assets/{id}/share`, `/api/assets/{id}/similar`
- `/api/assets/{id}/embedding-status`, `/api/assets/batch/embedding-status`, `/api/assets/{id}/generate-embedding`
- `/api/search`, `/api/search/advanced`
- `/api/stats`
- `/api/tags`, `/api/tags/{tagId}`
- `/api/analytics/usage`, `/api/telemetry`
- `/api/cache/stats`, `/api/embeddings/text`, `/api/embeddings/image`, `/api/sse/embedding-updates`

## Response Format

successful responses are endpoint-specific json objects. error responses use
the route's `error` field, with optional diagnostic fields on some endpoints:

```json
{
  "error": "Error message",
  "details": { ... }
}
```

## Rate Limiting

- Upload endpoints: 10 requests per minute
- Search endpoints: 30 requests per minute
- Other endpoints: 60 requests per minute

---

## Endpoints

### Health Check

#### GET /api/health

Check API availability and system status.

**Authentication:** Not required

**Response:**

```json
{
  "status": "ok",
  "timestamp": "2025-09-16T12:00:00Z",
  "version": "1.0.0"
}
```

---

### Upload Management

#### POST /api/upload

Uploads are guarded by the same runtime and quota policy:

- `SPLOOT_UPLOADS_ENABLED=false` pauses uploads before server-side Blob writes and returns `503` with `code: "uploads_disabled"`.
- Per-user storage quota is checked after validation/deduplication and before image processing or Blob writes.
- Quota denials return `403` with `code: "quota_exceeded"`, a `quota` snapshot, and an action pointing to `/app/settings`.
- `POST /api/upload` is the supported upload contract for web, extension, and future queued replay clients. Direct client-upload URL generation is not a supported product API.

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

### Asset Management

#### POST /api/assets

Create a new asset record after successful blob upload. Automatically starts
embedding generation when Replicate is configured.

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

List assets for the authenticated user with pagination, filtering, and seeded shuffle.

**Authentication:** Required

**Query Parameters:**

- `limit` (number, optional): number of results (default: 50, min: 1, max: 100)
- `offset` (number, optional): skip this many results (default: 0, min: 0)
- `sortBy` (string, optional): `createdAt`, `updatedAt`, `size`, `pathname`, or `shuffle` (default: `createdAt`)
- `sortOrder` (string, optional): `desc` or `asc` for non-shuffle sorts (default: `desc`)
- `favorite` (boolean, optional): filter to favorites only
- `tagId` (string, optional): filter to one tag id
- `includeTags` (boolean, optional): include tag objects in each asset; enabled automatically with `tagId`
- `shuffleSeed` (number, required when `sortBy=shuffle`): deterministic shuffle seed from `0` to `1000000`

**Shuffle Contract:**

Use `sortBy=shuffle&shuffleSeed=<seed>&limit=<n>` to fetch a deterministic seeded ring order for the authenticated user's assets. Each asset has a stable `shuffle_key` (`BIGINT`), and the seed maps to a pivot on that keyspace. Results are ordered by walking the ring from the pivot and wrapping at the end. The same seed, filters, limit, and offset return the same order while the matching asset set is unchanged. Shuffle is private to the authenticated user's library and respects `favorite`, `tagId`, `limit`, and `offset`.

Tradeoff: this path is scalable and index-friendly, but it is not a per-request full-table random sort; it is a deterministic rotation over stable shuffle keys.

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
      "createdAt": "2025-09-16T12:00:00Z"
    }
  ],
  "pagination": {
    "total": 150,
    "limit": 50,
    "offset": 0,
    "hasMore": true
  }
}
```

**Shuffle Example:**

```http
GET /api/assets?sortBy=shuffle&shuffleSeed=424242&limit=30&offset=0
```

**Error Responses:**

- 400: Invalid `limit`, `offset`, `sortBy`, or `shuffleSeed`; `shuffleSeed` missing for `sortBy=shuffle`; `shuffleSeed` provided without `sortBy=shuffle`
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
- `tags` (array, optional): Array of tag strings

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

Attach existing or new tags to an asset you own.

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

### Tags

#### GET /api/tags

List tags for the authenticated user.

**Authentication:** Required

**Error Responses:**

- 401: `{"error":"Unauthorized"}`
- 500: Failed to fetch tags
- 503: Database unavailable

#### POST /api/tags

Create a tag for the authenticated user.

**Authentication:** Required

**Error Responses:**

- 400: Invalid tag payload
- 401: `{"error":"Unauthorized"}`
- 409: Tag already exists
- 500: Failed to create tag
- 503: Database unavailable

#### PATCH /api/tags/{tagId}

Update an existing user-owned tag.

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

Embedding generation is guarded by `SPLOOT_EMBEDDINGS_ENABLED=false`; when disabled this route returns `503` with `code: "embeddings_disabled"` before calling Replicate. The cron embedding processor uses the same gate.

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
  "message": "Embedding generation started",
  "assetId": "550e8400-e29b-41d4-a716-446655440000"
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
the generated embedding.

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
  "threshold": 0.2,
  "shuffleSeed": 424242
}
```

**Parameters:**

- `query` (string, required): Search text (max 500 characters)
- `limit` (number, optional): requested result count (default: 30). the server
  searches for at least 10 similar results, so `limit` in the response may be
  higher than the requested value.
- `threshold` (number, optional): Minimum similarity score (0-1, default: 0.2)
- `shuffleSeed` (number, optional): Seed used by vector search when supported

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
  "limit": 30,
  "requestedLimit": 30,
  "threshold": 0.2,
  "requestedThreshold": 0.2,
  "processingTime": 245,
  "embeddingModel": "krthr/clip-embeddings:1c0371070cb827ec3c7f2f28adcdde54b50dcd239aa6faea0bc98b174ef03fb4",
  "cached": false,
  "thresholdFallback": false
}
```

When Replicate is not configured, the route returns `200` with an empty
`results` array and an `error` explaining search is unavailable.

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

#### POST /api/search/advanced

Advanced search with multiple filters and sorting options.

**Authentication:** Required

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
- `threshold` (number, optional): Minimum similarity (0-1, default: 0.5)

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
| 503  | Service Unavailable - External service down |

## Mock Mode

When running in development without external services configured, the API automatically switches to mock mode. Mock mode provides:

- Simulated authentication (any request is authorized)
- In-memory storage for assets
- Fake embeddings for testing
- Cached example search results
- No external API calls

To enable mock mode, set `MOCK_MODE=true` in your environment or leave external service environment variables unconfigured.

## WebSocket Events (Future)

_Note: Real-time features are planned for v2_

```javascript
// Example WebSocket connection for live updates
const ws = new WebSocket("wss://your-app.vercel.app/api/ws");

ws.on("asset:created", (asset) => {
  console.log("New asset:", asset);
});

ws.on("embedding:completed", (data) => {
  console.log("Embedding ready:", data.assetId);
});
```

## SDK Usage Examples

### JavaScript/TypeScript

```typescript
// Using the API with fetch
async function uploadMeme(file: File) {
  const formData = new FormData();
  formData.append("file", file);

  const uploadRes = await fetch("/api/upload", {
    method: "POST",
    body: formData,
  });

  const data = await uploadRes.json();
  return data.asset;
}

// Search for memes
async function searchMemes(query: string) {
  const res = await fetch("/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, limit: 30 }),
  });

  return await res.json();
}
```

### Python

```python
import requests
import os

class SplootAPI:
    def __init__(self, base_url, session_cookie):
        self.base_url = base_url
        self.session = requests.Session()
        self.session.cookies.set('__session', session_cookie)

    def upload_meme(self, file_path):
        with open(file_path, 'rb') as f:
            file_data = f.read()

        upload_response = self.session.post(
            f"{self.base_url}/api/upload",
            files={
                'file': (os.path.basename(file_path), file_data, 'image/jpeg')
            }
        )

        return upload_response.json()

    def search(self, query):
        response = self.session.post(
            f"{self.base_url}/api/search",
            json={'query': query}
        )
        return response.json()
```

## Performance Tips

1. **Batch Operations**: When uploading multiple files, reuse the session and upload in parallel
2. **Caching**: Search results are cached for 5 minutes - repeated searches are faster
3. **Pagination**: Use offset/limit for large collections instead of fetching all assets
4. **Thumbnails**: The blob URLs support on-the-fly resizing via query parameters
5. **Embeddings**: Allow 1-2 seconds after upload for embedding generation to complete

## Changelog

### v1.0.0 (2025-09-16)

- Initial API release
- Core upload, search, and asset management
- Semantic search with SigLIP embeddings
- Multi-layer caching system
- PWA support with offline capabilities

### Planned Features (v2.0)

- Batch upload endpoints
- WebSocket for real-time updates
- Public sharing links
- Advanced search with OCR
- Video/GIF support
- Organization and team features
