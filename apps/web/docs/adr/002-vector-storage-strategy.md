# ADR-002: Vector Storage Strategy

**Status:** Proposed
**Date:** 2024-09-13
**Deciders:** Development Team
**Technical Story:** Sploot requires efficient vector similarity search for semantic image retrieval

## Context

Sploot needs to store and search high-dimensional embedding vectors (1152-dimensional for SigLIP) to enable fast text→image semantic search. The system must handle:

- **Vector similarity search** with sub-500ms latency
- **Filtering by user ownership** (private libraries)
- **Scaling to 100K+ vectors** over time
- **Integration with existing metadata** (favorites, tags, timestamps)
- **Cost optimization** for a Vercel-hosted application

### Requirements Analysis

**Performance Requirements:**
- Search latency: <500ms p95 for similarity search + metadata joins
- Throughput: 100+ searches per minute (peak usage)
- Index build time: Acceptable up to minutes for batch uploads
- Memory usage: Efficient enough for Vercel serverless functions

**Scale Expectations:**
- Initial: 1K-10K vectors
- Growth target: 100K vectors within 2 years
- Dimensions: 1152 (SigLIP-Large-384) or 768 (CLIP alternatives)
- Query patterns: 90% similarity search, 10% filtered queries

**Integration Requirements:**
- Must join with assets table for metadata (URLs, timestamps, favorites)
- User isolation (all queries filtered by owner_user_id)
- ACID transactions for embedding updates
- Backup and point-in-time recovery support

## Decision

We will use **Vercel Postgres with pgvector extension** as our vector storage solution.

**Architecture:**
- **Database:** Vercel Postgres (Neon-based) with pgvector 0.5.0+
- **Index type:** HNSW (Hierarchical Navigable Small World) for approximate nearest neighbor search
- **Distance metric:** Cosine distance (vectors normalized at insert time)
- **Schema design:** Separate `asset_embeddings` table with foreign key to `assets`
- **Query pattern:** Single JOIN between embeddings and assets with user filtering

**Implementation Details:**
```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Embeddings table
CREATE TABLE asset_embeddings (
  asset_id uuid PRIMARY KEY REFERENCES assets(id) ON DELETE CASCADE,
  model_name text NOT NULL,
  dimension integer NOT NULL,
  image_embedding vector(1152) NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- HNSW index for fast similarity search
CREATE INDEX asset_embeddings_hnsw_idx
  ON asset_embeddings
  USING hnsw (image_embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Compound index for user filtering + similarity
CREATE INDEX assets_user_id_created_idx
  ON assets(owner_user_id, created_at DESC);
```

## Consequences

### Positive

- **Single database:** Eliminates data consistency issues between vector and metadata storage
- **ACID transactions:** Consistent updates of embeddings and metadata
- **Mature ecosystem:** Proven PostgreSQL reliability, tooling, and backup strategies
- **Cost efficiency:** No additional database service costs beyond existing Postgres
- **Development simplicity:** Single connection pool, familiar SQL patterns
- **Vercel integration:** Native support, automatic scaling, managed service benefits

### Negative

- **Performance ceiling:** May hit limits around 1M+ vectors or high concurrent load
- **Memory usage:** HNSW indexes require significant memory (estimated 2-4GB for 100K vectors)
- **Index build time:** HNSW construction becomes slow with large datasets (minutes for 100K+ vectors)
- **Query optimization complexity:** Requires careful tuning of HNSW parameters
- **Version dependency:** Tied to pgvector extension availability and version support

## Alternatives Considered

### 1. Dedicated Vector Database (Pinecone)

**Pros:**
- Optimized specifically for vector search performance
- Managed service with automatic scaling
- Advanced features (metadata filtering, hybrid search)
- Better performance at massive scale (millions of vectors)

**Cons:**
- Additional service dependency and cost ($70+/month minimum)
- Data consistency challenges (vectors vs. metadata in different systems)
- Vendor lock-in with proprietary API
- Complexity of syncing deletes/updates between systems

