# ADR-001: Embedding Service Architecture

**Status:** Proposed
**Date:** 2024-09-13
**Deciders:** Development Team
**Technical Story:** Sploot requires CLIP/SigLIP embeddings for text→image semantic search

## Context

Sploot needs to generate high-quality multimodal embeddings for semantic search between text queries and image content. The system must handle:

- **Image embeddings** generated during upload processing (batch/async acceptable)
- **Text embeddings** generated during search queries (must be fast, <200ms)
- **Model consistency** between text and image towers
- **Scale considerations** for potentially millions of images over time
- **Cost optimization** for a personal project with moderate usage

### Requirements Analysis

**Performance Requirements:**
- Upload processing: <2.5s total (embedding generation is part of this)
- Search latency: <500ms total (text embedding + vector search)
- Cold start tolerance: acceptable for image processing, not for search

**Scale Expectations:**
- Initial: hundreds to low thousands of images
- Growth: up to 100K+ images over multiple years
- Query frequency: 10-100 searches per day per user
- Upload frequency: 5-50 images per week per user

**Quality Requirements:**
- Support for meme/screenshot content (not just natural photos)
- Good text→image retrieval performance on informal, humorous content
- Consistent embedding space between text and image modalities

## Decision

We will use **Replicate API with SigLIP-Large-Patch16-384** as our primary embedding service.

**Architecture:**
- **Image embeddings:** Generated asynchronously during upload via `/api/assets` endpoint
- **Text embeddings:** Generated synchronously during search via `/api/search` endpoint
- **Model specification:** `clip-vit-large-patch14-336` (SigLIP) via Replicate
- **Fallback model:** OpenAI CLIP ViT-L/14 for comparison/migration path
- **Client pattern:** Single embedding service module with model abstraction

**Implementation Details:**
```typescript
// lib/embeddings/service.ts
interface EmbeddingService {
  embedImage(imageUrl: string): Promise<number[]>
  embedText(query: string): Promise<number[]>
  modelInfo: { name: string, dimension: number }
}

class ReplicateEmbeddingService implements EmbeddingService {
  modelInfo = { name: 'siglip-large-384', dimension: 1152 }
  // Implementation with Replicate API calls
}
```

## Consequences

### Positive

- **Proven quality:** SigLIP has demonstrated superior performance on diverse image-text retrieval tasks
- **Managed service:** No infrastructure management, automatic scaling, built-in reliability
- **Cost predictable:** Pay-per-request model aligns with usage patterns
- **Fast iteration:** Can test different models by changing API calls, not infrastructure
- **Model evolution:** Easy to upgrade to newer/better models as they become available

### Negative

- **Vendor lock-in:** Dependent on Replicate availability and pricing
- **Network latency:** External API calls add 50-200ms overhead per embedding
- **Rate limiting:** May hit API rate limits during bulk operations
- **Cost scaling:** Costs scale linearly with usage (no fixed infrastructure amortization)
- **Cold starts:** External API calls may experience their own cold start delays

## Alternatives Considered

### 1. Self-Hosted Embeddings (Hugging Face Transformers)

**Pros:**
- Full control over model versions and hosting
- Potentially lower long-term costs at high scale
- No rate limits or vendor dependencies
- Can optimize for specific image types (memes, screenshots)

**Cons:**
- GPU infrastructure costs ($50-200/month minimum)
- Model management and version control complexity
- Cold start problems in serverless (10-30s model loading)
- DevOps overhead for monitoring, scaling, updates

**Verdict:** Rejected for v1 due to operational complexity and Vercel's serverless constraints.

### 2. OpenAI Embeddings API

**Pros:**
- Reliable, well-supported service
- Good documentation and client libraries
- Integrated with broader OpenAI ecosystem

**Cons:**
- CLIP model is older generation (less accurate than SigLIP)
- Higher cost per request (~2-3x Replicate)
- Less flexibility in model choice
- Focused on text embeddings (image support limited)

**Verdict:** Considered as fallback but Replicate + SigLIP offers better performance/cost.

### 3. Hybrid: Self-hosted for images, API for text

**Pros:**
- Could optimize image processing for batch uploads
- Text embedding latency still fast via API

**Cons:**
- Architectural complexity (two different embedding sources)
- Model consistency challenges between text and image towers
- Still requires GPU infrastructure for image processing

**Verdict:** Rejected due to complexity and consistency concerns.

### 4. Sentence Transformers with CLIP

**Pros:**
- Open source, flexible
- Good Python ecosystem support

**Cons:**
- Still requires GPU hosting
- Less optimized than dedicated services
- Model management overhead

**Verdict:** Rejected in favor of managed service approach.

## Trade-offs

### Performance vs. Cost
- **Chosen:** API latency overhead (50-200ms) but predictable costs
- **Alternative:** Self-hosted with faster embedding but higher fixed costs

### Control vs. Simplicity
- **Chosen:** Less control over model hosting/versions but simpler architecture
- **Alternative:** Full control but significant operational complexity

### Vendor Independence vs. Speed-to-Market
- **Chosen:** Accept Replicate dependency for faster development
- **Alternative:** Build embedding infrastructure, slower initial delivery

## Implementation Strategy

### Phase 1: MVP with Replicate SigLIP
```typescript
// Immediate implementation
const embeddings = new ReplicateEmbeddingService({
  model: 'lucataco/siglip-large-patch16-384',
  apiToken: process.env.REPLICATE_API_TOKEN
})
```

### Phase 2: Caching Layer
```typescript
// Add Redis/Upstash caching for text embeddings
const cachedEmbeddings = new CachedEmbeddingService(embeddings, cache)
```

### Phase 3: Model Flexibility
```typescript
// Abstract interface to support model switching
const embeddings = createEmbeddingService({
  provider: process.env.EMBEDDING_PROVIDER, // 'replicate' | 'openai' | 'local'
  model: process.env.EMBEDDING_MODEL
})
```

## Migration Path

If we need to change providers or models:

1. **Database schema supports model switching:** Store `model_name` and `dimension` with each embedding
2. **Gradual migration:** Can generate new embeddings alongside old ones, then swap search index
3. **Validation framework:** A/B test new models against existing ones with known queries
4. **Rollback capability:** Keep previous model embeddings until new model is validated

## Monitoring and Success Criteria

### Key Metrics
- **Embedding latency:** p50, p95, p99 for text embeddings during search
- **Search quality:** Manual evaluation of top-10 results for canonical queries
- **Cost tracking:** Monthly embedding API costs vs. usage volume
- **Error rates:** Failed embedding requests, timeout rates

### Success Thresholds
- Text embedding: <200ms p95 latency
- Search relevance: >80% of test queries return expected results in top-10
- Cost efficiency: <$50/month for typical usage (1000 searches, 500 uploads/month)
- Availability: >99% successful embedding generation

## Future Considerations

- **Model upgrades:** Evaluate newer models (SigLIP improvements, CLIP variants) annually
- **Self-hosted transition:** If usage scales to >$200/month in API costs, reconsider infrastructure
- **Multimodal evolution:** Consider models that handle video, audio, or text-in-image content
- **Fine-tuning:** If we accumulate enough usage data, consider domain-specific model fine-tuning

## References

- [SigLIP Paper: Sigmoid Loss for Language Image Pre-training](https://arxiv.org/abs/2303.15343)
- [Replicate SigLIP Model Documentation](https://replicate.com/lucataco/siglip-large-patch16-384)
- [pgvector Performance Benchmarks](https://github.com/pgvector/pgvector#performance)
- [CLIP vs SigLIP Comparison Studies](https://github.com/google-research/big_vision)