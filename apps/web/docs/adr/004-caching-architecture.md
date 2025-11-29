# ADR-004: Caching Architecture

**Status:** Proposed
**Date:** 2024-09-13
**Deciders:** Development Team
**Technical Story:** Sploot requires multi-layer caching for optimal performance and cost control

## Context

Sploot's architecture involves several expensive operations that benefit significantly from caching:

- **Text embeddings:** External API calls (50-200ms) for every search query
- **Image embeddings:** Expensive API calls (500-2000ms) that should avoid duplication
- **Search results:** Database vector similarity searches that could be cached for popular queries
- **Image assets:** Blob storage requests that benefit from CDN and client caching
- **Static assets:** PWA resources for offline capability

### Requirements Analysis

**Performance Requirements:**
- Search query latency: <500ms p95 (including embedding generation)
- Text embedding cache hit ratio: >80% for repeat queries
- Image deduplication: 100% for identical files (SHA-256)
- PWA offline functionality: Critical resources available offline

**Cost Requirements:**
- Minimize embedding API costs through intelligent caching
- Reduce database load via query result caching
- Optimize blob storage egress costs

**Scale Requirements:**
- Support 1K-100K cached text embeddings
- Handle duplicate image detection across 100K+ assets
- Serve PWA assets with sub-100ms response times

## Decision

We will implement a **multi-layer caching architecture** with different strategies optimized for each use case.

**Caching Layers:**
1. **Client-side caching:** Service Worker + Browser Cache API for PWA assets and frequent data
2. **Edge caching:** Vercel Edge Cache for static and semi-static content
3. **Application caching:** Upstash Redis for text embeddings and search results
4. **Database caching:** PostgreSQL query result caching and connection pooling

**Cache Strategies by Content Type:**
- **Text embeddings:** Short-term cache (5-15 min) with LRU eviction
- **Image embeddings:** Long-term cache by SHA-256 checksum (indefinite)
- **Search results:** Medium-term cache (1-5 min) with query normalization
- **Static assets:** Long-term cache with versioning for PWA functionality

## Consequences

### Positive

- **Improved performance:** Sub-200ms response times for cached text embeddings
- **Cost optimization:** 80%+ reduction in duplicate embedding API calls
- **Better user experience:** Instant results for repeated searches
- **Offline capability:** PWA functions without network connectivity
- **Reduced database load:** Cached queries reduce expensive vector operations

### Negative

- **Complexity:** Multi-layer caching requires careful cache invalidation strategies
- **Memory usage:** Redis and client-side caches consume additional memory
- **Cache consistency:** Risk of stale data if invalidation fails
- **Debugging complexity:** Cached responses can mask underlying performance issues
- **Additional cost:** Redis hosting adds ~$20-50/month operational cost

## Alternatives Considered

### 1. Single-Layer Application Caching (Redis only)

**Pros:**
- Simpler architecture with single cache invalidation strategy
- Centralized cache management and monitoring
- Consistent performance characteristics

**Cons:**
- Higher latency for edge cases (network round-trip to Redis)
- No offline capabilities for PWA
- Misses optimization opportunities for different content types

**Verdict:** Rejected in favor of multi-layer approach for better performance.

### 2. Database-only Caching (PostgreSQL + pgbouncer)

**Pros:**
- Minimal additional infrastructure
- Strong consistency with database state
- Lower operational complexity

**Cons:**
- Cannot cache external API calls (text embeddings)
- Limited cache size due to PostgreSQL memory constraints
- No client-side performance benefits

**Verdict:** Rejected due to inability to cache external API calls.

### 3. Client-side Only Caching

**Pros:**
- Zero server-side caching infrastructure
- Best possible latency for cached content
- Offline-first architecture

**Cons:**
- Cache not shared across devices/sessions
- Limited by browser storage quotas
- No server-side cost optimizations

**Verdict:** Rejected as insufficient for API cost optimization.

### 4. Vercel KV (Redis) + Edge Functions