**Verdict:** Rejected due to cost and architectural complexity for initial scale.

### 2. Qdrant (Self-hosted or Cloud)

**Pros:**
- Open source with self-hosting option
- Excellent performance and rich filtering capabilities
- Good REST API and client libraries
- Supports payload (metadata) storage alongside vectors

**Cons:**
- Operational overhead for self-hosting on Vercel/serverless
- Cloud version adds cost and vendor dependency
- Additional complexity in deployment and monitoring
- Need to replicate metadata or design around payload limitations

**Verdict:** Rejected in favor of simpler single-database approach for v1.

### 3. Weaviate

**Pros:**
- Hybrid search capabilities (vector + text + filters)
- Good GraphQL API
- Built-in ML model support

**Cons:**
- Complex setup and configuration
- Heavier resource requirements
- Overkill for simple similarity search use case
- Additional service to manage and monitor

**Verdict:** Rejected due to complexity vs. requirements mismatch.

### 4. Elasticsearch with dense_vector

**Pros:**
- Mature search platform with vector support
- Rich filtering and aggregation capabilities
- Good monitoring and operational tools

**Cons:**
- Significant operational overhead
- High memory requirements
- Complex cluster management
- Cost of managed Elasticsearch service

**Verdict:** Rejected due to operational complexity and cost.

### 5. In-Memory Vector Search (Faiss/Annoy + Redis)

**Pros:**
- Maximum performance for similarity search
- Full control over indexing algorithms
- Can optimize for specific use cases

**Cons:**
- Requires warm-up time in serverless environments
- Complex persistence and consistency management
- Memory management challenges in serverless functions
- Need separate metadata storage and sync

**Verdict:** Rejected due to serverless architecture constraints.

## Trade-offs

### Performance vs. Simplicity
- **Chosen:** Potentially lower peak performance but much simpler architecture
- **Alternative:** Dedicated vector DB with higher performance but operational complexity

### Cost vs. Scale Ceiling
- **Chosen:** Lower initial costs but may need migration at higher scales
- **Alternative:** Higher fixed costs but better long-term scalability

### Consistency vs. Performance
- **Chosen:** Strong consistency with metadata but potential performance bottlenecks
- **Alternative:** Eventually consistent systems with better performance isolation

## Implementation Strategy

### Phase 1: Basic HNSW Setup
```sql
-- Conservative HNSW parameters for initial deployment
CREATE INDEX asset_embeddings_hnsw_idx
  ON asset_embeddings
  USING hnsw (image_embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Runtime search parameter (can be tuned per query)
SET hnsw.ef_search = 40;
```

### Phase 2: Performance Optimization
```sql
-- Optimized parameters based on usage patterns
-- Higher m and ef_construction for better recall at cost of index size
ALTER INDEX asset_embeddings_hnsw_idx SET (m = 32, ef_construction = 128);

-- Connection-level optimization
SET work_mem = '256MB';  -- For index operations
SET shared_buffers = '1GB';  -- If available
```

### Phase 3: Query Optimization
```sql
-- Optimized search query with proper index usage
EXPLAIN ANALYZE
SELECT
  a.id, a.blob_url, a.favorite, a.created_at,
  e.image_embedding <=> $1::vector as distance
FROM assets a
JOIN asset_embeddings e ON a.id = e.asset_id
WHERE
  a.owner_user_id = $2
  AND a.deleted_at IS NULL
ORDER BY e.image_embedding <=> $1::vector
LIMIT $3;
```

## Performance Tuning Parameters

### HNSW Index Parameters

**m (number of connections):**
- Default: 16
- Higher values (32-64): Better recall, larger index size
- Lower values (8-12): Smaller index, potentially lower recall

**ef_construction (build time):**
- Default: 64
- Higher values (128-200): Better index quality, slower builds
- Lower values (32-48): Faster builds, potentially lower quality

**ef_search (query time):**
- Default: 40
- Higher values (100-200): Better recall, slower queries
- Lower values (20-30): Faster queries, potentially lower recall

