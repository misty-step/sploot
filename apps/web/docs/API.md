# Sploot API Documentation

## Overview

Sploot provides a RESTful API for managing your personal meme library with semantic search capabilities. All API endpoints require authentication via Clerk and follow standard HTTP conventions.

## Base URL

```
Production: https://your-app.vercel.app/api
Development: http://localhost:3000/api
```

## Authentication

All API endpoints (except `/api/health`) require authentication via Clerk. Include the session cookie from your authenticated browser session or use Clerk's SDK for programmatic access.

## Response Format

All successful responses return JSON with the following structure:

```json
{
  "data": { ... },
  "timestamp": "2025-09-16T12:00:00Z"
}
```

Error responses return:

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

#### POST /api/upload-url

Generate a pre-signed URL for direct client-side upload to Vercel Blob storage.

**Authentication:** Required

**Request Body:**
```json
{
  "filename": "funny-meme.jpg",
  "mimeType": "image/jpeg",
  "size": 2048576
}
```

**Parameters:**
- `filename` (string, required): Original filename
- `mimeType` (string, required): MIME type of the file (image/jpeg, image/png, image/webp, image/gif)
- `size` (number, required): File size in bytes (max 10MB)

**Success Response (200):**
```json
{
  "uploadUrl": "https://blob.vercel-storage.com/upload?...",
  "blobUrl": "https://blob.vercel-storage.com/abc123/funny-meme.jpg",
  "fields": {
    "key": "user123/funny-meme-1234567890.jpg"
  }
}
```

**Error Responses:**
- 400: Invalid file type or size
- 401: Unauthorized
- 500: Server error

---

### Asset Management

#### POST /api/assets

Create a new asset record after successful blob upload. Automatically generates embeddings for semantic search.

**Authentication:** Required

**Request Body:**
```json
{
  "blobUrl": "https://blob.vercel-storage.com/abc123/funny-meme.jpg",
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
- `filename` (string, required): Original filename
- `mimeType` (string, required): MIME type
- `size` (number, required): File size in bytes
- `width` (number, optional): Image width in pixels
- `height` (number, optional): Image height in pixels
- `checksum` (string, required): SHA-256 checksum for deduplication

**Success Response (201):**
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
    "embeddingStatus": "processing"
  }
}
```

**Error Responses:**
- 400: Invalid parameters or duplicate asset
- 401: Unauthorized
- 500: Server error

#### GET /api/assets

List all assets for the authenticated user with pagination and filtering.

**Authentication:** Required

**Query Parameters:**
- `limit` (number, optional): Number of results (default: 50, max: 100)
- `offset` (number, optional): Skip first N results (default: 0)
- `sort` (string, optional): Sort order (createdAt_desc, createdAt_asc, favorite)
- `favoriteOnly` (boolean, optional): Filter to favorites only
- `mimeTypes` (string, optional): Comma-separated MIME types
- `tags` (string, optional): Comma-separated tag IDs

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
  "total": 150,
  "limit": 50,
  "offset": 0
}
```

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
  "status": "completed",
  "modelName": "daanelson/imagebind:0383f62e173dc821ec52663ed22a076d9c970549c209666ac3db181618b7a304",
  "dimension": 1024,
  "createdAt": "2025-09-16T12:00:00Z"
}
```

**Status Values:**
- `pending`: Not yet processed
- `processing`: Currently generating
- `completed`: Successfully generated
- `failed`: Generation failed

#### POST /api/assets/{id}/generate-embedding

Manually trigger embedding generation for an asset.

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
  "text": "distracted boyfriend meme"
}
```

**Success Response (200):**
```json
{
  "embedding": [0.123, 0.456, ...],
  "modelName": "daanelson/imagebind:0383f62e173dc821ec52663ed22a076d9c970549c209666ac3db181618b7a304",
  "dimension": 1024,
  "cached": false
}
```

#### POST /api/embeddings/image

Generate embeddings for an image URL (primarily for testing).

**Authentication:** Required

**Request Body:**
```json
{
  "imageUrl": "https://blob.vercel-storage.com/abc123/funny-meme.jpg"
}
```

**Success Response (200):**
```json
{
  "embedding": [0.789, 0.012, ...],
  "modelName": "daanelson/imagebind:0383f62e173dc821ec52663ed22a076d9c970549c209666ac3db181618b7a304",
  "dimension": 1024,
  "cached": true
}
```

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
  "threshold": 0.6
}
```

**Parameters:**
- `query` (string, required): Search text (max 500 characters)
- `limit` (number, optional): Number of results (default: 30, max: 100)
- `threshold` (number, optional): Minimum similarity score (0-1, default: 0.6)

**Success Response (200):**
```json
{
  "results": [
    {
      "asset": {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "blobUrl": "https://blob.vercel-storage.com/abc123/funny-meme.jpg",
        "filename": "funny-meme.jpg",
        "mimeType": "image/jpeg",
        "width": 1920,
        "height": 1080,
        "favorite": false,
        "tags": [],
        "createdAt": "2025-09-16T12:00:00Z"
      },
      "score": 0.95,
      "distance": 0.05,
      "relevance": 95
    }
  ],
  "query": "distracted boyfriend",
  "cached": false,
  "searchTime": 245,
  "embeddingTime": 120,
  "totalTime": 365
}
```

#### GET /api/search

Get search suggestions based on recent and popular searches.

**Authentication:** Required