**Pros:**
- Fully integrated with Vercel platform
- Automatic scaling and management
- Edge deployment capabilities

**Cons:**
- Higher cost than dedicated Redis providers
- Limited to Vercel ecosystem
- Newer service with less proven reliability

**Verdict:** Considered but Upstash Redis offers better cost/performance ratio.

## Trade-offs

### Performance vs. Complexity
- **Chosen:** Multi-layer optimization with increased architectural complexity
- **Alternative:** Simple single-layer caching with suboptimal performance

### Cost vs. Consistency
- **Chosen:** Aggressive caching for cost savings with eventual consistency
- **Alternative:** Strong consistency with higher API costs

### Storage vs. Computation
- **Chosen:** Trade memory/storage for reduced computation and API calls
- **Alternative:** Compute-heavy approach with lower memory usage

## Implementation Strategy

### Layer 1: Client-Side Caching
```typescript
// Service Worker for PWA asset caching
const CACHE_NAME = 'sploot-v1'
const STATIC_ASSETS = ['/app', '/search', '/upload', '/manifest.json']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS)
    })
  )
})

// Browser Cache API for search results
const searchCache = {
  async get(query: string): Promise<SearchResult[] | null> {
    const cache = await caches.open('search-results')
    const response = await cache.match(query)
    if (response && Date.now() - new Date(response.headers.get('cached-at')!).getTime() < 5 * 60 * 1000) {
      return response.json()
    }
    return null
  },

  async set(query: string, results: SearchResult[]): Promise<void> {
    const cache = await caches.open('search-results')
    const response = new Response(JSON.stringify(results), {
      headers: { 'cached-at': new Date().toISOString() }
    })
    await cache.put(query, response)
  }
}
```

### Layer 2: Edge Caching (Vercel)
```typescript
// Edge cache for semi-static content
export const runtime = 'edge'

export async function GET(request: Request) {
  const response = await fetch(/* ... */)

  // Cache static metadata for 1 hour
  response.headers.set('Cache-Control', 'public, max-age=3600')

  // Cache search results for 5 minutes
  if (request.url.includes('/api/search')) {
    response.headers.set('Cache-Control', 'public, max-age=300')
  }

  return response
}
```

### Layer 3: Application Caching (Upstash Redis)
```typescript
import { Redis } from '@upstash/redis'

class EmbeddingCache {
  private redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  })

  // Text embedding cache (5-15 minute TTL)
  async getTextEmbedding(query: string): Promise<number[] | null> {
    const normalizedQuery = this.normalizeQuery(query)
    const cached = await this.redis.get(`text_embed:${normalizedQuery}`)
    return cached ? JSON.parse(cached as string) : null
  }

  async setTextEmbedding(query: string, embedding: number[]): Promise<void> {
    const normalizedQuery = this.normalizeQuery(query)
    const ttl = 5 * 60 // 5 minutes
    await this.redis.setex(`text_embed:${normalizedQuery}`, ttl, JSON.stringify(embedding))
  }

  // Image embedding cache (indefinite, keyed by SHA-256)
  async getImageEmbedding(checksum: string): Promise<number[] | null> {
    const cached = await this.redis.get(`img_embed:${checksum}`)
    return cached ? JSON.parse(cached as string) : null
  }

  async setImageEmbedding(checksum: string, embedding: number[]): Promise<void> {
    // No expiration for image embeddings (content-based key)
    await this.redis.set(`img_embed:${checksum}`, JSON.stringify(embedding))
  }

  private normalizeQuery(query: string): string {
    return query.toLowerCase().trim().replace(/\s+/g, ' ')
  }
}
```

### Layer 4: Database Query Caching
```typescript
// Connection pooling with query caching
import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
})

// Prepared statement caching for frequent queries
const searchQuery = `
  SELECT a.id, a.blob_url, a.favorite, e.image_embedding <=> $1 as distance
  FROM assets a
  JOIN asset_embeddings e ON a.id = e.asset_id
  WHERE a.owner_user_id = $2 AND a.deleted_at IS NULL
  ORDER BY distance ASC
  LIMIT $3