### Query Optimization

```sql
-- Ensure proper vector normalization
UPDATE asset_embeddings
SET image_embedding = image_embedding / sqrt(
  (image_embedding <-> '[0,0,0,...]'::vector)
);

-- Index usage verification
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM asset_embeddings
ORDER BY image_embedding <=> $1::vector
LIMIT 10;
```

## Monitoring and Success Criteria

### Key Metrics

**Performance Metrics:**
- Query latency: p50, p95, p99 for similarity search
- Index build time: Duration for HNSW construction
- Memory usage: Postgres memory consumption vs. vector count
- Query plan analysis: Index scan vs. sequential scan ratios

**Quality Metrics:**
- Search recall: Percentage of relevant results in top-K
- Index selectivity: Effectiveness of user filtering
- Cache hit rates: Postgres buffer cache performance

### Success Thresholds

- Search latency: <200ms p95 for pure vector search, <500ms including metadata JOIN
- Index efficiency: >95% of queries use HNSW index scan
- Memory scalability: Linear memory growth <10GB per 100K vectors
- Recall quality: >90% recall@10 for test query set

### Alerting Thresholds

```sql
-- Query to monitor performance degradation
SELECT
  COUNT(*) as total_vectors,
  AVG(pg_relation_size('asset_embeddings')) / COUNT(*) as avg_vector_size,
  (SELECT setting FROM pg_settings WHERE name = 'shared_buffers') as buffer_size
FROM asset_embeddings;
```

## Migration Strategy

### Scaling Thresholds

**Migration triggers:**
- Query latency consistently >1s p95
- Memory usage >80% of available Postgres memory
- Index build time >30 minutes
- Cost exceeding $200/month for vector operations

### Migration Path to Dedicated Vector DB

```typescript
// Dual-write pattern for migration
interface VectorStore {
  insert(assetId: string, embedding: number[]): Promise<void>
  search(query: number[], limit: number): Promise<SearchResult[]>
  delete(assetId: string): Promise<void>
}

class DualWriteVectorStore implements VectorStore {
  constructor(
    private postgres: PostgresVectorStore,
    private vectorDB: PineconeVectorStore
  ) {}

  async insert(assetId: string, embedding: number[]) {
    await Promise.all([
      this.postgres.insert(assetId, embedding),
      this.vectorDB.insert(assetId, embedding)
    ])
  }

  async search(query: number[], limit: number) {
    // Use postgres initially, fall back to vectorDB
    // Gradual traffic shifting based on feature flag
    return this.postgres.search(query, limit)
  }
}
```

## Risk Mitigation

### Performance Degradation
- **Monitoring:** Continuous latency tracking with alerts
- **Fallback:** Exact search fallback if HNSW performance degrades
- **Scaling:** Horizontal read replicas for search-heavy workloads

### Index Corruption
- **Detection:** Regular VACUUM and ANALYZE operations
- **Recovery:** Automated index rebuilding procedures
- **Backup:** Point-in-time recovery for data consistency

### Memory Exhaustion
- **Limits:** Connection pooling and query timeout settings
- **Monitoring:** Memory usage alerts and scaling triggers
- **Mitigation:** Index parameter tuning and query optimization

## Future Considerations

- **Hybrid search:** Add text search capabilities (full-text + vector)
- **Multi-vector:** Support multiple embedding models simultaneously
- **Clustering:** Implement vector clustering for better organization
- **Compression:** Vector quantization for storage efficiency
- **Real-time updates:** Streaming vector updates for live applications

## References

- [pgvector Documentation](https://github.com/pgvector/pgvector)
- [PostgreSQL HNSW Index Performance](https://github.com/pgvector/pgvector#hnsw)
- [Vercel Postgres Limits and Performance](https://vercel.com/docs/storage/vercel-postgres/limits)
- [Vector Database Comparison Study](https://benchmark.vectorview.ai/)
- [HNSW Algorithm Paper](https://arxiv.org/abs/1603.09320)