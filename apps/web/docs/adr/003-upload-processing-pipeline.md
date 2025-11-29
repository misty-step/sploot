# ADR-003: Upload Processing Pipeline

**Status:** Proposed
**Date:** 2024-09-13
**Deciders:** Development Team
**Technical Story:** Sploot requires efficient image upload and processing with embedding generation

## Context

Sploot's upload pipeline must handle multiple concurrent operations for each uploaded image:

- **File upload** to Vercel Blob storage (potentially large files up to 10MB)
- **Metadata extraction** (dimensions, file size, MIME type, checksum)
- **Image embedding generation** via external API (200-2000ms latency)
- **Database persistence** of asset metadata and embeddings
- **UI feedback** to provide responsive user experience
- **Error handling** for partial failures across multiple services

### Requirements Analysis

**Performance Requirements:**
- Total upload-to-visible: <2.5s p95 (per PRD)
- UI responsiveness: Immediate optimistic feedback
- Concurrent uploads: Support 5+ simultaneous uploads per user
- Error recovery: Graceful handling of partial failures

**User Experience Requirements:**
- Drag-and-drop with instant visual feedback
- Progress indicators for long operations
- Retry mechanisms for failed operations
- Offline capability with resume-on-reconnect

**System Requirements:**
- Integration with Vercel Blob (signed URLs)
- External embedding service calls (variable latency)
- Database consistency (metadata + embeddings)
- Resource efficiency in serverless environment

## Decision

We will implement a **hybrid synchronous-asynchronous pipeline** with optimistic UI updates.

**Architecture:**
- **Phase 1 (Synchronous):** File upload → immediate metadata extraction → optimistic UI update
- **Phase 2 (Asynchronous):** Background embedding generation → database finalization
- **Client-side:** Optimistic updates with progress tracking and error recovery
- **Server-side:** Atomic database operations with retry mechanisms

**Flow Design:**
```
Client Upload → Signed URL → Blob Storage → Metadata API → UI Update
                                           ↓ (async)
                              Embedding API → Database Write → Status Update
```

**Implementation Structure:**
```typescript
// Upload flow coordination
interface UploadPipeline {
  // Phase 1: Fast path for immediate feedback
  initiateUpload(file: File): Promise<OptimisticAsset>

  // Phase 2: Background processing
  processEmbedding(assetId: string): Promise<CompletedAsset>

  // Error handling and retry
  retryFailed(assetId: string): Promise<void>
  getUploadStatus(assetId: string): Promise<UploadStatus>
}
```

## Consequences

### Positive

- **Fast user feedback:** Users see uploaded images immediately (optimistic)
- **Resilient to failures:** Can retry embedding generation without re-upload
- **Scalable processing:** Async embedding generation doesn't block UI
- **Cost efficient:** Only pay for compute during actual processing
- **Recoverable state:** Failed uploads can be resumed from checkpoints

### Negative

- **Complexity:** More complex state management (pending, processing, completed, failed)
- **Eventual consistency:** UI may show images before they're searchable
- **Error handling:** Need robust retry and cleanup mechanisms
- **Monitoring:** More complex observability due to multi-phase operations

## Alternatives Considered

### 1. Fully Synchronous Pipeline

**Pros:**
- Simpler state management
- Strong consistency (image visible = immediately searchable)
- Easier error handling (single point of failure)

**Cons:**
- Poor user experience (2-3s wait for each upload)
- Timeout risks with slow embedding API
- No progress feedback during processing
- Blocks concurrent uploads

**Verdict:** Rejected due to UX requirements and performance targets.

### 2. Fully Asynchronous with Message Queue

**Pros:**
- Excellent scalability and error recovery
- Perfect for batch processing scenarios
- Clean separation of concerns

**Cons:**
- Added infrastructure complexity (Redis/SQS)
- Higher latency for metadata extraction
- More complex deployment and monitoring
- Overkill for single-user application

**Verdict:** Rejected due to operational complexity for current scale.

### 3. Client-Side Embedding Generation

**Pros:**
- No server-side embedding latency
- Reduced API costs
- Immediate search availability

**Cons:**
- Large model downloads (200MB+ for CLIP)
- Inconsistent performance across devices
- Battery drain on mobile devices
- Model version management complexity

**Verdict:** Rejected due to model size and performance variability.

### 4. Pre-computed Embeddings at Upload

**Pros:**
- Predictable processing time
- Immediate search availability
- Simple linear pipeline