`

// Query result caching with Redis
async function cachedSearch(embedding: number[], userId: string, limit: number) {
  const cacheKey = `search:${userId}:${hashEmbedding(embedding)}:${limit}`

  const cached = await redis.get(cacheKey)
  if (cached) return JSON.parse(cached)

  const result = await pool.query(searchQuery, [embedding, userId, limit])

  // Cache for 1 minute
  await redis.setex(cacheKey, 60, JSON.stringify(result.rows))

  return result.rows
}
```

## Cache Invalidation Strategy

### Text Embedding Cache
- **Strategy:** Time-based expiration (5-15 minutes)
- **Rationale:** Queries are repeatable and embedding models don't change frequently
- **Implementation:** Redis TTL with automatic cleanup

### Image Embedding Cache
- **Strategy:** Content-based caching (SHA-256 checksum)
- **Rationale:** Identical images always produce identical embeddings
- **Implementation:** Permanent cache with content-based keys

### Search Result Cache
- **Strategy:** Short-term caching with user-based invalidation
- **Rationale:** Results change when user adds/removes/modifies assets
- **Implementation:** 1-5 minute TTL + manual invalidation on user mutations

### Static Asset Cache
- **Strategy:** Version-based caching with long expiration
- **Rationale:** Static assets change infrequently and can be versioned
- **Implementation:** Service Worker with cache-first strategy

### Cache Invalidation Triggers
```typescript
// Invalidate user's search cache on asset mutations
async function invalidateUserCache(userId: string) {
  const pattern = `search:${userId}:*`
  const keys = await redis.keys(pattern)
  if (keys.length > 0) {
    await redis.del(...keys)
  }
}

// Asset lifecycle hooks
const assetMutationHooks = {
  afterCreate: (userId: string) => invalidateUserCache(userId),
  afterUpdate: (userId: string) => invalidateUserCache(userId),
  afterDelete: (userId: string) => invalidateUserCache(userId),
}
```

## Performance Optimization

### Cache Warming
```typescript
// Pre-populate cache with common queries
const POPULAR_QUERIES = [
  'drake pointing', 'distracted boyfriend', 'woman yelling at cat',
  'this is fine', 'galaxy brain', 'expanding brain'
]

async function warmTextEmbeddingCache() {
  for (const query of POPULAR_QUERIES) {
    if (!(await embeddingCache.getTextEmbedding(query))) {
      const embedding = await embeddingService.embedText(query)
      await embeddingCache.setTextEmbedding(query, embedding)
    }
  }
}
```

### Cache Monitoring
```typescript
// Cache hit/miss metrics
class CacheMetrics {
  private hits = new Map<string, number>()
  private misses = new Map<string, number>()

  recordHit(cacheType: string) {
    this.hits.set(cacheType, (this.hits.get(cacheType) || 0) + 1)
  }

  recordMiss(cacheType: string) {
    this.misses.set(cacheType, (this.misses.get(cacheType) || 0) + 1)
  }

  getHitRate(cacheType: string): number {
    const hits = this.hits.get(cacheType) || 0
    const misses = this.misses.get(cacheType) || 0
    return hits / (hits + misses)
  }
}
```

## Monitoring and Success Criteria

### Key Performance Indicators

**Cache Performance:**
- Text embedding cache hit rate: Target >80%
- Image embedding deduplication rate: Target >95%
- Search result cache hit rate: Target >60%
- Average cache lookup latency: <10ms

**Cost Impact:**
- Embedding API call reduction: Target >70%
- Database query reduction: Target >50%
- Blob storage bandwidth savings: Target >40%

**User Experience:**
- Cached search response time: <100ms p95
- PWA offline functionality: >95% uptime
- Cache warming success rate: >90%

### Alerting Thresholds
```typescript
const CACHE_ALERTS = {
  TEXT_EMBEDDING_HIT_RATE: 0.70,    // Alert if <70% hit rate
  REDIS_MEMORY_USAGE: 0.85,         // Alert if >85% memory usage
  CACHE_LOOKUP_LATENCY_P95: 50,     // Alert if >50ms p95 latency
  FAILED_CACHE_WRITES: 0.05,        // Alert if >5% write failures
}
```