**Query Parameters:**
- `type` (string, optional): Suggestion type (recent, popular, all)
- `limit` (number, optional): Number of suggestions (default: 10)

**Success Response (200):**
```json
{
  "recent": [
    "drake meme",
    "woman yelling at cat"
  ],
  "popular": [
    "distracted boyfriend",
    "this is fine"
  ]
}
```

#### POST /api/search/advanced

Advanced search with multiple filters and sorting options.

**Authentication:** Required

**Request Body:**
```json
{
  "query": "reaction",
  "filters": {
    "favoriteOnly": true,
    "mimeTypes": ["image/jpeg", "image/png"],
    "tags": ["reaction", "template"],
    "dateFrom": "2025-01-01T00:00:00Z",
    "dateTo": "2025-12-31T23:59:59Z",
    "minWidth": 500,
    "maxWidth": 2000
  },
  "sort": "relevance",
  "limit": 30,
  "offset": 0,
  "threshold": 0.5
}
```

**Parameters:**
- `query` (string, optional): Search text (if omitted, filters metadata only)
- `filters` (object, optional): Filter criteria
  - `favoriteOnly` (boolean): Only favorites
  - `mimeTypes` (array): MIME type filters
  - `tags` (array): Tag filters
  - `dateFrom` (string): Start date (ISO 8601)
  - `dateTo` (string): End date (ISO 8601)
  - `minWidth` (number): Minimum width
  - `maxWidth` (number): Maximum width
  - `minHeight` (number): Minimum height
  - `maxHeight` (number): Maximum height
- `sort` (string, optional): Sort order (relevance, date_desc, date_asc, favorite)
- `limit` (number, optional): Results per page (default: 30)
- `offset` (number, optional): Pagination offset (default: 0)
- `threshold` (number, optional): Minimum similarity (0-1, default: 0.5)

**Success Response (200):**
```json
{
  "results": [
    {
      "asset": { ... },
      "score": 0.89,
      "distance": 0.11,
      "relevance": 89
    }
  ],
  "total": 145,
  "query": "reaction",
  "filters": { ... },
  "cached": false,
  "searchTime": 320
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
      "hitRate": 0.80,
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

| Code | Description |
|------|------------|
| 400 | Bad Request - Invalid parameters |
| 401 | Unauthorized - Authentication required |
| 403 | Forbidden - Access denied |
| 404 | Not Found - Resource doesn't exist |
| 409 | Conflict - Duplicate resource |
| 413 | Payload Too Large - File exceeds size limit |
| 429 | Too Many Requests - Rate limit exceeded |
| 500 | Internal Server Error |
| 503 | Service Unavailable - External service down |

## Mock Mode

When running in development without external services configured, the API automatically switches to mock mode. Mock mode provides:

- Simulated authentication (any request is authorized)
- In-memory storage for assets
- Fake embeddings for testing
- Cached example search results
- No external API calls

To enable mock mode, set `MOCK_MODE=true` in your environment or leave external service environment variables unconfigured.

## WebSocket Events (Future)

*Note: Real-time features are planned for v2*

```javascript
// Example WebSocket connection for live updates
const ws = new WebSocket('wss://your-app.vercel.app/api/ws');

ws.on('asset:created', (asset) => {
  console.log('New asset:', asset);
});

ws.on('embedding:completed', (data) => {
  console.log('Embedding ready:', data.assetId);
});
```

## SDK Usage Examples

### JavaScript/TypeScript

```typescript
// Using the API with fetch
async function uploadMeme(file: File) {
  // Step 1: Get upload URL
  const uploadUrlRes = await fetch('/api/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: file.name,
      mimeType: file.type,
      size: file.size
    })
  });

  const { uploadUrl, blobUrl } = await uploadUrlRes.json();

  // Step 2: Upload directly to blob storage
  await fetch(uploadUrl, {
    method: 'PUT',
    body: file
  });

  // Step 3: Create asset record
  const assetRes = await fetch('/api/assets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      blobUrl,
      filename: file.name,
      mimeType: file.type,
      size: file.size,
      checksum: await calculateSHA256(file)
    })
  });

  return await assetRes.json();
}

// Search for memes
async function searchMemes(query: string) {
  const res = await fetch('/api/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, limit: 30 })
  });

  return await res.json();
}
```

### Python

```python
import requests
import hashlib

class SplootAPI:
    def __init__(self, base_url, session_cookie):
        self.base_url = base_url
        self.session = requests.Session()
        self.session.cookies.set('__session', session_cookie)

    def upload_meme(self, file_path):
        with open(file_path, 'rb') as f:
            file_data = f.read()

        # Get upload URL
        upload_url_response = self.session.post(
            f"{self.base_url}/api/upload-url",
            json={
                'filename': os.path.basename(file_path),
                'mimeType': 'image/jpeg',
                'size': len(file_data)
            }
        )
        upload_data = upload_url_response.json()

        # Upload to blob
        requests.put(upload_data['uploadUrl'], data=file_data)

        # Create asset
        checksum = hashlib.sha256(file_data).hexdigest()
        asset_response = self.session.post(
            f"{self.base_url}/api/assets",
            json={
                'blobUrl': upload_data['blobUrl'],
                'filename': os.path.basename(file_path),
                'mimeType': 'image/jpeg',
                'size': len(file_data),
                'checksum': f"sha256:{checksum}"
            }
        )

        return asset_response.json()

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