**Cons:**
- Cannot optimize for meme-specific content
- Fixed model choice limits future flexibility
- Still requires external API or GPU hosting

**Verdict:** Rejected in favor of more flexible approach.

## Trade-offs

### User Experience vs. System Complexity
- **Chosen:** Better UX with optimistic updates but more complex state management
- **Alternative:** Simpler synchronous flow but poor user experience

### Consistency vs. Performance
- **Chosen:** Eventual consistency for better upload performance
- **Alternative:** Strong consistency with slower user feedback

### Reliability vs. Simplicity
- **Chosen:** Multi-stage pipeline with retry mechanisms
- **Alternative:** Single-stage pipeline with simpler but less resilient error handling

## Implementation Strategy

### Phase 1: Optimistic Upload
```typescript
// Client-side optimistic update
async function uploadImage(file: File): Promise<OptimisticAsset> {
  // 1. Get signed upload URL
  const { uploadUrl, assetId } = await getSignedUploadUrl(file.name, file.type)

  // 2. Upload to blob storage
  await uploadToBlob(uploadUrl, file)

  // 3. Extract metadata and create asset record
  const metadata = await extractMetadata(file)
  const asset = await createAsset({
    id: assetId,
    ...metadata,
    status: 'processing'
  })

  // 4. Start background embedding generation
  processEmbeddingAsync(assetId)

  return asset
}
```

### Phase 2: Background Processing
```typescript
// Server-side background processing
async function processEmbeddingAsync(assetId: string): Promise<void> {
  try {
    // 1. Fetch image from blob storage
    const asset = await getAsset(assetId)
    const imageBuffer = await fetchFromBlob(asset.blobUrl)

    // 2. Generate embedding
    const embedding = await embeddingService.embedImage(imageBuffer)

    // 3. Atomic database update
    await db.transaction(async (tx) => {
      await tx.insert(assetEmbeddings).values({
        assetId,
        imageEmbedding: embedding,
        modelName: embeddingService.modelInfo.name,
        dimension: embeddingService.modelInfo.dimension
      })

      await tx.update(assets)
        .set({ status: 'completed', processedAt: new Date() })
        .where(eq(assets.id, assetId))
    })

    // 4. Notify client of completion
    await notifyUploadComplete(assetId)

  } catch (error) {
    await handleEmbeddingError(assetId, error)
  }
}
```

### Phase 3: Error Recovery
```typescript
// Retry mechanism for failed embeddings
async function retryFailedEmbeddings(): Promise<void> {
  const failedAssets = await db.query.assets.findMany({
    where: and(
      eq(assets.status, 'failed'),
      gte(assets.createdAt, sql`NOW() - INTERVAL '1 hour'`)
    )
  })

  for (const asset of failedAssets) {
    await processEmbeddingAsync(asset.id)
  }
}
```

## State Management

### Asset Status States
```typescript
type AssetStatus =
  | 'uploading'    // File transfer in progress
  | 'processing'   // Metadata extracted, embedding pending
  | 'completed'    // Fully processed and searchable
  | 'failed'       // Processing failed, retry available
  | 'retrying'     // Retry attempt in progress
```

### Client State Synchronization
```typescript
// Real-time status updates via Server-Sent Events or polling
interface UploadStatus {
  assetId: string
  status: AssetStatus
  progress?: number
  error?: string
  searchable: boolean
}

// Client-side status tracking
const useUploadStatus = (assetId: string) => {
  const [status, setStatus] = useState<UploadStatus>()

  useEffect(() => {
    const eventSource = new EventSource(`/api/upload-status/${assetId}`)
    eventSource.onmessage = (event) => {
      setStatus(JSON.parse(event.data))
    }
    return () => eventSource.close()
  }, [assetId])

  return status
}
```

## Error Handling Strategy

### Failure Categories

**1. Upload Failures (Phase 1)**
- Network timeouts
- Blob storage service errors
- File validation failures

**Recovery:** Immediate retry with exponential backoff

**2. Processing Failures (Phase 2)**
- Embedding API failures
- Database connection issues
- Image format/corruption issues

**Recovery:** Background retry with status tracking

**3. Partial Failures**
- Metadata saved but embedding failed
- Embedding generated but database write failed

**Recovery:** Resume from checkpoint, avoid duplicate work