### Cache Size Management
```typescript
// Implement LRU eviction for text embeddings
class LRUCache<T> {
  private cache = new Map<string, { value: T; timestamp: number }>()
  private maxSize: number

  constructor(maxSize: number = 10000) {
    this.maxSize = maxSize
  }

  get(key: string): T | undefined {
    const item = this.cache.get(key)
    if (item) {
      // Update timestamp for LRU
      item.timestamp = Date.now()
      return item.value
    }
    return undefined
  }

  set(key: string, value: T): void {
    if (this.cache.size >= this.maxSize) {
      this.evictOldest()
    }

    this.cache.set(key, { value, timestamp: Date.now() })
  }

  private evictOldest(): void {
    let oldestKey = ''
    let oldestTime = Date.now()

    for (const [key, item] of this.cache.entries()) {
      if (item.timestamp < oldestTime) {
        oldestTime = item.timestamp
        oldestKey = key
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey)
    }
  }
}
```

## Security Considerations

### Cache Key Security
```typescript
// Prevent cache poisoning with user isolation
function getCacheKey(userId: string, query: string): string {
  const hash = crypto.createHash('sha256')
  hash.update(`${userId}:${query}`)
  return hash.digest('hex')
}

// Validate cache access permissions
async function validateCacheAccess(userId: string, cacheKey: string): Promise<boolean> {
  return cacheKey.includes(userId) || cacheKey.startsWith('public:')
}
```

### Sensitive Data Handling
```typescript
// Ensure sensitive data is not cached inappropriately
const SENSITIVE_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /key/i
]

function shouldCache(data: any): boolean {
  const serialized = JSON.stringify(data)
  return !SENSITIVE_PATTERNS.some(pattern => pattern.test(serialized))
}
```

## Future Enhancements

### Distributed Caching
- Multi-region Redis replication for global users
- Consistent hashing for cache partitioning
- Edge-side caching with Cloudflare Workers

### Advanced Cache Strategies
- Bloom filters for negative caching (embedding misses)
- Probabilistic cache warming based on user behavior
- Machine learning-based cache preloading

### Cache Analytics
- Real-time cache performance dashboards
- Predictive cache eviction based on access patterns
- Cost-benefit analysis of cache storage vs. computation

## Configuration Management

### Environment Variables
```bash
# Redis Configuration
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...

# Cache TTL Configuration (seconds)
TEXT_EMBEDDING_TTL=300      # 5 minutes
SEARCH_RESULT_TTL=60       # 1 minute
STATIC_ASSET_TTL=86400     # 24 hours

# Cache Size Limits
MAX_TEXT_EMBEDDINGS=10000
MAX_SEARCH_RESULTS=5000
REDIS_MAX_MEMORY=512mb
```

### Cache Configuration
```typescript
export const cacheConfig = {
  textEmbeddings: {
    ttl: parseInt(process.env.TEXT_EMBEDDING_TTL || '300'),
    maxSize: parseInt(process.env.MAX_TEXT_EMBEDDINGS || '10000'),
  },
  searchResults: {
    ttl: parseInt(process.env.SEARCH_RESULT_TTL || '60'),
    maxSize: parseInt(process.env.MAX_SEARCH_RESULTS || '5000'),
  },
  redis: {
    maxMemory: process.env.REDIS_MAX_MEMORY || '512mb',
    evictionPolicy: 'allkeys-lru',
  }
}
```

## References

- [HTTP Caching Best Practices](https://web.dev/http-cache/)
- [Upstash Redis Documentation](https://docs.upstash.com/redis)
- [Vercel Edge Caching Guide](https://vercel.com/docs/concepts/edge-network/caching)
- [Service Worker Caching Strategies](https://developers.google.com/web/tools/workbox/guides/storage-quota)
- [Cache-Control Header Reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control)