### Retry Logic
```typescript
const retryWithBackoff = async <T>(
  operation: () => Promise<T>,
  maxAttempts: number = 3,
  baseDelayMs: number = 1000
): Promise<T> => {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation()
    } catch (error) {
      if (attempt === maxAttempts) throw error

      const delay = baseDelayMs * Math.pow(2, attempt - 1)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  throw new Error('Max retries exceeded')
}
```

## Performance Optimization

### Concurrent Processing
```typescript
// Process multiple uploads concurrently with rate limiting
const embeddingQueue = new PQueue({
  concurrency: 3,  // Max 3 concurrent embedding API calls
  interval: 1000,  // Rate limiting for API
  intervalCap: 5   // Max 5 requests per interval
})

const processEmbedding = (assetId: string) => {
  return embeddingQueue.add(() => generateEmbedding(assetId))
}
```

### Caching Strategy
```typescript
// Cache embeddings to avoid regeneration on retries
const embeddingCache = new Map<string, number[]>()

const getCachedEmbedding = async (checksum: string, imageUrl: string) => {
  const cached = embeddingCache.get(checksum)
  if (cached) return cached

  const embedding = await embeddingService.embedImage(imageUrl)
  embeddingCache.set(checksum, embedding)
  return embedding
}
```

## Monitoring and Observability

### Key Metrics

**Upload Pipeline Metrics:**
- Phase 1 completion time (upload → metadata)
- Phase 2 completion time (metadata → searchable)
- Success rates by phase
- Retry attempt rates
- Queue depth and processing time

**User Experience Metrics:**
- Time to first visual feedback
- Percentage of uploads requiring retry
- Average time to searchable state
- Failed upload recovery rate

### Alerting Thresholds
```typescript
const PIPELINE_ALERTS = {
  PHASE_1_LATENCY_P95: 5000,     // 5s for upload + metadata
  PHASE_2_LATENCY_P95: 30000,    // 30s for embedding + DB
  FAILED_UPLOAD_RATE: 0.05,      // 5% failure rate
  EMBEDDING_QUEUE_DEPTH: 50,     // Queue backlog
  RETRY_ATTEMPT_RATE: 0.20       // 20% requiring retry
}
```

### Logging Strategy
```typescript
// Structured logging for pipeline observability
const logger = {
  uploadStarted: (assetId: string, filename: string) =>
    console.log({ event: 'upload_started', assetId, filename, timestamp: Date.now() }),

  uploadCompleted: (assetId: string, duration: number) =>
    console.log({ event: 'upload_completed', assetId, duration, timestamp: Date.now() }),

  embeddingStarted: (assetId: string) =>
    console.log({ event: 'embedding_started', assetId, timestamp: Date.now() }),

  embeddingCompleted: (assetId: string, duration: number) =>
    console.log({ event: 'embedding_completed', assetId, duration, timestamp: Date.now() }),

  pipelineError: (assetId: string, phase: string, error: Error) =>
    console.error({ event: 'pipeline_error', assetId, phase, error: error.message, timestamp: Date.now() })
}
```

## Future Enhancements

### Batch Processing
- Group multiple uploads for batch embedding generation
- Optimize API usage with batch endpoints
- Implement smart queuing based on user behavior

### Progressive Enhancement
- Support for video and GIF frame extraction
- Multiple embedding models for different content types
- Client-side preprocessing (resizing, format conversion)

### Advanced Error Recovery
- Automatic cleanup of orphaned blob storage files
- Dead letter queue for permanently failed items
- Health checks and automatic system recovery

## Security Considerations

### File Validation
```typescript
const validateUploadedFile = async (blobUrl: string, expectedChecksum: string) => {
  const response = await fetch(blobUrl)
  const buffer = await response.arrayBuffer()
  const actualChecksum = await crypto.subtle.digest('SHA-256', buffer)

  if (actualChecksum !== expectedChecksum) {
    throw new Error('File integrity check failed')
  }

  return buffer
}
```

### Rate Limiting
```typescript
// Per-user upload rate limiting
const uploadRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Limit each user to 50 uploads per windowMs
  keyGenerator: (req) => req.auth?.userId || req.ip
})
```

## References

- [Vercel Blob Documentation](https://vercel.com/docs/storage/vercel-blob)
- [File Upload Best Practices](https://web.dev/file-upload/)
- [Optimistic UI Patterns](https://www.apollographql.com/docs/react/performance/optimistic-ui/)
- [Background Job Processing Patterns](https://blog.heroku.com/background_jobs_with_postgresql)
- [Error Recovery in Distributed Systems](https://martinfowler.com/articles/patterns-of-distributed-systems/)